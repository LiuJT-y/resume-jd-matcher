// popup.js

const noResumeSection = document.getElementById("noResumeSection");
const mainSection = document.getElementById("mainSection");
const setupResumeBtn = document.getElementById("setupResumeBtn");
const editResumeLink = document.getElementById("editResumeLink");
const resumeSummaryText = document.getElementById("resumeSummaryText");
const analyzeBtn = document.getElementById("analyzeBtn");
const autoExtractBtn = document.getElementById("autoExtractBtn");
const jdInput = document.getElementById("jdInput");
const jdStatus = document.getElementById("jdStatus");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("errorBox");
const resultSection = document.getElementById("resultSection");
const openOptions = document.getElementById("openOptions");

// 保存到投递记录相关
const saveSection = document.getElementById("saveSection");
const saveCompany = document.getElementById("saveCompany");
const savePosition = document.getElementById("savePosition");
const saveCity = document.getElementById("saveCity");
const saveChannel = document.getElementById("saveChannel");
const savePriority = document.getElementById("savePriority");
const saveToTrackerBtn = document.getElementById("saveToTrackerBtn");
const saveStatus = document.getElementById("saveStatus");

let activeTabId = null;
let activeTabUrl = null;
let lastMatchScore = null; // 最近一次分析得到的匹配分,保存时一起带上

init();

async function init() {
  const resumeData = await getResumeData();
  if (!isResumeDataEmpty(resumeData)) {
    showMainSection(resumeData);
  } else {
    noResumeSection.classList.remove("hidden");
  }
  await loadSelectedJd();
}

// 读取简历数据,并自动迁移旧版纯文本简历(resumeText)
async function getResumeData() {
  const stored = await chrome.storage.local.get(["resumeData", "resumeText"]);
  if (stored.resumeData) return stored.resumeData;

  if (stored.resumeText) {
    const migrated = createEmptyResumeData();
    migrated.summary = stored.resumeText;
    await chrome.storage.local.set({ resumeData: migrated });
    await chrome.storage.local.remove("resumeText");
    return migrated;
  }

  return createEmptyResumeData();
}

function showMainSection(resumeData) {
  noResumeSection.classList.add("hidden");
  mainSection.classList.remove("hidden");
  resumeSummaryText.textContent = [resumeData.name, resumeData.title].filter(Boolean).join(" · ") || "已保存简历";
}

// 从当前活动标签页获取选中的JD文本,预填到文本框(手动兜底)
async function loadSelectedJd() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab && tab.id ? tab.id : null;
  activeTabUrl = tab && tab.url ? tab.url : null; // 作为投递记录的 jobLink
  if (!activeTabId) return;

  try {
    const response = await chrome.tabs.sendMessage(activeTabId, { type: "GET_SELECTED_TEXT" });
    if (response && response.selectedText) {
      jdInput.value = response.selectedText;
      setJdStatus("已载入页面选中的文本,可直接分析,或点击上方自动识别。");
    }
  } catch (e) {
    // content script 未注入(如 chrome:// 页面),忽略,用户可手动粘贴
  }
}

function setJdStatus(msg, isError = false) {
  jdStatus.textContent = msg || "";
  jdStatus.style.color = isError ? "#b91c1c" : "#666";
}

// 自动识别:抓整页文本 → 交给 Claude 提取 JD → 填入文本框供用户确认
autoExtractBtn.addEventListener("click", async () => {
  if (!activeTabId) {
    setJdStatus("无法获取当前页面", true);
    return;
  }

  autoExtractBtn.disabled = true;
  setJdStatus("正在读取页面内容...");

  let pageText = "";
  try {
    const resp = await chrome.tabs.sendMessage(activeTabId, { type: "GET_PAGE_TEXT" });
    pageText = resp && resp.pageText ? resp.pageText : "";
  } catch (e) {
    setJdStatus("无法读取页面内容,请刷新页面后重试", true);
    autoExtractBtn.disabled = false;
    return;
  }

  if (!pageText.trim()) {
    setJdStatus("页面内容为空,请改用手动选中", true);
    autoExtractBtn.disabled = false;
    return;
  }

  setJdStatus("正在识别JD(调用 Claude,可能需要几秒)...");

  chrome.runtime.sendMessage({ type: "EXTRACT_JD", pageText }, (response) => {
    autoExtractBtn.disabled = false;

    if (!response || !response.success) {
      setJdStatus(response ? response.error : "识别失败", true);
      return;
    }

    // 现在 EXTRACT_JD 返回结构化对象 { jd, company, position, city }
    const data = response.data;
    jdInput.value = data.jd || "";
    // 预填保存表单(此时还隐藏着,分析成功后才显示);仅在识别到时填,避免覆盖用户已改的内容
    if (data.company) saveCompany.value = data.company;
    if (data.position) savePosition.value = data.position;
    if (data.city) saveCity.value = data.city;
    setJdStatus("已自动识别,请核对/编辑下方JD,确认无误后点击分析。");
  });
});

function openResumeEditor() {
  chrome.tabs.create({ url: chrome.runtime.getURL("resume/resume.html") });
}

setupResumeBtn.addEventListener("click", openResumeEditor);

editResumeLink.addEventListener("click", (e) => {
  e.preventDefault();
  openResumeEditor();
});

analyzeBtn.addEventListener("click", async () => {
  errorBox.classList.add("hidden");
  resultSection.classList.add("hidden");
  saveSection.classList.add("hidden"); // 重新分析时先收起保存区
  setSaveStatus("");

  const jdText = jdInput.value.trim();
  if (!jdText) {
    showError("请先自动识别或手动填写JD文本");
    return;
  }

  const resumeData = await getResumeData();
  if (isResumeDataEmpty(resumeData)) {
    showError("请先完善简历信息");
    return;
  }

  loading.classList.remove("hidden");
  analyzeBtn.disabled = true;

  chrome.runtime.sendMessage(
    { type: "ANALYZE_MATCH", resumeData, jdText },
    (response) => {
      loading.classList.add("hidden");
      analyzeBtn.disabled = false;

      if (!response || !response.success) {
        showError(response ? response.error : "未知错误");
        return;
      }

      renderResult(response.data);
    }
  );
});

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

function renderResult(data) {
  document.getElementById("matchScore").textContent = data.matchScore;

  fillList("matchedSkills", data.matchedSkills);
  fillList("missingSkills", data.missingSkills);
  fillList("suggestions", data.suggestions);

  resultSection.classList.remove("hidden");

  // 分析成功后才显示「保存到投递记录」表单;此时 matchScore 必有值
  lastMatchScore = data.matchScore;
  saveSection.classList.remove("hidden");
}

function fillList(elementId, items) {
  const ul = document.getElementById(elementId);
  ul.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });
}

function setSaveStatus(msg, isError = false) {
  saveStatus.textContent = msg || "";
  saveStatus.style.color = isError ? "#b91c1c" : "#16a34a";
}

// 点「确认保存到投递记录」才真正 POST 到 job-tracker —— 分析本身不会触发保存
saveToTrackerBtn.addEventListener("click", () => {
  const company = saveCompany.value.trim();
  const position = savePosition.value.trim();
  if (!company || !position) {
    setSaveStatus("请填写公司和岗位", true);
    return;
  }

  const application = {
    company,
    position,
    city: saveCity.value.trim() || null,
    channel: saveChannel.value,
    priority: savePriority.value,
    jobLink: activeTabUrl || null,
    jdText: jdInput.value.trim() || null,
    matchScore: lastMatchScore,
    status: "SAVED" // 先存成「感兴趣」,投了再到看板拖到已投递
  };

  saveToTrackerBtn.disabled = true;
  setSaveStatus("正在保存...");

  chrome.runtime.sendMessage({ type: "SAVE_APPLICATION", application }, (response) => {
    saveToTrackerBtn.disabled = false;

    if (!response || !response.success) {
      setSaveStatus(response ? response.error : "保存失败", true);
      return;
    }

    setSaveStatus(`已保存到投递记录:${response.data.company} · ${response.data.position}`);
  });
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

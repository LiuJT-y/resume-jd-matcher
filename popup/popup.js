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

let activeTabId = null;

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

    jdInput.value = response.data;
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

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// resume.js
// 简历信息编辑页:PDF上传解析 + 结构化表单填写/修正

import * as pdfjsLib from "../lib/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.mjs");

// 各重复区块的字段布局
const SECTION_CONFIGS = {
  education: {
    containerId: "educationList",
    emptyHint: "暂无教育经历,点击右上角“+ 添加一条”",
    rows: [
      [
        { key: "school", label: "学校", type: "text" },
        { key: "degree", label: "学位", type: "text" }
      ],
      [
        { key: "major", label: "专业", type: "text" },
        { key: "time", label: "时间", type: "text", placeholder: "如 2018.09 - 2022.06" }
      ]
    ]
  },
  experience: {
    containerId: "experienceList",
    emptyHint: "暂无工作经历,点击右上角“+ 添加一条”",
    rows: [
      [
        { key: "company", label: "公司", type: "text" },
        { key: "title", label: "职位", type: "text" }
      ],
      [{ key: "time", label: "时间", type: "text", placeholder: "如 2022.07 - 至今", full: true }],
      [{ key: "description", label: "工作内容(每行一条)", type: "textarea", full: true }]
    ]
  },
  projects: {
    containerId: "projectsList",
    emptyHint: "暂无项目经历,点击右上角“+ 添加一条”",
    rows: [
      [
        { key: "name", label: "项目名称", type: "text" },
        { key: "time", label: "时间", type: "text" }
      ],
      [{ key: "description", label: "项目内容(每行一条)", type: "textarea", full: true }]
    ]
  }
};

const pdfInput = document.getElementById("pdfInput");
const parseStatus = document.getElementById("parseStatus");
const resumeForm = document.getElementById("resumeForm");
const saveMsg = document.getElementById("saveMsg");

init();

async function init() {
  const { resumeData } = await chrome.storage.local.get("resumeData");
  applyResumeData(resumeData || createEmptyResumeData());
}

function applyResumeData(data) {
  document.getElementById("name").value = data.name || "";
  document.getElementById("title").value = data.title || "";
  document.getElementById("contact").value = data.contact || "";
  document.getElementById("summary").value = data.summary || "";
  document.getElementById("skills").value = data.skills || "";
  renderSection("education", data.education);
  renderSection("experience", data.experience);
  renderSection("projects", data.projects);
}

function collectResumeData() {
  return {
    name: document.getElementById("name").value.trim(),
    title: document.getElementById("title").value.trim(),
    contact: document.getElementById("contact").value.trim(),
    summary: document.getElementById("summary").value.trim(),
    skills: document.getElementById("skills").value.trim(),
    education: collectSection("education"),
    experience: collectSection("experience"),
    projects: collectSection("projects")
  };
}

function createField(field, data) {
  const label = document.createElement("label");
  if (field.full) label.classList.add("full");

  const span = document.createElement("span");
  span.textContent = field.label;

  const input =
    field.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
  if (field.type === "textarea") {
    input.rows = 3;
  } else {
    input.type = "text";
  }
  input.dataset.field = field.key;
  input.value = (data && data[field.key]) || "";
  if (field.placeholder) input.placeholder = field.placeholder;

  label.appendChild(span);
  label.appendChild(input);
  return label;
}

function createRow(sectionKey, data = {}) {
  const config = SECTION_CONFIGS[sectionKey];
  const item = document.createElement("div");
  item.className = "repeat-item";

  config.rows.forEach((rowFields) => {
    if (rowFields.length > 1) {
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      rowFields.forEach((field) => rowEl.appendChild(createField(field, data)));
      item.appendChild(rowEl);
    } else {
      item.appendChild(createField(rowFields[0], data));
    }
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "删除此项";
  removeBtn.addEventListener("click", () => item.remove());
  item.appendChild(removeBtn);

  return item;
}

function renderSection(sectionKey, items) {
  const config = SECTION_CONFIGS[sectionKey];
  const container = document.getElementById(config.containerId);
  container.innerHTML = "";

  if (!items || !items.length) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = config.emptyHint;
    container.appendChild(hint);
    return;
  }

  items.forEach((item) => container.appendChild(createRow(sectionKey, item)));
}

function collectSection(sectionKey) {
  const config = SECTION_CONFIGS[sectionKey];
  const container = document.getElementById(config.containerId);
  const items = [];

  container.querySelectorAll(".repeat-item").forEach((itemEl) => {
    const item = {};
    let hasValue = false;
    itemEl.querySelectorAll("[data-field]").forEach((input) => {
      const value = input.value.trim();
      item[input.dataset.field] = value;
      if (value) hasValue = true;
    });
    if (hasValue) items.push(item);
  });

  return items;
}

document.querySelectorAll(".add-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sectionKey = btn.dataset.add;
    const config = SECTION_CONFIGS[sectionKey];
    const container = document.getElementById(config.containerId);
    const hint = container.querySelector(".empty-hint");
    if (hint) hint.remove();
    container.appendChild(createRow(sectionKey, {}));
  });
});

resumeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = collectResumeData();
  await chrome.storage.local.set({ resumeData: data });
  await chrome.storage.local.remove("resumeText");
  saveMsg.textContent = "已保存";
  setTimeout(() => (saveMsg.textContent = ""), 2000);
});

pdfInput.addEventListener("change", handlePdfUpload);

async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!isResumeDataEmpty(collectResumeData())) {
    if (!confirm("自动识别结果将覆盖下方表单中已填写的内容,是否继续?")) {
      pdfInput.value = "";
      return;
    }
  }

  setStatus("正在读取PDF...", "");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((textItem) => textItem.str).join(" ") + "\n";
    }

    if (!fullText.trim()) {
      setStatus("未能从PDF中提取到文本,可能是扫描版PDF,请手动填写下方表单。", "error");
      return;
    }

    setStatus("正在识别简历信息(调用 Claude API,可能需要几秒)...", "");

    chrome.runtime.sendMessage({ type: "PARSE_RESUME_TEXT", text: fullText }, (response) => {
      if (!response || !response.success) {
        setStatus(
          "自动识别失败:" + (response ? response.error : "未知错误") + "。请手动填写下方表单。",
          "error"
        );
        return;
      }
      applyResumeData(Object.assign(createEmptyResumeData(), response.data));
      setStatus("识别完成,请仔细核对并修正以下信息,确认无误后点击「保存简历」。", "success");
    });
  } catch (err) {
    setStatus("PDF读取失败:" + err.message, "error");
  } finally {
    pdfInput.value = "";
  }
}

function setStatus(text, type) {
  parseStatus.textContent = text;
  parseStatus.className = "status" + (type ? " " + type : "");
}

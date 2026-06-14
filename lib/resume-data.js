// resume-data.js
// 简历结构化数据的公共定义与工具函数
// 以普通脚本(非 module)加载,供 background.js (importScripts)、
// popup.js 和 resume.js 共用全局函数

// 简历数据的标准结构
function createEmptyResumeData() {
  return {
    name: "",
    title: "",
    contact: "",
    summary: "",
    skills: "",
    education: [],
    experience: [],
    projects: []
  };
}

// 简历是否为空(用于决定 popup 展示哪个界面)
function isResumeDataEmpty(resumeData) {
  if (!resumeData) return true;
  const hasItems = (arr) => Array.isArray(arr) && arr.length > 0;
  return !(
    resumeData.name ||
    resumeData.title ||
    resumeData.contact ||
    resumeData.summary ||
    resumeData.skills ||
    hasItems(resumeData.education) ||
    hasItems(resumeData.experience) ||
    hasItems(resumeData.projects)
  );
}

// 将结构化简历数据拼接为给 Claude 分析用的纯文本
function formatResumeForPrompt(resumeData) {
  if (!resumeData) return "";
  const lines = [];

  const basics = [];
  if (resumeData.name) basics.push(`姓名:${resumeData.name}`);
  if (resumeData.title) basics.push(`求职意向:${resumeData.title}`);
  if (resumeData.contact) basics.push(`联系方式:${resumeData.contact}`);
  if (basics.length) lines.push(...basics);

  if (resumeData.summary) {
    lines.push("", "【自我评价】", resumeData.summary);
  }

  if (resumeData.skills) {
    lines.push("", "【技能】", resumeData.skills);
  }

  if (resumeData.education && resumeData.education.length) {
    lines.push("", "【教育经历】");
    resumeData.education.forEach((edu) => {
      const head = [edu.school, edu.major, edu.degree, edu.time].filter(Boolean).join(" | ");
      if (head) lines.push("- " + head);
    });
  }

  if (resumeData.experience && resumeData.experience.length) {
    lines.push("", "【工作经历】");
    resumeData.experience.forEach((exp) => {
      const head = [exp.company, exp.title, exp.time].filter(Boolean).join(" | ");
      if (head) lines.push("- " + head);
      appendDescriptionLines(lines, exp.description);
    });
  }

  if (resumeData.projects && resumeData.projects.length) {
    lines.push("", "【项目经历】");
    resumeData.projects.forEach((proj) => {
      const head = [proj.name, proj.time].filter(Boolean).join(" | ");
      if (head) lines.push("- " + head);
      appendDescriptionLines(lines, proj.description);
    });
  }

  return lines.join("\n").trim();
}

function appendDescriptionLines(lines, description) {
  if (!description) return;
  description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => lines.push("  " + line));
}

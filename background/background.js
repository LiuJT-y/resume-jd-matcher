// background.js
// Manifest V3 service worker
// 负责接收 popup/resume 页面的请求,调用 Claude API,返回结果

importScripts("../lib/resume-data.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_MATCH") {
    handleAnalyze(message.resumeData, message.jdText)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    // 返回 true 表示异步响应
    return true;
  }

  if (message.type === "PARSE_RESUME_TEXT") {
    handleParseResume(message.text)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "EXTRACT_JD") {
    handleExtractJd(message.pageText)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "SAVE_APPLICATION") {
    handleSaveApplication(message.application)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) {
    throw new Error("未配置 Claude API Key,请在设置页填写");
  }
  return apiKey;
}

const REQUEST_TIMEOUT_MS = 30000;

async function callClaude(apiKey, { system, content, maxTokens }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content }]
      }),
      signal: controller.signal
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`请求超时(超过${REQUEST_TIMEOUT_MS / 1000}秒未响应),请检查网络后重试`);
    }
    throw new Error("网络请求失败,请检查网络连接后重试");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API请求失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("API返回内容为空");
  }

  // 清理可能存在的 markdown 代码块标记
  return textBlock.text.replace(/```json\s*|\s*```/g, "").trim();
}

async function handleAnalyze(resumeData, jdText) {
  const apiKey = await getApiKey();

  const resumeText = formatResumeForPrompt(resumeData);
  if (!resumeText) {
    throw new Error("简历内容为空,请先完善简历信息");
  }

  const systemPrompt = `你是一个专业的求职顾问。你会收到一份简历文本和一份职位描述(JD)。
请分析两者的匹配程度,并严格按照以下 JSON 格式返回结果,不要包含任何其他文字、解释或 markdown 代码块标记:

{
  "matchScore": <0-100的整数,表示匹配程度>,
  "matchedSkills": [<简历中与JD相符的关键技能/经历,数组,每项简短>],
  "missingSkills": [<JD要求但简历中缺失或体现不足的技能/经历,数组>],
  "suggestions": [<针对此JD优化简历的具体建议,数组,每条简短可执行>]
}`;

  const userContent = `【简历内容】\n${resumeText}\n\n【职位描述JD】\n${jdText}`;

  const cleanText = await callClaude(apiKey, {
    system: systemPrompt,
    content: userContent,
    maxTokens: 1024
  });

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    throw new Error("解析API返回结果失败: " + cleanText.slice(0, 200));
  }
}

async function handleParseResume(rawText) {
  const apiKey = await getApiKey();

  if (!rawText || !rawText.trim()) {
    throw new Error("未能从PDF中提取到文本");
  }

  const systemPrompt = `你是一个简历信息抽取助手。你会收到一段从PDF简历中提取出来的原始文本(可能存在排版混乱、断行错位等问题)。
请从中抽取结构化信息,严格按照以下 JSON 格式返回结果,不要包含任何其他文字、解释或 markdown 代码块标记。
缺失的信息用空字符串或空数组表示,不要编造原文中没有的信息。

{
  "name": "<姓名>",
  "title": "<求职意向/目标职位,如简历中有体现>",
  "contact": "<联系方式,如电话/邮箱/地址/个人主页等,用空格或逗号分隔拼成一行>",
  "summary": "<自我评价/个人简介>",
  "skills": "<技能列表,用逗号分隔拼成一行>",
  "education": [{"school": "<学校>", "degree": "<学位>", "major": "<专业>", "time": "<时间段>"}],
  "experience": [{"company": "<公司>", "title": "<职位>", "time": "<时间段>", "description": "<工作内容要点,每条一行>"}],
  "projects": [{"name": "<项目名称>", "time": "<时间段>", "description": "<项目内容要点,每条一行>"}]
}`;

  const cleanText = await callClaude(apiKey, {
    system: systemPrompt,
    content: rawText,
    maxTokens: 2048
  });

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    throw new Error("解析简历结果失败: " + cleanText.slice(0, 200));
  }
}

async function handleExtractJd(pageText) {
  const apiKey = await getApiKey();

  if (!pageText || !pageText.trim()) {
    throw new Error("页面内容为空,无法识别");
  }

  // 一次调用同时拿到 JD 正文 + 公司/岗位/城市,供「保存到投递记录」表单预填(不额外多花一次 API)
  const systemPrompt = `你会收到一段从招聘网站页面提取出来的杂乱文本,里面可能混杂导航栏、公司介绍、相似职位推荐、福利、页脚等噪音。
请从中找出"当前这个职位"的信息,严格按照以下 JSON 格式返回结果,不要包含任何其他文字、解释或 markdown 代码块标记:

{
  "company": "<招聘公司名称,找不到则空字符串>",
  "position": "<职位名称,找不到则空字符串>",
  "city": "<工作城市,找不到则空字符串>",
  "jd": "<当前职位的职位描述(JD)正文,通常包括岗位职责、任职要求、技能要求、加分项等;原样输出,可去掉明显无关的噪音,但不要改写、不要总结、不要翻译;找不到则空字符串>"
}`;

  const cleanText = await callClaude(apiKey, {
    system: systemPrompt,
    content: pageText,
    maxTokens: 1600
  });

  let parsed;
  try {
    parsed = JSON.parse(cleanText);
  } catch (e) {
    throw new Error("解析JD识别结果失败: " + cleanText.slice(0, 200));
  }

  const jd = (parsed.jd || "").trim();
  if (!jd) {
    throw new Error("未能在本页识别到职位描述,请在页面上手动选中JD文本");
  }

  return {
    jd,
    company: (parsed.company || "").trim(),
    position: (parsed.position || "").trim(),
    city: (parsed.city || "").trim()
  };
}

// 把当前岗位保存到 job-tracker 的投递记录(POST /api/applications)
async function handleSaveApplication(application) {
  if (!application || !application.company || !application.position) {
    throw new Error("公司和岗位为必填");
  }

  const { trackerUrl } = await chrome.storage.local.get("trackerUrl");
  const baseUrl = (trackerUrl || "http://localhost:3000").replace(/\/+$/, "");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(application),
      signal: controller.signal
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`请求超时(超过${REQUEST_TIMEOUT_MS / 1000}秒未响应),请检查投递记录工具是否在运行`);
    }
    throw new Error("无法连接投递记录工具,请确认它已启动、地址配置正确");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`保存失败 (${response.status}): ${errText}`);
  }

  return response.json();
}

// content.js
// 监听用户选中文本,记录最近一次选中内容
// 当 popup 打开并请求时,返回当前页面的选中文本

let lastSelectedText = "";

document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : "";
  if (text.length > 0) {
    lastSelectedText = text;
  }
});

// 监听来自 popup/background 的请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_SELECTED_TEXT") {
    sendResponse({ selectedText: lastSelectedText });
    return;
  }

  if (message.type === "GET_PAGE_TEXT") {
    // 返回整页可见文本,交给 background 调用 Claude 提取 JD
    // 截断到 30000 字符,避免消息过大 / token 过多
    const raw = document.body ? document.body.innerText || "" : "";
    sendResponse({ pageText: raw.replace(/\n{3,}/g, "\n\n").trim().slice(0, 30000) });
    return;
  }
});

const apiKeyInput = document.getElementById("apiKey");
const trackerUrlInput = document.getElementById("trackerUrl");
const saveBtn = document.getElementById("saveBtn");
const savedMsg = document.getElementById("savedMsg");

// 加载已保存的设置
chrome.storage.local.get(["apiKey", "trackerUrl"]).then(({ apiKey, trackerUrl }) => {
  if (apiKey) apiKeyInput.value = apiKey;
  if (trackerUrl) trackerUrlInput.value = trackerUrl;
});

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  // 去掉末尾斜杠，保证拼接 /api/applications 时不出现双斜杠
  const trackerUrl = trackerUrlInput.value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ apiKey, trackerUrl });
  savedMsg.style.display = "inline";
  setTimeout(() => (savedMsg.style.display = "none"), 1500);
});

const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const savedMsg = document.getElementById("savedMsg");

// 加载已保存的key
chrome.storage.local.get("apiKey").then(({ apiKey }) => {
  if (apiKey) apiKeyInput.value = apiKey;
});

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  await chrome.storage.local.set({ apiKey });
  savedMsg.style.display = "inline";
  setTimeout(() => (savedMsg.style.display = "none"), 1500);
});

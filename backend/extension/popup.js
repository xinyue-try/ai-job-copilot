const statusEl = document.querySelector("#status");

async function capturePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: document.title,
      url: location.href,
      text: document.body.innerText.replace(/\n{3,}/g, "\n\n").trim(),
    }),
  });

  const response = await fetch("http://localhost:5177/api/ingest-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result.result),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "发送失败");
  return payload.page;
}

document.querySelector("#sendBtn").addEventListener("click", async () => {
  statusEl.textContent = "正在读取当前页...";
  try {
    const page = await capturePage();
    statusEl.textContent = `已发送：${page.title || "当前页面"}`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

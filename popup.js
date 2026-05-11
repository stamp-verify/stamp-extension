// Popup controller: shows the current tab, dispatches the stamp request to
// the background service worker, renders status + result.

const stampBtn = document.getElementById("stamp-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const resultHash = document.getElementById("result-hash");
const resultLink = document.getElementById("result-link");
const targetUrl = document.getElementById("target-url");
const openOptions = document.getElementById("open-options");

let activeTab = null;

(async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  targetUrl.textContent = tab?.url ?? "(no active tab)";

  // Restricted pages chrome can't capture (chrome://, file://, extension pages)
  if (!tab?.url || /^(chrome|edge|about|file|chrome-extension|moz-extension):/i.test(tab.url)) {
    stampBtn.disabled = true;
    showStatus("Cannot stamp this kind of page (browser internal or local file).", "error");
  }
})();

stampBtn.addEventListener("click", async () => {
  hide(resultEl);
  showStatus("Capturing page…");
  stampBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "stamp",
      tabId: activeTab.id,
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "unknown error");
    }

    hide(statusEl);
    resultHash.textContent = response.hash;
    resultLink.href = `https://bastamp.com/verify/${response.hash}`;
    show(resultEl);
  } catch (err) {
    showStatus("Error: " + (err.message ?? err), "error");
  } finally {
    stampBtn.disabled = false;
  }
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

function showStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", kind === "error");
  show(statusEl);
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

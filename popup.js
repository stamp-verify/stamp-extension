// Popup controller — state machine: ready → generating → confirm → done.
// State is mirrored in chrome.storage.local so closing/reopening the popup
// restores the correct view.

const states = {
  ready: document.getElementById("state-ready"),
  generating: document.getElementById("state-generating"),
  confirm: document.getElementById("state-confirm"),
  done: document.getElementById("state-done"),
  error: document.getElementById("state-error"),
};

const captureBtn = document.getElementById("capture-btn");
const confirmBtn = document.getElementById("confirm-btn");
const cancelBtn = document.getElementById("cancel-btn");
const resetBtn = document.getElementById("reset-btn");
const errorResetBtn = document.getElementById("error-reset-btn");
const openOptions = document.getElementById("open-options");

const targetUrl = document.getElementById("target-url");
const pendingFormat = document.getElementById("pending-format");
const pendingSize = document.getElementById("pending-size");
const pendingHash = document.getElementById("pending-hash");
const doneHash = document.getElementById("done-hash");
const doneLink = document.getElementById("done-link");
const errorBody = document.getElementById("error-body");
const generatingHint = document.getElementById("generating-hint");
const creditsLine = document.getElementById("credits-line");
const doneStatus = document.getElementById("done-status");
const copyLink = document.getElementById("copy-link");

let activeTab = null;
let statusTimer = null;

(async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  targetUrl.textContent = tab?.url ?? "(no active tab)";

  if (!tab?.url || /^(chrome|edge|about|file|chrome-extension|moz-extension):/i.test(tab.url)) {
    captureBtn.disabled = true;
    targetUrl.style.color = "#8a8f98";
    targetUrl.textContent = `Cannot stamp ${tab?.url ?? "this page"} — browser-internal pages aren't accessible to extensions.`;
  }

  // If there's a pending preview (e.g. user closed the popup and reopened),
  // jump straight to the confirm state.
  const { pending } = await sendMsg({ type: "getPending" });
  if (pending) renderConfirm(pending);
  else show("ready");

  loadCredits();
})();

captureBtn.addEventListener("click", async () => {
  const format = document.querySelector('input[name="format"]:checked')?.value || "pdf";
  generatingHint.textContent = format === "pdf"
    ? `Chrome will briefly show a "DevTools attached" bar — that's the PDF capture step.`
    : "Capturing the visible viewport with a URL banner overlay…";
  show("generating");
  const res = await sendMsg({ type: "previewStamp", tabId: activeTab.id, format });
  if (!res.ok) return renderError(res.error);
  renderConfirm({
    hash: res.hash,
    fileName: res.fileName,
    fileSize: res.fileSize,
    format: res.format,
  });
});

confirmBtn.addEventListener("click", async () => {
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  const res = await sendMsg({ type: "confirmStamp" });
  if (!res.ok) {
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    return renderError(res.error);
  }
  doneHash.textContent = res.hash;
  doneLink.href = `https://bastamp.com/verify/${res.hash}`;
  show("done");
  startStatusPolling(res.hash);
});

cancelBtn.addEventListener("click", async () => {
  cancelBtn.disabled = true;
  confirmBtn.disabled = true;
  await sendMsg({ type: "cancelStamp" });
  show("ready");
});

resetBtn.addEventListener("click", () => { stopStatusPolling(); show("ready"); loadCredits(); });
errorResetBtn.addEventListener("click", () => show("ready"));

copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(doneLink.href);
    copyLink.textContent = "Copied ✓";
    setTimeout(() => { copyLink.textContent = "Copy link"; }, 1500);
  } catch { /* clipboard blocked — the link stays visible to copy manually */ }
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ── helpers ──

function show(name) {
  for (const k of Object.keys(states)) states[k].classList.toggle("hidden", k !== name);
}

function renderConfirm(p) {
  pendingFormat.textContent = p.format === "png" ? "PNG screenshot" : "Full-page PDF";
  pendingSize.textContent = formatBytes(p.fileSize);
  pendingHash.textContent = p.hash;
  confirmBtn.disabled = false;
  cancelBtn.disabled = false;
  show("confirm");
}

function renderError(msg) {
  errorBody.textContent = msg ?? "Unknown error";
  show("error");
}

async function loadCredits() {
  const res = await sendMsg({ type: "getAccount" });
  if (res.ok && res.configured) {
    creditsLine.textContent = `${res.credits} credit${res.credits === 1 ? "" : "s"} left`;
    creditsLine.hidden = false;
  } else if (res.ok && res.configured === false) {
    creditsLine.textContent = "No API key set — open Settings.";
    creditsLine.hidden = false;
  } else {
    creditsLine.hidden = true; // network/API error: don't nag, the capture flow surfaces it
  }
}

function stopStatusPolling() {
  if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
}

// Poll the anchor status until Polygon settles, then stop. Bitcoin follows
// over ~24h via OpenTimestamps — too slow to poll in a popup, so we note it.
function startStatusPolling(hash) {
  stopStatusPolling();
  const poll = async () => {
    const res = await sendMsg({ type: "getStatus", hash });
    if (!res.ok) { doneStatus.textContent = "status unavailable"; doneStatus.style.color = ""; return; }
    const label = statusLabel(res);
    doneStatus.textContent = label.text;
    doneStatus.style.color = label.color;
    if (label.stop) return;
    statusTimer = setTimeout(poll, 8000);
  };
  poll();
}

function statusLabel(res) {
  if (res.state === "anchored" && res.anchor) {
    const btc = res.anchor.bitcoin;
    if (btc && btc.status === "confirmed") {
      return { text: "anchored on Polygon + Bitcoin ✓", color: "#16c172", stop: true };
    }
    return { text: "anchored on Polygon · Bitcoin to follow (~24h)", color: "#16c172", stop: true };
  }
  if (res.state === "none") return { text: "submitting…", color: "" };
  return { text: "pending — anchoring on Polygon (~5 min)", color: "" };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function sendMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response ?? { ok: false, error: "no response from service worker" });
      }
    });
  });
}

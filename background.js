// Service worker: split the stamp flow into preview + confirm so the user
// reviews the captured artifact before a credit is charged.
//
// Messages from popup:
//   { type: "previewStamp", tabId, format }
//       Capture page as PDF or PNG, save to Downloads, open it for review,
//       store the pending state, return { hash, fileSize, format, fileName }.
//   { type: "confirmStamp" }
//       Read pending state, POST to /api/v1/stamps (1 credit), clear pending.
//   { type: "cancelStamp" }
//       Read pending state, delete the previewed file from Downloads, clear.
//   { type: "getPending" }
//       Return pending state if any (popup uses this on open to restore UI).

const API_BASE = "https://bastamp.com";
const CDP_PROTOCOL_VERSION = "1.3";
const PENDING_TTL_MS = 30 * 60 * 1000; // 30 min — preview state expires
const PENDING_KEY = "pendingStamp";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler =
    msg?.type === "previewStamp" ? handlePreview(msg) :
    msg?.type === "confirmStamp" ? handleConfirm() :
    msg?.type === "cancelStamp" ? handleCancel() :
    msg?.type === "getPending" ? handleGetPending() :
    null;
  if (!handler) return;
  handler
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((err) => sendResponse({ ok: false, error: err.message ?? String(err) }));
  return true; // async sendResponse
});

// ── preview ──

async function handlePreview({ tabId, format }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API key not set. Open Settings and paste your bastamp.com API key.");
  }

  const tab = await chrome.tabs.get(tabId);
  const capturedAt = new Date().toISOString();

  let bytes, mimeType, extension;
  if (format === "png") {
    bytes = await captureViewportPng(tab.windowId, tab.url, capturedAt);
    mimeType = "image/png";
    extension = "png";
  } else {
    bytes = await capturePagePdf(tabId, tab.url, capturedAt);
    mimeType = "application/pdf";
    extension = "pdf";
  }

  const contentHash = "0x" + (await sha256HexFromBytes(bytes));
  const fileName = makeFileName(tab.url, capturedAt, extension);
  const dataUrl = bytesToDataUrl(bytes, mimeType);

  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename: fileName,
    saveAs: false,
  });
  // Open the saved file for review (PDF viewer or image viewer).
  try { await chrome.downloads.open(downloadId); } catch { /* best-effort */ }

  await chrome.storage.local.set({
    [PENDING_KEY]: {
      contentHash,
      fileName,
      fileSize: bytes.length,
      mimeType,
      format,
      downloadId,
      sourceUrl: tab.url,
      capturedAt,
      createdAtMs: Date.now(),
    },
  });

  return { hash: contentHash, fileName, fileSize: bytes.length, format };
}

// ── confirm: anchor on chain ──

async function handleConfirm() {
  const pending = await readPending();
  if (!pending) throw new Error("no pending stamp to confirm");

  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("API key not set");

  const requestBody = JSON.stringify({
    contentHash: pending.contentHash,
    fileName: pending.fileName,
    fileSize: pending.fileSize,
    mimeType: pending.mimeType,
  });
  console.log("[bastamp] POST /api/v1/stamps", {
    contentHash: pending.contentHash, format: pending.format, fileSize: pending.fileSize,
  });

  const apiResponse = await fetch(`${API_BASE}/api/v1/stamps`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: requestBody,
  });
  const responseText = await apiResponse.text();
  console.log("[bastamp] response", {
    status: apiResponse.status, ok: apiResponse.ok, body: responseText.slice(0, 500),
  });

  if (!apiResponse.ok) {
    let parsed;
    try { parsed = JSON.parse(responseText); } catch {}
    const msg = parsed?.error?.message ?? parsed?.error ?? responseText ?? `HTTP ${apiResponse.status}`;
    throw new Error(`bastamp.com: ${msg}`);
  }
  let serverHash = null;
  try {
    const parsed = JSON.parse(responseText);
    serverHash = parsed?.stamp?.contentHash ?? null;
  } catch {}
  if (serverHash && serverHash.toLowerCase() !== pending.contentHash.toLowerCase()) {
    console.error("[bastamp] HASH MISMATCH", { sent: pending.contentHash, server: serverHash });
    throw new Error(`server echoed a different hash: ${serverHash}`);
  }
  if (!serverHash) {
    console.error("[bastamp] server response had no stamp.contentHash", responseText.slice(0, 500));
    throw new Error("server response had no stamp.contentHash");
  }

  await chrome.storage.local.remove(PENDING_KEY);

  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/128.png",
      title: "BA | Stamp",
      message: "Page stamped on chain. 1 credit charged.",
    });
  } catch {}

  return { hash: pending.contentHash };
}

// ── cancel: discard preview ──

async function handleCancel() {
  const pending = await readPending();
  if (!pending) return { discarded: false };

  try {
    await chrome.downloads.removeFile(pending.downloadId);
  } catch (e) {
    console.warn("[bastamp] removeFile failed (file may already be gone):", e?.message);
  }
  try {
    await chrome.downloads.erase({ id: pending.downloadId });
  } catch {}

  await chrome.storage.local.remove(PENDING_KEY);
  return { discarded: true };
}

// ── pending state ──

async function readPending() {
  const stored = (await chrome.storage.local.get([PENDING_KEY]))?.[PENDING_KEY];
  if (!stored) return null;
  if (Date.now() - stored.createdAtMs > PENDING_TTL_MS) {
    await chrome.storage.local.remove(PENDING_KEY);
    return null;
  }
  return stored;
}

async function handleGetPending() {
  const pending = await readPending();
  if (!pending) return { pending: null };
  return {
    pending: {
      hash: pending.contentHash,
      fileName: pending.fileName,
      fileSize: pending.fileSize,
      format: pending.format,
      sourceUrl: pending.sourceUrl,
      capturedAt: pending.capturedAt,
    },
  };
}

// ── full-page PDF via CDP ──

async function capturePagePdf(tabId, url, capturedAtIso) {
  const target = { tabId };
  await chrome.debugger.attach(target, CDP_PROTOCOL_VERSION);
  try {
    const headerTemplate = `
      <div style="width:100%;font-size:7px;color:#888;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;">
        <span style="letter-spacing:0.18em;font-weight:700;color:#444">BA | STAMP</span>
        <span class="title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;text-align:center;color:#666"></span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`;
    const footerTemplate = `
      <div style="width:100%;font-size:7px;color:#888;padding:0 12mm;display:flex;justify-content:space-between;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;color:#666">${escapeHtmlAttr(url)}</span>
        <span style="color:#666">Captured ${escapeHtmlAttr(capturedAtIso)}</span>
      </div>`;

    const result = await chrome.debugger.sendCommand(target, "Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: false,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.5, marginBottom: 0.5, marginLeft: 0.4, marginRight: 0.4,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      generateDocumentOutline: false,
    });
    if (!result?.data) throw new Error("Page.printToPDF returned no data");
    return base64ToBytes(result.data);
  } finally {
    try { await chrome.debugger.detach(target); } catch {}
  }
}

// ── viewport PNG with URL banner overlay ──

async function captureViewportPng(windowId, url, capturedAtIso) {
  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const screenshotBlob = await (await fetch(screenshotDataUrl)).blob();
  const bitmap = await createImageBitmap(screenshotBlob);

  const BANNER = 56;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height + BANNER);
  const ctx = canvas.getContext("2d");

  // Banner background (dark) at top
  ctx.fillStyle = "#080c12";
  ctx.fillRect(0, 0, canvas.width, BANNER);

  // Brand label
  ctx.fillStyle = "#5eead4";
  ctx.font = "bold 11px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("BA | STAMP", 16, 22);

  // URL (truncate if too long)
  const maxUrlChars = Math.floor((canvas.width - 32) / 7);
  const urlText = url.length > maxUrlChars ? url.slice(0, maxUrlChars - 1) + "…" : url;
  ctx.fillStyle = "#e4e4e7";
  ctx.font = "13px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(urlText, 16, 40);

  // Timestamp (right-aligned)
  ctx.fillStyle = "#8a8f98";
  ctx.font = "11px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Captured " + capturedAtIso, canvas.width - 16, 22);
  ctx.textAlign = "left";

  // The screenshot itself, below the banner
  ctx.drawImage(bitmap, 0, BANNER);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

// ── helpers ──

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get(["apiKey"]);
  return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
}

function makeFileName(url, capturedAtIso, extension) {
  let host = "page";
  try { host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"); } catch {}
  const stamp = capturedAtIso.replace(/[:.]/g, "-").slice(0, 19);
  return `bastamp-${host}-${stamp}.${extension}`;
}

function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToDataUrl(bytes, mimeType) {
  // Chunked btoa to avoid stack overflow on large buffers.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(bin)}`;
}

async function sha256HexFromBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

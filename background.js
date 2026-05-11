// Service worker: captures the active tab as a full-page PDF, anchors the
// PDF's SHA-256 on Polygon via bastamp.com's public API, saves the PDF to
// the user's Downloads folder. Done.
//
// Flow per click:
//   1. chrome.debugger.attach (yellow "DevTools attached" bar flashes briefly)
//   2. Page.printToPDF with header/footer template stamped onto every page
//   3. chrome.debugger.detach
//   4. SHA-256(PDF bytes) → contentHash
//   5. POST /api/v1/stamps with the user's API key
//   6. Cross-check that server echoes back the same hash
//   7. chrome.downloads.download the PDF
//
// The PDF *is* the bundle. To verify later, the user drops the same PDF on
// bastamp.com/verify/<hash>, which hashes the file and compares with the
// on-chain anchor.

const API_BASE = "https://bastamp.com";
const CDP_PROTOCOL_VERSION = "1.3";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "stamp") return;
  stampCurrentTab(msg.tabId)
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((err) => sendResponse({ ok: false, error: err.message ?? String(err) }));
  return true; // keeps the message channel open for async sendResponse
});

async function stampCurrentTab(tabId) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API key not set. Open Settings and paste your bastamp.com API key.");
  }

  const tab = await chrome.tabs.get(tabId);
  const capturedAt = new Date().toISOString();

  // Step 1 — full-page PDF via CDP, with our header/footer baked into
  // every page (URL + timestamp + BA Stamp branding).
  const pdfBase64 = await capturePagePdf(tabId, tab.url, capturedAt);
  const pdfBytes = base64ToBytes(pdfBase64);

  // Step 2 — hash the PDF bytes. This is the on-chain anchor and the
  // only thing the user needs to verify the artifact later.
  const contentHash = "0x" + (await sha256HexFromBytes(pdfBytes));

  // Step 3 — anchor via the public API
  const fileName = makeFileName(tab.url, capturedAt);
  const requestBody = JSON.stringify({
    contentHash,
    fileName,
    fileSize: pdfBytes.length,
    mimeType: "application/pdf",
  });
  console.log("[bastamp] POST /api/v1/stamps", { contentHash, fileSize: pdfBytes.length });

  const apiResponse = await fetch(`${API_BASE}/api/v1/stamps`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: requestBody,
  });
  const responseText = await apiResponse.text();
  console.log("[bastamp] response", { status: apiResponse.status, ok: apiResponse.ok, body: responseText.slice(0, 500) });

  if (!apiResponse.ok) {
    let parsed;
    try { parsed = JSON.parse(responseText); } catch { /* not json */ }
    const msg = parsed?.error?.message ?? parsed?.error ?? responseText ?? `HTTP ${apiResponse.status}`;
    throw new Error(`bastamp.com: ${msg}`);
  }
  let serverHash = null;
  try {
    const parsed = JSON.parse(responseText);
    serverHash = parsed?.stamp?.contentHash ?? null;
  } catch { /* unexpected */ }
  if (serverHash && serverHash.toLowerCase() !== contentHash.toLowerCase()) {
    console.error("[bastamp] HASH MISMATCH", { sent: contentHash, server: serverHash });
    throw new Error(`server echoed a different hash: ${serverHash}`);
  }
  if (!serverHash) {
    console.error("[bastamp] server response had no stamp.contentHash", responseText.slice(0, 500));
    throw new Error("server response had no stamp.contentHash — see service worker console");
  }

  // Step 4 — save PDF to Downloads
  const pdfDataUrl = "data:application/pdf;base64," + pdfBase64;
  await chrome.downloads.download({
    url: pdfDataUrl,
    filename: fileName,
    saveAs: false,
  });

  // Step 5 — toast
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/128.png",
      title: "BA | Stamp",
      message: "Page stamped. PDF saved to Downloads.",
    });
  } catch { /* notifications may not be granted */ }

  return { hash: contentHash };
}

// ── full-page PDF via CDP, with branded header/footer ──

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
      paperWidth: 8.27,   // A4 portrait
      paperHeight: 11.69,
      marginTop: 0.5,
      marginBottom: 0.5,
      marginLeft: 0.4,
      marginRight: 0.4,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      generateDocumentOutline: false,
    });
    if (!result?.data) throw new Error("Page.printToPDF returned no data");
    return result.data;
  } finally {
    try { await chrome.debugger.detach(target); } catch {}
  }
}

// ── helpers ──

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get(["apiKey"]);
  return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
}

function makeFileName(url, capturedAtIso) {
  let host = "page";
  try { host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"); } catch {}
  const stamp = capturedAtIso.replace(/[:.]/g, "-").slice(0, 19);
  return `bastamp-${host}-${stamp}.pdf`;
}

function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256HexFromBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

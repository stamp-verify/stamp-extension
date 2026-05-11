// Service worker: orchestrates the capture flow.
//
//   1. Screenshot of the visible tab via chrome.tabs.captureVisibleTab
//   2. DOM snapshot via chrome.scripting.executeScript (returns outerHTML)
//   3. Build a deterministic JSON manifest with metadata + the three parts
//   4. SHA-256 the canonicalized manifest → that's what we anchor
//   5. POST { contentHash, fileName, mimeType, locale } to /api/v1/stamps
//   6. Download the manifest JSON to user's Downloads folder
//
// The user keeps the bundle. To verify later they drop it on
// bastamp.com/verify, which re-canonicalizes and re-hashes it against the
// on-chain anchor. Backend stores only the hash — never the page itself.

const API_BASE = "https://bastamp.com";

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

  // Step 1 — visible-viewport screenshot (PNG, base64 data URL)
  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });

  // Step 2 — DOM snapshot
  const [{ result: domResult }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      title: document.title,
      html: document.documentElement.outerHTML,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      userAgent: navigator.userAgent,
    }),
  });

  // Step 3 — manifest
  const screenshotBase64 = screenshotDataUrl.replace(/^data:image\/png;base64,/, "");
  const manifest = {
    type: "bastamp.web-capture",
    version: "1",
    capturedAt: new Date().toISOString(),
    source: {
      url: tab.url,
      title: domResult.title,
      userAgent: domResult.userAgent,
      viewport: domResult.viewport,
    },
    content: {
      domSha256: await sha256Hex(domResult.html),
      domLength: domResult.html.length,
    },
    screenshot: {
      mimeType: "image/png",
      sha256: await sha256HexFromBase64(screenshotBase64),
    },
  };

  // Step 4 — canonicalize + hash the manifest
  // Bundle is the manifest + the raw parts. Anchor hash is over the manifest
  // alone (the manifest already commits to dom and screenshot via their
  // SHA-256, so reproducing the manifest from the parts is sufficient).
  const manifestCanon = canonicalize(manifest);
  const manifestHash = "0x" + (await sha256Hex(manifestCanon));

  const bundle = {
    manifest,
    parts: {
      dom: domResult.html,
      screenshotBase64,
    },
  };

  // Step 5 — anchor on chain via the public API
  const apiResponse = await fetch(`${API_BASE}/api/v1/stamps`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contentHash: manifestHash,
      fileName: makeFileName(tab.url),
      fileSize: manifestCanon.length,
      mimeType: "application/x-bastamp-web-capture",
    }),
  });

  if (!apiResponse.ok) {
    const body = await apiResponse.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { /* not json */ }
    const msg = parsed?.error?.message ?? parsed?.error ?? body ?? `HTTP ${apiResponse.status}`;
    throw new Error(`bastamp.com: ${msg}`);
  }

  // Step 6 — save bundle to Downloads
  const bundleJson = JSON.stringify(bundle, null, 2);
  const bundleDataUrl =
    "data:application/json;base64," + btoa(unescape(encodeURIComponent(bundleJson)));
  await chrome.downloads.download({
    url: bundleDataUrl,
    filename: makeFileName(tab.url),
    saveAs: false,
  });

  // Optional toast
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/128.png",
      title: "BA | Stamp",
      message: "Page stamped. Bundle saved to Downloads.",
    });
  } catch { /* notifications may not be granted */ }

  return { hash: manifestHash };
}

// ── helpers ──

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get(["apiKey"]);
  return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
}

function makeFileName(url) {
  let host = "page";
  try { host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_"); } catch {}
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `bastamp-${host}-${stamp}.json`;
}

// Canonical JSON: deterministic stringification with sorted keys at every
// depth, no whitespace. RFC 8785 (JCS) compatible for the shapes we use
// here (strings, numbers, booleans, null, objects, arrays — no Unicode
// escape quirks because we let JSON.stringify handle escaping).
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexFromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

# BA | Stamp browser extension

Web-page timestamping in two clicks. The extension captures the current page (full-page PDF *or* visible-viewport PNG, your choice), opens the captured file so you can review it, and only anchors its SHA-256 on the Polygon blockchain — charging one credit — after you click **Confirm**.

The captured file (PDF or PNG) is your evidence. Drop it on `bastamp.com/verify/<hash>` (or hash it yourself) to prove it hasn't been tampered with since the on-chain anchor.

## What it certifies

That **this specific PDF** existed at the time it was anchored. The on-chain transaction commits to the PDF's SHA-256 forever; anyone can recompute the hash to confirm it matches.

It does **not** certify that the page was authentic, that the server wasn't lying, or that no one tampered with the page before you captured it. It proves the page *as you saw it* existed at this time. That's the use case for journalism, IP filings, AI output provenance, scam evidence, and audit trails.

## How it works

1. Click the toolbar button on any page. Pick **Full-page PDF** (selectable text, every section, URL + timestamp footer on every page) or **Screenshot PNG** (visible viewport with a URL + timestamp banner above the image). Click **Capture & preview**.
2. The extension generates the file via Chrome's DevTools Protocol (for PDF) or `tabs.captureVisibleTab` + OffscreenCanvas (for PNG), saves it to your Downloads, and opens it for review. **No credit charged yet.**
3. You inspect the file — fonts, layout, missing content. If anything's wrong, click **Cancel & delete file** in the popup; the file is removed from Downloads and nothing happens on chain.
4. If it looks right, click **Confirm & anchor (1 credit)**. The extension SHA-256s the file and POSTs `{ contentHash, fileSize, fileName, mimeType }` to `https://bastamp.com/api/v1/stamps` with your API key. **The file itself never leaves your browser.**
5. bastamp.com batches your hash into a Merkle tree and anchors the root on Polygon (~5 min). The anchor is forever. The file stays in your Downloads.

## How to verify

### On bastamp.com (easiest)

1. Visit `https://bastamp.com/verify/<hash>` (the popup shows the link after stamping).
2. Drop the PDF on the file drop zone.
3. The page recomputes the PDF's SHA-256 and compares it with the on-chain anchor. Match = the file is identical to the one stamped.

### Offline (technical users — no trust in bastamp.com required)

```bash
# any platform
sha256sum bastamp-<host>-<date>.pdf      # macOS/Linux
certutil -hashfile bastamp-…pdf SHA256   # Windows
```

The output (prefix `0x` to match BA Stamp's format) is what was anchored on Polygon. Use the open-source [stamp-verify](https://github.com/stamp-verify/stamp-verify) CLI to query the on-chain anchor independently and confirm the match — no bastamp.com involvement at all.

## Install (development — "load unpacked")

1. Clone or download this repo.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Toggle **Developer mode** in the top right.
4. Click **Load unpacked** and select the `stamp-extension` folder.
5. Click the BA Stamp toolbar icon → **Settings** → paste your API key.
   - Don't have one? Create one at [bastamp.com/account/api-keys](https://bastamp.com/account/api-keys). First stamp on a new account is free.

Each stamp uses one credit from your bastamp.com account.

## Permissions explained

| Permission | What it's for |
|---|---|
| `activeTab` | Read the current page (URL + viewport contents) when you click the toolbar button. |
| `debugger` | Required by Chrome to use `Page.printToPDF` (the only way to capture a full-page PDF, not just the visible part). Chrome briefly shows a yellow "DevTools attached" bar; the extension detaches as soon as the PDF is generated (≤2 seconds for most pages). Not used for PNG captures. |
| `downloads` | Save the captured file to your Downloads folder, open it for preview, and delete it if you cancel. |
| `storage` | Store your API key and the in-progress preview state locally (chrome.storage.local — never leaves the browser). |
| `notifications` | Show a "page stamped" toast on confirm. |
| `host_permissions: https://bastamp.com/*` | Call the stamping API. |

The extension does **not** request access to all sites, your network, your history, bookmarks, cookies, or any other data.

## What gets sent to bastamp.com

Only this, every time you click stamp:

```json
{
  "contentHash": "0x<sha256 of the pdf>",
  "fileName": "bastamp-<host>-<date>.pdf",
  "fileSize": <int>,
  "mimeType": "application/pdf"
}
```

Plus your `Authorization: Bearer <api_key>` header. **The page contents and the PDF itself never leave your browser.**

## Architecture

```
manifest.json    MV3 declaration (permissions, scripts, icons)
popup.html/.js   UI: current URL, "Stamp this page" button, result panel
options.html/.js Settings (API key) + full explainer
background.js   Orchestrator: chrome.debugger → Page.printToPDF → SHA-256 →
                fetch POST /api/v1/stamps → cross-check server-echoed hash →
                chrome.downloads.download
icons/          16/48/128 PNG (scaled from the BA Stamp app icon)
```

No build step. Pure browser APIs. Anyone can read every line before installing — which is the point.

## License

MIT — see [LICENSE](./LICENSE).

## Roadmap

- Sign for Firefox Add-ons (currently Chrome / Edge / Brave only)
- Optional inclusion of response HTTP headers in the PDF (forensic completeness)
- Keyboard shortcut
- Right-click context menu "Stamp this page"
- Chrome Web Store + Firefox Add-ons submission (see [PUBLISHING.md](./PUBLISHING.md))

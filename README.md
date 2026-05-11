# BA | Stamp browser extension

One-click web-page timestamping for [BA | Stamp](https://bastamp.com). Click the toolbar button, the extension captures the current page (URL + DOM + visible-viewport screenshot), hashes the capture, and anchors that hash on the Polygon blockchain via the public API.

Useful for journalists, IP researchers, scam tracking, AI provenance — anywhere you need to prove "this URL looked like this at this exact time".

## What it captures

- **URL** of the active tab
- **DOM** snapshot (`document.documentElement.outerHTML`) at click time
- **Visible viewport screenshot** (PNG)
- **Capture metadata** (timestamp, viewport size, user agent, page title)

These are bundled into a single JSON file, the SHA-256 of which is anchored on Polygon. The bundle is downloaded to your Downloads folder — keep it; you need it to verify the stamp later.

**The page contents never leave your browser**, except as a hash sent to bastamp.com. The bundle stays with you.

## Install (development, "load unpacked")

1. Clone or download this repo.
2. Open `chrome://extensions` (or `edge://extensions`, `about:debugging` on Firefox).
3. Toggle **Developer mode**.
4. Click **Load unpacked** and select the `stamp-extension` folder.
5. Click the extension's icon → **Settings** → paste your bastamp.com API key (create one at [bastamp.com/account/api-keys](https://bastamp.com/account/api-keys)).

Each stamp uses one credit from your bastamp.com account.

## Verify a stamp

Visit `https://bastamp.com/verify/<hash>` (the popup shows the link after stamping). To prove the bundle hasn't been tampered with, you can recompute its hash locally:

```bash
# canonicalize the manifest portion of the bundle and SHA-256 it
jq -c -S '.manifest' bastamp-example.com-2026-05-11.json | sha256sum
```

The output must match the hash on the verify page.

## How the hashing works

The bundle has two parts:

1. **`manifest`** — a small JSON object with metadata + the SHA-256 of the DOM and the SHA-256 of the screenshot bytes.
2. **`parts`** — the raw DOM string and base64-encoded screenshot.

The **anchor hash** is computed only over the canonicalized `manifest`. Since `manifest` already commits to the DOM and screenshot via their SHA-256s, verifying the anchor proves both parts match the on-chain record.

Canonicalization uses sorted-key JSON, no whitespace (RFC 8785–compatible for the shapes used here).

## Permissions explained

- `activeTab` + `scripting` — read the DOM and capture the screenshot of the page you click the button on. Nothing else.
- `downloads` — save the bundle to your Downloads folder.
- `storage` — store your API key locally.
- `notifications` — show a "page stamped" toast.
- `host_permissions: https://bastamp.com/*` — call the public stamping API.

The extension does **not** request access to all sites, the network, your history, or any other data.

## Architecture

```
popup.html / popup.js     → UI: shows current URL, "Stamp this page" button
background.js             → orchestrates: screenshot → DOM → manifest → hash → API → download
options.html / options.js → save API key in chrome.storage.local
manifest.json             → MV3 declaration (permissions, scripts, icons)
```

No build step. Pure DOM APIs + `chrome.*` extension APIs + `crypto.subtle` for hashing. Read every line before installing.

## License

MIT — see [LICENSE](./LICENSE).

## Roadmap (v0.2 and beyond)

- Full-page screenshot (stitch across scroll, currently visible-viewport only)
- Response HTTP headers (requires `webRequest` listener in background)
- Firefox-specific build (manifest tweaks)
- Real icons (current set is scaled from the BA Stamp app icon)
- Chrome Web Store submission
- Browser-action shortcut keybinding

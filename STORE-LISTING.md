# Chrome Web Store listing — copy-paste content for v0.3.2

All fields below map 1:1 to the dev-console listing form. Paste verbatim, adjust if Google flags something during review.

---

## Item details

### Name (max 75 chars)
```
BA | Stamp — Anchor web pages on Polygon
```

### Summary (max 132 chars)
```
Capture any web page as PDF or PNG and anchor its hash on Polygon — verifiable proof a URL existed at this time.
```

### Description (paste in full)

```
BA | Stamp is a one-click web-page timestamping tool. Click the toolbar icon on any page, pick PDF or PNG, review the captured file in your viewer, then anchor its SHA-256 hash on the Polygon blockchain. The hash is anchored forever; anyone can verify that the file you have today matches the one stamped at that moment.

WHAT IT'S FOR
• Journalism — prove a public statement existed before it was edited or taken down.
• Intellectual property — prove a design, post, or document existed on this date.
• AI provenance — prove what an AI model output looked like at a specific time.
• Scam research and audit trails — capture web evidence with cryptographic timestamps.

HOW IT WORKS
1. Open any web page and click the BA | Stamp toolbar icon.
2. Choose Full-page PDF (selectable text, every section, URL + timestamp in every footer) or Screenshot PNG (visible viewport with a URL + timestamp banner above the screenshot).
3. Click "Capture & preview". The file is generated locally, saved to your Downloads folder, and opens in your viewer. No credit charged yet.
4. Inspect the file. If it looks right, click "Confirm & anchor (1 credit)". The extension SHA-256s the file and POSTs that hash to the public bastamp.com API. The hash gets anchored on Polygon in the next batch (~5 minutes).
5. If anything looks wrong, click "Cancel & delete file" — the file is removed from Downloads and no credit is charged.

WHAT GETS SENT
Only the SHA-256 hash of the captured file, the file size, the file name, and the MIME type. THE FILE ITSELF NEVER LEAVES YOUR BROWSER. The page contents are not transmitted, not stored, not analyzed.

HOW TO VERIFY A STAMP
Visit bastamp.com/verify/<hash> (the popup shows the link after confirming) and drop the captured file on the page. The verify page recomputes the SHA-256 and compares it with the on-chain anchor. You can also compute the hash yourself (sha256sum / certutil) — the open-source verifier at github.com/stamp-verify/stamp-verify confirms the on-chain match without any trust in bastamp.com.

PRICING
Each confirmed stamp uses one credit from your bastamp.com account. The first stamp on a new account is free; packs available at bastamp.com/pricing.

OPEN SOURCE
The extension is MIT-licensed. Every line of code is auditable: github.com/stamp-verify/stamp-extension. Read it before installing.
```

### Category
```
Productivity
```

### Language
```
English (United States)
```

---

## Privacy practices

### Single purpose (required, max ~1000 chars)
```
Timestamp the current web page on the Polygon blockchain by capturing it as a PDF or PNG image, hashing the captured file locally with SHA-256, and anchoring that hash on chain through the public bastamp.com API. The captured file itself never leaves the user's browser — only its hash is transmitted.
```

### Justification — `activeTab` permission
```
Used to access the URL and contents of the current tab when the user clicks the toolbar button. No tab data is read at any other time — only on explicit user action (clicking the extension icon and pressing "Capture & preview").
```

### Justification — `debugger` permission
```
Required by Chrome to use the DevTools Protocol command "Page.printToPDF", which is the only browser API capable of generating a PDF that includes the entire web page (content above and below the visible viewport, with selectable text). The debugger is attached only for the duration of the PDF generation (typically under 2 seconds) and detached immediately afterward. The extension does not use the debugger for any other purpose — no network inspection, no console reading, no breakpoints. The capability is also not invoked when the user chooses the PNG capture format.
```

### Justification — `downloads` permission
```
Used to (a) save the captured PDF or PNG file to the user's Downloads folder for preview before they decide whether to anchor it on chain, (b) open the saved file in the user's default viewer for that preview, and (c) delete the file from Downloads if the user cancels the stamp before confirming.
```

### Justification — `storage` permission
```
Stores the user's bastamp.com API key and the in-progress preview state in chrome.storage.local. Both values stay on the user's device and are never transmitted to any server other than bastamp.com (for the API key, only as the Authorization header on stamping requests).
```

### Justification — `notifications` permission
```
Shows a single confirmation toast after the user successfully anchors a stamp on chain ("Page stamped on chain. 1 credit charged."). Used only as a UX confirmation, never for marketing or alerts.
```

### Justification — `host_permissions: https://bastamp.com/*`
```
Required to call the bastamp.com REST API endpoint POST /api/v1/stamps to anchor the SHA-256 hash on the Polygon blockchain. No requests are made to any other origin.
```

### Privacy policy URL
```
https://bastamp.com/legal/privacy
```

### Data collection disclosure form (Chrome dev console)

Tick boxes as follows:

- **Personally identifiable info**: No (the API key authenticates the account but is created/managed by the user on bastamp.com; the extension only stores and transmits it).
- **Health info**: No.
- **Financial / payment info**: No (Stripe handles the credit purchase flow on bastamp.com — the extension never touches payment data).
- **Authentication info**: **Yes** → the user's bastamp.com API key, stored locally and sent as the Authorization header on stamping requests. Not shared with third parties.
- **Personal communications**: No.
- **Location**: No.
- **Web history**: **Yes** → only the URL of the page the user explicitly chooses to stamp, sent as part of the file name to bastamp.com. Not used for tracking, not shared with third parties.
- **User activity**: No.
- **Website content**: No (the SHA-256 hash is transmitted, not the content itself; the content never leaves the user's browser).

Confirmation checkboxes:
- ✓ I do not sell or transfer user data to third parties, outside of the approved use cases.
- ✓ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ✓ I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Visual assets

### Icon
`icons/128.png` (already in the zip — Chrome reads it from the manifest)

### Small promo tile (440×280) — REQUIRED
`stamp-extension-promo-440x280.png` (generated separately by the build script — open it in an image viewer; if the layout doesn't read well at small sizes, regenerate or hand-design)

### Marquee promo tile (1400×560) — OPTIONAL
Not generated yet. Add later if Chrome's homepage feature pages are a goal.

### Screenshots — at least 1, ideally 3–5 (1280×800)
Take these on your machine with the extension loaded:

1. **The popup, ready state.** Open the extension on a real page (e.g. https://bastamp.com). Capture the whole popup with both format options visible and the Capture button. Use a screenshot tool that lets you capture a specific window (gnome-screenshot, Flameshot, etc.). Scale or pad to 1280×800.
2. **The popup, confirm state.** After clicking "Capture & preview", capture the popup showing format/size/hash and the Confirm/Cancel buttons.
3. **The captured PDF.** Screenshot of the PDF open in Chrome's viewer with the footer (URL + timestamp + BA | STAMP) clearly visible.
4. **The settings page.** Full screenshot of `chrome-extension://<id>/options.html` showing the explainer sections.
5. **(Optional) A verify page.** Drop a stamped file on `bastamp.com/verify/<hash>` and capture the success state with the on-chain anchor details.

Naming convention: `screenshot-1-popup-ready.png`, `screenshot-2-popup-confirm.png`, etc.

---

## Submission checklist

- [ ] Sign in at https://chrome.google.com/webstore/devconsole (pay the one-time $5 developer fee if first time).
- [ ] New item → upload `stamp-extension-0.3.2.zip`.
- [ ] Paste Name, Summary, Description from above.
- [ ] Category: Productivity. Language: English (US).
- [ ] Upload icon (already in zip), small promo tile, and screenshots.
- [ ] Privacy practices form: paste justifications, paste Single Purpose, tick the disclosure boxes as above, paste privacy policy URL.
- [ ] Save draft, review the preview, then **Submit for review**.
- [ ] Expected turnaround: 1–3 business days. Items with `debugger` permission sometimes go through additional manual review — 5–7 days possible.

After approval the listing lives at `https://chrome.google.com/webstore/detail/<assigned-id>`. Update `bastamp.com/landing/Footer.tsx` to link to it.

## Re-building the zip on future releases

```bash
cd ~/stamp-extension
mkdir -p /tmp/sxs-build && rm -rf /tmp/sxs-build/*
cp -r manifest.json background.js popup.html popup.css popup.js \
      options.html options.js icons /tmp/sxs-build/
( cd /tmp/sxs-build && zip -r "$HOME/stamp-extension-$(jq -r .version manifest.json).zip" . )
```

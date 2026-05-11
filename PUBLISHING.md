# Publishing

## Chrome Web Store

**One-time:** sign up at <https://chrome.google.com/webstore/devconsole>. $5 developer fee (lifetime).

**Per release:**

1. Bump the version in `manifest.json` (semver).
2. Create the upload zip from the repo root:
   ```bash
   git archive --format=zip -o stamp-extension-$(jq -r .version manifest.json).zip HEAD
   ```
   Or zip the contents of the working tree excluding `.git`, `PUBLISHING.md`, and any local `.zip` files.
3. Go to the dev console → **Items** → click your extension (or **New item** for the first upload) → **Package** → **Upload new package** → drop the zip.
4. Fill in (or update) the listing on first submission:
   - **Description (short)**: ~100 chars. "One-click web-page timestamping on the Polygon blockchain — proof a URL existed as you saw it."
   - **Description (long)**: copy from README's "What it certifies" + "How it works" + "Privacy" sections.
   - **Category**: Productivity.
   - **Language**: English (others can be added later).
   - **Screenshots**: minimum one 1280x800 PNG. Capture the popup on a real page, plus the result panel after a stamp, plus the Settings page.
   - **Promo tile (small)**: 440x280 PNG. Just the BA Stamp logo + tagline.
   - **Privacy policy URL**: needed because we have `activeTab` + `debugger`. Use `https://bastamp.com/legal/privacy` (it covers data handling for all BA Stamp surfaces).
   - **Single purpose** (required field): "Timestamp the current web page on the Polygon blockchain and save the captured PDF locally."
   - **Permissions justification**: for each permission, paste the row from the README permissions table. The `debugger` permission triggers extra review — be explicit that it's used solely for `Page.printToPDF` and detached immediately after.
5. Click **Submit for review**. Typical turnaround: 1–3 business days. First submission with `debugger` permission may take longer (manual review).

After approval, the listing is at `https://chrome.google.com/webstore/detail/<id>`. The README and bastamp.com landing should link to that.

## Firefox Add-ons (AMO)

**One-time:** sign up at <https://addons.mozilla.org/developers/>. Free.

**Firefox-specific manifest tweak.** Firefox's MV3 still differs from Chrome's in a couple of places. Before submitting, add to `manifest.json`:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "stamp-extension@stamp-verify",
    "strict_min_version": "121.0"
  }
}
```

Firefox 121+ supports MV3 service workers as `background.scripts`; older versions don't. Also: `chrome.debugger` is **not supported** in Firefox at all. For the Firefox build we'd need a different capture strategy (e.g., `browser.tabs.saveAsPDF` if available, or fall back to viewport-only). Defer Firefox build until we decide on that path.

**Per release** (when ready):

1. Zip as for Chrome.
2. Submit at <https://addons.mozilla.org/developers/addon/submit>. Choose **listed** for public AMO listing, **unlisted** to self-distribute a signed XPI.
3. AMO requires source if the code is obfuscated. Ours isn't, so just zip is fine.
4. Review: hours to a day for simple add-ons. Faster than Chrome Web Store.

## Microsoft Edge Add-ons

Edge runs the Chrome build unchanged. Optionally submit to <https://partner.microsoft.com/dashboard/microsoftedge> for a listing on the Edge add-on store. Same zip, same listing assets. Free, no fee.

## Self-hosted CRX (not recommended)

Chrome blocks installation of self-hosted CRX files outside enterprise policies. Don't ship this way for public users — go through the Chrome Web Store.

## Updating

For Chrome Web Store: bump `manifest.json` version, re-zip, upload via the dev console, click **Submit for review**. Users get the update automatically within a few hours of approval — no action on their part.

A new permission (e.g., adding `webRequest` in the future) triggers an explicit user-side approval prompt before the update applies. Plan permission changes carefully.

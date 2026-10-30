# Uposatha · GitHub Pages edition

Version 18 · 30 October 2026

This is the existing Uposatha v15 app adapted for GitHub Pages. It includes the
complete app, the opening Namo Tassa, instrumental music, and all 18 tradition
recordings. Visitors need no account, email, phone number, API key or backend.

## Reading collection

Open **Read** to use the offline reader. It includes the complete Dhammapada
(423 verses in 26 chapters), the Heart Sutra, Loving-Kindness, Blessings, the
First Teaching, and the Eight Precepts discourse. Text size, paper/night mode
and the current chapter and reading position are saved on the device. Reading
preferences use the separate `uposatha-readings-v1` key and are now included
in practice backup files.

Five translations are by Bhikkhu Sujato (SuttaCentral, CC0). The Heart Sutra is
a clearly credited new English rendering from the short Chinese recension
T 251. Each text has its own source and reuse information. The source snapshot
is retained in `maintenance/reading-sources.json`; rebuild the catalogue with
`python3 maintenance/build_readings.py`. No source site needs to be contacted
while reading. Wait for **Offline files ready** before disconnecting.

## Portable practice and reading backups

**Download backup** includes all previously supported practice records and
settings plus reader font size, paper/night theme, and each text's last selected
chapter and scroll ratio. Only explicitly supported Uposatha storage keys are
exported; other browser data and installation flags are excluded. The existing
`uposatha-device-backup`, version `1` envelope is unchanged; reader data is an
optional JSON string under `data["uposatha-readings-v1"]`.

- Version 18 restores older backups. If reader data is absent, the device's
  current reading preferences and places are kept (defaults on a fresh device).
- Missing or invalid individual reader preferences use safe defaults; numeric
  values are bounded to 16–30 px, a valid chapter for that text, and a 0–1 scroll
  ratio. Unknown text IDs and malformed place entries are discarded.
- Malformed JSON, non-object or oversized reader records are skipped. The
  restore preview says when the current reading state will be kept. Valid
  practice information can still be restored. Invalid practice data or unknown
  storage keys continue to reject the entire import before anything is changed.
- Restore remains transactional: a storage failure rolls back all affected
  practice and reading records together. The previous-data recovery download
  includes the original reading record if rollback cannot finish.
- Scroll ratios preserve the approximate place across different screen sizes;
  line wrapping and font changes can move the exact visible line.

**Update both installations to version 18 before transferring a new backup.**
Version 17 and earlier reject the new reader storage key. AWS and GitHub Pages
have separate browser storage and service workers; publishing GitHub Pages does
not update AWS. On the source, wait for version 18 to load, then make a **new**
backup. On the updated destination, choose it, review it and restore it. Old
backups cannot recover reading places that were never included in them. There
is no automatic cross-site sync. External calendar events still require their
existing calendar import/export workflow.

## AWS installation

The same portable static files can update `/srv/uposatha-download`. The
`maintenance/install_aws.py` installer validates all payload checksums, takes
a dated backup, retains old assets for open tabs, and rolls back on failure.
It does not restart services or change Caddy routes. Run `--check` first, then
`--apply` as root. A saved backup can be restored with `--rollback PATH`.
The downloadable package uses existing verified recordings. The standalone
installer can instead download the complete release (including all recordings)
using `--source-commit FULL_COMMIT_SHA`; use a pinned commit, not a branch name.

## Publish

Repository: [hkgogoi/uposatha](https://github.com/hkgogoi/uposatha).

1. Open [Settings → Pages](https://github.com/hkgogoi/uposatha/settings/pages).
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose **main** and **/docs**, then **Save**.
4. Wait for the GitHub Pages deployment to finish. The expected address is
   [https://hkgogoi.github.io/uposatha/](https://hkgogoi.github.io/uposatha/).
   Confirm the published address and deployment status in Settings → Pages.

Uploading these files does not by itself enable GitHub Pages. For manual
updates from the ZIP, extract and upload its contents to `main`, preserving
`docs/index.html`, `docs/assets/`, `docs/audio/` and the other directories.
Do not upload the ZIP itself or add an extra enclosing folder.

No build command, npm installation, web server, database or runtime service is
needed. GitHub serves the `docs/` directory directly. Keep `docs/.nojekyll`.
The included GitHub workflow runs validation checks; Pages publication uses
the branch and folder selected above.

## Move an existing installation

The old address and the GitHub Pages address are different websites to your
browser. An existing installed app cannot silently change to the new address,
and its private device data cannot be read by the new site.

1. In the **old app**, open **Back up or restore your practice** and select
   **Download backup**. Keep that JSON file on your own device; do not commit it
   to GitHub.
2. Open the **new GitHub Pages address** in Chrome on Android, Safari on iPhone
   or iPad, or Chrome/Edge on desktop. Install Uposatha from there.
3. Close the browser tab and open the newly installed app from its home-screen
   or desktop icon. Select **Choose backup to restore** and review/restore your
   saved JSON file.
4. Check your tradition, timezone, journal, mantra counts and reading places. Keep the old
   installation until you have confirmed that your practice data was restored.
5. Keep the new app open online until it displays **Offline files ready**.
   The complete application and recordings use approximately 64 MiB.

Your calendar app's existing imported reminders remain in that calendar. Avoid
importing the same events twice; re-export when your dates or preferences change.

## Preserved behavior

- Install-first screen and direct entry when launched in standalone mode.
- Chinese Mahayana, Theravada, Tibetan/Vajrayana, Japanese and community choices.
- Calendar calculations and the existing calendar-reminder export.
- Opening homage, music, chant selection, volume, pause, next and repetition.
- Meditation timer, mala counters, journal, checklists and local backup/restore.
- Existing storage keys and backup format.
- Update checks when opening or returning to the app online.
- All 20 MP3 files, original illustration, icons and recording attributions.

Background reminders still use the imported calendar file. This migration
does not add server push or promise scheduled browser notifications while the
app is closed. As before, a browser may require a tap on **Play** before sound
can start; background playback depends on the device and browser.

## What changed

- Page, image, audio, icon and manifest paths are relative to the app folder.
- Lazy-loaded app code and styles resolve correctly inside a repository path.
- Service-worker registration, scope and cached URLs follow that folder.
- Each app path has its own cache namespace, so updates do not delete caches
  belonging to other GitHub Pages projects on the same domain.
- Incomplete offline downloads do not activate the new worker.
- Offline audio retains byte-range support for seeking and playback.
- The app now displays Version 18. No AWS installer is required for this edition.

The input archive contained compiled JavaScript and CSS, not the original
editable TypeScript project. This release makes focused changes to those
bundles and provides the maintenance tools below. It is not a recreated source
project or a fresh framework build.

## Maintain and check

Node.js 22+ and Python 3 are only needed by maintainers, not visitors or Pages.

After changing files in `docs/`, run:

```sh
python3 maintenance/refresh_release.py
node maintenance/test_playback.cjs
node maintenance/test_pages.cjs
node maintenance/test_readings.cjs
node maintenance/test_backup.cjs
python3 maintenance/test_aws.py
```

The refresh script updates the offline asset list and fingerprints the release
so installed copies can update. Commit the resulting `docs/sw.js` and
`docs/offline-assets.json` together with your changes. Do not remove audio
credits when editing playlists. Recording metadata is in
`maintenance/chants.json`; the served catalogue is embedded in the app bundle.

See `VERIFICATION.txt` for the checks completed for this package, including
the limits of device-installation testing.

## References

- [GitHub Pages publishing configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Create a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Web app start URL](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url)
- [Web app scope](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope)

The repository's existing [LICENSE](LICENSE) is retained. Third-party recordings
retain their separate credits and licenses in
[docs/AUDIO_CREDITS.txt](docs/AUDIO_CREDITS.txt).


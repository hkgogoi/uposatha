# Uposatha · GitHub Pages edition

Version 16 · 23 October 2026

This is the existing Uposatha v15 app adapted for GitHub Pages. It includes the
complete app, the opening Namo Tassa, instrumental music, and all 18 tradition
recordings. Visitors need no account, email, phone number, API key or backend.

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
4. Check your tradition, timezone, journal and mantra counts. Keep the old
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
- The app now displays Version 16. No AWS installer is required for this edition.

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

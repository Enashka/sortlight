# Sortlight

Sortlight is a privacy-first image review and sorting app. It opens a local folder in the browser, shows each image at a large size, assigns one or more configurable keyboard tags, and then safely copies tagged images into independently chosen folders.

No image is uploaded. Folder access and file operations stay in the browser on the computer where Sortlight is open.

## Features

- Large fit/fill preview and browser fullscreen mode
- Neutral charcoal interface designed to keep attention on image color and detail
- Up to nine custom tags, each with a renameable label, color, and single-key shortcut
- Multiple tags can be assigned to the same image and toggled independently
- Export-time destination selection for every tag used in the current batch
- CSV export of the complete sorting plan, including tagged and untagged images
- Shortcut keys toggle a tag on and off; optional auto-advance is off by default
- All, untagged, and per-tag filters with a thumbnail filmstrip
- Direct image-number navigation for folders with thousands of images
- Local exact-duplicate detection with a duplicates-only review filter
- Duplicate cleanup that keeps one chosen copy per set and moves verified extras to a quarantine folder
- Tag restoration when the same folder is reopened in the same browser
- Automatic resumable sessions that immediately save the most recently viewed image
- Recent-session list with saved folder access, current image, filter, and fit mode
- Versioned `.json` session backups for recovery or transfer between macOS and Ubuntu
- Collision-safe copying with byte-size verification; originals remain untouched
- Responsive layouts for desktop, laptop, and touch-sized screens
- Installable app icon and standalone window for the macOS Dock and Ubuntu launcher

## Browser and operating-system support

The full folder-copying workflow uses the File System Access API and works in current desktop versions of Chrome, Chromium, and Microsoft Edge on macOS and Linux, including Ubuntu on Wayland. The browser will ask for destination-folder write permission when it needs it.

Firefox and Safari can load, preview, and tag a selected folder through the fallback folder input, but they do not currently provide the required browser API for choosing writable destination folders. Copying is therefore disabled in those browsers.

Sortlight reads images from the selected folder's top level. At export time, each tag used in the batch can point to a different folder anywhere the browser is allowed to access, including folders outside the source folder.

## Resuming and backing up sessions

Every tag change is saved immediately in the browser. Sortlight also checkpoints the current image, active filter, fit mode, tag definitions, and selected folder. After closing and reopening the app, choose the folder under **Recent sessions** to continue. Chrome or Chromium may ask you to approve folder access again.

Use **Session → Save backup** to download a versioned `.json` session file. On another computer, choose **Load session file**, then select the corresponding image folder. Backups identify images by filename, size, and modification date; they do not contain images or absolute filesystem paths.

Browser sessions belong to the exact site address and browser profile that created them. For example, `localhost` and the hosted Sortlight address keep separate session lists. A backup file is the safest way to move work between those addresses, browsers, or computers.

## Duplicate cleanup

After opening a folder, select **Exact duplicates** in the sidebar to compare image contents locally. Duplicate sets are shown together, with the first file in each set marked as the keeper by default. Review each set and use **Keep this copy** when another file should remain instead.

Choose **Move extras** to select a quarantine folder. Sortlight writes and byte-size-verifies every quarantine copy before removing its corresponding source copy. This cleanup requires Chrome, Chromium, or Edge folder access; no file is removed when its copy or verification fails.

## Install as a desktop app

Open Sortlight in desktop Chrome or Chromium and select **Install app** when the button appears. Chrome can also install it from **More → Cast, save and share → Install page as app**. After installation, keep Sortlight in the macOS Dock, or right-click it in Ubuntu and choose **Add to Favorites**.

An installation made from `localhost` still needs the local Sortlight server to be running. Installing the hosted version avoids that requirement; images and folder operations remain local to the computer either way.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. Localhost is treated as a secure browser context, so Chrome/Chromium can grant folder access.

## Verification

```bash
npm run lint
npm test
```

`npm test` builds the production worker and checks the rendered app shell plus the source-level copy-safety guarantees.

## Sorting safety and limitations

- Normal tag exports never change or remove source images. Duplicate cleanup moves only copies explicitly marked as extras.
- During duplicate cleanup, each quarantine copy is verified by byte size before its source copy is removed.
- Every destination copy is checked against the source file's byte size.
- If a destination already contains the same filename, Sortlight adds ` (2)`, ` (3)`, and so on.
- A destination folder must be different from the selected source folder.
- A failed copy reports the failure and leaves the original untouched.
- Browser-readable formats include JPEG, PNG, GIF, WebP, AVIF, BMP, and SVG. Formats such as HEIC may require conversion before the browser can preview them.
- Local sessions do not sync automatically between computers. Use a Sortlight session backup to transfer work; destination folders are still chosen separately for each export batch.

## Project structure

- `app/image-sorter.tsx` — folder access, review workflow, shortcuts, and safe sorting
- `app/sorting.ts` — shared destination types and pure sorting helpers
- `app/session-storage.ts` — IndexedDB session metadata and per-image tag assignments
- `app/session-backup.mjs` — portable session validation, serialization, and filenames
- `app/globals.css` — responsive visual system
- `public/manifest.webmanifest` and `public/sw.js` — desktop installation and offline app shell
- `public/icons/` — Dock, launcher, and browser icons
- `tests/rendered-html.test.mjs` — production-render and safety regression checks

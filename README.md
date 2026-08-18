# Sortlight

Sortlight is a privacy-first image review and sorting app. It opens a local folder in the browser, shows each image at a large size, assigns one destination tag with configurable keyboard shortcuts, and then safely copies tagged images into independently chosen folders.

No image is uploaded. Folder access and file operations stay in the browser on the computer where Sortlight is open.

## Features

- Large fit/fill preview and browser fullscreen mode
- Neutral charcoal interface designed to keep attention on image color and detail
- Up to nine custom tags, each with a renameable label, color, and single-key shortcut
- Export-time destination selection for every tag used in the current batch
- CSV export of the complete sorting plan, including tagged and untagged images
- Shortcut keys toggle a tag on and off; optional auto-advance is off by default
- All, untagged, and per-tag filters with a thumbnail filmstrip
- Tag restoration when the same folder is reopened in the same browser
- Collision-safe copying with byte-size verification; originals remain untouched
- Responsive layouts for desktop, laptop, and touch-sized screens

## Browser and operating-system support

The full folder-copying workflow uses the File System Access API and works in current desktop versions of Chrome, Chromium, and Microsoft Edge on macOS and Linux, including Ubuntu on Wayland. The browser will ask for destination-folder write permission when it needs it.

Firefox and Safari can load, preview, and tag a selected folder through the fallback folder input, but they do not currently provide the required browser API for choosing writable destination folders. Copying is therefore disabled in those browsers.

Sortlight reads images from the selected folder's top level. At export time, each tag used in the batch can point to a different folder anywhere the browser is allowed to access, including folders outside the source folder.

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

- Source images are never changed or removed.
- Every destination copy is checked against the source file's byte size.
- If a destination already contains the same filename, Sortlight adds ` (2)`, ` (3)`, and so on.
- A destination folder must be different from the selected source folder.
- A failed copy reports the failure and leaves the original untouched.
- Browser-readable formats include JPEG, PNG, GIF, WebP, AVIF, BMP, and SVG. Formats such as HEIC may require conversion before the browser can preview them.
- Settings and pending tag assignments stay in that browser on that device. They do not sync between computers. Destination folders are chosen for each export batch.

## Project structure

- `app/image-sorter.tsx` — folder access, review workflow, shortcuts, and safe sorting
- `app/sorting.ts` — shared destination types and pure sorting helpers
- `app/globals.css` — responsive visual system
- `tests/rendered-html.test.mjs` — production-render and safety regression checks

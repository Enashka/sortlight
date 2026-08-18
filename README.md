# Sortlight

Sortlight is a privacy-first image review and sorting app. It opens a local folder in the browser, shows each image at a large size, assigns one destination tag with configurable keyboard shortcuts, and then safely moves tagged images into subfolders.

No image is uploaded. Folder access and file operations stay in the browser on the computer where Sortlight is open.

## Features

- Large fit/fill preview and browser fullscreen mode
- Custom destination names, folder names, colors, and single-key shortcuts
- Automatic advance after tagging, with Arrow Left/Right navigation
- All, untagged, and per-tag filters with a thumbnail filmstrip
- Tag restoration when the same folder is reopened in the same browser
- Collision-safe sorting: copy, verify the copied byte size, then delete the source
- CSV plan export when write access is unavailable
- Responsive layouts for desktop, laptop, and touch-sized screens

## Browser and operating-system support

The full open-and-move workflow uses the File System Access API and works in current desktop versions of Chrome, Chromium, and Microsoft Edge on macOS and Linux, including Ubuntu on Wayland. The browser will ask for folder read/write permission each time it needs it.

Firefox and Safari can load, preview, and tag a selected folder through the fallback folder input, but they do not currently provide the required browser API for moving local files. In those browsers, Sortlight exports a CSV sorting plan instead.

Sortlight reads images from the selected folder's top level. Destination folders are created inside that selected folder when sorting is confirmed.

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

`npm test` builds the production worker and checks the rendered app shell plus the source-level file-safety guarantees.

## Sorting safety and limitations

- The source image is removed only after the destination file is written and its byte size matches the source.
- If a destination already contains the same filename, Sortlight adds ` (2)`, ` (3)`, and so on.
- A failed copy leaves its original file untouched and reports the failure.
- Browser-readable formats include JPEG, PNG, GIF, WebP, AVIF, BMP, and SVG. Formats such as HEIC may require conversion before the browser can preview them.
- Settings and pending tag assignments are stored only in that browser's local storage. They do not sync between computers; export the CSV plan if you need to transfer a plan.

## Project structure

- `app/image-sorter.tsx` — folder access, review workflow, shortcuts, and safe sorting
- `app/sorting.ts` — shared destination types and pure sorting helpers
- `app/globals.css` — responsive visual system
- `tests/rendered-html.test.mjs` — production-render and safety regression checks

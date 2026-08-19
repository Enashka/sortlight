import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Sortlight application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Sortlight — Local image sorter<\/title>/i);
  assert.match(html, /Image sorter/);
  assert.match(html, /Open image folder/);
  assert.match(html, /Your images stay on this device/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /apple-touch-icon/);
  assert.doesNotMatch(html, /Give every image|a place to go/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("provides an installable desktop web app manifest", async () => {
  const [manifestText, serviceWorker, icon192, icon512] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/icons/sortlight-192.png", import.meta.url)),
    readFile(new URL("../public/icons/sortlight-512.png", import.meta.url)),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.name, "Sortlight — Local image sorter");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#252928");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);
  assert.match(serviceWorker, /addEventListener\("fetch"/);
  assert.match(serviceWorker, /sortlight-512\.png/);
  assert.ok(icon192.byteLength > 1_000);
  assert.ok(icon512.byteLength > icon192.byteLength);
});

test("keeps export-time folder selection and local copy safeguards in source", async () => {
  const [component, sorting] = await Promise.all([
    readFile(new URL("../app/image-sorter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sorting.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /showDirectoryPicker/);
  assert.match(component, /webkitdirectory/);
  assert.match(component, /writtenFile\.size !== sourceFile\.size/);
  assert.match(component, /exportHandles\.get\(tagId\)/);
  assert.match(component, /for \(const tagId of image\.tagIds\)/);
  assert.match(component, /Choose one destination per tag/);
  assert.doesNotMatch(component, /Tags, shortcuts & folders/);
  assert.match(component, /buildSortingCsv/);
  assert.doesNotMatch(component, /removeEntry/);
  assert.match(component, /Originals stay untouched/);
  assert.match(sorting, /Destination 1/);
  assert.doesNotMatch(sorting, /Favorites|To edit|Archive|Rejects/);
});

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
  assert.match(html, /Give every image/);
  assert.match(html, /Open image folder/);
  assert.match(html, /Your images stay on this device/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps local copy safeguards and destination-folder persistence in source", async () => {
  const [component, sorting, folderStore] = await Promise.all([
    readFile(new URL("../app/image-sorter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sorting.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/folder-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /showDirectoryPicker/);
  assert.match(component, /webkitdirectory/);
  assert.match(component, /writtenFile\.size !== sourceFile\.size/);
  assert.match(component, /directoryHandles\.get\(image\.tagId\)/);
  assert.doesNotMatch(component, /removeEntry|sort-plan\.csv|makeCsv/);
  assert.match(component, /Originals stay untouched/);
  assert.match(sorting, /Destination 1/);
  assert.doesNotMatch(sorting, /Favorites|To edit|Archive|Rejects/);
  assert.match(folderStore, /indexedDB\.open/);
  assert.match(folderStore, /store\.put\(handle, id\)/);
});

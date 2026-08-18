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
  assert.doesNotMatch(html, /Give every image|a place to go/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
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
  assert.match(component, /Choose one destination folder for each tag used in this batch/);
  assert.doesNotMatch(component, /Tags, shortcuts & folders/);
  assert.match(component, /buildSortingCsv/);
  assert.doesNotMatch(component, /removeEntry/);
  assert.match(component, /Originals stay untouched/);
  assert.match(sorting, /Destination 1/);
  assert.doesNotMatch(sorting, /Favorites|To edit|Archive|Rejects/);
});

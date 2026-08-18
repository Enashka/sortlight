import assert from "node:assert/strict";
import test from "node:test";

import { pickDirectory } from "../app/browser-files.mjs";
import { buildSortingCsv, csvDownloadName } from "../app/csv-export.mjs";
import { filmstripRange } from "../app/filmstrip.mjs";
import { normalizeTagIds, toggledTags } from "../app/tagging.mjs";

test("invokes the browser directory picker with its Window receiver", async () => {
  const expectedHandle = { kind: "directory", name: "Pictures" };
  const browserWindow = {
    showDirectoryPicker(options) {
      assert.equal(this, browserWindow);
      assert.deepEqual(options, { id: "sortlight-source", mode: "read" });
      return Promise.resolve(expectedHandle);
    },
  };

  assert.equal(
    await pickDirectory(browserWindow, { id: "sortlight-source", mode: "read" }),
    expectedHandle,
  );
});

test("adds several tags and toggles each one independently", () => {
  assert.deepEqual(toggledTags([], "destination-1"), ["destination-1"]);
  assert.deepEqual(toggledTags(["destination-1"], "destination-2"), [
    "destination-1",
    "destination-2",
  ]);
  assert.deepEqual(
    toggledTags(["destination-1", "destination-2"], "destination-1"),
    ["destination-2"],
  );
  assert.deepEqual(toggledTags(["destination-1"], null), []);
});

test("migrates saved single tags and validates saved tag lists", () => {
  const validTags = new Set(["destination-1", "destination-2"]);
  assert.deepEqual(normalizeTagIds("destination-1", validTags), ["destination-1"]);
  assert.deepEqual(
    normalizeTagIds(["destination-1", "missing", "destination-1"], validTags),
    ["destination-1"],
  );
});

test("keeps a large image folder's filmstrip DOM bounded", () => {
  assert.deepEqual(filmstripRange(5_132, 0), { start: 0, end: 120 });
  assert.deepEqual(filmstripRange(5_132, 2_566), { start: 2_506, end: 2_626 });
  assert.deepEqual(filmstripRange(80, 40), { start: 0, end: 80 });
});

test("exports a spreadsheet-safe CSV for tagged and untagged images", () => {
  const csv = buildSortingCsv(
    [
      { name: '=SUM(1,2).jpg', size: 12, lastModified: 0, tagIds: ["keep", "web"] },
      { name: 'portrait "final".png', size: 34, lastModified: 1_000, tagIds: [] },
    ],
    [
      { id: "keep", label: "Selected, final", shortcut: "1" },
      { id: "web", label: "For web", shortcut: "w" },
    ],
  );

  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=SUM\(1,2\)\.jpg","Selected, final; For web","1; w","tagged","12"/);
  assert.match(csv, /"portrait ""final""\.png","","","untagged","34"/);
  assert.equal(csvDownloadName('July: selects/01'), "July- selects-01-sortlight.csv");
});

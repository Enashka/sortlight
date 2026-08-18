import assert from "node:assert/strict";
import test from "node:test";

import { pickDirectory } from "../app/browser-files.mjs";
import { filmstripRange } from "../app/filmstrip.mjs";
import { toggledTag } from "../app/tagging.mjs";

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

test("pressing a tag shortcut again removes that tag", () => {
  assert.equal(toggledTag(null, "destination-1"), "destination-1");
  assert.equal(toggledTag("destination-1", "destination-1"), null);
  assert.equal(toggledTag("destination-1", "destination-2"), "destination-2");
});

test("keeps a large image folder's filmstrip DOM bounded", () => {
  assert.deepEqual(filmstripRange(5_132, 0), { start: 0, end: 120 });
  assert.deepEqual(filmstripRange(5_132, 2_566), { start: 2_506, end: 2_626 });
  assert.deepEqual(filmstripRange(80, 40), { start: 0, end: 80 });
});

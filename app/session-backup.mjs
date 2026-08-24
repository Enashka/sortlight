export const SORTLIGHT_SESSION_KIND = "sortlight-session";
export const SORTLIGHT_SESSION_VERSION = 1;

function validDestination(destination) {
  return Boolean(
    destination &&
      typeof destination.id === "string" &&
      destination.id &&
      destination.id.length <= 200 &&
      typeof destination.label === "string" &&
      destination.label &&
      destination.label.length <= 200 &&
      typeof destination.shortcut === "string" &&
      (!destination.shortcut || /^[a-z1-9]$/i.test(destination.shortcut)) &&
      typeof destination.color === "string" &&
      /^#[0-9a-f]{6}$/i.test(destination.color),
  );
}

export function createSessionBackup({
  folderName,
  destinations,
  images,
  currentImageKey,
  filter,
  fitMode,
  savedAt = new Date().toISOString(),
}) {
  return {
    kind: SORTLIGHT_SESSION_KIND,
    version: SORTLIGHT_SESSION_VERSION,
    savedAt,
    folderName,
    destinations: destinations.map(({ id, label, shortcut, color }) => ({
      id,
      label,
      shortcut,
      color,
    })),
    assignments: Object.fromEntries(
      images
        .filter((image) => image.tagIds.length)
        .map((image) => [
          `${image.name}:${image.size}:${image.lastModified}`,
          [...new Set(image.tagIds)],
        ]),
    ),
    currentImageKey,
    filter,
    fitMode,
    imageCount: images.length,
  };
}

export function serializeSessionBackup(backup) {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function parseSessionBackup(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This is not a valid JSON file.");
  }
  if (
    !value ||
    value.kind !== SORTLIGHT_SESSION_KIND ||
    value.version !== SORTLIGHT_SESSION_VERSION ||
    typeof value.folderName !== "string" ||
    !value.folderName ||
    !Array.isArray(value.destinations) ||
    !value.destinations.length ||
    value.destinations.length > 9 ||
    !value.destinations.every(validDestination) ||
    !value.assignments ||
    typeof value.assignments !== "object" ||
    Array.isArray(value.assignments)
  ) {
    throw new Error("This file is not a supported Sortlight session.");
  }

  const destinationIds = value.destinations.map((destination) => destination.id);
  const shortcuts = value.destinations
    .map((destination) => destination.shortcut.toLowerCase())
    .filter(Boolean);
  if (
    new Set(destinationIds).size !== destinationIds.length ||
    new Set(shortcuts).size !== shortcuts.length
  ) {
    throw new Error("This file has duplicate Sortlight tags or shortcuts.");
  }

  const validTagIds = new Set(destinationIds);
  const assignments = {};
  for (const [imageKey, tagIds] of Object.entries(value.assignments)) {
    if (typeof imageKey !== "string" || !Array.isArray(tagIds)) continue;
    const normalized = [...new Set(tagIds)].filter(
      (tagId) => typeof tagId === "string" && validTagIds.has(tagId),
    );
    if (normalized.length) assignments[imageKey] = normalized;
  }

  const validFilter =
    value.filter === "all" ||
    value.filter === "untagged" ||
    validTagIds.has(value.filter)
      ? value.filter
      : "all";

  return {
    kind: SORTLIGHT_SESSION_KIND,
    version: SORTLIGHT_SESSION_VERSION,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
    folderName: value.folderName,
    destinations: value.destinations.map(({ id, label, shortcut, color }) => ({
      id,
      label,
      shortcut,
      color,
    })),
    assignments,
    currentImageKey: typeof value.currentImageKey === "string" ? value.currentImageKey : null,
    filter: validFilter,
    fitMode: value.fitMode === "cover" ? "cover" : "contain",
    imageCount: Number.isSafeInteger(value.imageCount) && value.imageCount >= 0
      ? value.imageCount
      : 0,
  };
}

export function sessionDownloadName(folderName) {
  const safeFolder = folderName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "images";
  return `${safeFolder}-sortlight-session.json`;
}

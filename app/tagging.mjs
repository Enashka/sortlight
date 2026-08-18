export function toggledTags(currentTagIds, requestedTagId) {
  if (requestedTagId === null) return [];
  if (currentTagIds.includes(requestedTagId)) {
    return currentTagIds.filter((tagId) => tagId !== requestedTagId);
  }
  return [...currentTagIds, requestedTagId];
}

export function normalizeTagIds(savedValue, validTagIds) {
  const values = Array.isArray(savedValue)
    ? savedValue
    : typeof savedValue === "string"
      ? [savedValue]
      : [];
  return [...new Set(values)].filter(
    (tagId) => typeof tagId === "string" && validTagIds.has(tagId),
  );
}

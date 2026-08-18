export function toggledTag(currentTagId, requestedTagId) {
  return currentTagId === requestedTagId ? null : requestedTagId;
}

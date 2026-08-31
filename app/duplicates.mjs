export function duplicateCandidateGroups(items) {
  const groupsBySize = new Map();
  for (const item of items) {
    const group = groupsBySize.get(item.size) ?? [];
    group.push(item);
    groupsBySize.set(item.size, group);
  }
  return [...groupsBySize.values()].filter((group) => group.length > 1);
}

export function exactDuplicateGroups(fingerprintedItems) {
  const groupsByFingerprint = new Map();
  for (const item of fingerprintedItems) {
    const key = `${item.size}:${item.fingerprint}`;
    const group = groupsByFingerprint.get(key) ?? [];
    group.push(item);
    groupsByFingerprint.set(key, group);
  }
  return [...groupsByFingerprint.values()].filter((group) => group.length > 1);
}

export function defaultDuplicateKeepers(groups) {
  return new Map(
    groups
      .filter((group) => group.length)
      .map((group, index) => [index + 1, group[0].id]),
  );
}

async function sha256(file) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function findExactDuplicateGroups(items, onProgress = () => {}) {
  const candidates = duplicateCandidateGroups(items);
  const candidateCount = candidates.reduce((count, group) => count + group.length, 0);
  const fingerprinted = [];
  let processed = 0;
  onProgress(processed, candidateCount);

  for (const group of candidates) {
    for (const item of group) {
      fingerprinted.push({
        ...item,
        fingerprint: await sha256(item.file),
      });
      processed += 1;
      onProgress(processed, candidateCount);
    }
  }

  return exactDuplicateGroups(fingerprinted);
}

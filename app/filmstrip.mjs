const DEFAULT_WINDOW_SIZE = 120;

export function filmstripRange(length, currentIndex, windowSize = DEFAULT_WINDOW_SIZE) {
  if (length <= windowSize) return { start: 0, end: length };

  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.min(
    Math.max(currentIndex - halfWindow, 0),
    length - windowSize,
  );
  return { start, end: start + windowSize };
}

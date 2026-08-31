export function imageNumberToIndex(value, imageCount) {
  const imageNumber = Number(value);
  if (
    !Number.isInteger(imageNumber) ||
    imageNumber < 1 ||
    imageNumber > imageCount
  ) {
    return null;
  }
  return imageNumber - 1;
}

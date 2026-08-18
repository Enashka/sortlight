export type Destination = {
  id: string;
  label: string;
  folder: string;
  shortcut: string;
  color: string;
};

export type SortableImage = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  url: string;
  file: File;
  handle?: FileSystemFileHandle;
  tagId: string | null;
};

export const DEFAULT_DESTINATIONS: Destination[] = [
  { id: "destination-1", label: "Destination 1", folder: "", shortcut: "1", color: "#f6c85f" },
  { id: "destination-2", label: "Destination 2", folder: "", shortcut: "2", color: "#74b9ff" },
  { id: "destination-3", label: "Destination 3", folder: "", shortcut: "3", color: "#9f8cff" },
];

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

export function isImageFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(extension);
}

export function storedImageKey(image: Pick<SortableImage, "name" | "size" | "lastModified">) {
  return `${image.name}:${image.size}:${image.lastModified}`;
}

export function isValidShortcut(value: string) {
  return /^[a-z0-9]$/i.test(value) && value !== "0";
}

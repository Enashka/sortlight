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
  handle?: FileSystemFileHandle;
  tagId: string | null;
};

export const DEFAULT_DESTINATIONS: Destination[] = [
  { id: "favorites", label: "Favorites", folder: "Favorites", shortcut: "1", color: "#f6c85f" },
  { id: "edit", label: "To edit", folder: "To edit", shortcut: "2", color: "#74b9ff" },
  { id: "archive", label: "Archive", folder: "Archive", shortcut: "3", color: "#8b9bb4" },
  { id: "reject", label: "Rejects", folder: "Rejects", shortcut: "4", color: "#ff7a7a" },
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

export function cleanFolderName(value: string) {
  return value.replace(/[\\/\0]/g, "-").trim();
}

export function isValidShortcut(value: string) {
  return /^[a-z0-9]$/i.test(value) && value !== "0";
}

export function makeCsv(
  images: SortableImage[],
  destinations: Destination[],
) {
  const destinationById = new Map(destinations.map((item) => [item.id, item]));
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = images
    .filter((image) => image.tagId)
    .map((image) => {
      const destination = destinationById.get(image.tagId ?? "");
      return [image.name, destination?.label ?? "", destination?.folder ?? ""]
        .map(escape)
        .join(",");
    });
  return ["filename,tag,destination_folder", ...rows].join("\n");
}

function spreadsheetSafeText(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  return `"${spreadsheetSafeText(value).replaceAll('"', '""')}"`;
}

export function buildSortingCsv(images, destinations) {
  const tagsById = new Map(destinations.map((destination) => [destination.id, destination]));
  const rows = [
    ["Filename", "Tag", "Shortcut", "Status", "Size (bytes)", "Last modified (UTC)"],
    ...images.map((image) => {
      const tag = image.tagId ? tagsById.get(image.tagId) : null;
      return [
        image.name,
        tag?.label ?? "",
        tag?.shortcut ?? "",
        tag ? "tagged" : "untagged",
        image.size,
        new Date(image.lastModified).toISOString(),
      ];
    }),
  ];

  // A UTF-8 BOM helps spreadsheet apps open non-ASCII filenames correctly.
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function csvDownloadName(folderName) {
  const safeFolderName = String(folderName ?? "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();
  return `${safeFolderName || "images"}-sortlight.csv`;
}

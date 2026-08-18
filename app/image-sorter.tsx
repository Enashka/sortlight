"use client";

import {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_DESTINATIONS,
  Destination,
  isImageFile,
  isValidShortcut,
  SortableImage,
  storedImageKey,
} from "./sorting";
import { pickDirectory, supportsDirectoryPicker } from "./browser-files.mjs";
import { buildSortingCsv, csvDownloadName } from "./csv-export.mjs";
import { filmstripRange } from "./filmstrip.mjs";
import { normalizeTagIds, toggledTags } from "./tagging.mjs";

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
};

type Filter = "all" | "untagged" | string;
type Notice = { tone: "success" | "warning" | "error"; text: string } | null;

const DESTINATIONS_KEY = "sortlight:destinations:v2";
const AUTO_ADVANCE_KEY = "sortlight:auto-advance:v2";
const TAGS_KEY_PREFIX = "sortlight:tags:v2:";
const LEGACY_TAGS_KEY_PREFIX = "sortlight:tags:v1:";

function savedDestinations() {
  if (typeof window === "undefined") return DEFAULT_DESTINATIONS;
  try {
    const saved = window.localStorage.getItem(DESTINATIONS_KEY);
    const parsed = saved ? (JSON.parse(saved) as Destination[]) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_DESTINATIONS;
  } catch {
    return DEFAULT_DESTINATIONS;
  }
}

function savedAutoAdvance() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTO_ADVANCE_KEY) === "true";
  } catch {
    return false;
  }
}

function folderPickerError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "SecurityError") {
      return "Chrome blocked folder access here. Open Sortlight in a regular tab at localhost or over HTTPS.";
    }
    if (error.name === "NotAllowedError") {
      return "Chrome did not grant access to that folder. Try again and approve the folder prompt.";
    }
  }
  return "That folder could not be opened. Check its permissions and try again.";
}

function bytesToSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function makeDestination(): Destination {
  return {
    id: `destination-${Date.now()}`,
    label: "New tag",
    shortcut: "",
    color: "#9f8cff",
  };
}

async function availableName(directory: FileSystemDirectoryHandle, fileName: string) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : "";
  let candidate = fileName;
  let suffix = 2;

  while (true) {
    try {
      await directory.getFileHandle(candidate);
      candidate = `${base} (${suffix})${extension}`;
      suffix += 1;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return candidate;
      throw error;
    }
  }
}

async function ensureWritePermission(directory: FileSystemDirectoryHandle) {
  const permissionHandle = directory as PermissionDirectoryHandle;
  if (typeof permissionHandle.queryPermission !== "function") return true;
  if ((await permissionHandle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await permissionHandle.requestPermission({ mode: "readwrite" })) === "granted";
}

export function ImageSorter() {
  const [images, setImages] = useState<SortableImage[]>([]);
  const [folderName, setFolderName] = useState("");
  const [sourceDirectoryHandle, setSourceDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>(savedDestinations);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [autoAdvance, setAutoAdvance] = useState(savedAutoAdvance);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageStageRef = useRef<HTMLDivElement>(null);
  const currentThumbnailRef = useRef<HTMLButtonElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const visibleImages = useMemo(() => {
    if (filter === "all") return images;
    if (filter === "untagged") return images.filter((image) => !image.tagIds.length);
    return images.filter((image) => image.tagIds.includes(filter));
  }, [filter, images]);

  const safeIndex = Math.min(currentIndex, Math.max(visibleImages.length - 1, 0));
  const currentImage = visibleImages[safeIndex];
  const visibleFilmstripRange = filmstripRange(visibleImages.length, safeIndex);
  const filmstripImages = visibleImages.slice(
    visibleFilmstripRange.start,
    visibleFilmstripRange.end,
  );
  const taggedCount = images.filter((image) => image.tagIds.length).length;
  const untaggedCount = images.length - taggedCount;
  const folderPickerSupported =
    typeof window !== "undefined" && supportsDirectoryPicker(window as DirectoryPickerWindow);

  useEffect(() => {
    currentThumbnailRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentImage?.id]);

  const rememberTags = useCallback(
    (nextImages: SortableImage[]) => {
      if (!folderName) return;
      try {
        const saved = Object.fromEntries(
          nextImages
            .filter((image) => image.tagIds.length)
            .map((image) => [storedImageKey(image), image.tagIds]),
        );
        window.localStorage.setItem(`${TAGS_KEY_PREFIX}${folderName}`, JSON.stringify(saved));
      } catch {
        // Sorting remains available even if local persistence is blocked.
      }
    },
    [folderName],
  );

  const loadFiles = useCallback(
    (files: Array<{ file: File; handle?: FileSystemFileHandle }>, sourceName: string) => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];

      let savedTags: Record<string, string | string[]> = {};
      try {
        const currentSavedTags = window.localStorage.getItem(`${TAGS_KEY_PREFIX}${sourceName}`);
        const legacySavedTags = window.localStorage.getItem(`${LEGACY_TAGS_KEY_PREFIX}${sourceName}`);
        savedTags = JSON.parse(currentSavedTags ?? legacySavedTags ?? "{}") as Record<
          string,
          string | string[]
        >;
      } catch {
        savedTags = {};
      }
      const validTagIds = new Set(destinations.map((destination) => destination.id));

      const nextImages = files
        .filter(({ file }) => isImageFile(file))
        .sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }))
        .map(({ file, handle }, index) => {
          const url = URL.createObjectURL(file);
          objectUrlsRef.current.push(url);
          const image: SortableImage = {
            id: `${file.name}:${file.size}:${file.lastModified}:${index}`,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            url,
            file,
            handle,
            tagIds: [],
          };
          image.tagIds = normalizeTagIds(
            savedTags[storedImageKey(image)],
            validTagIds,
          );
          return image;
        });

      setFolderName(sourceName);
      setImages(nextImages);
      setCurrentIndex(0);
      setFilter("all");
      setFailedImageIds(new Set());
      setNotice(
        nextImages.length
          ? null
          : { tone: "warning", text: "No browser-readable images were found in this folder." },
      );
    },
    [destinations],
  );

  const openFolder = useCallback(async () => {
    if (!supportsDirectoryPicker(window as DirectoryPickerWindow)) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const directory = await pickDirectory(window as DirectoryPickerWindow, {
        id: "sortlight-source",
        mode: "read",
      });
      const files: Array<{ file: File; handle: FileSystemFileHandle }> = [];
      for await (const entry of (directory as IterableDirectoryHandle).values()) {
        if (entry.kind !== "file") continue;
        const file = await entry.getFile();
        if (isImageFile(file)) files.push({ file, handle: entry });
      }
      setSourceDirectoryHandle(directory);
      loadFiles(files, directory.name);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice({
        tone: "error",
        text: folderPickerError(error),
      });
    }
  }, [loadFiles]);

  const openFallbackFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.target.files ?? []);
      if (!selected.length) return;
      const firstPath = selected[0].webkitRelativePath;
      const sourceName = firstPath.split("/")[0] || "Selected images";
      setSourceDirectoryHandle(null);
      loadFiles(selected.map((file) => ({ file })), sourceName);
      event.target.value = "";
    },
    [loadFiles],
  );

  const moveBy = useCallback(
    (amount: number) => {
      if (!visibleImages.length) return;
      setCurrentIndex((index) =>
        Math.min(Math.max(index + amount, 0), visibleImages.length - 1),
      );
    },
    [visibleImages.length],
  );

  const applyTag = useCallback(
    (tagId: string | null) => {
      if (!currentImage) return;
      const nextTagIds = toggledTags(currentImage.tagIds, tagId);
      const nextImages = images.map((image) =>
        image.id === currentImage.id
          ? { ...image, tagIds: nextTagIds }
          : image,
      );
      setImages(nextImages);
      rememberTags(nextImages);
      if (autoAdvance && tagId && nextTagIds.includes(tagId) && safeIndex < visibleImages.length - 1) {
        setCurrentIndex(safeIndex + 1);
      }
    },
    [autoAdvance, currentImage, images, rememberTags, safeIndex, visibleImages.length],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await imageStageRef.current?.requestFullscreen();
    } catch {
      setNotice({ tone: "warning", text: "Fullscreen is not available in this browser window." });
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, button") ||
        target?.isContentEditable ||
        settingsOpen ||
        confirmOpen ||
        helpOpen
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveBy(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveBy(1);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        applyTag(null);
        return;
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      const destination = destinations.find(
        (item) => item.shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (destination) {
        event.preventDefault();
        applyTag(destination.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyTag, confirmOpen, destinations, helpOpen, moveBy, settingsOpen, toggleFullscreen]);

  const saveDestinations = (nextDestinations: Destination[]) => {
    const normalized = nextDestinations.map((destination) => ({
      id: destination.id,
      label: destination.label.trim(),
      shortcut: destination.shortcut.toLowerCase().trim(),
      color: destination.color,
    }));
    const shortcuts = normalized.map((item) => item.shortcut).filter(Boolean);
    const valid = normalized.every(
      (item) => item.label && (!item.shortcut || isValidShortcut(item.shortcut)),
    );
    if (!valid || new Set(shortcuts).size !== shortcuts.length) {
      setNotice({
        tone: "error",
        text: "Each tag needs a name. Shortcuts must be unique letters or 1–9.",
      });
      return;
    }
    const destinationIds = new Set(normalized.map((item) => item.id));
    setDestinations(normalized);
    setImages((items) =>
      items.map((image) => ({
        ...image,
        tagIds: image.tagIds.filter((tagId) => destinationIds.has(tagId)),
      })),
    );
    if (filter !== "all" && filter !== "untagged" && !destinationIds.has(filter)) {
      setFilter("all");
      setCurrentIndex(0);
    }
    window.localStorage.setItem(DESTINATIONS_KEY, JSON.stringify(normalized));
    setSettingsOpen(false);
    setNotice({ tone: "success", text: "Tags and shortcuts saved." });
  };

  const copyImages = async (exportHandles: Map<string, FileSystemDirectoryHandle>) => {
    setIsSorting(true);
    setNotice(null);
    const successfulTagsByImage = new Map<string, Set<string>>();
    const failures: string[] = [];
    const permissionByTag = new Map<string, boolean>();
    let successfulCopyCount = 0;

    for (const image of images.filter((item) => item.tagIds.length)) {
      for (const tagId of image.tagIds) {
        try {
          const directory = exportHandles.get(tagId);
          if (!directory) throw new Error("Export folder is missing");
          let hasPermission = permissionByTag.get(tagId);
          if (hasPermission === undefined) {
            hasPermission = await ensureWritePermission(directory);
            permissionByTag.set(tagId, hasPermission);
          }
          if (!hasPermission) throw new Error("Destination permission was not granted");
          const sourceFile = image.handle ? await image.handle.getFile() : image.file;
          const nextName = await availableName(directory, image.name);
          const nextHandle = await directory.getFileHandle(nextName, { create: true });
          const writable = await nextHandle.createWritable();
          await writable.write(sourceFile);
          await writable.close();
          const writtenFile = await nextHandle.getFile();
          if (writtenFile.size !== sourceFile.size) throw new Error("Copy verification failed");
          const successfulTags = successfulTagsByImage.get(image.id) ?? new Set<string>();
          successfulTags.add(tagId);
          successfulTagsByImage.set(image.id, successfulTags);
          successfulCopyCount += 1;
        } catch {
          failures.push(`${image.name}:${tagId}`);
        }
      }
    }

    const completedIds = new Set(
      images
        .filter(
          (image) =>
            image.tagIds.length > 0 &&
            image.tagIds.every((tagId) => successfulTagsByImage.get(image.id)?.has(tagId)),
        )
        .map((image) => image.id),
    );
    const nextImages = images.flatMap((image) => {
      if (completedIds.has(image.id)) return [];
      const successfulTags = successfulTagsByImage.get(image.id);
      return successfulTags
        ? [{ ...image, tagIds: image.tagIds.filter((tagId) => !successfulTags.has(tagId)) }]
        : [image];
    });
    for (const image of images) {
      if (completedIds.has(image.id)) URL.revokeObjectURL(image.url);
    }
    objectUrlsRef.current = objectUrlsRef.current.filter(
      (url) => !images.some((image) => completedIds.has(image.id) && image.url === url),
    );
    setImages(nextImages);
    rememberTags(nextImages);
    setCurrentIndex(0);
    setConfirmOpen(false);
    setIsSorting(false);
    if (failures.length) {
      setNotice({
        tone: "error",
        text: `${successfulCopyCount} copies created; ${failures.length} could not be copied. Successful tags were cleared so retrying will not duplicate them.`,
      });
    } else {
      setNotice({ tone: "success", text: `${successfulCopyCount} copies created. Your originals are unchanged.` });
    }
  };

  const exportCsv = () => {
    const csv = buildSortingCsv(images, destinations);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = csvDownloadName(folderName);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice({ tone: "success", text: `CSV exported with ${images.length} images.` });
  };

  const filterLabel =
    filter === "all"
      ? "All images"
      : filter === "untagged"
        ? "Untagged"
        : destinations.find((item) => item.id === filter)?.label ?? "Filtered";

  if (!images.length) {
    return (
      <main
        className={`welcome-shell${isDragging ? " is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const files = Array.from(event.dataTransfer.files);
          if (files.length) {
            setSourceDirectoryHandle(null);
            loadFiles(files.map((file) => ({ file })), "Dropped images");
          }
        }}
      >
        <header className="welcome-header">
          <a className="brand" href="#top" aria-label="Sortlight home">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span>Sortlight</span>
          </a>
          <button className="quiet-button" type="button" onClick={() => setHelpOpen(true)}>
            How it works <kbd>?</kbd>
          </button>
        </header>

        <section className="welcome-content" id="top">
          <h1>Image sorter</h1>
          <p className="welcome-copy">
            Open a local folder, assign one or more keyboard tags to each image, then
            choose destination folders when you export.
          </p>
          <div className="welcome-actions">
            <button className="primary-button large" type="button" onClick={() => void openFolder()}>
              <span aria-hidden="true">＋</span> Open image folder
            </button>
            <p className="browser-note">Folder copying works in desktop Chrome, Chromium, and Edge.</p>
          </div>
          <div className="privacy-note"><span aria-hidden="true">◆</span> Your images stay on this device</div>
        </section>

        <aside className="shortcut-preview" aria-label="Example keyboard shortcuts">
          <p>KEYBOARD SHORTCUTS</p>
          {DEFAULT_DESTINATIONS.slice(0, 3).map((destination, index) => (
            <div className={`preview-row row-${index + 1}`} key={destination.id}>
              <kbd>{destination.shortcut}</kbd>
              <span>{destination.label}</span>
              <i style={{ background: destination.color }} />
            </div>
          ))}
          <div className="preview-progress"><span /></div>
          <small>12 of 48 sorted</small>
        </aside>

        <div className="welcome-steps" aria-label="Three steps">
          <div><b>01</b><span><strong>Open</strong>Your folder</span></div>
          <div><b>02</b><span><strong>Tag</strong>Use your keys</span></div>
          <div><b>03</b><span><strong>Copy</strong>Keep originals</span></div>
        </div>

        {isDragging && <div className="drop-overlay">Drop images to begin</div>}
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          // @ts-expect-error webkitdirectory is the cross-browser folder-input fallback.
          webkitdirectory=""
          onChange={openFallbackFiles}
        />
        {notice && <div className={`toast ${notice.tone}`}>{notice.text}</div>}
        {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <a className="brand compact" href="#top" aria-label="Sortlight home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Sortlight</span>
        </a>
        <div className="folder-title">
          <strong>{folderName}</strong>
          <span>{images.length} images · {taggedCount} tagged</span>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" title="Keyboard help" onClick={() => setHelpOpen(true)}>?</button>
          <button className="secondary-button open-folder-button" type="button" onClick={() => void openFolder()}>Open another folder</button>
          <button className="secondary-button csv-button" type="button" title="Download the complete sorting plan" onClick={exportCsv}>Export CSV</button>
          <button
            className="primary-button"
            type="button"
            disabled={!taggedCount}
            onClick={() => {
              if (!folderPickerSupported) {
                setNotice({ tone: "error", text: "Copying to folders requires desktop Chrome, Chromium, or Edge." });
              } else {
                setConfirmOpen(true);
              }
            }}
          >
            Export {taggedCount} images
          </button>
        </div>
      </header>

      <aside className="tag-sidebar">
        <div className="sidebar-heading">
          <span>TAGS</span>
          <button type="button" onClick={() => setSettingsOpen(true)}>Manage up to 9</button>
        </div>
        <button
          className={`filter-row${filter === "all" ? " active" : ""}`}
          type="button"
          onClick={() => { setFilter("all"); setCurrentIndex(0); }}
        >
          <span className="filter-symbol">◫</span><span>All images</span><b>{images.length}</b>
        </button>
        <button
          className={`filter-row${filter === "untagged" ? " active" : ""}`}
          type="button"
          onClick={() => { setFilter("untagged"); setCurrentIndex(0); }}
        >
          <span className="filter-symbol">○</span><span>Untagged</span><b>{untaggedCount}</b>
        </button>
        <div className="sidebar-rule" />
        {destinations.map((destination) => {
          const count = images.filter((image) => image.tagIds.includes(destination.id)).length;
          return (
            <button
              className={`filter-row tag-filter${filter === destination.id ? " active" : ""}`}
              type="button"
              key={destination.id}
              title={destination.label}
              onClick={() => { setFilter(destination.id); setCurrentIndex(0); }}
            >
              <span className="color-dot" style={{ background: destination.color }} />
              <span>{destination.label}</span>
              <kbd>{destination.shortcut || "—"}</kbd>
              <b>{count}</b>
            </button>
          );
        })}
        <div className="sidebar-spacer" />
        <div className="toggle-row">
          <span><strong>Auto-advance</strong><small>After tagging</small></span>
          <label htmlFor="auto-advance">
            Toggle auto-advance
            <input
              id="auto-advance"
              type="checkbox"
              checked={autoAdvance}
              onChange={(event) => {
                setAutoAdvance(event.target.checked);
                window.localStorage.setItem(AUTO_ADVANCE_KEY, String(event.target.checked));
              }}
            />
            <i />
          </label>
        </div>
        {!folderPickerSupported && (
          <div className="read-only-note"><strong>Copy unavailable</strong><span>Open Sortlight in Chrome, Chromium, or Edge to choose destination folders.</span></div>
        )}
      </aside>

      <section className="review-area">
        <div className="review-toolbar">
          <div>
            <span className="muted-label">{filterLabel.toUpperCase()}</span>
            <strong>{safeIndex + 1} <em>/</em> {visibleImages.length}</strong>
          </div>
          <div className="filename-block">
            <strong title={currentImage?.name}>{currentImage?.name}</strong>
            <span>{currentImage ? bytesToSize(currentImage.size) : ""}</span>
          </div>
          <div className="view-controls">
            <button className={fitMode === "contain" ? "active" : ""} type="button" onClick={() => setFitMode("contain")}>Fit</button>
            <button className={fitMode === "cover" ? "active" : ""} type="button" onClick={() => setFitMode("cover")}>Fill</button>
            <button type="button" onClick={() => void toggleFullscreen()} title="Fullscreen (F)">⛶</button>
          </div>
        </div>

        <div className="image-stage" ref={imageStageRef}>
          {currentImage && !failedImageIds.has(currentImage.id) ? (
            // Blob URLs represent files explicitly selected by the user; no optimizer is useful here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentImage.url}
              alt={currentImage.name}
              className={fitMode}
              onError={() => setFailedImageIds((ids) => new Set(ids).add(currentImage.id))}
            />
          ) : (
            <div className="image-error"><span>Image preview unavailable</span><small>The file is preserved and can still be tagged.</small></div>
          )}
          {currentImage?.tagIds.length ? (
            <div className="active-tags" aria-label="Assigned tags">
              {destinations
                .filter((destination) => currentImage.tagIds.includes(destination.id))
                .map((destination) => (
                  <span className="active-tag" style={{ background: destination.color }} key={destination.id}>
                    {destination.label}
                  </span>
                ))}
            </div>
          ) : null}
          <button className="stage-arrow previous" type="button" disabled={safeIndex === 0} onClick={() => moveBy(-1)} aria-label="Previous image">‹</button>
          <button className="stage-arrow next" type="button" disabled={safeIndex >= visibleImages.length - 1} onClick={() => moveBy(1)} aria-label="Next image">›</button>
        </div>

        <div className="tag-controls" aria-label="Tag current image">
          <button className="clear-tag" type="button" onClick={() => applyTag(null)} title="Clear all tags (0)"><kbd>0</kbd><span>Clear all</span></button>
          <div className="tag-button-list">
            {destinations.map((destination) => (
              <button
                className={currentImage?.tagIds.includes(destination.id) ? "selected" : ""}
                style={{ "--tag-color": destination.color } as React.CSSProperties}
                type="button"
                key={destination.id}
                onClick={() => applyTag(destination.id)}
              >
                <kbd>{destination.shortcut || "·"}</kbd><span>{destination.label}</span>
              </button>
            ))}
          </div>
          <span className="nav-hint"><kbd>←</kbd><kbd>→</kbd> Navigate</span>
        </div>
      </section>

      <aside className="filmstrip" aria-label="Image filmstrip">
        {filmstripImages.map((image, windowIndex) => {
          const index = visibleFilmstripRange.start + windowIndex;
          const tags = destinations.filter((destination) => image.tagIds.includes(destination.id));
          return (
            <button
              className={index === safeIndex ? "active" : ""}
              type="button"
              key={image.id}
              ref={index === safeIndex ? currentThumbnailRef : undefined}
              title={image.name}
              onClick={() => setCurrentIndex(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" loading="lazy" />
              <span>{index + 1}</span>
              {tags.length > 0 && (
                <div className="filmstrip-tags">
                  {tags.slice(0, 4).map((tag) => <i style={{ background: tag.color }} key={tag.id} />)}
                </div>
              )}
            </button>
          );
        })}
      </aside>

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        // @ts-expect-error webkitdirectory is the cross-browser folder-input fallback.
        webkitdirectory=""
        onChange={openFallbackFiles}
      />

      {settingsOpen && (
        <SettingsDialog
          destinations={destinations}
          onCancel={() => setSettingsOpen(false)}
          onSave={saveDestinations}
        />
      )}
      {confirmOpen && (
        <ConfirmDialog
          destinations={destinations}
          images={images}
          isSorting={isSorting}
          sourceDirectoryHandle={sourceDirectoryHandle}
          onCancel={() => !isSorting && setConfirmOpen(false)}
          onConfirm={(handles) => void copyImages(handles)}
        />
      )}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {notice && (
        <div className={`toast ${notice.tone}`} role="status">
          {notice.text}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}
    </main>
  );
}

function DialogFrame({ title, subtitle, children, onClose }: { title: string; subtitle: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </section>
    </div>
  );
}

function SettingsDialog({ destinations, onCancel, onSave }: {
  destinations: Destination[];
  onCancel: () => void;
  onSave: (destinations: Destination[]) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(destinations);
  const updateDestination = (id: string, patch: Partial<Destination>) => {
    setDraft((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  const restrictShortcut = (event: ReactKeyboardEvent<HTMLInputElement>, id: string) => {
    if (event.key === "Backspace" || event.key === "Delete") return;
    if (isValidShortcut(event.key)) {
      event.preventDefault();
      updateDestination(id, { shortcut: event.key.toLowerCase() });
    }
  };
  return (
    <DialogFrame title="Tags & shortcuts" subtitle="Rename tags, assign keys, and create up to nine." onClose={onCancel}>
      <div className="settings-labels"><span>Color & tag</span><span>Key</span><span /></div>
      <div className="destination-editor">
        {draft.map((destination) => (
          <div className="destination-edit-row" key={destination.id}>
            <input className="color-input" type="color" value={destination.color} onChange={(event) => updateDestination(destination.id, { color: event.target.value })} aria-label={`${destination.label} color`} />
            <input value={destination.label} onChange={(event) => updateDestination(destination.id, { label: event.target.value })} aria-label="Tag name" />
            <input className="shortcut-input" value={destination.shortcut} maxLength={1} onKeyDown={(event) => restrictShortcut(event, destination.id)} onChange={(event) => updateDestination(destination.id, { shortcut: event.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 1) })} aria-label="Shortcut key" />
            <button className="remove-row" type="button" onClick={() => setDraft((items) => items.filter((item) => item.id !== destination.id))} aria-label={`Remove ${destination.label}`}>×</button>
          </div>
        ))}
      </div>
      <button className="add-destination" type="button" disabled={draft.length >= 9} onClick={() => setDraft((items) => [...items, makeDestination()])}>＋ Add tag <span>{draft.length} / 9</span></button>
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" type="button" onClick={() => void onSave(draft)}>Save tags</button></div>
    </DialogFrame>
  );
}

function ConfirmDialog({ destinations, images, isSorting, sourceDirectoryHandle, onCancel, onConfirm }: {
  destinations: Destination[];
  images: SortableImage[];
  isSorting: boolean;
  sourceDirectoryHandle: FileSystemDirectoryHandle | null;
  onCancel: () => void;
  onConfirm: (handles: Map<string, FileSystemDirectoryHandle>) => void;
}) {
  const [draftHandles, setDraftHandles] = useState<Map<string, FileSystemDirectoryHandle>>(
    () => new Map(),
  );
  const [pickerError, setPickerError] = useState("");
  const groups = destinations.map((destination) => ({
    destination,
    count: images.filter((image) => image.tagIds.includes(destination.id)).length,
  })).filter((group) => group.count);
  const taggedImageCount = images.filter((image) => image.tagIds.length).length;
  const copyCount = groups.reduce((sum, group) => sum + group.count, 0);
  const missingFolder = groups.some(({ destination }) => !draftHandles.has(destination.id));
  const chooseFolder = async (id: string) => {
    try {
      const handle = await pickDirectory(window as DirectoryPickerWindow, {
        id: `sortlight-export-${id}`,
        mode: "readwrite",
      });
      if (sourceDirectoryHandle && await handle.isSameEntry(sourceDirectoryHandle)) {
        setPickerError("Choose an export folder different from the source folder.");
        return;
      }
      setDraftHandles((handles) => new Map(handles).set(id, handle));
      setPickerError("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPickerError(folderPickerError(error));
    }
  };
  return (
    <DialogFrame title={`Export ${taggedImageCount} images`} subtitle={`Choose one destination per tag. This will create ${copyCount} copies.`} onClose={onCancel}>
      <div className="sort-summary">
        {groups.map(({ destination, count }) => (
          <div key={destination.id}>
            <span className="color-dot" style={{ background: destination.color }} />
            <span className="export-group"><strong>{destination.label}</strong><small>{count} {count === 1 ? "image" : "images"}</small></span>
            <button className={`folder-picker${draftHandles.has(destination.id) ? " selected" : ""}`} type="button" disabled={isSorting} onClick={() => void chooseFolder(destination.id)}>
              <span>{draftHandles.get(destination.id)?.name ?? "Choose destination"}</span><b>{draftHandles.has(destination.id) ? "Change" : "Choose"}</b>
            </button>
          </div>
        ))}
      </div>
      {pickerError && <p className="settings-error" role="alert">{pickerError}</p>}
      {missingFolder && !pickerError && <p className="settings-error">Choose a destination folder for every tag in this batch.</p>}
      <div className="safety-note"><span>✓</span><p><strong>Originals stay untouched</strong>Every copy is verified by file size. Existing names receive a numbered suffix.</p></div>
      <div className="dialog-actions"><button className="secondary-button" type="button" disabled={isSorting} onClick={onCancel}>Keep reviewing</button><button className="primary-button" type="button" disabled={isSorting || missingFolder} onClick={() => onConfirm(draftHandles)}>{isSorting ? "Copying…" : "Export copies"}</button></div>
    </DialogFrame>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title="Keyboard guide" subtitle="Keep your hands on the keyboard and move quickly." onClose={onClose}>
      <div className="help-grid">
        <div><kbd>1–9</kbd><span><strong>Toggle tags</strong>Add several tags; press a shortcut again to remove only that tag.</span></div>
        <div><kbd>0</kbd><span><strong>Clear all tags</strong>Return the image to untagged.</span></div>
        <div><kbd>← →</kbd><span><strong>Navigate</strong>Move through the current filter.</span></div>
        <div><kbd>F</kbd><span><strong>Fullscreen</strong>Expand the image review area.</span></div>
        <div><kbd>?</kbd><span><strong>Open this guide</strong>Shortcuts pause while dialogs are open.</span></div>
      </div>
      <div className="dialog-actions"><button className="primary-button" type="button" onClick={onClose}>Start sorting</button></div>
    </DialogFrame>
  );
}

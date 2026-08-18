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
  cleanFolderName,
  DEFAULT_DESTINATIONS,
  Destination,
  isImageFile,
  isValidShortcut,
  makeCsv,
  SortableImage,
  storedImageKey,
} from "./sorting";

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

type Filter = "all" | "untagged" | string;
type Notice = { tone: "success" | "warning" | "error"; text: string } | null;

const DESTINATIONS_KEY = "sortlight:destinations:v1";
const AUTO_ADVANCE_KEY = "sortlight:auto-advance:v1";
const TAGS_KEY_PREFIX = "sortlight:tags:v1:";

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
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTO_ADVANCE_KEY) !== "false";
  } catch {
    return true;
  }
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
    folder: "New tag",
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

export function ImageSorter() {
  const [images, setImages] = useState<SortableImage[]>([]);
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState("");
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
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const visibleImages = useMemo(() => {
    if (filter === "all") return images;
    if (filter === "untagged") return images.filter((image) => !image.tagId);
    return images.filter((image) => image.tagId === filter);
  }, [filter, images]);

  const safeIndex = Math.min(currentIndex, Math.max(visibleImages.length - 1, 0));
  const currentImage = visibleImages[safeIndex];
  const taggedCount = images.filter((image) => image.tagId).length;
  const untaggedCount = images.length - taggedCount;

  const rememberTags = useCallback(
    (nextImages: SortableImage[]) => {
      if (!folderName) return;
      try {
        const saved = Object.fromEntries(
          nextImages
            .filter((image) => image.tagId)
            .map((image) => [storedImageKey(image), image.tagId]),
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

      let savedTags: Record<string, string> = {};
      try {
        savedTags = JSON.parse(
          window.localStorage.getItem(`${TAGS_KEY_PREFIX}${sourceName}`) ?? "{}",
        ) as Record<string, string>;
      } catch {
        savedTags = {};
      }

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
            handle,
            tagId: null,
          };
          const savedTag = savedTags[storedImageKey(image)];
          image.tagId = destinations.some((destination) => destination.id === savedTag)
            ? savedTag
            : null;
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
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const directory = await picker({ id: "sortlight-source", mode: "readwrite" });
      const files: Array<{ file: File; handle: FileSystemFileHandle }> = [];
      for await (const entry of directory.values()) {
        if (entry.kind !== "file") continue;
        const file = await entry.getFile();
        if (isImageFile(file)) files.push({ file, handle: entry });
      }
      setFolderHandle(directory);
      loadFiles(files, directory.name);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice({
        tone: "error",
        text: "The folder could not be opened. Check its permissions and try again.",
      });
    }
  }, [loadFiles]);

  const openFallbackFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.target.files ?? []);
      if (!selected.length) return;
      const firstPath = selected[0].webkitRelativePath;
      const sourceName = firstPath.split("/")[0] || "Selected images";
      setFolderHandle(null);
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
      const nextImages = images.map((image) =>
        image.id === currentImage.id
          ? { ...image, tagId: image.tagId === tagId ? null : tagId }
          : image,
      );
      setImages(nextImages);
      rememberTags(nextImages);
      if (autoAdvance && safeIndex < visibleImages.length - 1) {
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
      ...destination,
      label: destination.label.trim(),
      folder: cleanFolderName(destination.folder),
      shortcut: destination.shortcut.toLowerCase().trim(),
    }));
    const shortcuts = normalized.map((item) => item.shortcut).filter(Boolean);
    const valid = normalized.every((item) =>
      item.label &&
      item.folder &&
      item.folder !== "." &&
      item.folder !== ".." &&
      (!item.shortcut || isValidShortcut(item.shortcut)),
    );
    if (!valid || new Set(shortcuts).size !== shortcuts.length) {
      setNotice({
        tone: "error",
        text: "Each tag needs a name and folder. Shortcuts must be unique letters or 1–9.",
      });
      return;
    }
    setDestinations(normalized);
    const destinationIds = new Set(normalized.map((item) => item.id));
    setImages((items) =>
      items.map((image) =>
        image.tagId && !destinationIds.has(image.tagId) ? { ...image, tagId: null } : image,
      ),
    );
    if (filter !== "all" && filter !== "untagged" && !destinationIds.has(filter)) {
      setFilter("all");
      setCurrentIndex(0);
    }
    window.localStorage.setItem(DESTINATIONS_KEY, JSON.stringify(normalized));
    setSettingsOpen(false);
    setNotice({ tone: "success", text: "Shortcut settings saved." });
  };

  const exportPlan = () => {
    const csv = makeCsv(images, destinations);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${folderName || "images"}-sort-plan.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sortImages = async () => {
    if (!folderHandle) return;
    setIsSorting(true);
    setNotice(null);
    const successfulIds = new Set<string>();
    const failures: string[] = [];

    for (const image of images.filter((item) => item.tagId)) {
      const destination = destinations.find((item) => item.id === image.tagId);
      if (!destination || !image.handle) continue;
      try {
        const sourceFile = await image.handle.getFile();
        const directory = await folderHandle.getDirectoryHandle(destination.folder, { create: true });
        const nextName = await availableName(directory, image.name);
        const nextHandle = await directory.getFileHandle(nextName, { create: true });
        const writable = await nextHandle.createWritable();
        await writable.write(sourceFile);
        await writable.close();
        const writtenFile = await nextHandle.getFile();
        if (writtenFile.size !== sourceFile.size) throw new Error("Copy verification failed");
        await folderHandle.removeEntry(image.name);
        successfulIds.add(image.id);
      } catch {
        failures.push(image.name);
      }
    }

    const nextImages = images.filter((image) => !successfulIds.has(image.id));
    setImages(nextImages);
    rememberTags(nextImages);
    setCurrentIndex(0);
    setConfirmOpen(false);
    setIsSorting(false);
    if (failures.length) {
      setNotice({
        tone: "error",
        text: `${successfulIds.size} moved; ${failures.length} could not be moved. The originals of failed files were left untouched.`,
      });
    } else {
      setNotice({ tone: "success", text: `${successfulIds.size} images sorted successfully.` });
    }
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
            setFolderHandle(null);
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
          <div className="eyebrow"><span /> PRIVATE · LOCAL · FAST</div>
          <h1>Give every image<br />a place to go.</h1>
          <p className="welcome-copy">
            Review a folder at full size, tag with one key, then move every selection into
            tidy destination folders—without uploading a single image.
          </p>
          <div className="welcome-actions">
            <button className="primary-button large" type="button" onClick={() => void openFolder()}>
              <span aria-hidden="true">＋</span> Open image folder
            </button>
            <p className="browser-note">Full file moving works in desktop Chrome, Chromium, and Edge.</p>
          </div>
          <div className="privacy-note"><span aria-hidden="true">◆</span> Your images stay on this device</div>
        </section>

        <aside className="shortcut-preview" aria-label="Example keyboard shortcuts">
          <p>ONE KEY. NEXT IMAGE.</p>
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
          <div><b>03</b><span><strong>Sort</strong>Move safely</span></div>
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
          <button className="secondary-button" type="button" onClick={() => void openFolder()}>Open another folder</button>
          <button
            className="primary-button"
            type="button"
            disabled={!taggedCount}
            onClick={() => (folderHandle ? setConfirmOpen(true) : exportPlan())}
          >
            {folderHandle ? `Sort ${taggedCount} images` : `Export ${taggedCount} tags`}
          </button>
        </div>
      </header>

      <aside className="tag-sidebar">
        <div className="sidebar-heading">
          <span>DESTINATIONS</span>
          <button type="button" onClick={() => setSettingsOpen(true)}>Edit</button>
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
          const count = images.filter((image) => image.tagId === destination.id).length;
          return (
            <button
              className={`filter-row tag-filter${filter === destination.id ? " active" : ""}`}
              type="button"
              key={destination.id}
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
        {!folderHandle && (
          <div className="read-only-note"><strong>Preview mode</strong><span>Export your tag plan as CSV. Use Chromium to move files.</span></div>
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
          {currentImage?.tagId && (
            <div className="active-tag" style={{ background: destinations.find((item) => item.id === currentImage.tagId)?.color }}>
              {destinations.find((item) => item.id === currentImage.tagId)?.label}
            </div>
          )}
          <button className="stage-arrow previous" type="button" disabled={safeIndex === 0} onClick={() => moveBy(-1)} aria-label="Previous image">‹</button>
          <button className="stage-arrow next" type="button" disabled={safeIndex >= visibleImages.length - 1} onClick={() => moveBy(1)} aria-label="Next image">›</button>
        </div>

        <div className="tag-controls" aria-label="Tag current image">
          <button className="clear-tag" type="button" onClick={() => applyTag(null)} title="Clear tag (0)"><kbd>0</kbd><span>Clear</span></button>
          <div className="tag-button-list">
            {destinations.map((destination) => (
              <button
                className={currentImage?.tagId === destination.id ? "selected" : ""}
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
        {visibleImages.map((image, index) => {
          const tag = destinations.find((destination) => destination.id === image.tagId);
          return (
            <button
              className={index === safeIndex ? "active" : ""}
              type="button"
              key={image.id}
              title={image.name}
              onClick={() => setCurrentIndex(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" loading="lazy" />
              <span>{index + 1}</span>
              {tag && <i style={{ background: tag.color }} />}
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
          onCancel={() => !isSorting && setConfirmOpen(false)}
          onConfirm={() => void sortImages()}
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
  onSave: (destinations: Destination[]) => void;
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
    <DialogFrame title="Tags & shortcuts" subtitle="Each tag maps to one destination folder." onClose={onCancel}>
      <div className="settings-labels"><span>Color & tag</span><span>Folder</span><span>Key</span><span /></div>
      <div className="destination-editor">
        {draft.map((destination) => (
          <div className="destination-edit-row" key={destination.id}>
            <input className="color-input" type="color" value={destination.color} onChange={(event) => updateDestination(destination.id, { color: event.target.value })} aria-label={`${destination.label} color`} />
            <input value={destination.label} onChange={(event) => updateDestination(destination.id, { label: event.target.value })} aria-label="Tag name" />
            <input value={destination.folder} onChange={(event) => updateDestination(destination.id, { folder: event.target.value })} aria-label="Folder name" />
            <input className="shortcut-input" value={destination.shortcut} maxLength={1} onKeyDown={(event) => restrictShortcut(event, destination.id)} onChange={(event) => updateDestination(destination.id, { shortcut: event.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 1) })} aria-label="Shortcut key" />
            <button className="remove-row" type="button" onClick={() => setDraft((items) => items.filter((item) => item.id !== destination.id))} aria-label={`Remove ${destination.label}`}>×</button>
          </div>
        ))}
      </div>
      <button className="add-destination" type="button" disabled={draft.length >= 9} onClick={() => setDraft((items) => [...items, makeDestination()])}>＋ Add destination</button>
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" type="button" onClick={() => onSave(draft)}>Save shortcuts</button></div>
    </DialogFrame>
  );
}

function ConfirmDialog({ destinations, images, isSorting, onCancel, onConfirm }: {
  destinations: Destination[];
  images: SortableImage[];
  isSorting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const groups = destinations.map((destination) => ({
    destination,
    count: images.filter((image) => image.tagId === destination.id).length,
  })).filter((group) => group.count);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <DialogFrame title={`Sort ${total} images?`} subtitle="Files are copied, verified, then removed from the source folder." onClose={onCancel}>
      <div className="sort-summary">
        {groups.map(({ destination, count }) => (
          <div key={destination.id}><span className="color-dot" style={{ background: destination.color }} /><strong>{count} {count === 1 ? "image" : "images"}</strong><span>→</span><code>/{destination.folder}</code></div>
        ))}
      </div>
      <div className="safety-note"><span>✓</span><p><strong>Safe by default</strong>A source file is only deleted after its destination copy has been verified. Existing names receive a numbered suffix.</p></div>
      <div className="dialog-actions"><button className="secondary-button" type="button" disabled={isSorting} onClick={onCancel}>Keep reviewing</button><button className="primary-button" type="button" disabled={isSorting} onClick={onConfirm}>{isSorting ? "Sorting…" : "Move images"}</button></div>
    </DialogFrame>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title="Keyboard guide" subtitle="Keep your hands on the keyboard and move quickly." onClose={onClose}>
      <div className="help-grid">
        <div><kbd>1–9</kbd><span><strong>Apply a tag</strong>Keys follow your shortcut settings.</span></div>
        <div><kbd>0</kbd><span><strong>Clear a tag</strong>Return the image to untagged.</span></div>
        <div><kbd>← →</kbd><span><strong>Navigate</strong>Move through the current filter.</span></div>
        <div><kbd>F</kbd><span><strong>Fullscreen</strong>Expand the image review area.</span></div>
        <div><kbd>?</kbd><span><strong>Open this guide</strong>Shortcuts pause while dialogs are open.</span></div>
      </div>
      <div className="dialog-actions"><button className="primary-button" type="button" onClick={onClose}>Start sorting</button></div>
    </DialogFrame>
  );
}

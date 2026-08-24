import type { Destination } from "./sorting";

const DATABASE_NAME = "sortlight";
const DATABASE_VERSION = 1;
const SESSION_STORE = "sessions";
const ASSIGNMENT_STORE = "assignments";

export type StoredSession = {
  id: string;
  folderName: string;
  directoryHandle?: FileSystemDirectoryHandle;
  destinations: Destination[];
  currentImageKey: string | null;
  filter: string;
  fitMode: "contain" | "cover";
  imageCount: number;
  taggedCount: number;
  createdAt: number;
  updatedAt: number;
};

type StoredAssignment = {
  sessionId: string;
  imageKey: string;
  tagIds: string[];
};

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Browser storage transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage transaction was cancelled"));
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        const sessions = database.createObjectStore(SESSION_STORE, { keyPath: "id" });
        sessions.createIndex("by-updated-at", "updatedAt");
      }
      if (!database.objectStoreNames.contains(ASSIGNMENT_STORE)) {
        const assignments = database.createObjectStore(ASSIGNMENT_STORE, {
          keyPath: ["sessionId", "imageKey"],
        });
        assignments.createIndex("by-session", "sessionId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Sortlight storage could not be opened"));
    };
  });
  return databasePromise;
}

export async function listStoredSessions() {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, "readonly");
  const sessions = await requestResult(
    transaction.objectStore(SESSION_STORE).getAll() as IDBRequest<StoredSession[]>,
  );
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getStoredSession(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, "readonly");
  return requestResult(
    transaction.objectStore(SESSION_STORE).get(id) as IDBRequest<StoredSession | undefined>,
  );
}

export async function putStoredSession(session: StoredSession) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, "readwrite");
  transaction.objectStore(SESSION_STORE).put(session);
  await transactionComplete(transaction);
}

export async function getStoredAssignments(sessionId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(ASSIGNMENT_STORE, "readonly");
  const records = await requestResult(
    transaction
      .objectStore(ASSIGNMENT_STORE)
      .index("by-session")
      .getAll(IDBKeyRange.only(sessionId)) as IDBRequest<StoredAssignment[]>,
  );
  return Object.fromEntries(records.map((record) => [record.imageKey, record.tagIds]));
}

export async function putStoredAssignment(sessionId: string, imageKey: string, tagIds: string[]) {
  const database = await openDatabase();
  const transaction = database.transaction(ASSIGNMENT_STORE, "readwrite");
  const store = transaction.objectStore(ASSIGNMENT_STORE);
  const key: IDBValidKey = [sessionId, imageKey];
  if (tagIds.length) store.put({ sessionId, imageKey, tagIds } satisfies StoredAssignment);
  else store.delete(key);
  await transactionComplete(transaction);
}

export async function replaceStoredAssignments(
  sessionId: string,
  assignments: Record<string, string[]>,
) {
  const database = await openDatabase();
  const readonlyTransaction = database.transaction(ASSIGNMENT_STORE, "readonly");
  const existingKeys = await requestResult(
    readonlyTransaction
      .objectStore(ASSIGNMENT_STORE)
      .index("by-session")
      .getAllKeys(IDBKeyRange.only(sessionId)),
  );

  const transaction = database.transaction(ASSIGNMENT_STORE, "readwrite");
  const store = transaction.objectStore(ASSIGNMENT_STORE);
  for (const key of existingKeys) store.delete(key);
  for (const [imageKey, tagIds] of Object.entries(assignments)) {
    if (tagIds.length) store.put({ sessionId, imageKey, tagIds } satisfies StoredAssignment);
  }
  await transactionComplete(transaction);
}

export async function findStoredSessionForDirectory(directory: FileSystemDirectoryHandle) {
  const sessions = await listStoredSessions();
  for (const session of sessions) {
    if (!session.directoryHandle) continue;
    try {
      if (await directory.isSameEntry(session.directoryHandle)) return session;
    } catch {
      // A stale or revoked handle should not prevent another session from opening.
    }
  }
  return undefined;
}

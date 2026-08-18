const DATABASE_NAME = "sortlight-local-folders";
const STORE_NAME = "destination-handles";
const DATABASE_VERSION = 1;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadDirectoryHandles(ids: string[]) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const entries = await Promise.all(
    ids.map(
      (id) =>
        new Promise<[string, FileSystemDirectoryHandle | null]>((resolve, reject) => {
          const request = store.get(id);
          request.onsuccess = () =>
            resolve([id, (request.result as FileSystemDirectoryHandle | undefined) ?? null]);
          request.onerror = () => reject(request.error);
        }),
    ),
  );
  await transactionComplete(transaction);
  database.close();
  return new Map(entries.filter((entry): entry is [string, FileSystemDirectoryHandle] => Boolean(entry[1])));
}

export async function saveDirectoryHandles(
  handles: Map<string, FileSystemDirectoryHandle>,
  validIds: Set<string>,
) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const keysRequest = store.getAllKeys();
  keysRequest.onsuccess = () => {
    for (const key of keysRequest.result) {
      if (typeof key === "string" && !validIds.has(key)) store.delete(key);
    }
    for (const [id, handle] of handles) {
      if (validIds.has(id)) store.put(handle, id);
    }
  };
  await transactionComplete(transaction);
  database.close();
}

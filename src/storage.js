import { blankWorkspace, validateWorkspace } from "./domain";
export class ConflictError extends Error {
  constructor() {
    super(
      "This workspace changed in another tab. Close this dialog, review the latest data and try again.",
    );
  }
}
export function createStorage(name = "penny-expenses-v1") {
  function open() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB)
        return reject(
          Error(
            "IndexedDB is unavailable. Enable browser storage to use this app.",
          ),
        );
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error("Could not open browser storage."));
    });
  }
  async function readRaw() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readonly"),
        request = tx.objectStore("state").get("workspace");
      let value;
      request.onsuccess = () => {
        value = request.result;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(value === undefined ? blankWorkspace() : value);
      };
      tx.onerror = () => {
        db.close();
        reject(Error("Could not read browser storage."));
      };
    });
  }
  async function load() {
    return validateWorkspace(await readRaw());
  }
  async function mutate(expectedRevision, change) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      let result, failure;
      const store = tx.objectStore("state"),
        request = store.get("workspace");
      request.onsuccess = () => {
        try {
          const current = validateWorkspace(
            request.result === undefined ? blankWorkspace() : request.result,
          );
          if (current.revision !== expectedRevision) throw new ConflictError();
          const draft = change(structuredClone(current));
          result = validateWorkspace({
            ...draft,
            revision: current.revision + 1,
          });
          store.put(result, "workspace");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onabort = () => {
        db.close();
        reject(
          failure ||
            Error(
              "Could not save. Browser storage may be full or blocked. No changes were applied.",
            ),
        );
      };
      tx.onerror = () => {
        failure =
          failure ||
          Error(
            "Could not save. Browser storage may be full or blocked. No changes were applied.",
          );
      };
    });
  }
  return { load, readRaw, mutate };
}
export const storage = createStorage();

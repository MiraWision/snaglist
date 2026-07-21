import type { ArtifactFile } from "./types";

/**
 * Offline delivery queue backed by IndexedDB (blobs are too large for
 * localStorage). Used as an outbox: a batch is persisted before delivery is
 * attempted and removed once it succeeds, so an issue survives a failed upload
 * or the tab closing mid-delivery and is retried on the next load. Degrades to
 * a no-op when IndexedDB is unavailable.
 */

export interface QueuedBatch {
  /** Auto-increment key, assigned on enqueue. Preserves delivery order. */
  id: number;
  sessionId: string;
  files: ArtifactFile[];
  createdAt: number;
}

export interface OfflineQueue {
  /** Persist a batch, returning its assigned id (or null if unavailable). */
  enqueue(batch: Omit<QueuedBatch, "id">): Promise<number | null>;
  remove(id: number): Promise<void>;
  /** All pending batches, oldest first. */
  all(): Promise<QueuedBatch[]>;
}

const STORE = "batches";

function openDb(dbName: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const NOOP_QUEUE: OfflineQueue = {
  enqueue: () => Promise.resolve(null),
  remove: () => Promise.resolve(),
  all: () => Promise.resolve([]),
};

export function createOfflineQueue(project: string): OfflineQueue {
  const dbName = `feedback-widget:${project}:queue`;
  const dbPromise = openDb(dbName);

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T | null> {
    const db = await dbPromise;
    if (!db) {
      return null;
    }
    try {
      const tx = db.transaction(STORE, mode);
      return await promisifyRequest(run(tx.objectStore(STORE)));
    } catch {
      return null;
    }
  }

  return {
    async enqueue(batch) {
      const key = await withStore<IDBValidKey>("readwrite", (store) =>
        store.add(batch as QueuedBatch)
      );
      return typeof key === "number" ? key : null;
    },
    async remove(id) {
      await withStore("readwrite", (store) => store.delete(id));
    },
    async all() {
      const rows = await withStore<QueuedBatch[]>("readonly", (store) =>
        store.getAll()
      );
      return (rows ?? []).sort((a, b) => a.id - b.id);
    },
  };
}

export { NOOP_QUEUE };

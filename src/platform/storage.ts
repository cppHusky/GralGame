import { saveSchema } from '../../schema/save.js';
import type { GameState } from '../core/state.js';

export interface SaveRecord {
  slot: string;
  savedAt: string;
  state: GameState;
  scriptHash: string;
  bookCommit: string;
}
export interface StorageAdapter {
  list(): Promise<SaveRecord[]>;
  get(slot: string): Promise<SaveRecord | undefined>;
  put(record: SaveRecord): Promise<void>;
  remove(slot: string): Promise<void>;
}

const dbName = 'gralgame';
let database: Promise<IDBDatabase> | undefined;
function openDb(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('saves', { keyPath: 'slot' });
    request.onsuccess = () => {
      const connection = request.result;
      connection.onversionchange = () => {
        connection.close();
        database = undefined;
      };
      resolve(connection);
    };
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  });
  return database;
}
async function operation<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('saves', mode);
    const request = action(transaction.objectStore('saves'));
    let result: T;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? request.error);
    request.onsuccess = () => {
      result = request.result;
    };
  });
}

export const saveStorage: StorageAdapter = {
  async list() {
    return (
      await operation<SaveRecord[]>('readonly', (store) => store.getAll())
    ).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  async get(slot) {
    return operation<SaveRecord | undefined>('readonly', (store) =>
      store.get(slot),
    );
  },
  async put(record) {
    saveSchema.parse({
      format: 'gralgame-save',
      version: 1,
      scriptHash: record.scriptHash,
      bookCommit: record.bookCommit,
      savedAt: record.savedAt,
      state: record.state,
    });
    await operation<IDBValidKey>('readwrite', (store) => store.put(record));
  },
  async remove(slot) {
    await operation<undefined>('readwrite', (store) => store.delete(slot));
  },
};

export interface Settings {
  textSpeed: number;
  autoDelay: number;
  fontScale: number;
  masterVolume: number;
  bgmVolume: number;
  seVolume: number;
  skipUnread: boolean;
  reducedMotion: boolean;
}
const defaultSettings: Settings = {
  textSpeed: 35,
  autoDelay: 2200,
  fontScale: 1,
  masterVolume: 0.7,
  bgmVolume: 0.18,
  seVolume: 0.45,
  skipUnread: false,
  reducedMotion: false,
};
export function loadSettings(): Settings {
  try {
    return {
      ...defaultSettings,
      ...(JSON.parse(
        localStorage.getItem('gralgame.settings') ?? '{}',
      ) as Partial<Settings>),
    };
  } catch {
    return defaultSettings;
  }
}
export function storeSettings(settings: Settings) {
  localStorage.setItem('gralgame.settings', JSON.stringify(settings));
}

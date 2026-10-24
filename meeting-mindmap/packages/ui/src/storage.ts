import type { MeetingSummary, MindMap, SpeakerNames, Utterance } from "@mm/core";

export interface MeetingRecord {
  id: string;
  mode: "online" | "offline";
  title: string;
  createdAt: number;
  utterances: Utterance[];
  mindmap: MindMap;
  summaryBullets: string[];
  speakerNames: SpeakerNames;
  finalSummary: MeetingSummary | null;
}

const DB = "meeting-mindmap";
const STORE = "meetings";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export const saveMeeting = (m: MeetingRecord) => tx("readwrite", (s) => s.put(m)).then(() => undefined);
export const deleteMeeting = (id: string) => tx("readwrite", (s) => s.delete(id)).then(() => undefined);
export const listMeetings = () =>
  tx<MeetingRecord[]>("readonly", (s) => s.getAll()).then((all) => all.sort((a, b) => b.createdAt - a.createdAt));

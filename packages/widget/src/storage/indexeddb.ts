import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { CopilotMessage } from '../ui/copilotTypes.js';

export interface StoredSession {
  sessionId: string;
  tenant: string;
  agentSlug: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: CopilotMessage[];
}

interface WidgetDB extends DBSchema {
  sessions: {
    key: string;
    value: StoredSession;
    indexes: { 'by-updatedAt': number };
  };
}

const DB_NAME = 'openflow-widget';
const DB_VERSION = 1;

export async function openSessionsDB(): Promise<IDBPDatabase<WidgetDB>> {
  return await openDB<WidgetDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('sessions', { keyPath: 'sessionId' });
      store.createIndex('by-updatedAt', 'updatedAt');
    },
  });
}

export async function putSession(s: StoredSession): Promise<void> {
  const db = await openSessionsDB();
  await db.put('sessions', s);
}

export async function getSession(id: string): Promise<StoredSession | undefined> {
  const db = await openSessionsDB();
  return await db.get('sessions', id);
}

export async function listSessions(): Promise<StoredSession[]> {
  const db = await openSessionsDB();
  const all = await db.getAllFromIndex('sessions', 'by-updatedAt');
  return all.reverse(); // newest first
}

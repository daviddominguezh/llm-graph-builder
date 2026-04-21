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
  starred?: boolean;
}

interface WidgetDB extends DBSchema {
  sessions: {
    key: string;
    value: StoredSession;
    indexes: {
      'by-updatedAt': number;
      'by-tenant-agent-updatedAt': [string, string, number];
    };
  };
}

const DB_NAME = 'openflow-widget';
const DB_VERSION = 2;
const SCHEMA_V1 = 1;
const SCHEMA_V2 = 2;
const TENANT_AGENT_INDEX = 'by-tenant-agent-updatedAt';
const UPDATED_AT_INDEX = 'by-updatedAt';

function upgradeFromV0(db: IDBPDatabase<WidgetDB>): void {
  const store = db.createObjectStore('sessions', { keyPath: 'sessionId' });
  store.createIndex(UPDATED_AT_INDEX, 'updatedAt');
  store.createIndex(TENANT_AGENT_INDEX, ['tenant', 'agentSlug', 'updatedAt']);
}

export async function openSessionsDB(): Promise<IDBPDatabase<WidgetDB>> {
  return await openDB<WidgetDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < SCHEMA_V1) {
        upgradeFromV0(db);
        return;
      }
      if (oldVersion < SCHEMA_V2) {
        tx.objectStore('sessions').createIndex(TENANT_AGENT_INDEX, ['tenant', 'agentSlug', 'updatedAt']);
      }
    },
  });
}

export async function putSession(s: StoredSession): Promise<void> {
  const db = await openSessionsDB();
  await db.put('sessions', s);
}

export async function getSession(
  tenant: string,
  agentSlug: string,
  id: string
): Promise<StoredSession | undefined> {
  const db = await openSessionsDB();
  const session = await db.get('sessions', id);
  if (session === undefined) return undefined;
  if (session.tenant !== tenant || session.agentSlug !== agentSlug) return undefined;
  return session;
}

export async function listSessions(tenant: string, agentSlug: string): Promise<StoredSession[]> {
  const db = await openSessionsDB();
  const lower: [string, string, number] = [tenant, agentSlug, Number.NEGATIVE_INFINITY];
  const upper: [string, string, number] = [tenant, agentSlug, Number.POSITIVE_INFINITY];
  const range = IDBKeyRange.bound(lower, upper);
  const all = await db.getAllFromIndex('sessions', TENANT_AGENT_INDEX, range);
  return all.reverse();
}

export async function deleteSessionById(
  tenant: string,
  agentSlug: string,
  id: string
): Promise<void> {
  const db = await openSessionsDB();
  const session = await db.get('sessions', id);
  if (session === undefined) return;
  if (session.tenant !== tenant || session.agentSlug !== agentSlug) return;
  await db.delete('sessions', id);
}

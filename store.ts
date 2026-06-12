// Tiny JSON-file-backed session store, keyed by callId. In-memory Map with
// write-through to data/sessions.json so a mid-demo restart keeps history.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Session } from "./shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const FILE = join(DATA_DIR, "sessions.json");

const sessions = new Map<string, Session>();

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function persist(): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify([...sessions.values()], null, 2));
}

/** Load any persisted sessions on startup. Call once at boot. */
export function loadSessions(): void {
  ensureDir();
  if (!existsSync(FILE)) return;
  try {
    const rows: Session[] = JSON.parse(readFileSync(FILE, "utf8"));
    for (const s of rows) sessions.set(s.callId, s);
  } catch {
    // ignore a corrupt file — start empty
  }
}

export function createSession(input: { callId: string; name: string; phone: string; isTest?: boolean }): Session {
  const now = new Date().toISOString();
  const session: Session = {
    callId: input.callId,
    name: input.name,
    phone: input.phone,
    status: "calling",
    isTest: input.isTest || undefined,
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(session.callId, session);
  persist();
  return session;
}

export function getSession(callId: string): Session | undefined {
  return sessions.get(callId);
}

export function updateSession(callId: string, patch: Partial<Session>): Session | undefined {
  const cur = sessions.get(callId);
  if (!cur) return undefined;
  const next: Session = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  sessions.set(callId, next);
  persist();
  return next;
}

/** Real student sessions for the teacher dashboard (test dry-runs are hidden). */
export function listSessions(): Session[] {
  return [...sessions.values()]
    .filter((s) => !s.isTest)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Typed fetch helpers for the Kesherola API (proxied to Express in dev).
import type { Assignment, EnrollResponse, Session } from "@shared/types";

async function json<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { detail?: string }).detail || `Request failed (${r.status})`);
  return body as T;
}

export function enroll(name: string, phone: string): Promise<EnrollResponse> {
  return fetch("/api/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone }),
  }).then((r) => r.json());
}

export function getSessions(): Promise<Session[]> {
  return fetch("/api/sessions").then((r) => json<{ sessions: Session[] }>(r)).then((d) => d.sessions);
}

export function assessSession(callId: string): Promise<Session> {
  return fetch(`/api/sessions/${callId}/assess`, { method: "POST" })
    .then((r) => json<{ session: Session }>(r))
    .then((d) => d.session);
}

export function getAssignment(): Promise<Assignment> {
  return fetch("/api/assignment").then((r) => json<{ assignment: Assignment }>(r)).then((d) => d.assignment);
}

export function getTemplates(): Promise<Assignment[]> {
  return fetch("/api/templates").then((r) => json<{ templates: Assignment[] }>(r)).then((d) => d.templates);
}

/** Place a test call using the (unsaved) scenario in the setup form. */
export function testCall(assignment: Assignment, name: string, phone: string): Promise<EnrollResponse> {
  return fetch("/api/test-call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignment, name, phone }),
  }).then((r) => r.json());
}

export function putAssignment(patch: Partial<Assignment>): Promise<Assignment> {
  return fetch("/api/assignment", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((r) => json<{ assignment: Assignment }>(r)).then((d) => d.assignment);
}

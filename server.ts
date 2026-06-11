// Storyline backend — Express API + WebSocket.
//
//   * POST /api/enroll      student self-enrolls → places the character call
//   * GET/PUT /api/assignment   read/edit the agent's persona + context + goals
//   * GET /api/sessions(/:id)   teacher view of calls, transcripts, assessments
//   * WS  /ws               live session updates pushed to the teacher dashboard
//
// Call lifecycle is driven by Dial events on the DialService hub: call.ended
// sets the outcome; call.transcribed captures the transcript (and, in Sprint 2,
// triggers the Claude assessment).

import express from "express";
import type { Request, Response } from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSettings } from "./config.ts";
import { DialService } from "./dial-service.ts";
import { getAssignment, saveAssignment, buildOutboundInstruction } from "./assignment.ts";
import { createSession, getSession, updateSession, listSessions, loadSessions } from "./store.ts";
import { assessTranscript, assessmentEnabled } from "./assessor.ts";
import type { Assignment, Session, SessionStatus } from "./shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const E164 = /^\+[1-9]\d{1,14}$/;
function validE164(v: string): string {
  const s = (v || "").trim().replace(/[\s-]/g, "");
  if (!E164.test(s)) throw new Error("Phone number must be E.164, e.g. +14155550123");
  return s;
}
function requireText(v: string, label: string): string {
  const s = (v || "").trim();
  if (!s) throw new Error(`${label} cannot be empty`);
  return s;
}

const settings = loadSettings();
const service = new DialService(settings);
loadSessions();
await service.start();

// ---- Dial event → session updates ------------------------------------------

type HubEvent = { type?: string; data?: Record<string, unknown> };

/** Map Dial's call.ended termination to our coarse session status. */
function statusFromEnded(rawStatus: string, canceled: boolean): SessionStatus {
  if (canceled) return "failed";
  switch (rawStatus) {
    case "completed": return "completed";
    case "no-answer": return "no-answer";
    case "busy":
    case "failed":
    case "canceled": return "failed";
    default: return "completed";
  }
}

/** Push an enriched session update so the teacher dashboard updates live. */
function publishSession(session: Session): void {
  service.hub.publish({ type: "session.updated", data: session });
}

async function handleEvent(raw: unknown): Promise<void> {
  const ev = raw as HubEvent;
  const data = ev?.data ?? {};
  const callId = data.callId as string | undefined;
  if (!ev?.type || !callId) return;
  if (!getSession(callId)) return; // not one of our enrolled calls

  if (ev.type === "call.ended") {
    const status = statusFromEnded(String(data.status ?? ""), Boolean(data.canceled));
    const updated = updateSession(callId, {
      status,
      outcome: data.status as string | undefined,
      durationSeconds: (data.durationSeconds as number | null) ?? undefined,
    });
    if (updated) publishSession(updated);
    return;
  }

  if (ev.type === "call.transcribed") {
    try {
      const call = await service.getCall(callId);
      const transcript = call.transcript ?? "";
      const stored = updateSession(callId, { status: "transcribed", transcript });
      if (stored) publishSession(stored);
      await runAssessment(callId, transcript);
    } catch (e) {
      console.error(`[storyline] failed to fetch transcript for ${callId}:`, (e as Error).message);
    }
  }
}

/** Grade a captured transcript with Claude and store the result (if enabled). */
async function runAssessment(callId: string, transcript: string): Promise<void> {
  if (!assessmentEnabled(settings.anthropicApiKey) || !transcript.trim()) return;
  const session = getSession(callId);
  if (!session) return;
  try {
    const assessment = await assessTranscript(
      settings.anthropicApiKey!,
      getAssignment(),
      session.name,
      transcript,
    );
    const updated = updateSession(callId, { status: "assessed", assessment });
    if (updated) publishSession(updated);
    console.log(`[storyline] assessed ${callId}: score ${assessment.score} (${assessment.suggestedGrade})`);
  } catch (e) {
    console.error(`[storyline] assessment failed for ${callId}:`, (e as Error).message);
  }
}

service.hub.subscribe((ev) => void handleEvent(ev));

// ---- HTTP app --------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "web", "dist")));

// Health / sanity: your provisioned numbers.
app.get("/api/numbers", async (_req: Request, res: Response) => {
  res.json({ numbers: await service.refreshNumbers(), defaultNumberId: service.defaultNumberId });
});

// --- assignment (the editable agent prompt + context + goals) ---
app.get("/api/assignment", (_req: Request, res: Response) => {
  res.json({ assignment: getAssignment() });
});

app.put("/api/assignment", (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const patch: Partial<Assignment> = {};
    if (b.characterName !== undefined) patch.characterName = requireText(b.characterName, "Character name");
    if (b.bookTitle !== undefined) patch.bookTitle = requireText(b.bookTitle, "Book title");
    if (b.persona !== undefined) patch.persona = requireText(b.persona, "Persona");
    if (b.context !== undefined) patch.context = requireText(b.context, "Context");
    if (b.language !== undefined) patch.language = String(b.language).trim() || undefined;
    if (b.learningGoals !== undefined) {
      if (!Array.isArray(b.learningGoals)) throw new Error("learningGoals must be a list");
      patch.learningGoals = b.learningGoals.map((g: unknown) => String(g).trim()).filter(Boolean);
    }
    res.json({ assignment: saveAssignment(patch) });
  } catch (e) {
    res.status(400).json({ detail: (e as Error).message });
  }
});

// --- enroll (student self-service) → place the character call ---
app.post("/api/enroll", async (req: Request, res: Response) => {
  try {
    const name = requireText(req.body?.name, "Name");
    const phone = validE164(req.body?.phone);
    const assignment = getAssignment();
    const instruction = buildOutboundInstruction(assignment, name);
    const call = await service.placeCall(phone, instruction, assignment.language);
    const session = createSession({ callId: call.id, name, phone });
    publishSession(session);
    res.json({ ok: true, callId: call.id });
  } catch (e) {
    res.status(400).json({ ok: false, detail: (e as Error).message });
  }
});

// --- teacher views ---
app.get("/api/sessions", (_req: Request, res: Response) => {
  res.json({ sessions: listSessions() });
});

app.get("/api/sessions/:callId", (req: Request, res: Response) => {
  const session = getSession(String(req.params.callId));
  if (!session) { res.status(404).json({ detail: "Session not found" }); return; }
  res.json({ session });
});

// Re-run (or run) the Claude assessment on a stored transcript on demand.
app.post("/api/sessions/:callId/assess", async (req: Request, res: Response) => {
  const callId = String(req.params.callId);
  const session = getSession(callId);
  if (!session) { res.status(404).json({ detail: "Session not found" }); return; }
  if (!assessmentEnabled(settings.anthropicApiKey)) {
    res.status(400).json({ detail: "ANTHROPIC_API_KEY is not set — add it to .env to enable grading." }); return;
  }
  if (!session.transcript?.trim()) { res.status(400).json({ detail: "No transcript to assess yet." }); return; }
  try {
    await runAssessment(callId, session.transcript);
    res.json({ session: getSession(callId) });
  } catch (e) {
    res.status(500).json({ detail: (e as Error).message });
  }
});

// SPA fallback: serve the built React app for any non-API GET so client-side
// routes (/teacher, /setup) survive a hard refresh in production.
app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
  res.sendFile(join(__dirname, "web", "dist", "index.html"));
});

const server = createServer(app);

// Live session updates over WebSocket at /ws.
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws: WebSocket) => {
  // seed a fresh dashboard with current sessions
  ws.send(JSON.stringify({ kind: "snapshot", sessions: listSessions() }));
  const unsubscribe = service.hub.subscribe((ev) => {
    const e = ev as HubEvent;
    if (e?.type === "session.updated" && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ kind: "session", session: e.data }));
    }
  });
  ws.on("close", unsubscribe);
  ws.on("error", unsubscribe);
});

const PORT = Number(process.env.PORT ?? 8000);
server.listen(PORT, () => console.log(`Storyline server running on http://localhost:${PORT}`));

async function shutdown() {
  await service.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Kesherola backend — Express API + WebSocket.
//
//   * POST /api/enroll      student self-enrolls → places the character call
//   * GET/PUT /api/assignment   read/edit the agent's persona + context + goals
//   * GET /api/sessions(/:id)   teacher view of calls, transcripts, assessments
//   * WS  /ws               live session updates pushed to the teacher dashboard
//
// Call lifecycle is driven by Dial events on the DialService hub: call.ended
// sets the outcome; call.transcribed captures the transcript and triggers the
// AI assessment when a grading provider is configured.

import express from "express";
import type { Request, Response } from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSettings } from "./config.ts";
import { DialService } from "./dial-service.ts";
import { getAssignment, saveAssignment, buildOutboundInstruction, SCENARIO_TEMPLATES } from "./assignment.ts";
import { createSession, getSession, updateSession, listSessions, loadSessions } from "./store.ts";
import { assessTranscript, assessmentEnabled, assessmentProvider } from "./assessor.ts";
import type { Assignment, ScenarioMode, Session, SessionStatus } from "./shared/types.ts";

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
const assessmentConfig = {
  openaiApiKey: settings.openaiApiKey,
  anthropicApiKey: settings.anthropicApiKey,
  model: settings.assessmentModel,
};
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
      console.error(`[kesherola] failed to fetch transcript for ${callId}:`, (e as Error).message);
    }
  }
}

/** Grade a captured transcript and store the result (if enabled). */
async function runAssessment(callId: string, transcript: string): Promise<void> {
  if (!assessmentEnabled(assessmentConfig) || !transcript.trim()) return;
  const session = getSession(callId);
  if (!session) return;
  if (session.isTest) return; // dry-runs capture a transcript but are not graded
  try {
    const assessment = await assessTranscript(
      assessmentConfig,
      getAssignment(),
      session.name,
      transcript,
    );
    const updated = updateSession(callId, { status: "assessed", assessment });
    if (updated) publishSession(updated);
    const provider = assessmentProvider(assessmentConfig);
    console.log(`[kesherola] assessed ${callId} via ${provider}: score ${assessment.score} (${assessment.suggestedGrade})`);
  } catch (e) {
    console.error(`[kesherola] assessment failed for ${callId}:`, (e as Error).message);
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

// --- templates (built-in scenarios the teacher can start from) ---
app.get("/api/templates", (_req: Request, res: Response) => {
  res.json({ templates: SCENARIO_TEMPLATES });
});

// --- assignment (the editable scenario: persona + context + goals/objectives) ---
app.get("/api/assignment", (_req: Request, res: Response) => {
  res.json({ assignment: getAssignment() });
});

app.put("/api/assignment", (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const patch: Partial<Assignment> = {};
    // Required regardless of mode.
    if (b.characterName !== undefined) patch.characterName = requireText(b.characterName, "Character name");
    if (b.persona !== undefined) patch.persona = requireText(b.persona, "Persona");
    if (b.context !== undefined) patch.context = requireText(b.context, "Context");
    // Optional / mode-specific — strings are stored when present, cleared when blank.
    if (b.mode !== undefined) {
      if (b.mode !== "quiz" && b.mode !== "mission") throw new Error("mode must be 'quiz' or 'mission'");
      patch.mode = b.mode as ScenarioMode;
    }
    if (b.title !== undefined) patch.title = String(b.title).trim() || undefined;
    if (b.characterRole !== undefined) patch.characterRole = String(b.characterRole).trim() || undefined;
    if (b.bookTitle !== undefined) patch.bookTitle = String(b.bookTitle).trim() || undefined;
    if (b.studentMission !== undefined) patch.studentMission = String(b.studentMission).trim() || undefined;
    if (b.studentRole !== undefined) patch.studentRole = String(b.studentRole).trim() || undefined;
    if (b.openingLine !== undefined) patch.openingLine = String(b.openingLine).trim() || undefined;
    if (b.languageLevel !== undefined) patch.languageLevel = String(b.languageLevel).trim() || undefined;
    if (b.notes !== undefined) patch.notes = String(b.notes).trim() || undefined;
    if (b.voiceGender !== undefined) {
      patch.voiceGender = b.voiceGender === "female" ? "female" : b.voiceGender === "male" ? "male" : undefined;
    }
    if (b.language !== undefined) patch.language = String(b.language).trim() || undefined;
    if (b.learningGoals !== undefined) {
      if (!Array.isArray(b.learningGoals)) throw new Error("learningGoals must be a list");
      patch.learningGoals = b.learningGoals.map((g: unknown) => String(g).trim()).filter(Boolean);
    }
    // Outcome labels travel with a loaded template; preserve them (or clear if blanked).
    if (b.outcomeLabels !== undefined) {
      const ol = b.outcomeLabels;
      patch.outcomeLabels =
        ol && typeof ol === "object" && ol.strong && ol.medium && ol.supported
          ? { strong: String(ol.strong), medium: String(ol.medium), supported: String(ol.supported) }
          : undefined;
    }
    res.json({ assignment: saveAssignment(patch) });
  } catch (e) {
    res.status(400).json({ detail: (e as Error).message });
  }
});

// --- test call (teacher dry-run) → place a call using UNSAVED form values ---
// Builds the scenario straight from the request body so a teacher can hear the
// agent before saving. Intentionally does NOT create a session or persist.
function strOpt(v: unknown): string | undefined {
  const s = (v == null ? "" : String(v)).trim();
  return s || undefined;
}
function assignmentFromBody(b: Record<string, unknown>): Assignment {
  return {
    mode: b.mode === "mission" ? "mission" : "quiz",
    title: strOpt(b.title),
    characterName: requireText(b.characterName as string, "Character name"),
    characterRole: strOpt(b.characterRole),
    bookTitle: strOpt(b.bookTitle),
    persona: requireText(b.persona as string, "Persona"),
    context: requireText(b.context as string, "Context"),
    studentMission: strOpt(b.studentMission),
    studentRole: strOpt(b.studentRole),
    openingLine: strOpt(b.openingLine),
    languageLevel: strOpt(b.languageLevel),
    learningGoals: Array.isArray(b.learningGoals)
      ? b.learningGoals.map((g: unknown) => String(g).trim()).filter(Boolean)
      : [],
    voiceGender: b.voiceGender === "female" ? "female" : b.voiceGender === "male" ? "male" : undefined,
    language: strOpt(b.language),
  };
}

app.post("/api/test-call", async (req: Request, res: Response) => {
  try {
    const name = requireText(req.body?.name, "Name");
    const phone = validE164(req.body?.phone);
    const assignment = assignmentFromBody((req.body?.assignment ?? {}) as Record<string, unknown>);
    const instruction = buildOutboundInstruction(assignment, name);
    const call = await service.placeCall(phone, instruction, assignment.language, assignment.voiceGender);
    // Capture the dry-run transcript (hidden from the dashboard) so a future
    // "refine with AI" step can pair it with the teacher's notes. No grading.
    createSession({ callId: call.id, name, phone, isTest: true });
    res.json({ ok: true, callId: call.id });
  } catch (e) {
    res.status(400).json({ ok: false, detail: (e as Error).message });
  }
});

// --- enroll (student self-service) → place the character call ---
app.post("/api/enroll", async (req: Request, res: Response) => {
  try {
    const name = requireText(req.body?.name, "Name");
    const phone = validE164(req.body?.phone);
    const assignment = getAssignment();
    const instruction = buildOutboundInstruction(assignment, name);
    const call = await service.placeCall(phone, instruction, assignment.language, assignment.voiceGender);
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

// Re-run (or run) the AI assessment on a stored transcript on demand.
app.post("/api/sessions/:callId/assess", async (req: Request, res: Response) => {
  const callId = String(req.params.callId);
  const session = getSession(callId);
  if (!session) { res.status(404).json({ detail: "Session not found" }); return; }
  if (!assessmentEnabled(assessmentConfig)) {
    res.status(400).json({ detail: "OPENAI_API_KEY or CODEX_API_KEY is not set. Add one to .env to enable OpenAI grading, or set ANTHROPIC_API_KEY as a fallback." }); return;
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
      if ((e.data as Session | undefined)?.isTest) return; // keep dry-runs off the dashboard
      ws.send(JSON.stringify({ kind: "session", session: e.data }));
    }
  });
  ws.on("close", unsubscribe);
  ws.on("error", unsubscribe);
});

const PORT = Number(process.env.PORT ?? 8000);
server.listen(PORT, () => console.log(`Kesherola server running on http://localhost:${PORT}`));

async function shutdown() {
  await service.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

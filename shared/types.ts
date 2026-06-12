// Shared API contract — imported by both the Express backend and the React app.

/**
 * Two shapes of experience:
 *  - "quiz"    — a warm character gently checks understanding (e.g. a book).
 *  - "mission" — a skeptical roleplay the student must persuade their way
 *                through, with adaptive difficulty and a guaranteed, no-fail
 *                completion path. The hard parts (support tiers, outcome tiers,
 *                opening/closing lines) are applied by the framework, not the
 *                teacher — see MISSION_RULES in assignment.ts.
 */
export type ScenarioMode = "quiz" | "mission";

/** Per-template flavor names for the three no-fail outcome tiers. */
export interface OutcomeLabels {
  strong: string;    // e.g. "Case Solved"
  medium: string;    // e.g. "Partial Lead"
  supported: string; // e.g. "Kept on File"
}

/** The editable scenario that drives the call and the assessment rubric. */
export interface Assignment {
  mode?: ScenarioMode;     // default "quiz" when absent (backward-compatible)
  title?: string;          // assignment/mission name, e.g. "The Night Before Yom Kippur"
  tagline?: string;        // short one-line description shown on the template card
  characterName: string;   // e.g. "Golda Meir"
  characterRole?: string;  // mission: "Prime Minister of Israel"
  bookTitle?: string;      // quiz only: e.g. "Harry Potter and the Sorcerer's Stone"
  persona: string;         // how the character speaks/behaves on the call
  context: string;         // background the character knows (book facts OR the historical setting)
  studentMission?: string; // mission: what the student must achieve on the call
  studentRole?: string;    // mission: who the STUDENT plays in the scene
  openingLine?: string;    // mission: the character's scripted first line
  languageLevel?: string;  // plain-language note on vocabulary level to use
  learningGoals: string[]; // success criteria / objectives (relabeled per mode in the UI)
  outcomeLabels?: OutcomeLabels; // mission: custom names for strong/medium/supported
  notes?: string;          // teacher's "what to change" note after a test call (future: feeds an LLM refine step)
  voiceGender?: "male" | "female"; // AI voice gender for the call (Dial voiceGender)
  language?: string;       // BCP-47, e.g. "en-US"; optional (auto-detected)
}

/** Lifecycle of one student's call. */
export type SessionStatus =
  | "calling"      // call placed, ringing / in progress
  | "completed"    // call ended normally; transcript may still be pending
  | "transcribed"  // transcript captured; assessment pending
  | "assessed"     // Claude assessment ready
  | "no-answer"    // nobody picked up
  | "failed";      // busy / failed / canceled

/** Claude's structured grade of one transcript. */
export interface Assessment {
  summary: string;        // 1–2 sentence overview for the teacher
  understood: string[];   // learning goals the student demonstrated
  gaps: string[];         // goals they missed or were shaky on
  engagement: string;     // a short note on participation/effort
  score: number;          // 0–100
  suggestedGrade: string; // e.g. "B+"
  // --- mission mode only (quiz path leaves these undefined) ---
  objectiveResults?: { objective: string; met: boolean }[]; // per-objective checklist
  outcome?: string;        // "strong" | "medium" | "supported" — never a fail
  followUpQuestion?: string; // one suggested follow-up to ask the student next
}

/** One student's enrollment + call + result. Keyed by callId. */
export interface Session {
  callId: string;
  name: string;
  phone: string;
  status: SessionStatus;
  outcome?: string;          // raw Dial termination type (no-answer, busy, ...)
  durationSeconds?: number;
  transcript?: string;
  assessment?: Assessment;
  isTest?: boolean;          // a teacher dry-run: transcript captured but hidden from the dashboard
  createdAt: string;
  updatedAt: string;
}

export interface EnrollRequest {
  name: string;
  phone: string;
}

export interface EnrollResponse {
  ok: boolean;
  callId?: string;
  detail?: string;
}

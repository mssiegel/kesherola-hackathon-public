// Shared API contract — imported by both the Express backend and the React app.

/** The editable assignment that drives the call and the assessment rubric. */
export interface Assignment {
  characterName: string;   // e.g. "Harry Potter"
  bookTitle: string;       // e.g. "Harry Potter and the Sorcerer's Stone"
  persona: string;         // how the character speaks/behaves on the call
  context: string;         // book facts the agent can probe against
  learningGoals: string[]; // what a student should demonstrate
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

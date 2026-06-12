// Claude-powered transcript assessment. Reads one call transcript and grades it
// against the assignment's learning goals, returning structured JSON via a tool
// schema (so the result is reliable, not free-form prose).

import Anthropic from "@anthropic-ai/sdk";
import type { Assignment, Assessment } from "./shared/types.ts";

const MODEL = process.env.ASSESS_MODEL || "claude-sonnet-4-6";

const ASSESSMENT_TOOL: Anthropic.Tool = {
  name: "record_assessment",
  description: "Record the structured assessment of the student's conversation.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "1–2 sentence overview for the teacher." },
      understood: {
        type: "array", items: { type: "string" },
        description: "Learning goals the student clearly demonstrated, in plain language.",
      },
      gaps: {
        type: "array", items: { type: "string" },
        description: "Learning goals the student missed, avoided, or was shaky on.",
      },
      engagement: { type: "string", description: "Short note on the student's participation and effort." },
      score: { type: "integer", description: "Overall mastery score from 0 to 100." },
      suggestedGrade: { type: "string", description: "A letter grade such as A, B+, or C-." },
    },
    required: ["summary", "understood", "gaps", "engagement", "score", "suggestedGrade"],
  },
};

/** Mission-mode tool: track per-objective progress + a no-fail outcome tier. */
const MISSION_TOOL: Anthropic.Tool = {
  name: "record_mission_outcome",
  description: "Record how the student did on the historical roleplay mission. No student fails.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "1–2 sentence overview of the call for the teacher." },
      objectiveResults: {
        type: "array",
        description: "One entry per mission objective, in the order given, marking whether the student met it.",
        items: {
          type: "object",
          properties: {
            objective: { type: "string", description: "The objective text, echoed back." },
            met: { type: "boolean", description: "Whether the student demonstrated this objective (with or without help)." },
          },
          required: ["objective", "met"],
        },
      },
      outcome: {
        type: "string",
        enum: ["strong", "medium", "supported"],
        description:
          "strong = argued well and earned the action; medium = partly convincing; supported = needed the character's help to get there. Never a fail.",
      },
      engagement: { type: "string", description: "Short note on participation, effort, and how much support the student needed." },
      score: { type: "integer", description: "0–100 reflecting persuasiveness/effort — NOT a pass/fail. Even a supported student should score meaningfully above zero." },
      followUpQuestion: { type: "string", description: "One question the teacher could ask this student next to push their thinking further." },
    },
    required: ["summary", "objectiveResults", "outcome", "engagement", "score", "followUpQuestion"],
  },
};

/** True when assessment can run (i.e. an Anthropic key is configured). */
export function assessmentEnabled(apiKey?: string): boolean {
  return Boolean(apiKey);
}

export async function assessTranscript(
  apiKey: string,
  assignment: Assignment,
  studentName: string,
  transcript: string,
): Promise<Assessment> {
  const client = new Anthropic({ apiKey });
  return assignment.mode === "mission"
    ? assessMission(client, assignment, studentName, transcript)
    : assessQuiz(client, assignment, studentName, transcript);
}

/** Quiz mode: grade understanding against learning goals (unchanged behavior). */
async function assessQuiz(
  client: Anthropic,
  assignment: Assignment,
  studentName: string,
  transcript: string,
): Promise<Assessment> {
  const goals = assignment.learningGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const source = assignment.bookTitle ? `"${assignment.bookTitle}"` : "the assigned material";

  const system =
    `You are a fair, experienced literature teacher's grading assistant. A student named ${studentName} ` +
    `had a phone conversation with an AI roleplaying ${assignment.characterName} from ${source}. ` +
    `Assess ONLY what the transcript shows about the student's understanding of the book, graded against the ` +
    `learning goals. Be encouraging but honest: a short, distracted, or off-topic conversation should score lower, ` +
    `and credit specific textual details over vague or movie-only answers. Speech-to-text may be imperfect — judge ` +
    `intent generously, not spelling.`;

  const userContent =
    `Learning goals:\n${goals}\n\n` +
    `Book context (ground truth you can check answers against):\n${assignment.context}\n\n` +
    `Transcript (User = the student ${studentName}; Agent = ${assignment.characterName}):\n${transcript}\n\n` +
    `Call the record_assessment tool with your assessment.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools: [ASSESSMENT_TOOL],
    tool_choice: { type: "tool", name: "record_assessment" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude returned no assessment");
  const input = block.input as Partial<Assessment>;

  return {
    summary: String(input.summary ?? ""),
    understood: Array.isArray(input.understood) ? input.understood.map(String) : [],
    gaps: Array.isArray(input.gaps) ? input.gaps.map(String) : [],
    engagement: String(input.engagement ?? ""),
    score: Math.max(0, Math.min(100, Math.round(Number(input.score) || 0))),
    suggestedGrade: String(input.suggestedGrade ?? ""),
  };
}

const OUTCOME_LABEL: Record<string, string> = {
  strong: "Strong — agreed to act",
  medium: "Medium — taking it seriously",
  supported: "Supported — agreed to investigate",
};

/** Mission mode: track objectives + a no-fail outcome tier. */
async function assessMission(
  client: Anthropic,
  assignment: Assignment,
  studentName: string,
  transcript: string,
): Promise<Assessment> {
  const objectives = assignment.learningGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const role = assignment.characterRole ? `, ${assignment.characterRole},` : "";

  const system =
    `You are a supportive teacher's assistant reviewing an interactive roleplay. A student named ` +
    `${studentName} had a phone call with an AI playing ${assignment.characterName}${role}, and the student's ` +
    `mission was: ${assignment.studentMission ?? "to persuade the character to act"}. ` +
    `This is a no-fail exercise designed so EVERY student completes the mission — sometimes with the character's ` +
    `help. Assess how far the student got and HOW MUCH HELP they needed, not whether they "passed". The character ` +
    `uses a 3-tier rescue ladder: Tier 1 rephrases, Tier 2 offers a forced choice, Tier 3 gives the answer and asks ` +
    `the student to reason it back. Set the outcome from how far up that ladder they needed to be carried: ` +
    `"strong" = answered with little or no help; "medium" = needed forced-choice help; "supported" = needed answers ` +
    `given to them. Credit ideas the student reached even with hints. Speech-to-text may be imperfect — judge intent ` +
    `generously, not spelling. Be encouraging; never describe a student as failing.`;

  const userContent =
    `Mission objectives (return one objectiveResults entry per objective, in this order):\n${objectives}\n\n` +
    `Scene background (context the character knew):\n${assignment.context}\n\n` +
    `Transcript (User = the student ${studentName}; Agent = ${assignment.characterName}):\n${transcript}\n\n` +
    `Call the record_mission_outcome tool with your assessment.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools: [MISSION_TOOL],
    tool_choice: { type: "tool", name: "record_mission_outcome" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude returned no assessment");
  const input = block.input as {
    summary?: unknown;
    objectiveResults?: unknown;
    outcome?: unknown;
    engagement?: unknown;
    score?: unknown;
    followUpQuestion?: unknown;
  };

  const objectiveResults = Array.isArray(input.objectiveResults)
    ? input.objectiveResults.map((r) => {
        const o = (r ?? {}) as { objective?: unknown; met?: unknown };
        return { objective: String(o.objective ?? ""), met: Boolean(o.met) };
      })
    : [];

  const outcome = ["strong", "medium", "supported"].includes(String(input.outcome))
    ? String(input.outcome)
    : "supported";

  // Map mission results onto the legacy fields so the rest of the app still has
  // sensible understood/gaps/grade values to show.
  return {
    summary: String(input.summary ?? ""),
    understood: objectiveResults.filter((r) => r.met).map((r) => r.objective),
    gaps: objectiveResults.filter((r) => !r.met).map((r) => r.objective),
    engagement: String(input.engagement ?? ""),
    score: Math.max(0, Math.min(100, Math.round(Number(input.score) || 0))),
    suggestedGrade:
      (assignment.outcomeLabels?.[outcome as keyof typeof assignment.outcomeLabels]) ??
      OUTCOME_LABEL[outcome] ?? outcome,
    objectiveResults,
    outcome,
    followUpQuestion: String(input.followUpQuestion ?? ""),
  };
}

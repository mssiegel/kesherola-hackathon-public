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
  const goals = assignment.learningGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");

  const system =
    `You are a fair, experienced literature teacher's grading assistant. A student named ${studentName} ` +
    `had a phone conversation with an AI roleplaying ${assignment.characterName} from "${assignment.bookTitle}". ` +
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

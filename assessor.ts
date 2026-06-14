// AI-powered transcript assessment. OpenAI is the preferred provider; Anthropic
// remains a fallback when no OpenAI-compatible key is configured.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Assignment, Assessment } from "./shared/types.ts";

export type AssessmentProvider = "openai" | "anthropic";

export interface AssessmentConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  model: string;
}

type RawQuizAssessment = {
  summary?: unknown;
  understood?: unknown;
  gaps?: unknown;
  engagement?: unknown;
  score?: unknown;
  suggestedGrade?: unknown;
};

type RawMissionAssessment = RawQuizAssessment & {
  objectiveResults?: unknown;
  outcome?: unknown;
  followUpQuestion?: unknown;
};

const QUIZ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "1-2 sentence overview for the teacher." },
    understood: {
      type: "array",
      items: { type: "string" },
      description: "Learning goals the student clearly demonstrated, in plain language.",
    },
    gaps: {
      type: "array",
      items: { type: "string" },
      description: "Learning goals the student missed, avoided, or was shaky on.",
    },
    engagement: { type: "string", description: "Short note on the student's participation and effort." },
    score: { type: "integer", description: "Overall mastery score from 0 to 100." },
    suggestedGrade: { type: "string", description: "A letter grade such as A, B+, or C-." },
  },
  required: ["summary", "understood", "gaps", "engagement", "score", "suggestedGrade"],
} as const;

const MISSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "1-2 sentence overview of the call for the teacher." },
    objectiveResults: {
      type: "array",
      description: "One entry per mission objective, in the order given, marking whether the student met it.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          objective: { type: "string", description: "The objective text, echoed back." },
          met: { type: "boolean", description: "Whether the student demonstrated this objective, with or without help." },
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
    score: { type: "integer", description: "0-100 reflecting persuasiveness/effort, not pass/fail." },
    followUpQuestion: { type: "string", description: "One question the teacher could ask this student next." },
  },
  required: ["summary", "objectiveResults", "outcome", "engagement", "score", "followUpQuestion"],
} as const;

const ASSESSMENT_TOOL: Anthropic.Tool = {
  name: "record_assessment",
  description: "Record the structured assessment of the student's conversation.",
  input_schema: QUIZ_SCHEMA as unknown as Anthropic.Tool.InputSchema,
};

const MISSION_TOOL: Anthropic.Tool = {
  name: "record_mission_outcome",
  description: "Record how the student did on the historical roleplay mission. No student fails.",
  input_schema: MISSION_SCHEMA as unknown as Anthropic.Tool.InputSchema,
};

const OUTCOME_LABEL: Record<string, string> = {
  strong: "Strong - agreed to act",
  medium: "Medium - taking it seriously",
  supported: "Supported - agreed to investigate",
};

export function assessmentProvider(config: AssessmentConfig): AssessmentProvider | undefined {
  if (config.openaiApiKey) return "openai";
  if (config.anthropicApiKey) return "anthropic";
  return undefined;
}

export function assessmentEnabled(config: AssessmentConfig): boolean {
  return Boolean(assessmentProvider(config));
}

export async function assessTranscript(
  config: AssessmentConfig,
  assignment: Assignment,
  studentName: string,
  transcript: string,
): Promise<Assessment> {
  const provider = assessmentProvider(config);
  if (provider === "openai") {
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    return assignment.mode === "mission"
      ? assessMissionWithOpenAI(client, config.model, assignment, studentName, transcript)
      : assessQuizWithOpenAI(client, config.model, assignment, studentName, transcript);
  }
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    return assignment.mode === "mission"
      ? assessMissionWithAnthropic(client, config.model, assignment, studentName, transcript)
      : assessQuizWithAnthropic(client, config.model, assignment, studentName, transcript);
  }
  throw new Error("No assessment API key configured.");
}

function quizPrompt(assignment: Assignment, studentName: string, transcript: string): { system: string; userContent: string } {
  const goals = assignment.learningGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const source = assignment.bookTitle ? `"${assignment.bookTitle}"` : "the learning activity";
  const isBookQuiz = Boolean(assignment.bookTitle?.trim());

  const system = isBookQuiz
    ? `You are a fair, experienced literature teacher's grading assistant. A student named ${studentName} ` +
      `had a phone conversation with an AI roleplaying ${assignment.characterName} from ${source}. ` +
      `Assess ONLY what the transcript shows about the student's understanding of the book, graded against the ` +
      `learning goals. Be encouraging but honest: a short, distracted, or off-topic conversation should score lower, ` +
      `and credit specific textual details over vague or movie-only answers. Speech-to-text may be imperfect; judge ` +
      `intent generously, not spelling.`
    : `You are a fair, encouraging teacher's grading assistant. A student named ${studentName} ` +
      `had a phone conversation with ${assignment.characterName} for ${source}. Assess ONLY what the transcript ` +
      `shows against the learning goals. Be encouraging but honest: a very short, distracted, or off-topic ` +
      `conversation should score lower, while genuine effort, learner speaking time, appropriate use of the target ` +
      `language, and successful self-correction should receive credit. Speech-to-text may be imperfect; judge intent ` +
      `generously, not spelling or transcript punctuation.`;

  const userContent =
    `Learning goals:\n${goals}\n\n` +
    `${isBookQuiz ? "Book context (ground truth you can check answers against)" : "Teaching context"}:\n${assignment.context}\n\n` +
    `Transcript (User = the student ${studentName}; Agent = ${assignment.characterName}):\n${transcript}`;

  return { system, userContent };
}

function missionPrompt(assignment: Assignment, studentName: string, transcript: string): { system: string; userContent: string } {
  const objectives = assignment.learningGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const role = assignment.characterRole ? `, ${assignment.characterRole},` : "";

  const system =
    `You are a supportive teacher's assistant reviewing an interactive roleplay. A student named ` +
    `${studentName} had a phone call with an AI playing ${assignment.characterName}${role}, and the student's ` +
    `mission was: ${assignment.studentMission ?? "to persuade the character to act"}. ` +
    `This is a no-fail exercise designed so EVERY student completes the mission, sometimes with the character's ` +
    `help. Assess how far the student got and HOW MUCH HELP they needed, not whether they "passed". The character ` +
    `uses a 3-tier rescue ladder: Tier 1 rephrases, Tier 2 offers a forced choice, Tier 3 gives the answer and asks ` +
    `the student to reason it back. Set the outcome from how far up that ladder they needed to be carried: ` +
    `"strong" = answered with little or no help; "medium" = needed forced-choice help; "supported" = needed answers ` +
    `given to them. Credit ideas the student reached even with hints. Speech-to-text may be imperfect; judge intent ` +
    `generously, not spelling. Be encouraging; never describe a student as failing.`;

  const userContent =
    `Mission objectives (return one objectiveResults entry per objective, in this order):\n${objectives}\n\n` +
    `Scene background (context the character knew):\n${assignment.context}\n\n` +
    `Transcript (User = the student ${studentName}; Agent = ${assignment.characterName}):\n${transcript}`;

  return { system, userContent };
}

async function assessQuizWithOpenAI(
  client: OpenAI,
  model: string,
  assignment: Assignment,
  studentName: string,
  transcript: string,
): Promise<Assessment> {
  const { system, userContent } = quizPrompt(assignment, studentName, transcript);
  const input = await createStructuredAssessment(client, model, "quiz_assessment", QUIZ_SCHEMA, system, userContent);
  return normalizeQuiz(input as RawQuizAssessment);
}

async function assessMissionWithOpenAI(
  client: OpenAI,
  model: string,
  assignment: Assignment,
  studentName: string,
  transcript: string,
): Promise<Assessment> {
  const { system, userContent } = missionPrompt(assignment, studentName, transcript);
  const input = await createStructuredAssessment(client, model, "mission_assessment", MISSION_SCHEMA, system, userContent);
  return normalizeMission(input as RawMissionAssessment, assignment);
}

async function createStructuredAssessment(
  client: OpenAI,
  model: string,
  name: string,
  schema: typeof QUIZ_SCHEMA | typeof MISSION_SCHEMA,
  system: string,
  userContent: string,
): Promise<unknown> {
  const resp = await client.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    max_output_tokens: 1024,
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema,
      },
    },
  });

  if (!resp.output_text) throw new Error("OpenAI returned no assessment text");
  return JSON.parse(resp.output_text);
}

async function assessQuizWithAnthropic(
  client: Anthropic,
  model: string,
  assignment: Assignment,
  studentName: string,
  transcript: string,
): Promise<Assessment> {
  const { system, userContent } = quizPrompt(assignment, studentName, transcript);
  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    tools: [ASSESSMENT_TOOL],
    tool_choice: { type: "tool", name: "record_assessment" },
    messages: [{ role: "user", content: `${userContent}\n\nCall the record_assessment tool with your assessment.` }],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Anthropic returned no assessment");
  return normalizeQuiz(block.input as RawQuizAssessment);
}

async function assessMissionWithAnthropic(
  client: Anthropic,
  model: string,
  assignment: Assignment,
  studentName: string,
  transcript: string,
): Promise<Assessment> {
  const { system, userContent } = missionPrompt(assignment, studentName, transcript);
  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    tools: [MISSION_TOOL],
    tool_choice: { type: "tool", name: "record_mission_outcome" },
    messages: [{ role: "user", content: `${userContent}\n\nCall the record_mission_outcome tool with your assessment.` }],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Anthropic returned no assessment");
  return normalizeMission(block.input as RawMissionAssessment, assignment);
}

function normalizeQuiz(input: RawQuizAssessment): Assessment {
  return {
    summary: String(input.summary ?? ""),
    understood: Array.isArray(input.understood) ? input.understood.map(String) : [],
    gaps: Array.isArray(input.gaps) ? input.gaps.map(String) : [],
    engagement: String(input.engagement ?? ""),
    score: clampScore(input.score),
    suggestedGrade: String(input.suggestedGrade ?? ""),
  };
}

function normalizeMission(input: RawMissionAssessment, assignment: Assignment): Assessment {
  const objectiveResults = Array.isArray(input.objectiveResults)
    ? input.objectiveResults.map((r) => {
        const o = (r ?? {}) as { objective?: unknown; met?: unknown };
        return { objective: String(o.objective ?? ""), met: Boolean(o.met) };
      })
    : [];

  const outcome = ["strong", "medium", "supported"].includes(String(input.outcome))
    ? String(input.outcome)
    : "supported";

  return {
    summary: String(input.summary ?? ""),
    understood: objectiveResults.filter((r) => r.met).map((r) => r.objective),
    gaps: objectiveResults.filter((r) => !r.met).map((r) => r.objective),
    engagement: String(input.engagement ?? ""),
    score: clampScore(input.score),
    suggestedGrade:
      (assignment.outcomeLabels?.[outcome as keyof typeof assignment.outcomeLabels]) ??
      OUTCOME_LABEL[outcome] ?? outcome,
    objectiveResults,
    outcome,
    followUpQuestion: String(input.followUpQuestion ?? ""),
  };
}

function clampScore(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

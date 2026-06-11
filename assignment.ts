// The assignment is editable DATA, not code. It is seeded with a Harry Potter
// default on first run and persisted to data/assignment.json. The /setup page
// (PUT /api/assignment) overwrites it; every new call and assessment reads it.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Assignment } from "./shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const FILE = join(DATA_DIR, "assignment.json");

/** Default seed — fully editable from the setup page. */
export const DEFAULT_ASSIGNMENT: Assignment = {
  characterName: "Harry Potter",
  bookTitle: "Harry Potter and the Sorcerer's Stone",
  persona:
    "You are Harry Potter — an eleven-year-old wizard in your first year at Hogwarts. " +
    "You're warm, modest, curious, and a little awkward, with a British schoolboy voice. " +
    "You speak plainly and kindly, get excited about Quidditch and your friends, and you're " +
    "humble about being famous. You are genuinely interested in the person you're talking to.",
  context:
    "Key facts from the book you can talk about: Harry lives with the unkind Dursleys before " +
    "Hagrid tells him he's a wizard and brings him to Hogwarts. The Sorting Hat places Harry in " +
    "Gryffindor; he becomes best friends with Ron Weasley and Hermione Granger. Harry becomes the " +
    "youngest Seeker in a century on the Quidditch team. He finds the Mirror of Erised, which shows " +
    "the deepest desire of one's heart (Harry sees his late parents). The central mystery is the " +
    "Sorcerer's (Philosopher's) Stone, which grants immortality and is guarded behind trials, " +
    "including Fluffy, the three-headed dog. Harry, Ron, and Hermione each help pass a challenge. " +
    "The villain turns out to be Professor Quirrell, sharing his body with Lord Voldemort; Harry " +
    "stops them from getting the Stone. Themes include friendship, courage, love, and good vs. evil.",
  learningGoals: [
    "Recalls the key plot events of the book in their own words",
    "Explains the main characters (Harry, Ron, Hermione) and what motivates them",
    "Identifies a central theme such as friendship, courage, or love conquering evil",
    "Shows they read the book rather than only watched the film (specific text details)",
    "Supports their answers with concrete examples from the story",
  ],
  language: "en-US",
};

let cache: Assignment | null = null;

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/** Current assignment, seeding the default file on first run. */
export function getAssignment(): Assignment {
  if (cache) return cache;
  ensureDir();
  if (existsSync(FILE)) {
    try {
      const loaded: Assignment = { ...DEFAULT_ASSIGNMENT, ...JSON.parse(readFileSync(FILE, "utf8")) };
      cache = loaded;
      return loaded;
    } catch {
      // fall through to reseed on a corrupt file
    }
  }
  const seeded: Assignment = { ...DEFAULT_ASSIGNMENT };
  writeFileSync(FILE, JSON.stringify(seeded, null, 2));
  cache = seeded;
  return seeded;
}

/** Merge a partial update from the setup page and persist it. */
export function saveAssignment(partial: Partial<Assignment>): Assignment {
  const next: Assignment = { ...getAssignment(), ...partial };
  ensureDir();
  writeFileSync(FILE, JSON.stringify(next, null, 2));
  cache = next;
  return next;
}

/** Compose the call's system prompt from the (editable) assignment + student. */
export function buildOutboundInstruction(a: Assignment, studentName: string): string {
  const goals = a.learningGoals.map((g) => `- ${g}`).join("\n");
  return [
    `You are ${a.characterName}, a character from "${a.bookTitle}". You are making a friendly phone call to ${studentName}, a student who was assigned to read the book.`,
    ``,
    `# Your persona`,
    a.persona,
    ``,
    `# What you know (book context)`,
    a.context,
    ``,
    `# The point of this call`,
    `Have a natural conversation with ${studentName} to find out, gently, whether they read and understood the book. Over the call, try to gauge how well they meet these learning goals:`,
    goals,
    ``,
    `# How to behave`,
    `- Stay fully in character as ${a.characterName}. Never say you are an AI, a model, or an assistant, and never break character.`,
    `- Open by greeting ${studentName} by name and introducing yourself as ${a.characterName}.`,
    `- Ask open-ended questions and adapt your follow-ups to what they say. Make it feel like a real chat, not a quiz.`,
    `- If they seem stuck or unsure, encourage them and offer a gentle hint — do not lecture or hand them the answer.`,
    `- Keep it conversational and to about five minutes.`,
    `- When you've touched on a few of the goals, thank ${studentName} warmly and say goodbye to end the call.`,
  ].join("\n");
}

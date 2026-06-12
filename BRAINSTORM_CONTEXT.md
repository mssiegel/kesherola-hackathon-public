# Storyline — Project Context (for brainstorming)

## One-liner
Students receive a **live AI phone call from a character** (a literary character or a historical figure). The AI roleplays in character and has a real spoken conversation that probes whether the student actually did the reading/learning. After the call, **Claude reads the transcript and grades it** against the teacher's goals. It's engaging homework that's hard to fake with an AI, because the student has to *talk* and reason in real time.

## Why it exists
Traditional homework (essays, worksheets) is now trivially faked with AI. A spoken, adaptive conversation with a character is much harder to fake, more engaging for students, and gives teachers a richer signal than a multiple-choice score. Built at a hackathon (working title "Storyline").

## Two scenario modes
The app is a reusable framework. A teacher picks a `mode`:

1. **`quiz`** — A warm book character (demo: **Harry Potter**) gently checks whether the student read and understood the book. Graded as understood / gaps / score / grade.
2. **`mission`** — A **skeptical historical-roleplay** the student must *persuade* their way through. The character pushes back; the student has to argue their case using real knowledge. Has **adaptive difficulty** (eases up if the student struggles) and a **guaranteed no-fail completion path** (the student always reaches an ending, but the *quality tier* reflects how well they did). Demo seed: **Golda Meir, Oct 5 1973 — convince her to prepare for the Yom Kippur War.** Graded per-objective with a tiered outcome (strong / medium / supported, never an outright fail) plus a suggested follow-up question.

The genuinely hard pedagogy of a mission (adaptive support tiers, no-fail guarantee, skeptical pushback, outcome tiers, opening/closing beats) lives in fixed logic — teachers don't configure it. **Teachers only fill ~6 plain-language fields** (persona, context, goals, language, etc.) and can load a built-in template. Adding a new use case = adding one template object.

## How it works (flow)
1. Teacher sets up an assignment on `/setup` (persona, book/historical context, learning goals, language) — no code, persisted as data.
2. Student goes to `/`, enters name + phone number, and self-enrolls.
3. The system places an **outbound AI voice call**; the AI stays in character and adapts to the student's answers.
4. The transcript is captured live; the teacher watches sessions, transcripts, and assessments on `/teacher` in real time.
5. **Claude grades the transcript** against the assignment's rubric and produces a structured assessment.

## Tech stack
- **Voice/phone:** [Dial](https://getdial.ai) — gives AI agents real phone numbers and outbound calls (SMS + voice). The app forks Dial's `sms-and-voice/node-express` playbook.
- **Backend:** Node + TypeScript (Express + WebSocket `/ws` + `@getdial/sdk`, run via `tsx`).
- **Frontend:** React + TypeScript (Vite). Three routes: `/` (student enroll), `/teacher` (live dashboard), `/setup` (assignment editor).
- **Assessment:** Anthropic API (`@anthropic-ai/sdk`, `claude-sonnet-4-6`) producing a structured grade.
- **Storage:** simple JSON files (`data/assignment.json`, `data/sessions.json`) — hackathon-grade, no DB.

## Status / what's proven
- Full app built; three pages live; production build serves the React app from Express.
- **A real end-to-end call was placed and verified**: Dial number → a real phone, ~90s, the character stayed in role and adapted; transcript captured and shown on the teacher dashboard.
- AI assessment code path is complete; mode-aware grading with a per-mission outcome tool.

## Constraints / character of the project
- Hackathon scope: no auth, no scheduling, single shared assignment, JSON storage, student self-enrolls (trigger = student action, not a scheduled job).
- Everything is additive/backward-compatible and the design favors "teacher fills a few plain-language fields, the hard logic is fixed."

## Good directions to brainstorm
- New scenario templates / subjects beyond literature and history (science, civics, language practice, ethics debates, job-interview practice).
- Richer teacher analytics across a whole class (patterns, common gaps, rubric tuning).
- Anti-cheating / authenticity signals unique to voice (latency, reasoning-in-real-time, follow-up probing).
- Student-facing feedback loop (what they could improve, replaying the call).
- Scheduling, rosters, multi-assignment, accounts — productionizing.
- Accessibility / multilingual support (the persona/language is already configurable).
- Using SMS (Dial also does texting) for reminders, pre-call prep, or async follow-ups.

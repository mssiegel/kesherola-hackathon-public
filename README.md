# Kesherola 📞

**Your lesson, as a phone call students actually pick up.**

Kesherola calls each student and puts them in a real, spoken conversation with a character — a book's hero, a historical leader, a scientist, a spy recruiter. The student has to *talk*, think on their feet, and reach the goal of the scene. After the call, **AI reads the transcript and grades it** against the teacher's objectives.

It's homework that's hard to fake with AI (it's a live voice call, not a worksheet), it adapts to each student, and it grades itself.

Built on [Dial](https://getdial.ai) (AI voice calls) + OpenAI-first transcript assessment, with optional Anthropic fallback.

---

## Two kinds of scenario

Every scenario runs in one of two **modes**:

| Mode | What it is | Example |
|------|-----------|---------|
| **Quiz** | A warm character gently checks whether the student understood the material. | Harry Potter chats about the book you read. |
| **Mission** | A skeptical roleplay the student must *persuade their way through*, with adaptive difficulty and a guaranteed, no-fail ending. | Convince Golda Meir to mobilise before the Yom Kippur War. |

The hard parts of a mission — the **3-tier rescue ladder** (rephrase → forced choice → give-the-answer-and-ask-why), the **no-fail guarantee**, the skeptical pushback, the scripted opening line, and the **tiered outcomes** (strong / medium / supported) — are applied automatically by the engine. Teachers never configure them, they just fill in a few plain-language fields.

### Built-in templates

| Template | Mode | Mission |
|----------|------|---------|
| **Who Really Killed Gatsby?** | Mission | Solve a literary murder with detective Jordan Baker. |
| **The Night Before Yom Kippur** | Mission | Convince Golda Meir to prepare for war. |
| **You've Been Selected** | Mission | Ace a disguised oral interview with a spy recruiter. |
| **Earn Rosalind Franklin's Trust** | Mission | Prove DNA is a double helix — with evidence, before Watson & Crick. |
| **Harry Potter — reading check** | Quiz | Show you actually read the book. |

Adding a new use case is one config object in [`assignment.ts`](assignment.ts) (`SCENARIO_TEMPLATES`) — no other code changes.

---

## Pages

- **`/` — Home (teachers):** what Kesherola is and why, with a button to set up your first call.
- **`/setup` — Scenario editor:** pick a scenario type, start from a template card (or write your own), and **test it on your own phone before saving**.
- **`/student` — Enroll:** a student enters their name + phone and gets called by the character.
- **`/teacher` — Dashboard:** every student's call status, full transcript (chat bubbles), and AI assessment, updating live.

---

## How a teacher uses it

1. Go to **`/setup`**.
2. Choose **Quiz** or **Mission**, then click a **template card** to load it (or fill the fields from scratch).
3. Adjust the character, setting, student mission, success checklist, voice (female/male), etc.
4. **Test it** — enter your own name + number and hit *Call me to test* to hear the agent live. Nothing is saved; jot what you'd change in the *What would you change?* note.
5. Click **Save scenario** — it becomes the active scenario for the next call.
6. Send students to **`/student`** to enroll (or share the page). Each call rings their phone.
7. Watch results roll in on **`/teacher`**: transcript + per-objective checklist + outcome + a suggested follow-up question.

> Grading needs an OpenAI-compatible key (`OPENAI_API_KEY` or `CODEX_API_KEY`). Without it, calls and transcripts still work — only the AI assessment is skipped. `ANTHROPIC_API_KEY` can be used as a fallback if no OpenAI key is configured.

---

## Setup & running

Requires **Node 22+**.

1. **Dial account, number, and API key.** Sign up at [getdial.ai](https://getdial.ai), provision a phone number, and grab your `sk_live_...` key. (CLI: `npm i -g @getdial/cli` then `dial onboard`.)
2. **OpenAI-compatible API key** (optional — enables grading). Use `OPENAI_API_KEY`, or `CODEX_API_KEY` if that is the key name you already have. `ANTHROPIC_API_KEY` is still supported as fallback-only.
3. **Configure env:**
   ```bash
   cp .env.example .env       # fill DIAL_API_KEY (required) and OPENAI_API_KEY or CODEX_API_KEY (optional)
   ```
4. **Install and run (dev):**
   ```bash
   npm install
   npm run dev                # Express on :8000, Vite on :5173 (proxies /api + /ws)
   ```
   Open http://localhost:5173.

   **Production:**
   ```bash
   npm run build && npm start  # Express serves the built app on :8000
   ```

### Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `DIAL_API_KEY` | yes | Place/receive calls via Dial. |
| `OPENAI_API_KEY` | no | Preferred key for AI grading of transcripts. |
| `CODEX_API_KEY` | no | Alias for an OpenAI-compatible key; used when `OPENAI_API_KEY` is not set. |
| `ANTHROPIC_API_KEY` | no | Fallback grading key used only when no OpenAI key is configured. |
| `DIAL_NUMBER_ID` | no | Specific sending number; defaults to your first. |
| `ASSESS_MODEL` | no | Grading model (default `gpt-5.5` with OpenAI, `claude-sonnet-4-6` for Anthropic fallback). |
| `PORT` | no | Server port (default `8000`). |

---

## Architecture

**Backend** (repo root, TypeScript via `tsx`):
- [`server.ts`](server.ts) — Express API + WebSocket (`/ws`); routes the Dial event stream into live session updates.
- [`assignment.ts`](assignment.ts) — the editable scenario, the built-in `SCENARIO_TEMPLATES`, the fixed `MISSION_RULES` engine, and the prompt builders that compose each call's system prompt.
- [`assessor.ts`](assessor.ts) — OpenAI-first AI grading with Anthropic fallback (mode-aware: per-objective checklist + outcome tier for missions; understood/gaps/score for quizzes).
- [`dial-service.ts`](dial-service.ts) — `@getdial/sdk` wrapper (placing calls incl. `voiceGender`) + an in-memory event hub.
- [`store.ts`](store.ts) — JSON-file session store; [`config.ts`](config.ts) — env loader.

**Frontend** ([`web/`](web), React + TS via Vite): `LandingPage`, `StudentPage`, `TeacherDashboard`, `SetupPage`.

**Shared** ([`shared/types.ts`](shared/types.ts)) — one API contract typed across backend and frontend.

### Key API endpoints
- `GET /api/templates` — built-in scenario templates.
- `GET` / `PUT /api/assignment` — read / edit the active scenario.
- `POST /api/enroll` — student self-enroll → places the call.
- `POST /api/test-call` — teacher dry-run from unsaved form values (no save; transcript captured to a hidden session).
- `GET /api/sessions` (+ `/:id`, `POST /:id/assess`) — teacher views and on-demand grading.
- `WS /ws` — live session updates for the dashboard.

State is stored as JSON under `data/` (`assignment.json`, `sessions.json`) — gitignored.

See [`docs/DIAL.md`](docs/DIAL.md) for the Dial platform reference.

# Kesherola 📞📚

Students get a **phone call from a character in their assigned book** (demo: Harry Potter). The AI roleplays the character and has a real conversation that probes whether the student read and understood the material — fun homework that's hard to fake. After the call, **Claude reads the transcript and grades it** against the teacher's learning goals.

Built on [Dial](https://getdial.ai) (AI voice calls) + the Anthropic API (assessment).

## Pages
- `/` — **Student**: enter name + phone → get called by the character.
- `/teacher` — **Teacher**: every student's call status, full transcript, and AI assessment (live).
- `/setup` — **Assignment editor**: change the character persona, book context, and learning goals — no code.

## Setup

Requires **Node 22+**.

1. **Get a Dial account + number.** Install the CLI and onboard (saves a key + provisions a number):
   ```bash
   npm install -g @getdial/cli
   dial signup you@example.com
   dial onboard --code 123456
   ```
   Copy your `sk_live_...` key (and optionally a specific number id from `dial number list`).
2. **Get an Anthropic API key** from https://console.anthropic.com.
3. **Configure env:**
   ```bash
   cp .env.example .env      # then fill DIAL_API_KEY and ANTHROPIC_API_KEY
   ```
4. **Install + run (dev):**
   ```bash
   npm install
   npm run dev               # Express on :8000, Vite on :5173 (proxies /api + /ws)
   ```
   Production: `npm run build && npm start` (Express serves the built app on :8000).

## Sprint 0 smoke test (backend only)

Before the React UI exists, confirm Dial works end to end with a direct call:

```bash
npm install
cp .env.example .env         # fill DIAL_API_KEY
npm start                    # server on http://localhost:8000
# in another shell — call YOUR phone in E.164:
curl -X POST http://localhost:8000/api/call \
  -H 'Content-Type: application/json' \
  -d '{"to":"+1YOURNUMBER","instruction":"You are Harry Potter. Say a friendly hello and ask how they liked the first book."}'
```

Your phone should ring and an AI should talk. That validates the Dial wiring; later sprints add enrollment, assignment editing, and assessment.

## Architecture
- **Backend** (repo root, TypeScript via `tsx`): `server.ts` (Express + `/ws`), `dial-service.ts` (`@getdial/sdk` wrapper + event hub), `config.ts`, plus `assignment.ts` / `store.ts` / `assessor.ts` (later sprints).
- **Frontend** (`web/`, React + TS via Vite): student, teacher, and setup pages.
- **Shared types** (`shared/types.ts`): one API contract typed across both.
- See `docs/DIAL.md` for the Dial platform reference.

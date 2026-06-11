# Dial Reference (compiled 2026-06-11)

Dial gives an AI agent a real phone number: **send SMS, place AI voice calls, receive inbound SMS and calls**, and consume account events. Everything runs through one REST API at `https://getdial.ai` (`/api/v1/*`), with a CLI, Node/Python/LangChain SDKs, and MCP servers layered on top.

- Docs index: https://docs.getdial.ai/beta/llms.txt (append `.md` to any docs URL for clean markdown)
- Playbooks (runnable examples): https://github.com/GetDial-AI/playbooks
- OpenAPI spec: https://docs.getdial.ai/openapi.json
- Docs MCP server: `https://docs.getdial.ai/_mcp/server`

## Object model

| Object | Key fields | Notes |
| --- | --- | --- |
| Account | API keys | Created on email verification. `GET /api/v1/account` lists key previews. |
| API key | `sk_live_...` | Sent as `Authorization: Bearer <key>` on every request. Full account access — keep in env var, never commit. |
| Phone number | `id` (`pn_...`), `inboundInstruction`, `nickname` | Purchased through Dial. `id` is the `fromNumberId` passed to sends/calls. `inboundInstruction` = system prompt for the AI that auto-answers inbound calls. |
| Message | `from`, `to`, `body`, `status`, direction | An SMS, `inbound` or `outbound`. Send → `status: queued`. |
| Call | `status`, `duration`, `transcript`, `instruction`, `language` | AI voice call. Outbound uses per-call `outboundInstruction`; inbound uses the number's `inboundInstruction`. |
| Event | `type`, `data` | `message.received`, `call.ended`, `call.transcribed`, `webhook.ping`. |

All phone numbers are **E.164** (`+14155550123`). All REST fields are **camelCase**.

## Integration paths — pick per situation

| | CLI | Remote MCP | SDK |
| --- | --- | --- | --- |
| Best when | Agent runs shell commands | Agent speaks MCP (Claude, Cursor…) | App written in Node/Python |
| Auth | Local key saved by `dial onboard` (`~/.local/share/dial/auth.v1.json`) | OAuth 2.1 in browser, URL `https://getdial.ai/mcp` | API key in code/env |
| Output | `--json` + exit codes (0 = success) | MCP tool results (`send_message`, `place_call`, `wait_for_event`…) | Typed returns |
| Waiting for events | `dial wait-for` / listen daemon | `wait_for_event` (long-poll) | Async iterators |

`dial mcp` also runs a **local** stdio MCP server reusing the saved CLI key — same tools as Remote MCP plus local-only verbs (onboarding, listen daemon, local-target fan-out). All paths hit the same REST API; mixing is fine.

## Quickstart (CLI)

```bash
npm install -g @getdial/cli        # requires Node 22+
dial signup you@example.com        # emails a 6-digit code
dial onboard --code 123456         # creates account, SAVES API KEY locally, provisions first number
dial doctor                        # verifies account / key / number, says what's missing
dial message --to +14155550123 --body "Hello from Dial"
```

`onboard` flags: `--inbound-instruction "<prompt>"` (voice agent for inbound calls to your number), `--agent claude-code` (installs the Dial skill into the agent's config; repeatable; also `cursor`, `codex`, `opencode`, `pi`, `openclaw`, `nanoclaw`, `hermes`).

## CLI command reference

Conventions: every command takes `--json`; exit 0 = success; single attempt, **no auto-retry**; `DIAL_API_URL` env var overrides the deployment; `DIAL_NO_AUTO_UPDATE=1` disables the hourly background self-update.

| Command | Purpose / key flags |
| --- | --- |
| `dial doctor` | Account state + next steps. |
| `dial signup <email>` | Email sign-up code. `--force` overwrites pending sign-up. |
| `dial onboard` | `--code` (required), `--inbound-instruction`, `--verification-id`, `--agent` |
| `dial number list` | List numbers (gets you `pn_...` ids). |
| `dial number purchase` | `--inbound-instruction`, `--country <iso2>` (default US), `--area-code` (US/CA) |
| `dial number set <e164>` | `--inbound-instruction` (takes effect next inbound call), `--nickname` (≤100 chars, `""` clears) |
| `dial message` | Send SMS: `--to <e164>` `--body <text>` [`--from-number-id`] (defaults to onboarded number) |
| `dial message list` | `--number-id`, `--direction inbound\|outbound`, `--since <iso8601>` (≤100, newest first) |
| `dial call` | Place voice call: `--to` `--outbound-instruction` (both required), `--language <bcp47>` (auto-detected from country prefix if omitted), `--idempotency-key <uuid>`, `--from-number-id` |
| `dial call list` | Same filters as `message list`. |
| `dial call get <call_id>` | Status, duration, **transcript**. |
| `dial wait-for <event-type>` | Block for matching event. `--field name=value` / `-f` (exact, repeatable), `--regex name=pattern` / `-r`, `--timeout <s>` (default 30). Match → prints event, exit 0; timeout → exit non-zero. |
| `dial listen install / status / uninstall` | Background event daemon (launchd/systemd) logging events locally; `wait-for` reads its log when running. |
| `dial local-target add url <loopback-url>` | Daemon POSTs each event JSON to a local endpoint. `--secret` (HMAC-SHA256, header via `--signature-header`, default `X-Dial-Signature`), `--bearer`, `--timeout` (default 5s, one retry). Loopback hosts only. |
| `dial local-target add cmd <path>` | Daemon runs executable per event, event JSON as final positional arg. Exit 0 = delivered; one retry. Clean env except `PATH`/`HOME`. |
| `dial local-target remove / list` | Manage fan-out targets (live, no restart). |
| `dial mcp` | Local stdio MCP server (foreground, JSON-RPC). |
| `dial update` / `dial uninstall` | Self-update / remove daemon, skills, key, all local state (account untouched). |

## SDKs

**Node** — `npm install @getdial/sdk`

```typescript
import { DialClient } from "@getdial/sdk";
const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! }); // optional baseUrl

const numbers = await dial.listNumbers();
const msg  = await dial.sendMessage({ to: "+14155550123", fromNumberId: numbers[0].id, body: "Hi" });
const call = await dial.makeCall({ to: "+14155550123", fromNumberId: numbers[0].id,
  outboundInstruction: "You are confirming a reservation.", language: "en-US" }); // optional idempotencyKey
await dial.listMessages(); await dial.listCalls();
await dial.setNumberProperties(numbers[0].id, { nickname: "Support", inboundInstruction: "..." });

const conn = await dial.newEventsConnection();          // async-iterable; close() when done
try { for await (const ev of conn) { /* ev.type, ev.data */ } } finally { await conn.close(); }
```

**Python** — `pip install dial-sdk` (async, Python 3.11+)

```python
from dial_sdk import DialClient
dial = DialClient(api_key="sk_live_...")  # optional base_url

numbers = await dial.list_numbers()
await dial.send_message(to="+1...", from_number_id=numbers[0].id, body="Hi")
await dial.make_call(to="+1...", from_number_id=numbers[0].id,
                     outbound_instruction="...", language="en-US")  # optional idempotency_key
await dial.list_messages(); await dial.list_calls()
await dial.set_number_properties(numbers[0].id, nickname="Support", inbound_instruction="...")

async with dial.new_events_connection() as conn:
    async for event in conn:
        ...  # event["type"], event["data"]
await dial.close()
```

**LangChain** — `dial-langchain` provides tools like `SendMessageTool`, `MakeCallTool` (construct with `api_key`, hand to the agent; invoke with snake_case args).

## Capability recipes

### Send an SMS
CLI/SDK as above, or REST: `POST /api/v1/messages` with `{"to","fromNumberId","body"}` → `201`, `{id, status: "queued"}`. **Not idempotent** — see gotchas.

### Receive an SMS / catch an OTP
Don't poll — wait for the `message.received` event. Text is at `data.body`.

```bash
dial wait-for message.received --field to=+14155550123 --timeout 60 --json
```

REST equivalent: `POST /api/v1/events/wait` `{"eventType":"message.received","timeout":60}` → event, or `408` on timeout (expected, just retry). Extract a code with e.g. `re.search(r"\b(\d{6})\b", body)`.

### Place a voice call
Per-call `outboundInstruction` is the main lever — same number can run different behaviors per call. Voice is preset per number; language is BCP-47 (auto-detected if omitted). Returns immediately with `status: initiated`. Exactly one `call.ended` event fires however it ends (completed/failed/cancelled; cancelled adds `canceled: true`).

### Receive a voice call
Inbound calls are **auto-answered** by AI using the number's `inboundInstruction` (numbers without one reject inbound calls). No ringing/answered event — you learn about it via `call.ended` with `data.direction == "inbound"`. Transcript arrives slightly later via a separate `call.transcribed` event (only for calls that produced one) — wait for that, then `dial call get <id>`.

## Events

Envelope: `{ id, object: "event", type, version: 1, createdAt, relatedObject: {id,type,url}|null, data }`. Dedupe on `id`. Ignore undocumented provider-specific fields.

Types: `message.received` (inbound SMS), `call.ended` (any call finished), `call.transcribed` (transcript ready), `webhook.ping` (test).

**Delivery is presence-based**, NOT at-least-once: you only see events that arrive while connected; the listen daemon replays missed events only within ~2 minutes of reconnect. For guaranteed off-machine delivery use **webhooks** (signed HTTPS POSTs, retried at-least-once, `X-Dial-Event-ID` header) — `POST /api/v1/webhooks` etc.

## Errors, retries, idempotency (important!)

- Statuses: 200 ok, 201 created, 400 validation, 401 bad key, 404 not found, 408 wait timeout (expected), 409 idempotency conflict (retry same key shortly), 503 stream unconfigured.
- Error shape: `{ "error": "..." }` or for 400 `{ "error": { "fieldErrors": { "to": ["Required"] } } }`. Branch on status first.
- CLI and SDKs make a **single attempt, never auto-retry**.
- **Calls**: pass `Idempotency-Key` (header) / `idempotencyKey` / `--idempotency-key` → retry-safe; original returns with 200 (vs 201 fresh). A non-2xx guarantees no live call.
- **SMS and number provisioning have NO idempotency key** — a retry sends a second SMS / buys another number. After an ambiguous failure (timeout, 5xx), list recent messages/calls first and only re-send if missing. Retry freely after 400/401 (rejected before action) and for all GETs.

## REST endpoints (summary)

Auth: `POST /api/v1/auth/signup`, `POST /api/v1/auth/verify` (returns `apiKey` once). Account: `GET/DELETE /api/v1/account`, `GET /api/v1/usage`. Numbers: `GET/POST /api/v1/numbers`, `GET/PATCH/DELETE /api/v1/numbers/{id}`. Messages: `GET/POST /api/v1/messages`. Calls: `GET/POST /api/v1/calls`, `GET /api/v1/calls/{id}`. Events: `POST /api/v1/events/wait`, stream subscribe endpoint. Webhooks: CRUD + secret reveal + ping under `/api/v1/webhooks`.

## Playbooks repo layout

`<category>/<stack>`, each self-contained, credentials via `.env`:
- `sms-voice/python-fastapi`, `sms-voice/node-express` — dashboards for calls, SMS, WebSocket event streaming
- `self-hosted/openai-node`, `self-hosted/openai-python` — bring-your-own-LLM over Dial's WebSocket protocol
- `ai-agent/python-langchain` — LangChain agent with dial-langchain tools + dashboard

## Advanced (not expanded here — fetch docs when needed)

- **Webhooks**: signed HTTP POSTs with HMAC verification → `documentation/platform/webhooks.md`
- **Context MCP**: attach your own MCP server so the *voice agent* can call your tools mid-call, Dial manages OAuth → `documentation/platform/context-mcp.md`
- **Self-Hosted**: drive calls with your own LLM via a WebSocket protocol (`response_required` → `response` frames, `interrupt`, transcripts) → `api-reference/self-hosted-protocol/overview.md`

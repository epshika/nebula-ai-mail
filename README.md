# Nebula AI Mail

An email client where the AI assistant doesn't just answer questions — it drives the interface. Ask it to compose an email and the compose form visibly fills in. Ask it to filter your inbox and the email list updates. Built for the Nebula KnowLab AI-Powered Mail Web App hiring task.

## Overview

Nebula AI Mail is a full-stack webmail client (Inbox / Sent / Compose / Email detail) with a real Gmail backend and an assistant panel that controls the application through structured tool calls, not text replies. The assistant and the manual UI share one state store — an AI action and a mouse click update the app the exact same way.

## Features

- Inbox, Sent, Compose, and Email Detail views with loading/empty/error states
- Real Gmail integration via OAuth 2.0 and the Gmail API (send, list, read, mark read/unread)
- AI assistant panel that can: compose & pre-fill emails, search/filter and update the inbox, open a specific email, reply to the currently open email using conversational context ("reply to this"), and navigate views
- Human-in-the-loop send confirmation — the assistant never sends mail without an explicit yes
- Filters (date range, sender, keyword, read/unread) usable from both the UI controls and natural language
- Real-time inbox updates over Server-Sent Events, with a documented Pub/Sub production path
- Sanitized HTML rendering for email bodies (server: `sanitize-html`, client: `DOMPurify`)
- A local mock-mail mode so the entire app — including the AI-controls-the-UI loop — works without any Google credentials configured

## Architecture

```
client/ (React + TS + Vite + Tailwind)
  ├─ store/appStore.tsx     single reducer; AI "UIAction"s and manual actions both flow through it
  ├─ components/            Sidebar, EmailList, EmailDetail, Compose, AssistantPanel, Toasts
  └─ lib/api.ts             typed fetch client + SSE subscription

server/ (Node + Express + TS)
  ├─ services/gmailService.ts     real Gmail API integration (googleapis)
  ├─ services/mockMailService.ts  local dev fixture, same MailProvider interface
  ├─ services/mailProviderFactory.ts   picks Gmail vs mock per request — nothing else knows which
  ├─ services/authService.ts      Google OAuth flow, token refresh
  ├─ services/aiService.ts        Google Gemini tool-use conversation loop
  ├─ tools/definitions.ts         Zod schemas + Google Gemini tool specs (single source of truth)
  ├─ tools/executor.ts            runs a validated tool call against MailProvider, emits UIActions
  ├─ routes/                      auth, mail, assistant, realtime (SSE)
  └─ db/index.ts                  SQLite: users, oauth_tokens, sessions
```

Every mail-reading/writing code path — real or mock — goes through the same `MailProvider` interface (`server/src/types/mail.ts`). Routes, the AI tool executor, and the frontend never know or care whether they're talking to Gmail or the fixture. That's what lets the whole app (including the AI loop) be demoed without live Google credentials, and it's the only thing that changes once real credentials are added.

## AI Architecture

```
User message
  → aiService.ts sends message + tool definitions + CURRENT CONTEXT to Gemni
  → Gemni decides: reply in words, or call one or more tools (searchEmails, composeEmail, sendEmail, ...)
  → tools/executor.ts validates the tool's input (Zod) and executes it against the real MailProvider
  → executor returns (a) a short text result fed back to Claude and (b) a list of UIActions
  → server returns { reply, toolsUsed, uiActions } to the client
  → client's single reducer (store/appStore.tsx) applies uiActions directly to app state
  → Inbox/Compose/EmailDetail re-render from that state — the user sees the UI change
```

The assistant is never a keyword router. There is no `if (message.includes("send"))` anywhere in the codebase — `tools/definitions.ts` gives Claude strongly-typed tool schemas with descriptions of *when* to use each one, and the model decides which tool(s) to call and with what arguments. `tools/executor.ts` is intentionally "dumb": it only validates and executes what the model already decided.

### AI Tools

| Tool | Purpose |
|---|---|
| `searchEmails` | Filter by keyword/sender/date range/read-status; updates the main list |
| `filterInbox` | Alias of the above, scoped to the inbox |
| `openEmail` | Resolve an email by id or by sender/subject match, open detail view, mark read |
| `composeEmail` | Open compose and pre-fill any subset of To/Cc/Bcc/Subject/Body |
| `updateComposeDraft` | Patch fields on an already-open compose draft |
| `sendEmail` | Sends the current draft — **only** if `confirm=true`, which the model is instructed to set only after explicit user confirmation |
| `replyToEmail` | Resolves the target from the currently selected email in context if no id is given, pre-fills a reply |
| `navigateTo` | Switch between inbox/sent/compose/email views |
| `markAsRead` | Toggle read/unread on a specific email |
| `refreshInbox` | Force a re-fetch from the mail provider |

## Context Awareness

On every assistant turn, the client sends its current state as `context`:

```json
{
  "currentView": "email",
  "selectedEmailId": "m1",
  "currentFilter": null,
  "composeDraft": null
}
```

`aiService.ts` injects this into the system prompt as `CURRENT CONTEXT` and explicitly instructs the model to resolve pronouns like "this" against it. So "reply to this saying yes, that works" while `m1` is open never has to have its id restated by the user — `replyToEmail` falls back to `context.selectedEmailId` when no `emailId` argument is given (see `tools/executor.ts`).

## Real-Time Sync

**Documented production architecture** (Gmail push, not implemented live in this sandbox — see next section for why):
```
gmail.users.watch({ topicName }) → Google Cloud Pub/Sub topic
  → Pub/Sub push subscription → POST /api/realtime/gmail-webhook (not yet built)
  → server calls users.history.list since last historyId
  → server broadcasts the delta over the existing SSE channel
  → client's EventSource listener updates the inbox instantly
```
This requires a GCP project, a Pub/Sub topic granted publish rights to Gmail's push service account, and a publicly reachable HTTPS endpoint — all deployment-time infrastructure, not something a local dev sandbox can stand up. `GmailService.watch()` contains the exact registration call and is written to activate automatically once `GMAIL_PUBSUB_TOPIC` is set.

**What actually runs today:** an SSE endpoint (`/api/realtime/stream`) plus a background poll (`MAIL_POLL_INTERVAL_MS`, default 15s) that checks for a new top inbox message and pushes a `new-mail` event over SSE. This is explicitly a polling fallback, not push — it is not passed off as anything else. There's also a `/api/realtime/simulate-incoming` dev endpoint to demo the SSE path instantly without waiting on the poll interval.

## Security

- OAuth tokens (access + refresh) are stored server-side in SQLite, never sent to or stored in the browser. The frontend only ever holds an `httpOnly` session cookie.
- All secrets (`GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`) live in `server/.env`, which is git-ignored; `.env.example` in both `server/` and `client/` documents every variable with placeholder values only.
- Email HTML is sanitized twice: server-side with `sanitize-html` before it leaves the API, client-side with `DOMPurify` before `dangerouslySetInnerHTML`.
- Every mail route validates required fields (recipient, subject) before calling the provider and returns explicit error messages rather than swallowing failures.
- The `sendEmail` tool is hard-gated on `confirm=true` and on the draft actually having a recipient and subject — the model cannot send an incomplete or unconfirmed email no matter how it's prompted, because the gate lives in `tools/executor.ts`, not in the prompt.

## Local Setup

Requirements: Node.js 20+, npm.

```bash
git clone <your-repo-url>
cd nebula-ai-mail
npm install --workspaces
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run dev
```

This starts the backend on `http://localhost:4000` and the frontend on `http://localhost:5173`. With no further configuration, the app runs entirely against local mock mail data (see "Limitations") — Inbox, Sent, Compose, filters, and the AI assistant (once `GEMINI_API_KEY` is set) all work.

### Configuring Google OAuth (real Gmail)

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 Client ID of type "Web application".
2. Add authorized redirect URI: `http://localhost:4000/api/auth/google/callback`.
3. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) for the project.
4. Copy the Client ID and Client Secret into `server/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. Restart the server. The app will now show a "Sign in with Google" prompt; once signed in, all mail routes automatically switch from mock data to your real Gmail account (see `mailProviderFactory.ts`).

### Configuring the AI assistant

1. Create a key at [console.Google Gemini.com](https://console.Google Gemini.com/settings/keys).
2. Set `GEMINI_API_KEY` in `server/.env`.
3. Restart the server. Without this key, the app still runs — the assistant panel replies with a clear "not configured" message and the rest of the app is fully usable manually.

## Environment Variables

See `server/.env.example` and `client/.env.example` for the full annotated list. Summary:

| Variable | Where | Required for |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | server | Real Gmail login |
| `GMAIL_PUBSUB_TOPIC` | server | Production push notifications (optional) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | server | AI assistant |
| `DATABASE_PATH` | server | SQLite file location |
| `MAIL_POLL_INTERVAL_MS` | server | Realtime polling fallback cadence |
| `VITE_API_URL` | client | Backend base URL |

## Testing

```bash
cd server
npm test
```

36 tests covering: tool input validation (Zod schemas, including rejection of malformed input), the mock mail provider's filter/search/sort/send logic, and the tool executor's behavior — most importantly the `sendEmail` confirmation gate and `replyToEmail`'s context-resolution fallback. All tests exercise real logic against real inputs; none assert trivial constants.

## Deployment

Not yet deployed live (see Limitations). Intended path:
- **Backend**: Render or Railway (needs a persistent process for SQLite + SSE connections; Vercel's serverless model doesn't fit SSE well).
- **Frontend**: Vercel or Netlify, `VITE_API_URL` pointed at the deployed backend.
- Update `GOOGLE_REDIRECT_URI` and the Google Cloud OAuth consent screen's authorized redirect URIs to the deployed backend URL.
- Set `GMAIL_PUBSUB_TOPIC` and stand up the Pub/Sub push subscription (see "Real-Time Sync") pointed at the deployed backend's webhook.

## Screenshots / Demo

_Add screenshots or a short screen recording here showing the assistant filling the compose form and filtering the inbox live._

## Demo Scenarios

With mock mail data (no Google account needed) and `GEMINI_API_KEY` set:

1. "Show me unread emails from this week" — inbox list updates to the filtered set.
2. "Find the email from David about the project" — resolves and opens the matching email.
3. While that email is open: "Reply to this saying I'll be there" — compose opens pre-filled with the right recipient/subject and your reply body.
4. "Compose an email to john@example.com with subject 'Meeting Tomorrow' and body 'Let's meet at 3pm'" — compose form visibly fills in field by field.
5. Edit the body manually, then click **Send**, or tell the assistant "yes, send it" to trigger the confirmation flow.
6. Check the Sent folder — the message is really there (mock store), or really sent (live Gmail).

## Engineering Trade-offs

- **Mock mail fallback instead of stubbing it out entirely.** The assignment prioritizes demonstrating the AI-controls-UI loop; gating the entire app behind live OAuth (which can't be exercised in a sandboxed dev environment) would make that loop unverifiable. The mock and the real Gmail service share one interface, so nothing about the AI/tool/UI layer is different between them.
- **SQLite over Postgres.** Single-user local dev tool; no need for the operational overhead of a networked DB.
- **In-conversation history sent per-request rather than a server-side conversation store.** Simpler, statless request handling; a real chat-history table would be a natural next step for multi-session continuity.
- **Polling fallback for real-time instead of a fake "push" claim.** Documented honestly rather than pretending Pub/Sub is wired up when it isn't deployed.

## Limitations

- **Gmail OAuth and Gmail API calls are implemented against the real `googleapis` SDK but have not been exercised against a live Google account** in the environment this was built in (no outbound network access to Google's endpoints there). The code path is real, typed, and structurally identical to what ran successfully against the mock provider — but you should do a first real login yourself and report back if anything about Gmail's actual response shapes differs from what's assumed here.
- **The Google Gemini tool-calling loop has not been exercised live** for the same reason (no outbound network access to `the Gemini API` in the build environment). It was structurally verified via the tool executor unit tests and manual REST testing with the key absent (confirmed graceful degradation). Test it yourself with a real `GEMINI_API_KEY` before relying on it.
- **Gmail push notifications (Pub/Sub) are documented but not deployed** — see "Real-Time Sync". The polling fallback is real and working.
- Reply currently supports plain-text bodies only; it doesn't quote/thread the original message inline.
- No live deployment yet.

## Future Improvements

- Deploy backend + frontend and wire up real Pub/Sub push.
- Thread/conversation view grouping by `threadId` (already returned by both providers).
- Forward, in addition to reply.
- Rich inline email-preview cards in the assistant panel rather than plain text tool summaries.
- Server-side chat history persistence per user.
- Attachment support.

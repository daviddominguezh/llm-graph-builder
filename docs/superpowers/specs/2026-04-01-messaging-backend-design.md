# Messaging Backend Design Spec

Multi-channel messaging system for OpenFlow. Enables agents to communicate with end-users via WhatsApp, Instagram, and API channels. Includes real-time updates via Socket.io + Redis, AI agent invocation via the existing Supabase Edge Function, and a dashboard-facing REST API.

## Architecture

Approach B: all messaging code lives in `packages/backend/src/messaging/` as a self-contained module within the existing Express server. Shares Supabase client, auth middleware, and env config. Socket.io attaches to the same HTTP server (port 4000).

Reuses existing execution infrastructure:
- `edgeFunctionClient.ts` for calling the `execute-agent` edge function
- `executePersistence.ts` for saving executions, messages, nodes, session state
- `executionQueries.ts` for session get/create, message persistence
- `executionAuthQueries.ts` for fetching graphs, API keys, env vars

## Database Schema

### conversations

The inbox. One row per unique conversation.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK → organizations | |
| agent_id | uuid FK → agents | |
| tenant_id | uuid FK → tenants | |
| user_channel_id | text NOT NULL | Phone for WhatsApp, ig user id for Instagram |
| thread_id | text NOT NULL | Same as user_channel_id for now; Slack thread id in future |
| channel | text NOT NULL | 'whatsapp', 'instagram', 'api' |
| last_message_content | text | Denormalized for fast inbox |
| last_message_role | text | 'user' or 'assistant' |
| last_message_type | text | 'text', 'image', 'audio', etc. |
| last_message_at | timestamptz | |
| read | boolean DEFAULT true | |
| enabled | boolean DEFAULT true | AI on/off |
| status | text DEFAULT 'open' | 'open', 'blocked', 'closed' |
| name | text | End-user display name |
| unanswered_count | integer DEFAULT 0 | Number of consecutive unanswered user messages (reset to 0 when assistant replies, incremented when user sends and AI is off) |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |

Unique constraint: `(agent_id, tenant_id, user_channel_id, thread_id)`

Key indexes: `(tenant_id, last_message_at DESC)` for inbox pagination, `(tenant_id, updated_at)` for delta sync.

**`unanswered_count` logic:**
- Increment by 1 when: a user message is saved AND `conversations.enabled = false` (AI is off)
- Increment by 1 when: a user message is saved AND AI invocation fails (edge function error)
- Reset to 0 when: an assistant message is saved (manual or AI-generated)
- Do NOT increment for test chat messages

### messages

Full immutable message history. Never compacted.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid FK → conversations CASCADE | |
| role | text NOT NULL | 'user', 'assistant', 'note', 'assignee-change', 'status-change' |
| type | text NOT NULL | 'text', 'image', 'audio', 'video', 'pdf', 'document' |
| content | text | Message text or caption |
| media_url | text | Supabase Storage URL |
| reply_id | uuid FK → messages | Self-ref for quoted replies |
| original_id | text | Provider message ID (wamid.xxx) |
| channel_thread_id | text | For Slack threads in future |
| metadata | jsonb | Extensible (tool call info, etc.) |
| timestamp | bigint NOT NULL | Unix ms |
| created_at | timestamptz DEFAULT now() | |

Indexes: `(conversation_id, timestamp ASC)` for chronological display, `(conversation_id, created_at DESC)` for cursor pagination.

### messages_ai

Compactable AI context copy. Rows can be deleted and replaced by a summary. Mirrors the `messages` table schema except for the addition of `is_summary`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid FK → conversations CASCADE | |
| role | text NOT NULL | Same as messages |
| type | text NOT NULL | Same as messages |
| content | text | |
| media_url | text | |
| reply_id | uuid FK → messages_ai | Self-ref |
| original_id | text | |
| channel_thread_id | text | |
| metadata | jsonb | |
| timestamp | bigint NOT NULL | |
| is_summary | boolean DEFAULT false | True for compaction summary rows |
| created_at | timestamptz DEFAULT now() | |

FK: `conversation_id` references `conversations(id)` ON DELETE CASCADE.
Indexes: `(conversation_id, timestamp ASC)` for chronological display, `(conversation_id, created_at DESC)` for cursor pagination.

### conversation_notes

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid FK → conversations CASCADE | |
| creator_email | text NOT NULL | |
| content | text NOT NULL | |
| created_at | timestamptz DEFAULT now() | |

### conversation_assignees

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid FK → conversations CASCADE | |
| assignee | text NOT NULL | Email of assigned agent |
| created_at | timestamptz DEFAULT now() | |

Index: `(conversation_id, created_at DESC)`

### conversation_statuses

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid FK → conversations CASCADE | |
| status | text NOT NULL | |
| created_at | timestamptz DEFAULT now() | |

Index: `(conversation_id, created_at DESC)`

### deleted_conversations

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid NOT NULL | |
| tenant_id | uuid FK → tenants | |
| deleted_at | timestamptz DEFAULT now() | |

### end_users

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| user_channel_id | text NOT NULL | |
| name | text | Updated on conflict if new name is non-null |
| first_seen_at | timestamptz DEFAULT now() | |

Unique: `(tenant_id, user_channel_id)`. Upsert uses `ON CONFLICT (tenant_id, user_channel_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, end_users.name)`.

### channel_connections

Maps agent + tenant + channel to a specific channel account.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| org_id | uuid FK → organizations | |
| agent_id | uuid FK → agents | |
| tenant_id | uuid FK → tenants | |
| channel_type | text NOT NULL | 'whatsapp', 'instagram', 'api' |
| channel_identifier | text | phone_number_id for WhatsApp, ig_user_id for Instagram, null for API |
| enabled | boolean DEFAULT true | |
| created_at | timestamptz DEFAULT now() | |

Unique: `(channel_identifier)` WHERE `channel_identifier IS NOT NULL` (for webhook reverse lookup)
Unique: `(agent_id, tenant_id, channel_type)`

### whatsapp_credentials

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| channel_connection_id | uuid FK → channel_connections CASCADE | |
| encrypted_access_token | bytea NOT NULL | Encrypted via `encrypt_secret()` |
| phone_number_id | text NOT NULL | |
| waba_id | text NOT NULL | |
| phone_number | text | Display phone |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |

RPC: `get_whatsapp_access_token(p_credential_id uuid) RETURNS text` — decrypts and returns the access token.

### instagram_credentials

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| channel_connection_id | uuid FK → channel_connections CASCADE | |
| encrypted_access_token | bytea NOT NULL | Encrypted via `encrypt_secret()` |
| ig_user_id | text NOT NULL | |
| ig_username | text | |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |

RPC: `get_instagram_access_token(p_credential_id uuid) RETURNS text` — decrypts and returns the access token.

### Migrations to existing tables

**agent_sessions:**
- `tenant_id`: ALTER from `text` to `uuid`, ADD FK → `tenants(id)`. No data migration needed (no production data).
- `channel` CHECK constraint: ALTER to `CHECK (channel IN ('whatsapp', 'instagram', 'api', 'web'))`.

Note: `agent_sessions` cleanup on conversation delete is NOT cascaded — sessions are retained for analytics.

**Supabase Storage:**
- Create `message-media` bucket (public read, authenticated write).
- Storage policies: org members can upload/update/delete via `is_org_member(tenant_org_id(...))`.

## Route Structure

Note: `:userId` in all conversation routes refers to the `user_channel_id` string (e.g., `whatsapp:+573000000000`, `instagram:12345`), NOT a database UUID. It is URL-encoded when sent by the frontend.

All messaging routes in `src/messaging/routes/`. Mounted on the main Express app with `ensureMessagingAuth` middleware (except webhooks which use signature verification).

### Inbox — `/projects/:tenantId/messages`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/last` | Paginated inbox. Query params: `paginate=true`, `cursorTimestamp`, `cursorKey` for cursor pagination. Without `paginate`, returns all. |
| GET | `/last/delta` | Changes since timestamp. Query param: `timestamp` |
| GET | `/last/deleted` | Deleted conversation IDs since timestamp. Query param: `since` |

### Conversations — `/projects/:tenantId/conversations`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/:userId` | Conversation messages. Query params: `paginate=true`, `cursorTimestamp`, `cursorKey` for pagination. Without `paginate`, returns all (optionally filtered by `fromMessage` param). |
| POST | `/:userId/read` | Mark conversation read |
| POST | `/:userId/chatbot` | Toggle AI on/off. Query param: `enabled=true\|false` |
| POST | `/:userId/assignee` | Add assignee entry. Body: `{ assignee }` |
| POST | `/:userId/status` | Add status entry. Body: `{ status }` |
| DELETE | `/:userId` | Delete conversation + record in deleted_conversations |

### Activity — `/projects/:tenantId/conversations`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/:userId/activity` | Combined activity feed. Merges assignee changes + status changes into a chronologically sorted list. |

### Notes — `/projects/:tenantId/conversations`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/:userId/notes` | Get notes for conversation |
| POST | `/:userId/notes` | Create note. Body: `{ creator, content }` |
| DELETE | `/:userId/notes/:noteId` | Delete note |

### Send — `/messages`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/message` | Agent sends to end-user (delivers via channel + saves) |
| POST | `/test` | Test message (triggers AI, no channel delivery) |
| DELETE | `/:tenantId/:from` | Delete conversation and all its messages |

**POST `/messages/message`** body:
```
{ message: string, userID: string, tenantId: string, agentId: string, type: string, id?: string }
```

`id` is an optional client-generated message UUID for optimistic updates.

**POST `/messages/test`** body:
```
{ message: string, tenantId: string, agentId: string, type: string, id?: string }
```

`id` is an optional client-generated message UUID for optimistic updates.

### AI Helpers — `/projects/:tenantId/ai`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/make-friendly` | Friendlier tone |
| POST | `/make-formal` | Formal tone |
| POST | `/fix-grammar` | Fix grammar |
| POST | `/answer-question` | Answer question with conversation context |

Request: `{ text, agentId, context? }`. Response: `{ text }`.

### Media — `/projects/:tenantId/media`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/` | Register uploaded media. Body: `MediaFileDetail` (id, link, kind, status). Query params: `groupName`, `fileId`. |
| GET | `/analyze` | Get file description. Query params: `url`, `kind`, `path`. |

Frontend uploads directly to Supabase Storage, then calls POST to register. Incoming webhook media is downloaded from provider API → uploaded to Supabase Storage → URL saved on message row.

### Users — `/projects/:tenantId/users`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/:userId` | End-user info from `end_users` table |

### Collaborators — `/projects/:tenantId/collaborators`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Query `org_members` for the org owning this tenant |

### User Pics — `/auth`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/:email/pic` | User profile picture |

### Webhooks

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/whatsapp/webhook` | WhatsApp verification challenge |
| POST | `/whatsapp/webhook` | Incoming WhatsApp messages |
| GET | `/instagram/webhook` | Instagram verification challenge |
| POST | `/instagram/webhook` | Incoming Instagram messages |

## Out of Scope — Legacy Endpoints

The following endpoints exist in the frontend API client (`api.ts`) but are NOT implemented by this backend. They belong to the closer-back legacy system and will either be removed from the frontend or stubbed to return empty responses. The frontend must handle their absence gracefully (404/empty).

| Endpoint | Notes |
|----------|-------|
| `GET /projects/:ns/business` | Business/Shopify info — not applicable |
| `POST /projects/:ns/orders` | Order creation — e-commerce |
| `GET /projects/:ns/conversations/:id/orders` | User orders — e-commerce |
| `GET /projects/:ns/orders/:id/receipt` | Order receipt — e-commerce |
| `GET /stores/:key` | Storefront data — e-commerce |
| `POST /projects/:ns/conversations/:id/payment-link` | Payment links — e-commerce |
| `GET /projects/:ns/settings` | Project inner settings — replaced by org/tenant config |
| `GET /projects/:ns/tags` | Tags — not implementing |
| `POST /projects/:ns/conversations/:id/tags` | Set chat tags — not implementing |
| `GET /projects/:ns/quick-replies` | Quick replies — not implementing |
| `POST /messages/inquiry` | Fix inquiry/askBoss — not implementing |
| `POST /messages/verify-payment` | Payment verification — not implementing |

## ConversationSnapshot Shape

The `ConversationSnapshot` object published via Socket.io and returned by inbox endpoints must match the frontend's `LastMessage` type. Mapping from DB to wire format:

```typescript
interface ConversationSnapshot {
  // From conversations table
  id: string;                    // conversations.id
  key: string;                   // conversations.user_channel_id (the frontend uses this as the unique key)
  timestamp: number;             // conversations.last_message_at as unix ms
  read: boolean;                 // conversations.read
  enabled: boolean;              // conversations.enabled
  status: string | null;         // conversations.status
  name: string | undefined;      // conversations.name
  unansweredCount: number;       // conversations.unanswered_count

  // Last message content, wrapped in ModelMessage shape
  message: {
    role: 'user' | 'assistant';  // conversations.last_message_role
    content: string;             // conversations.last_message_content
  };
  type: string;                  // conversations.last_message_type
  originalId: string;            // '' (not tracked on conversation row)
  intent: string;                // 'NONE' (not used)

  // Assignees: built from conversation_assignees table
  // Record<generatedKey, { assignee: string, timestamp: number }>
  assignees: Record<string, { assignee: string; timestamp: number }>;

  // Statuses: built from conversation_statuses table
  // Record<generatedKey, { status: string, timestamp: number }>
  statuses: Record<string, { status: string; timestamp: number }>;
}
```

### ConversationSnapshot Building

When building snapshots for inbox responses (multiple conversations):
1. Query `conversations` with cursor pagination → get conversation IDs
2. Batch query `conversation_assignees WHERE conversation_id IN ($ids)` → group by conversation_id into Record maps
3. Batch query `conversation_statuses WHERE conversation_id IN ($ids)` → group by conversation_id into Record maps
4. Compose each conversation + its assignees + statuses into ConversationSnapshot

For Socket.io publishing (hot path), the snapshot is built inline after every message save — the assignees/statuses are only included if they changed, otherwise the frontend merges incrementally.

## Message Flows

### Agent sends message from dashboard

1. Frontend POSTs to `/messages/message` with `{ message, userID, tenantId, agentId, type, id? }`
2. Backend finds or creates conversation by `(agent_id, tenant_id, user_channel_id, thread_id)`
3. Detects provider from `user_channel_id` format (`whatsapp:+xxx` → whatsapp, `instagram:xxx` → instagram, TEST_PHONE → test)
4. Credential lookup chain:
   a. From the conversation, get `channel` ('whatsapp' or 'instagram') and `agent_id` + `tenant_id`
   b. Query `channel_connections WHERE agent_id = $1 AND tenant_id = $2 AND channel_type = $3` → get `channel_connections.id`
   c. Query `whatsapp_credentials WHERE channel_connection_id = $1` (or `instagram_credentials`) → get credential row ID
   d. Call RPC `get_whatsapp_access_token(credential_id)` to decrypt → get `access_token`
   e. Use `phone_number_id` from the credential row + `access_token` for the API call
5. Calls provider API (WhatsApp Graph API / Instagram Graph API / no-op for test)
6. Gets back `original_id` (wamid.xxx or ig mid.xxx)
7. Saves to `messages` table (role: 'assistant') + `messages_ai` table
8. Updates `conversations` row (last_message_*, read: true, unanswered_count: 0)
9. Builds `ConversationSnapshot`, publishes to Redis → Socket.io broadcasts

### Customer sends WhatsApp message (AI disabled)

1. WhatsApp POSTs to `/whatsapp/webhook`
2. Backend verifies HMAC signature using `WHATSAPP_APP_SECRET`, returns 200 immediately
3. Async: extract `phone_number_id` from webhook metadata
4. Reverse lookup: `SELECT * FROM channel_connections WHERE channel_identifier = $1` → agent_id + tenant_id
5. If no match found → log warning, discard message
6. Find or create conversation by `(agent_id, tenant_id, user_channel_id, thread_id)`
7. Upsert `end_users` row (save name from WhatsApp profile if available)
8. Save to `messages` + `messages_ai` (role: 'user')
9. Update `conversations` (last_message_*, read: false, increment unanswered_count if AI disabled)
10. Publish to Redis → Socket.io broadcasts
11. AI disabled (`conversations.enabled = false`) → done

### Customer sends WhatsApp message (AI enabled)

Steps 1-10 same as above, then:

11. Fetch latest published agent version: `SELECT current_version FROM agents WHERE id = $1` — this is how the existing codebase resolves the published version.
11b. Fetch `org_id` from the `agents` table: `SELECT org_id FROM agents WHERE id = $1`. Needed for `persistPreExecution` and VFS payload.
12. Get or create `agent_session` (reusing `getOrCreateSession()` from `executionQueries.ts`). The `session_id` parameter for `getOrCreateSession` is the conversation's `thread_id`. The `user_id` parameter is `user_channel_id`.
13. Fetch message history from `messages_ai` WHERE `conversation_id = $1` ORDER BY `timestamp ASC`
13b. Convert `messages_ai` rows to the `Message[]` format the edge function expects. This requires a new `hydrateAiMessages()` function that maps the `messages_ai` schema (text content, type, media_url) to the AI SDK's `Message` format (JSONB content with role). This is different from the existing `messageRowToMessage()` in `executeFetcher.ts` which reads from `agent_execution_messages` (JSONB content).
14. Fetch graph, API key, env vars (reusing existing execution auth queries). The model comes from the agent's graph data via the existing execution preparation flow (same as `prepareExecution()` in `executeHandler.ts`). It is NOT a column on the `agents` table.
15. Create `agent_executions` row + save user message to `agent_execution_messages` (reusing `persistPreExecution()`)
16. Call `execute-agent` edge function (reusing `executeAgent()` from `edgeFunctionClient.ts`)
17. Parse streaming SSE response → collect node visits + agent_response
18. Persist execution nodes, assistant message, completion metrics, session state (reusing `persistPostExecution()`)
19. Save assistant response to `messages` + `messages_ai` (role: 'assistant')
20. Send response to WhatsApp API (same provider call as agent-sends-message)
21. Update `conversations` (last_message_*, unanswered_count: 0), publish to Redis

`executeAgent` parameters:
- `userID`: For webhook-triggered invocations (no dashboard user), use `user_channel_id` as the `userID` parameter for `executeAgent` and `persistPreExecution`. This represents the end-user who sent the message.
- `data`: `{}` (no user-provided context for webhook messages)
- `quickReplies`: `{}` (not used in messaging flows)
- `channel`: the channel type string — `'whatsapp'`, `'instagram'`, or `'api'`

### Instagram messages

Identical to WhatsApp flows. Differences:
- Webhook: `POST /instagram/webhook`, signature uses `INSTAGRAM_APP_SECRET`
- Reverse lookup uses `ig_user_id` from webhook metadata
- Delivery uses Instagram Graph API: `POST https://graph.instagram.com/v18.0/{igUserId}/messages`
- Credentials from `instagram_credentials` table

### Test messages

1. Frontend POSTs to `/messages/test` with `{ message, tenantId, agentId, type, id? }`
2. Uses the constant `TEST_USER_CHANNEL_ID = 'test:console'`. This matches the frontend's `TEST_PHONE` constant from `app/constants/messages.ts`. The frontend must also be updated to use this same value.
3. Saves user message to `messages` + `messages_ai`
4. Updates `conversations`, publishes to Redis
5. Triggers AI invocation (same as AI-enabled flow steps 11-18)
6. Saves assistant response to `messages` + `messages_ai`
7. Skips channel delivery (test → no-op)
8. Publishes assistant response to Redis
9. Returns 200 immediately (AI processing continues async)

### Error handling for AI invocation

- Edge function failure: mark execution as `failed` in `agent_executions`, do NOT send to channel, log error. Conversation shows user message with no reply. Agent can reply manually from dashboard.
- Session lock conflict (`55P03`): log warning, skip AI processing. Message is still saved and visible in dashboard. Agent can reply manually.

## Socket.io & Redis

Socket.io attaches to the existing HTTP server. Upstash Redis for pub/sub.

### Subscription model

One shared Redis subscription per tenant_id. Multiple sockets per tenant. When the last socket for a tenant disconnects, the Redis subscription is cleaned up.

Redis channel format: `tenant:{tenantId}` (e.g., `tenant:a1b2c3d4-...`)

```
Map<tenantId, {
  sockets: Map<socketId, { socket, requestId }>
  redisSubscription: active subscription
}>
```

### Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `messages:subscribe` | Client → Server | `{ tenantId, requestId }` |
| `message:new` | Server → Client | `{ data: ConversationSnapshot, requestId }` |
| `disconnect` | Client → Server | Cleanup subscriptions |

### Publishing

Every message save → build `ConversationSnapshot` → `publish(`tenant:${tenantId}`, JSON.stringify(payload))` → Redis subscription callback → `socket.emit('message:new')` to all subscribed sockets for that tenant.

## Frontend API Path Migration

| Frontend function | Current path | New path |
|---|---|---|
| `getLastMessages` | `GET /projects/:ns/messages/last` | `GET /projects/:tenantId/messages/last` |
| `getLastMessagesPaginated` | `GET /projects/:ns/messages/last?paginate=true` | `GET /projects/:tenantId/messages/last?paginate=true` |
| `getLastMessagesDelta` | `GET /projects/:ns/messages/last?timestamp=X` | `GET /projects/:tenantId/messages/last/delta?timestamp=X` |
| `getDeletedChats` | `GET /projects/:ns/messages/deletedChats?from=X` | `GET /projects/:tenantId/messages/last/deleted?since=X` |
| `getMessagesFromSender` | `GET /projects/:ns/messages/:sender` | `GET /projects/:tenantId/conversations/:userId` |
| `getMessagesFromSenderPaginated` | `GET /projects/:ns/messages/:sender?paginate=true` | `GET /projects/:tenantId/conversations/:userId?paginate=true` |
| `setChatbotActiveState` | `POST /projects/:ns/messages/:sender/active?enabled=X` | `POST /projects/:tenantId/conversations/:userId/chatbot?enabled=X` |
| `createNote` | `POST /projects/:ns/messages/notes/:userId` | `POST /projects/:tenantId/conversations/:userId/notes` |
| `getNotes` | `GET /projects/:ns/messages/notes/:userId` | `GET /projects/:tenantId/conversations/:userId/notes` |
| `deleteNote` | `DELETE /projects/:ns/messages/notes/:userId/:noteId` | `DELETE /projects/:tenantId/conversations/:userId/notes/:noteId` |
| `getActivity` | `GET /projects/:ns/messages/activity/:userId` | `GET /projects/:tenantId/conversations/:userId/activity` |
| `updateChatAssignee` | `POST /projects/:ns/messages/assignee/:userId` | `POST /projects/:tenantId/conversations/:userId/assignee` |
| `updateChatStatus` | `POST /projects/:ns/messages/status/:userId` | `POST /projects/:tenantId/conversations/:userId/status` |
| `readConversation` | `POST /projects/:ns/messages/read/:phone` | `POST /projects/:tenantId/conversations/:userId/read` |
| `sendMessage` | `POST /messages/message` | `POST /messages/message` (body shape changes) |
| `sendTestMessage` | `POST /messages/test` | `POST /messages/test` (body shape changes) |
| `deleteConversation` | `DELETE /messages/:ns/:from` | `DELETE /messages/:tenantId/:from` |
| `makeFriendly` | `POST /projects/:ns/ai/make-friendly` | `POST /projects/:tenantId/ai/make-friendly` |
| `makeFormal` | `POST /projects/:ns/ai/make-formal` | `POST /projects/:tenantId/ai/make-formal` |
| `fixGrammar` | `POST /projects/:ns/ai/fix-grammar` | `POST /projects/:tenantId/ai/fix-grammar` |
| `answerQuestion` | `POST /projects/:ns/ai/answer-question` | `POST /projects/:tenantId/ai/answer-question` |
| `getFinalUserInfo` | `GET /projects/:ns/users/:id` | `GET /projects/:tenantId/users/:userId` |
| `getProjectCollaborators` | `GET /projects/:ns/collaborators` | `GET /projects/:tenantId/collaborators` |
| `setMediaUploaded` | `POST /projects/:ns/media` | `POST /projects/:tenantId/media` |
| `getFileDescription` | `GET /projects/:ns/media/analyze` | `GET /projects/:tenantId/media/analyze` |
| `getUserPictureByEmail` | `GET /auth/:email/pic` | `GET /auth/:email/pic` |

Note: `:ns` (namespace string) becomes `:tenantId` (UUID). `:userId` in conversation routes is the `user_channel_id` string (e.g., `whatsapp:+573000000000`), NOT a UUID.

## Frontend Changes

### API URL migration

The frontend's `api.ts` currently calls the closer-back API directly. It must be updated to:
1. Point to `NEXT_PUBLIC_API_URL` (localhost:4000) as the base URL
2. Update all endpoint paths to match the new route structure defined above

This is a required implementation task, not deferred.

### Socket.io migration

- Connect to `NEXT_PUBLIC_API_URL` (localhost:4000) instead of `NEXT_PUBLIC_CLOSER_API_URL`
- Subscribe with `tenantId` (uuid) instead of `projectName` (string)

### Tenant ID resolution

The chats page (`/orgs/[slug]/chats`) needs a tenant_id UUID for all API calls and Socket.io subscription. The frontend must:
1. Fetch tenants for the current org via `GET /tenants/:orgId` (existing endpoint)
2. Let the user select a tenant (or default to the first one)
3. Store the selected tenant_id in component state and pass it to all messaging API calls and the Socket.io subscription

This is a required frontend implementation task.

### Endpoints that will 404

The frontend should handle gracefully (catch and ignore) calls to endpoints listed in the "Out of Scope — Legacy Endpoints" section. These will return 404 from the new backend.

## Auth Middleware

### ensureMessagingAuth

Checks `api_key` header against `MESSAGING_MASTER_API_KEY` env var. For now, always calls `next()` regardless of result. Structure in place to plug in Supabase JWT validation later.

Applied to all messaging routes except webhooks.

### Webhook signature verification

- WhatsApp: HMAC-SHA256 of raw body against `WHATSAPP_APP_SECRET`
- Instagram: HMAC-SHA256 of raw body against `INSTAGRAM_APP_SECRET`

Webhook routes use `express.raw({ type: 'application/json' })` to get raw body for HMAC computation before JSON parsing.

## AI Text Helpers

Four endpoints for text transformation. Direct LLM calls, not graph execution.

1. Extract `agentId` from the request body. The frontend sends the agent_id of the currently viewed agent.
2. Get agent's `production_api_key_id` from `agents` table. The model comes from the agent's graph data via the existing execution preparation flow (same as `prepareExecution()` in `executeHandler.ts`). It is NOT a column on the `agents` table.
3. Decrypt API key via `get_api_key_value(production_api_key_id)` RPC
4. Call LLM provider with system prompt + user text (using fetch, not the edge function)
5. Return transformed text

Request: `{ text, agentId, context? }`. Response: `{ text }`.

System prompts:
- `/make-friendly`: "Rewrite the following message in a friendlier, warmer tone. Keep the same meaning."
- `/make-formal`: "Rewrite the following message in a more formal, professional tone. Keep the same meaning."
- `/fix-grammar`: "Fix grammar and spelling in the following message. Do not change the meaning or tone."
- `/answer-question`: "Using the conversation context provided, answer the following question." (receives `context` in request body)

## Media

Supabase Storage bucket `message-media` (public read, authenticated write). Path: `{tenant_id}/{conversation_id}/{file_id}.{ext}`.

### Upload flow (agent sending media)
1. Frontend uploads to Supabase Storage directly (client SDK)
2. Frontend calls `POST /projects/:tenantId/media` to register the upload
3. When sending the message, `media_url` is included in `POST /messages/message`

### Incoming media (webhook)
1. Webhook contains media ID (not URL)
2. Backend calls WhatsApp/Instagram API to get temporary download URL
3. Backend downloads the media binary
4. Backend uploads to Supabase Storage `message-media` bucket
5. Saves the Supabase Storage public URL as `media_url` on the message row

## File Structure

```
packages/backend/src/messaging/
  routes/
    index.ts              # messagingRouter — mounts all sub-routers
    inbox.ts              # GET /projects/:tenantId/messages/last, delta, deleted
    conversations.ts      # GET messages, POST read/chatbot/assignee/status, DELETE, GET activity
    notes.ts              # CRUD for conversation notes
    send.ts               # POST /messages/message, /messages/test, DELETE
    aiHelpers.ts          # POST make-friendly, make-formal, fix-grammar, answer-question
    media.ts              # POST media upload, GET analyze
    users.ts              # GET user info
    collaborators.ts      # GET collaborators (from org_members)
    userPics.ts           # GET /auth/:email/pic
    webhooks/
      whatsapp.ts         # GET/POST /whatsapp/webhook
      instagram.ts        # GET/POST /instagram/webhook
  controllers/
    messageProcessor.ts   # Core: processIncomingMessage, processSendMessage
    agentInvoker.ts       # Calls edge function, reuses existing execute infra
    providerRouter.ts     # Routes to whatsapp/instagram/test sender
  services/
    whatsapp/
      sender.ts           # sendWhatsAppTextMessage, sendWhatsAppImageMessage, etc.
      webhookParser.ts    # Parse & validate WhatsApp webhook payload
      credentials.ts      # Fetch and decrypt from whatsapp_credentials table
    instagram/
      sender.ts           # sendInstagramMessage, etc.
      webhookParser.ts    # Parse & validate Instagram webhook payload
      credentials.ts      # Fetch and decrypt from instagram_credentials table
    redis.ts              # Upstash Redis client: publish, subscribe
  socket/
    index.ts              # Socket.io server setup, attach to HTTP server
    subscriptions.ts      # Namespace subscription management per tenant
  queries/
    conversationQueries.ts    # conversations table CRUD + inbox pagination
    messageQueries.ts         # messages + messages_ai table CRUD + pagination
    noteQueries.ts            # conversation_notes CRUD
    assignmentQueries.ts      # conversation_assignees + conversation_statuses CRUD + activity feed
    channelQueries.ts         # channel_connections + credential reverse lookup
    endUserQueries.ts         # end_users upsert + lookup
    deletedConversationQueries.ts  # deleted_conversations insert + query
  middleware/
    ensureMessagingAuth.ts    # api_key check (returns true for now)
    webhookSignature.ts       # HMAC-SHA256 verification for WhatsApp/Instagram
  types/
    index.ts                  # All messaging-specific types + ConversationSnapshot
```

## Environment Variables

### New (added to `packages/backend/.env`)

Reference only — actual values in `.env` file, not committed to git.

```
UPSTASH_REDIS_REST_URL=         # Upstash Redis REST endpoint
UPSTASH_REDIS_REST_TOKEN=       # Upstash Redis auth token
WHATSAPP_APP_SECRET=            # Meta app secret for WhatsApp webhook HMAC
WHATSAPP_VERIFY_TOKEN=          # Custom string for WhatsApp webhook challenge
INSTAGRAM_APP_SECRET=           # Meta app secret for Instagram webhook HMAC
INSTAGRAM_VERIFY_TOKEN=         # Custom string for Instagram webhook challenge
MESSAGING_MASTER_API_KEY=       # API key for messaging auth middleware
```

### Existing (already in `.env`, reused)

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
SUPABASE_EDGE_FUNCTION_URL
EDGE_FUNCTION_MASTER_KEY
WEB_URL
```

### New dependencies for `packages/backend/package.json`

```
@upstash/redis
socket.io
```


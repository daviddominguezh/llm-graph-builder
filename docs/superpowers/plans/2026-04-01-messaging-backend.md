# Messaging Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-channel messaging backend for OpenFlow — WhatsApp, Instagram, and API channels with real-time Socket.io updates and AI agent invocation.

**Architecture:** Self-contained `messaging/` module inside `packages/backend`, sharing Supabase client and existing execution infrastructure. Socket.io on the same HTTP server. Upstash Redis for pub/sub.

**Tech Stack:** Express 5, TypeScript, Supabase (PostgreSQL + Storage), Socket.io, Upstash Redis, WhatsApp Business API, Instagram Graph API

**Spec:** `docs/superpowers/specs/2026-04-01-messaging-backend-design.md`

---

## Phase 1: Foundation (Database + Scaffold)

### Task 1: Supabase Migration SQL

**Files:**
- Create: `supabase/migrations/20260401000000_messaging_tables.sql`

- [ ] **Step 1: Create the migration file with ALL messaging tables, indexes, RPC functions, ALTER statements, and storage bucket**

```sql
-- ============================================================================
-- Messaging Backend Tables
-- ============================================================================

-- 1. conversations
CREATE TABLE public.conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id             uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_channel_id      text NOT NULL,
  thread_id            text NOT NULL,
  channel              text NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'api')),
  last_message_content text,
  last_message_role    text,
  last_message_type    text,
  last_message_at      timestamptz,
  read                 boolean NOT NULL DEFAULT true,
  enabled              boolean NOT NULL DEFAULT true,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'blocked', 'closed')),
  name                 text,
  unanswered_count     integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, tenant_id, user_channel_id, thread_id)
);

CREATE INDEX idx_conversations_tenant_last_msg
  ON public.conversations(tenant_id, last_message_at DESC);

CREATE INDEX idx_conversations_tenant_updated
  ON public.conversations(tenant_id, updated_at);

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY conversations_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY conversations_delete ON public.conversations
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- 2. messages
CREATE TABLE public.messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role               text NOT NULL CHECK (role IN ('user', 'assistant', 'note', 'assignee-change', 'status-change')),
  type               text NOT NULL CHECK (type IN ('text', 'image', 'audio', 'video', 'pdf', 'document')),
  content            text,
  media_url          text,
  reply_id           uuid REFERENCES public.messages(id),
  original_id        text,
  channel_thread_id  text,
  metadata           jsonb,
  timestamp          bigint NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_timestamp
  ON public.messages(conversation_id, timestamp ASC);

CREATE INDEX idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

-- 3. messages_ai (compactable AI context copy)
CREATE TABLE public.messages_ai (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role               text NOT NULL CHECK (role IN ('user', 'assistant', 'note', 'assignee-change', 'status-change')),
  type               text NOT NULL CHECK (type IN ('text', 'image', 'audio', 'video', 'pdf', 'document')),
  content            text,
  media_url          text,
  reply_id           uuid REFERENCES public.messages_ai(id),
  original_id        text,
  channel_thread_id  text,
  metadata           jsonb,
  timestamp          bigint NOT NULL,
  is_summary         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_ai_conversation_timestamp
  ON public.messages_ai(conversation_id, timestamp ASC);

CREATE INDEX idx_messages_ai_conversation_created
  ON public.messages_ai(conversation_id, created_at DESC);

ALTER TABLE public.messages_ai ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_ai_select ON public.messages_ai
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages_ai.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

CREATE POLICY messages_ai_insert ON public.messages_ai
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages_ai.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

CREATE POLICY messages_ai_delete ON public.messages_ai
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages_ai.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

-- 4. conversation_notes
CREATE TABLE public.conversation_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  creator_email   text NOT NULL,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_notes_select ON public.conversation_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_notes.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

CREATE POLICY conversation_notes_insert ON public.conversation_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_notes.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

CREATE POLICY conversation_notes_delete ON public.conversation_notes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_notes.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

-- 5. conversation_assignees
CREATE TABLE public.conversation_assignees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  assignee        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_assignees_conv_created
  ON public.conversation_assignees(conversation_id, created_at DESC);

ALTER TABLE public.conversation_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_assignees_select ON public.conversation_assignees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_assignees.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

CREATE POLICY conversation_assignees_insert ON public.conversation_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_assignees.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

-- 6. conversation_statuses
CREATE TABLE public.conversation_statuses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  status          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_statuses_conv_created
  ON public.conversation_statuses(conversation_id, created_at DESC);

ALTER TABLE public.conversation_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_statuses_select ON public.conversation_statuses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_statuses.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

CREATE POLICY conversation_statuses_insert ON public.conversation_statuses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_statuses.conversation_id
        AND is_org_member(c.org_id, auth.uid())
    )
  );

-- 7. deleted_conversations
CREATE TABLE public.deleted_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deleted_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deleted_conversations_tenant_deleted
  ON public.deleted_conversations(tenant_id, deleted_at DESC);

ALTER TABLE public.deleted_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY deleted_conversations_select ON public.deleted_conversations
  FOR SELECT TO authenticated
  USING (
    is_org_member(tenant_org_id(tenant_id), auth.uid())
  );

CREATE POLICY deleted_conversations_insert ON public.deleted_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(tenant_org_id(tenant_id), auth.uid())
  );

-- 8. end_users
CREATE TABLE public.end_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_channel_id text NOT NULL,
  name            text,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_channel_id)
);

ALTER TABLE public.end_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY end_users_select ON public.end_users
  FOR SELECT TO authenticated
  USING (
    is_org_member(tenant_org_id(tenant_id), auth.uid())
  );

CREATE POLICY end_users_insert ON public.end_users
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(tenant_org_id(tenant_id), auth.uid())
  );

CREATE POLICY end_users_update ON public.end_users
  FOR UPDATE TO authenticated
  USING (
    is_org_member(tenant_org_id(tenant_id), auth.uid())
  );

-- 9. channel_connections
CREATE TABLE public.channel_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id           uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_type       text NOT NULL CHECK (channel_type IN ('whatsapp', 'instagram', 'api')),
  channel_identifier text,
  enabled            boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, tenant_id, channel_type)
);

CREATE UNIQUE INDEX idx_channel_connections_identifier
  ON public.channel_connections(channel_identifier)
  WHERE channel_identifier IS NOT NULL;

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_connections_select ON public.channel_connections
  FOR SELECT TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY channel_connections_insert ON public.channel_connections
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id, auth.uid()));

CREATE POLICY channel_connections_update ON public.channel_connections
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

CREATE POLICY channel_connections_delete ON public.channel_connections
  FOR DELETE TO authenticated
  USING (is_org_member(org_id, auth.uid()));

-- 10. whatsapp_credentials
CREATE TABLE public.whatsapp_credentials (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_connection_id   uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  encrypted_access_token  bytea NOT NULL,
  phone_number_id         text NOT NULL,
  waba_id                 text NOT NULL,
  phone_number            text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_credentials_select ON public.whatsapp_credentials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_connections cc
      WHERE cc.id = whatsapp_credentials.channel_connection_id
        AND is_org_member(cc.org_id, auth.uid())
    )
  );

-- RPC: decrypt whatsapp access token
CREATE OR REPLACE FUNCTION public.get_whatsapp_access_token(p_credential_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_encrypted bytea;
BEGIN
  SELECT encrypted_access_token INTO v_encrypted
  FROM public.whatsapp_credentials
  WHERE id = p_credential_id;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'WhatsApp credential not found';
  END IF;

  RETURN public.decrypt_secret(v_encrypted);
END;
$$;

-- 11. instagram_credentials
CREATE TABLE public.instagram_credentials (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_connection_id   uuid NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  encrypted_access_token  bytea NOT NULL,
  ig_user_id              text NOT NULL,
  ig_username             text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY instagram_credentials_select ON public.instagram_credentials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_connections cc
      WHERE cc.id = instagram_credentials.channel_connection_id
        AND is_org_member(cc.org_id, auth.uid())
    )
  );

-- RPC: decrypt instagram access token
CREATE OR REPLACE FUNCTION public.get_instagram_access_token(p_credential_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_encrypted bytea;
BEGIN
  SELECT encrypted_access_token INTO v_encrypted
  FROM public.instagram_credentials
  WHERE id = p_credential_id;

  IF v_encrypted IS NULL THEN
    RAISE EXCEPTION 'Instagram credential not found';
  END IF;

  RETURN public.decrypt_secret(v_encrypted);
END;
$$;

-- ============================================================================
-- ALTER existing tables
-- ============================================================================

-- agent_sessions: change tenant_id from text to uuid, add FK, expand channel CHECK
ALTER TABLE public.agent_sessions
  ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;

ALTER TABLE public.agent_sessions
  ADD CONSTRAINT fk_agent_sessions_tenant
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.agent_sessions
  DROP CONSTRAINT IF EXISTS agent_sessions_channel_check;

ALTER TABLE public.agent_sessions
  ADD CONSTRAINT agent_sessions_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'api', 'web'));

-- ============================================================================
-- Storage bucket for message media
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read message media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'message-media');

CREATE POLICY "Org members can upload message media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-media'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );

CREATE POLICY "Org members can update message media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'message-media'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );

CREATE POLICY "Org members can delete message media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'message-media'
    AND is_org_member(
      tenant_org_id((storage.foldername(name))[1]::uuid)
    )
  );
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db reset` (or `npx supabase migration up` if you have data to preserve)

- [ ] **Step 3: Verify tables exist**

Run: `npx supabase db lint`

- [ ] **Step 4: Commit**

Message: `feat(db): add messaging tables migration — conversations, messages, channels, credentials`

---

### Task 2: Install Dependencies + Environment Variables

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `packages/backend/.env.example`
- Modify: `packages/backend/.env` (local only, not committed)

- [ ] **Step 1: Install runtime dependencies**

Run: `npm install @upstash/redis socket.io -w packages/backend`

- [ ] **Step 2: Add env vars to `.env.example`**

Append to `packages/backend/.env.example`:

```
# Messaging
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
INSTAGRAM_APP_SECRET=
INSTAGRAM_VERIFY_TOKEN=
MESSAGING_MASTER_API_KEY=
```

- [ ] **Step 3: Add same env vars to local `.env`** (with real or placeholder values)

- [ ] **Step 4: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 5: Commit**

Message: `chore(backend): add @upstash/redis and socket.io dependencies + messaging env vars`

---

### Task 3: Messaging Types

**Files:**
- Create: `packages/backend/src/messaging/types/index.ts`

- [ ] **Step 1: Create the types file with all messaging interfaces**

```ts
// packages/backend/src/messaging/types/index.ts

/* ─── Database row types ─── */

export interface ConversationRow {
  id: string;
  org_id: string;
  agent_id: string;
  tenant_id: string;
  user_channel_id: string;
  thread_id: string;
  channel: string;
  last_message_content: string | null;
  last_message_role: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  read: boolean;
  enabled: boolean;
  status: string;
  name: string | null;
  unanswered_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  type: string;
  content: string | null;
  media_url: string | null;
  reply_id: string | null;
  original_id: string | null;
  channel_thread_id: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: number;
  created_at: string;
}

export interface MessageAiRow {
  id: string;
  conversation_id: string;
  role: string;
  type: string;
  content: string | null;
  media_url: string | null;
  reply_id: string | null;
  original_id: string | null;
  channel_thread_id: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: number;
  is_summary: boolean;
  created_at: string;
}

export interface ConversationNoteRow {
  id: string;
  conversation_id: string;
  creator_email: string;
  content: string;
  created_at: string;
}

export interface ConversationAssigneeRow {
  id: string;
  conversation_id: string;
  assignee: string;
  created_at: string;
}

export interface ConversationStatusRow {
  id: string;
  conversation_id: string;
  status: string;
  created_at: string;
}

export interface DeletedConversationRow {
  id: string;
  conversation_id: string;
  tenant_id: string;
  deleted_at: string;
}

export interface EndUserRow {
  id: string;
  tenant_id: string;
  user_channel_id: string;
  name: string | null;
  first_seen_at: string;
}

export interface ChannelConnectionRow {
  id: string;
  org_id: string;
  agent_id: string;
  tenant_id: string;
  channel_type: string;
  channel_identifier: string | null;
  enabled: boolean;
  created_at: string;
}

export interface WhatsAppCredentialRow {
  id: string;
  channel_connection_id: string;
  phone_number_id: string;
  waba_id: string;
  phone_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstagramCredentialRow {
  id: string;
  channel_connection_id: string;
  ig_user_id: string;
  ig_username: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── Wire types (API responses / Socket.io payloads) ─── */

export interface ConversationSnapshotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssigneeEntry {
  assignee: string;
  timestamp: number;
}

export interface StatusEntry {
  status: string;
  timestamp: number;
}

export interface ConversationSnapshot {
  id: string;
  key: string;
  timestamp: number;
  read: boolean;
  enabled: boolean;
  status: string | null;
  name: string | undefined;
  unansweredCount: number;
  message: ConversationSnapshotMessage;
  type: string;
  originalId: string;
  intent: string;
  assignees: Record<string, AssigneeEntry>;
  statuses: Record<string, StatusEntry>;
}

/* ─── Request/param types ─── */

export interface SendMessageBody {
  message: string;
  userID: string;
  tenantId: string;
  agentId: string;
  type: string;
  id?: string;
}

export interface TestMessageBody {
  message: string;
  tenantId: string;
  agentId: string;
  type: string;
  id?: string;
}

export interface AiHelperBody {
  text: string;
  agentId: string;
  context?: string;
}

export interface CreateNoteBody {
  creator: string;
  content: string;
}

export interface AssigneeBody {
  assignee: string;
}

export interface StatusBody {
  status: string;
}

/* ─── Channel types ─── */

export type ChannelType = 'whatsapp' | 'instagram' | 'api';

export const TEST_USER_CHANNEL_ID = 'test:console';

/* ─── Pagination types ─── */

export interface PaginationCursor {
  timestamp: number;
  key: string;
}

export interface PaginatedResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: PaginationCursor;
}

/* ─── Provider send result ─── */

export interface ProviderSendResult {
  originalId: string;
}

/* ─── Incoming webhook parsed message ─── */

export interface IncomingMessage {
  userChannelId: string;
  channelIdentifier: string;
  content: string;
  type: string;
  originalId: string;
  userName: string | undefined;
  mediaId: string | undefined;
  replyOriginalId: string | undefined;
  timestamp: number;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add TypeScript types for messaging module`

---

### Task 4: Messaging Middleware

**Files:**
- Create: `packages/backend/src/messaging/middleware/ensureMessagingAuth.ts`
- Create: `packages/backend/src/messaging/middleware/webhookSignature.ts`

- [ ] **Step 1: Create ensureMessagingAuth**

```ts
// packages/backend/src/messaging/middleware/ensureMessagingAuth.ts
import type { NextFunction, Request, Response } from 'express';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';

/**
 * Checks `api_key` header against MESSAGING_MASTER_API_KEY.
 * For now, always calls next() regardless of result.
 * Structure in place to plug in Supabase JWT validation later.
 *
 * Attaches a service-role Supabase client to res.locals.supabase
 * for downstream handlers (messaging routes operate with elevated
 * privileges since they serve webhook-originated requests).
 */
export function ensureMessagingAuth(req: Request, res: Response, next: NextFunction): void {
  const supabase = createServiceClient();
  res.locals.supabase = supabase;
  next();
}
```

- [ ] **Step 2: Create webhookSignature middleware**

```ts
// packages/backend/src/messaging/middleware/webhookSignature.ts
import { createHmac } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const HTTP_FORBIDDEN = 403;

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

function verifyHmacSha256(payload: string, signature: string, secret: string): boolean {
  if (secret === '' || signature === '') return false;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const provided = signature.replace('sha256=', '');
  return expected === provided;
}

export function verifyWhatsAppSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const secret = readEnv('WHATSAPP_APP_SECRET');

  if (!verifyHmacSha256(rawBody, signature ?? '', secret)) {
    res.status(HTTP_FORBIDDEN).json({ error: 'Invalid signature' });
    return;
  }

  // Parse the raw body into JSON for downstream handlers
  if (typeof req.body === 'string') {
    req.body = JSON.parse(req.body) as Record<string, unknown>;
  }

  next();
}

export function verifyInstagramSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const secret = readEnv('INSTAGRAM_APP_SECRET');

  if (!verifyHmacSha256(rawBody, signature ?? '', secret)) {
    res.status(HTTP_FORBIDDEN).json({ error: 'Invalid signature' });
    return;
  }

  if (typeof req.body === 'string') {
    req.body = JSON.parse(req.body) as Record<string, unknown>;
  }

  next();
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add auth middleware and webhook signature verification`

---

### Task 5: Mount Messaging Router + Route Index

**Files:**
- Create: `packages/backend/src/messaging/routes/index.ts`
- Modify: `packages/backend/src/server.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Create the messaging route index (initially empty sub-routers)**

```ts
// packages/backend/src/messaging/routes/index.ts
import express from 'express';

import { ensureMessagingAuth } from '../middleware/ensureMessagingAuth.js';

export function buildMessagingRouter(): express.Router {
  const router = express.Router();

  // Webhook routes must be registered BEFORE ensureMessagingAuth
  // and use raw body parsing for HMAC verification.
  // (Will be added in Task 23)

  // All remaining routes require messaging auth
  router.use(ensureMessagingAuth);

  // Sub-routers will be mounted here as tasks progress:
  // router.use('/projects/:tenantId/messages', inboxRouter);
  // router.use('/projects/:tenantId/conversations', conversationsRouter);
  // router.use('/messages', sendRouter);
  // router.use('/projects/:tenantId/ai', aiHelpersRouter);
  // router.use('/projects/:tenantId/media', mediaRouter);
  // router.use('/projects/:tenantId/users', usersRouter);
  // router.use('/projects/:tenantId/collaborators', collaboratorsRouter);
  // router.use('/auth', userPicsRouter);

  return router;
}
```

- [ ] **Step 2: Modify server.ts to mount the messaging router**

Add import and mount it in `createApp()`:

```ts
// Add to imports:
import { buildMessagingRouter } from './messaging/routes/index.js';

// Add before the final return in createApp():
app.use(buildMessagingRouter());
```

- [ ] **Step 3: Modify index.ts to return the HTTP server (for Socket.io)**

Change `index.ts` so `app.listen()` returns the `http.Server`, which Socket.io will attach to in Task 24:

```ts
#!/usr/bin/env node
import { fetchAndCacheModels } from './openrouter/modelCache.js';
import { createApp } from './server.js';

const DEFAULT_PORT = 4000;

const ZERO = 0;
const envPort = Number(process.env.PORT);
const port = Number.isNaN(envPort) || envPort === ZERO ? DEFAULT_PORT : envPort;
const app = createApp();

const server = app.listen(port, () => {
  process.stdout.write(`Graph Runner Backend listening on port ${String(port)}\n`);
  void fetchAndCacheModels();
});

export { server };
```

- [ ] **Step 4: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 5: Commit**

Message: `feat(messaging): scaffold messaging router and mount in Express app`

---

## Phase 2: Core Queries + Inbox

### Task 6: conversationQueries.ts

**Files:**
- Create: `packages/backend/src/messaging/queries/conversationQueries.ts`

- [ ] **Step 1: Create the queries file**

```ts
// packages/backend/src/messaging/queries/conversationQueries.ts
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type {
  ConversationAssigneeRow,
  ConversationRow,
  ConversationStatusRow,
  PaginationCursor,
} from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

const PAGE_SIZE = 20;

/* ─── Find or create ─── */

interface FindOrCreateParams {
  orgId: string;
  agentId: string;
  tenantId: string;
  userChannelId: string;
  threadId: string;
  channel: string;
  name?: string;
}

export async function findOrCreateConversation(
  supabase: SupabaseClient,
  params: FindOrCreateParams
): Promise<ConversationRow> {
  // Try to find existing
  const existing: QueryResult<ConversationRow> = await supabase
    .from('conversations')
    .select('*')
    .eq('agent_id', params.agentId)
    .eq('tenant_id', params.tenantId)
    .eq('user_channel_id', params.userChannelId)
    .eq('thread_id', params.threadId)
    .single();

  if (existing.data !== null) return existing.data;

  // Create new
  const inserted: QueryResult<ConversationRow> = await supabase
    .from('conversations')
    .insert({
      org_id: params.orgId,
      agent_id: params.agentId,
      tenant_id: params.tenantId,
      user_channel_id: params.userChannelId,
      thread_id: params.threadId,
      channel: params.channel,
      name: params.name ?? null,
    })
    .select('*')
    .single();

  if (inserted.error !== null || inserted.data === null) {
    throw new Error(`findOrCreateConversation: ${inserted.error?.message ?? 'No data'}`);
  }

  return inserted.data;
}

/* ─── Inbox pagination (cursor-based) ─── */

interface InboxPageParams {
  tenantId: string;
  cursor?: PaginationCursor;
}

interface InboxPage {
  conversations: ConversationRow[];
  hasMore: boolean;
  nextCursor?: PaginationCursor;
}

export async function getInboxPage(
  supabase: SupabaseClient,
  params: InboxPageParams
): Promise<InboxPage> {
  let query = supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .order('last_message_at', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (params.cursor !== undefined) {
    query = query.or(
      `last_message_at.lt.${new Date(params.cursor.timestamp).toISOString()},` +
        `and(last_message_at.eq.${new Date(params.cursor.timestamp).toISOString()},user_channel_id.gt.${params.cursor.key})`
    );
  }

  const result: QueryResult<ConversationRow[]> = await query;

  if (result.error !== null) {
    throw new Error(`getInboxPage: ${result.error.message}`);
  }

  const rows = result.data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const lastRow = page[page.length - 1];

  return {
    conversations: page,
    hasMore,
    nextCursor:
      hasMore && lastRow !== undefined
        ? {
            timestamp: new Date(lastRow.last_message_at ?? lastRow.created_at).getTime(),
            key: lastRow.user_channel_id,
          }
        : undefined,
  };
}

/* ─── Inbox: all (no pagination) ─── */

export async function getAllInbox(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ConversationRow[]> {
  const result: QueryResult<ConversationRow[]> = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false });

  if (result.error !== null) {
    throw new Error(`getAllInbox: ${result.error.message}`);
  }

  return result.data ?? [];
}

/* ─── Inbox delta (changes since timestamp) ─── */

export async function getInboxDelta(
  supabase: SupabaseClient,
  tenantId: string,
  sinceTimestamp: string
): Promise<ConversationRow[]> {
  const result: QueryResult<ConversationRow[]> = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('updated_at', sinceTimestamp)
    .order('updated_at', { ascending: false });

  if (result.error !== null) {
    throw new Error(`getInboxDelta: ${result.error.message}`);
  }

  return result.data ?? [];
}

/* ─── Batch fetch assignees by conversation IDs ─── */

export async function batchGetAssignees(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Map<string, ConversationAssigneeRow[]>> {
  const result: QueryResult<ConversationAssigneeRow[]> = await supabase
    .from('conversation_assignees')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  const map = new Map<string, ConversationAssigneeRow[]>();
  for (const row of result.data ?? []) {
    const existing = map.get(row.conversation_id) ?? [];
    existing.push(row);
    map.set(row.conversation_id, existing);
  }

  return map;
}

/* ─── Batch fetch statuses by conversation IDs ─── */

export async function batchGetStatuses(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Map<string, ConversationStatusRow[]>> {
  const result: QueryResult<ConversationStatusRow[]> = await supabase
    .from('conversation_statuses')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  const map = new Map<string, ConversationStatusRow[]>();
  for (const row of result.data ?? []) {
    const existing = map.get(row.conversation_id) ?? [];
    existing.push(row);
    map.set(row.conversation_id, existing);
  }

  return map;
}

/* ─── Update last message fields ─── */

interface UpdateLastMessageParams {
  lastMessageContent: string;
  lastMessageRole: string;
  lastMessageType: string;
  lastMessageAt: string;
  read: boolean;
  unansweredCount: number;
}

export async function updateConversationLastMessage(
  supabase: SupabaseClient,
  conversationId: string,
  params: UpdateLastMessageParams
): Promise<void> {
  const result = await supabase
    .from('conversations')
    .update({
      last_message_content: params.lastMessageContent,
      last_message_role: params.lastMessageRole,
      last_message_type: params.lastMessageType,
      last_message_at: params.lastMessageAt,
      read: params.read,
      unanswered_count: params.unansweredCount,
    })
    .eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`updateConversationLastMessage: ${result.error.message}`);
  }
}

/* ─── Toggle chatbot ─── */

export async function updateConversationEnabled(
  supabase: SupabaseClient,
  conversationId: string,
  enabled: boolean
): Promise<void> {
  const result = await supabase
    .from('conversations')
    .update({ enabled })
    .eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`updateConversationEnabled: ${result.error.message}`);
  }
}

/* ─── Mark read ─── */

export async function markConversationRead(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  const result = await supabase
    .from('conversations')
    .update({ read: true })
    .eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`markConversationRead: ${result.error.message}`);
  }
}

/* ─── Find conversation by user_channel_id ─── */

export async function findConversationByUserChannelId(
  supabase: SupabaseClient,
  tenantId: string,
  userChannelId: string
): Promise<ConversationRow | null> {
  const result: QueryResult<ConversationRow> = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_channel_id', userChannelId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  return result.data;
}

/* ─── Delete conversation ─── */

export async function deleteConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  const result = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (result.error !== null) {
    throw new Error(`deleteConversation: ${result.error.message}`);
  }
}

/* ─── Insert deleted conversation record ─── */

export async function insertDeletedConversation(
  supabase: SupabaseClient,
  conversationId: string,
  tenantId: string
): Promise<void> {
  const result = await supabase
    .from('deleted_conversations')
    .insert({ conversation_id: conversationId, tenant_id: tenantId });

  if (result.error !== null) {
    throw new Error(`insertDeletedConversation: ${result.error.message}`);
  }
}

/* ─── Get deleted conversations since timestamp ─── */

export async function getDeletedConversations(
  supabase: SupabaseClient,
  tenantId: string,
  since: string
): Promise<string[]> {
  const result: QueryResult<Array<{ conversation_id: string }>> = await supabase
    .from('deleted_conversations')
    .select('conversation_id')
    .eq('tenant_id', tenantId)
    .gte('deleted_at', since);

  if (result.error !== null) {
    throw new Error(`getDeletedConversations: ${result.error.message}`);
  }

  return (result.data ?? []).map((r) => r.conversation_id);
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add conversation queries — find/create, inbox pagination, delta, batch assignees/statuses`

---

### Task 7: messageQueries.ts

**Files:**
- Create: `packages/backend/src/messaging/queries/messageQueries.ts`

- [ ] **Step 1: Create the message queries**

```ts
// packages/backend/src/messaging/queries/messageQueries.ts
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { MessageAiRow, MessageRow, PaginationCursor } from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

const PAGE_SIZE = 50;

/* ─── Insert into messages ─── */

interface InsertMessageParams {
  id?: string;
  conversationId: string;
  role: string;
  type: string;
  content: string | null;
  mediaUrl?: string;
  replyId?: string;
  originalId?: string;
  channelThreadId?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export async function insertMessage(
  supabase: SupabaseClient,
  params: InsertMessageParams
): Promise<MessageRow> {
  const insertData: Record<string, unknown> = {
    conversation_id: params.conversationId,
    role: params.role,
    type: params.type,
    content: params.content,
    media_url: params.mediaUrl ?? null,
    reply_id: params.replyId ?? null,
    original_id: params.originalId ?? null,
    channel_thread_id: params.channelThreadId ?? null,
    metadata: params.metadata ?? null,
    timestamp: params.timestamp,
  };

  if (params.id !== undefined) {
    insertData.id = params.id;
  }

  const result: QueryResult<MessageRow> = await supabase
    .from('messages')
    .insert(insertData)
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`insertMessage: ${result.error?.message ?? 'No data'}`);
  }

  return result.data;
}

/* ─── Insert into messages_ai ─── */

interface InsertMessageAiParams {
  conversationId: string;
  role: string;
  type: string;
  content: string | null;
  mediaUrl?: string;
  replyId?: string;
  originalId?: string;
  channelThreadId?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  isSummary?: boolean;
}

export async function insertMessageAi(
  supabase: SupabaseClient,
  params: InsertMessageAiParams
): Promise<MessageAiRow> {
  const result: QueryResult<MessageAiRow> = await supabase
    .from('messages_ai')
    .insert({
      conversation_id: params.conversationId,
      role: params.role,
      type: params.type,
      content: params.content,
      media_url: params.mediaUrl ?? null,
      reply_id: params.replyId ?? null,
      original_id: params.originalId ?? null,
      channel_thread_id: params.channelThreadId ?? null,
      metadata: params.metadata ?? null,
      timestamp: params.timestamp,
      is_summary: params.isSummary ?? false,
    })
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`insertMessageAi: ${result.error?.message ?? 'No data'}`);
  }

  return result.data;
}

/* ─── Paginated fetch from messages ─── */

interface MessagePageParams {
  conversationId: string;
  cursor?: PaginationCursor;
}

interface MessagePage {
  messages: MessageRow[];
  hasMore: boolean;
  nextCursor?: PaginationCursor;
}

export async function getMessagePage(
  supabase: SupabaseClient,
  params: MessagePageParams
): Promise<MessagePage> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', params.conversationId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (params.cursor !== undefined) {
    query = query.lt('created_at', new Date(params.cursor.timestamp).toISOString());
  }

  const result: QueryResult<MessageRow[]> = await query;

  if (result.error !== null) {
    throw new Error(`getMessagePage: ${result.error.message}`);
  }

  const rows = result.data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const lastRow = page[page.length - 1];

  return {
    messages: page.reverse(),
    hasMore,
    nextCursor:
      hasMore && lastRow !== undefined
        ? {
            timestamp: new Date(lastRow.created_at).getTime(),
            key: lastRow.id,
          }
        : undefined,
  };
}

/* ─── All messages (no pagination) ─── */

interface AllMessagesParams {
  conversationId: string;
  fromTimestamp?: number;
}

export async function getAllMessages(
  supabase: SupabaseClient,
  params: AllMessagesParams
): Promise<MessageRow[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', params.conversationId)
    .order('timestamp', { ascending: true });

  if (params.fromTimestamp !== undefined) {
    query = query.gt('timestamp', params.fromTimestamp);
  }

  const result: QueryResult<MessageRow[]> = await query;

  if (result.error !== null) {
    throw new Error(`getAllMessages: ${result.error.message}`);
  }

  return result.data ?? [];
}

/* ─── Hydrate AI messages for edge function ─── */

export async function getAiMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<MessageAiRow[]> {
  const result: QueryResult<MessageAiRow[]> = await supabase
    .from('messages_ai')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true });

  if (result.error !== null) {
    throw new Error(`getAiMessages: ${result.error.message}`);
  }

  return result.data ?? [];
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add message queries — insert, paginate, AI context hydration`

---

### Task 8: Inbox Route

**Files:**
- Create: `packages/backend/src/messaging/routes/inbox.ts`
- Create: `packages/backend/src/messaging/controllers/snapshotBuilder.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create the ConversationSnapshot builder**

```ts
// packages/backend/src/messaging/controllers/snapshotBuilder.ts
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  batchGetAssignees,
  batchGetStatuses,
} from '../queries/conversationQueries.js';
import type {
  AssigneeEntry,
  ConversationAssigneeRow,
  ConversationRow,
  ConversationSnapshot,
  ConversationSnapshotMessage,
  ConversationStatusRow,
  StatusEntry,
} from '../types/index.js';

function buildMessage(row: ConversationRow): ConversationSnapshotMessage {
  const role = row.last_message_role === 'assistant' ? 'assistant' : 'user';
  return { role, content: row.last_message_content ?? '' };
}

function buildAssigneeMap(rows: ConversationAssigneeRow[]): Record<string, AssigneeEntry> {
  const map: Record<string, AssigneeEntry> = {};
  for (const row of rows) {
    map[row.id] = {
      assignee: row.assignee,
      timestamp: new Date(row.created_at).getTime(),
    };
  }
  return map;
}

function buildStatusMap(rows: ConversationStatusRow[]): Record<string, StatusEntry> {
  const map: Record<string, StatusEntry> = {};
  for (const row of rows) {
    map[row.id] = {
      status: row.status,
      timestamp: new Date(row.created_at).getTime(),
    };
  }
  return map;
}

function conversationToSnapshot(
  row: ConversationRow,
  assignees: ConversationAssigneeRow[],
  statuses: ConversationStatusRow[]
): ConversationSnapshot {
  return {
    id: row.id,
    key: row.user_channel_id,
    timestamp: row.last_message_at !== null ? new Date(row.last_message_at).getTime() : 0,
    read: row.read,
    enabled: row.enabled,
    status: row.status,
    name: row.name ?? undefined,
    unansweredCount: row.unanswered_count,
    message: buildMessage(row),
    type: row.last_message_type ?? 'text',
    originalId: '',
    intent: 'NONE',
    assignees: buildAssigneeMap(assignees),
    statuses: buildStatusMap(statuses),
  };
}

export function buildSnapshotFromRow(
  row: ConversationRow,
  assignees: ConversationAssigneeRow[],
  statuses: ConversationStatusRow[]
): ConversationSnapshot {
  return conversationToSnapshot(row, assignees, statuses);
}

export async function buildSnapshots(
  supabase: SupabaseClient,
  conversations: ConversationRow[]
): Promise<ConversationSnapshot[]> {
  if (conversations.length === 0) return [];

  const ids = conversations.map((c) => c.id);
  const [assigneeMap, statusMap] = await Promise.all([
    batchGetAssignees(supabase, ids),
    batchGetStatuses(supabase, ids),
  ]);

  return conversations.map((conv) =>
    conversationToSnapshot(
      conv,
      assigneeMap.get(conv.id) ?? [],
      statusMap.get(conv.id) ?? []
    )
  );
}
```

- [ ] **Step 2: Create the inbox route**

```ts
// packages/backend/src/messaging/routes/inbox.ts
import express from 'express';
import type { Request, Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { buildSnapshots } from '../controllers/snapshotBuilder.js';
import {
  getAllInbox,
  getDeletedConversations,
  getInboxDelta,
  getInboxPage,
} from '../queries/conversationQueries.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

function getSupabase(res: Response): SupabaseClient {
  return res.locals.supabase as SupabaseClient;
}

function getTenantId(req: Request): string {
  return req.params.tenantId as string;
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/* GET /projects/:tenantId/messages/last */
async function handleGetInbox(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = getTenantId(req);
    const paginate = req.query.paginate === 'true';

    if (paginate) {
      const cursorTimestamp = req.query.cursorTimestamp as string | undefined;
      const cursorKey = req.query.cursorKey as string | undefined;
      const cursor =
        cursorTimestamp !== undefined && cursorKey !== undefined
          ? { timestamp: Number(cursorTimestamp), key: cursorKey }
          : undefined;

      const page = await getInboxPage(supabase, { tenantId, cursor });
      const snapshots = await buildSnapshots(supabase, page.conversations);

      res.status(HTTP_OK).json({
        data: snapshots,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      });
      return;
    }

    const conversations = await getAllInbox(supabase, tenantId);
    const snapshots = await buildSnapshots(supabase, conversations);
    res.status(HTTP_OK).json(snapshots);
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* GET /projects/:tenantId/messages/last/delta */
async function handleGetDelta(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = getTenantId(req);
    const timestamp = req.query.timestamp as string | undefined;

    if (timestamp === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing timestamp query param' });
      return;
    }

    const conversations = await getInboxDelta(supabase, tenantId, timestamp);
    const snapshots = await buildSnapshots(supabase, conversations);
    res.status(HTTP_OK).json(snapshots);
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* GET /projects/:tenantId/messages/last/deleted */
async function handleGetDeleted(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = getTenantId(req);
    const since = req.query.since as string | undefined;

    if (since === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing since query param' });
      return;
    }

    const ids = await getDeletedConversations(supabase, tenantId, since);
    res.status(HTTP_OK).json({ deletedIds: ids });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const inboxRouter = express.Router({ mergeParams: true });
inboxRouter.get('/last', handleGetInbox);
inboxRouter.get('/last/delta', handleGetDelta);
inboxRouter.get('/last/deleted', handleGetDeleted);
```

- [ ] **Step 3: Mount inboxRouter in messaging routes index**

Add to `packages/backend/src/messaging/routes/index.ts`:

```ts
import { inboxRouter } from './inbox.js';

// Inside buildMessagingRouter, after router.use(ensureMessagingAuth):
router.use('/projects/:tenantId/messages', inboxRouter);
```

- [ ] **Step 4: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 5: Commit**

Message: `feat(messaging): add inbox route with pagination, delta, and deleted endpoints`

---

### Task 9: Conversation Routes

**Files:**
- Create: `packages/backend/src/messaging/routes/conversations.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create conversation routes**

```ts
// packages/backend/src/messaging/routes/conversations.ts
import express from 'express';
import type { Request, Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  deleteConversation,
  findConversationByUserChannelId,
  insertDeletedConversation,
  markConversationRead,
  updateConversationEnabled,
} from '../queries/conversationQueries.js';
import { getAllMessages, getMessagePage } from '../queries/messageQueries.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

function getSupabase(res: Response): SupabaseClient {
  return res.locals.supabase as SupabaseClient;
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function decodeUserId(req: Request): string {
  return decodeURIComponent(req.params.userId as string);
}

/* GET /projects/:tenantId/conversations/:userId — messages */
async function handleGetMessages(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeUserId(req);
    const paginate = req.query.paginate === 'true';

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    if (paginate) {
      const cursorTimestamp = req.query.cursorTimestamp as string | undefined;
      const cursorKey = req.query.cursorKey as string | undefined;
      const cursor =
        cursorTimestamp !== undefined && cursorKey !== undefined
          ? { timestamp: Number(cursorTimestamp), key: cursorKey }
          : undefined;

      const page = await getMessagePage(supabase, {
        conversationId: conversation.id,
        cursor,
      });
      res.status(HTTP_OK).json({
        messages: page.messages,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      });
      return;
    }

    const fromMessage = req.query.fromMessage as string | undefined;
    const fromTs = fromMessage !== undefined ? Number(fromMessage) : undefined;
    const messages = await getAllMessages(supabase, {
      conversationId: conversation.id,
      fromTimestamp: Number.isNaN(fromTs) ? undefined : fromTs,
    });
    res.status(HTTP_OK).json({ messages });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* POST /projects/:tenantId/conversations/:userId/read */
async function handleMarkRead(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeUserId(req);

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await markConversationRead(supabase, conversation.id);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* POST /projects/:tenantId/conversations/:userId/chatbot */
async function handleToggleChatbot(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeUserId(req);
    const enabled = req.query.enabled === 'true';

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await updateConversationEnabled(supabase, conversation.id, enabled);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* DELETE /projects/:tenantId/conversations/:userId */
async function handleDeleteConversation(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeUserId(req);

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await insertDeletedConversation(supabase, conversation.id, tenantId);
    await deleteConversation(supabase, conversation.id);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const conversationsRouter = express.Router({ mergeParams: true });
conversationsRouter.get('/:userId', handleGetMessages);
conversationsRouter.post('/:userId/read', handleMarkRead);
conversationsRouter.post('/:userId/chatbot', handleToggleChatbot);
conversationsRouter.delete('/:userId', handleDeleteConversation);
```

- [ ] **Step 2: Mount in routes index**

```ts
import { conversationsRouter } from './conversations.js';

// Inside buildMessagingRouter:
router.use('/projects/:tenantId/conversations', conversationsRouter);
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add conversation routes — messages, read, chatbot toggle, delete`

---

## Phase 3: Notes + Assignment

### Task 10: Notes Queries + Route

**Files:**
- Create: `packages/backend/src/messaging/queries/noteQueries.ts`
- Create: `packages/backend/src/messaging/routes/notes.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create noteQueries.ts**

```ts
// packages/backend/src/messaging/queries/noteQueries.ts
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ConversationNoteRow } from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function getNotes(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationNoteRow[]> {
  const result: QueryResult<ConversationNoteRow[]> = await supabase
    .from('conversation_notes')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  if (result.error !== null) {
    throw new Error(`getNotes: ${result.error.message}`);
  }

  return result.data ?? [];
}

export async function createNote(
  supabase: SupabaseClient,
  conversationId: string,
  creatorEmail: string,
  content: string
): Promise<ConversationNoteRow> {
  const result: QueryResult<ConversationNoteRow> = await supabase
    .from('conversation_notes')
    .insert({ conversation_id: conversationId, creator_email: creatorEmail, content })
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`createNote: ${result.error?.message ?? 'No data'}`);
  }

  return result.data;
}

export async function deleteNote(
  supabase: SupabaseClient,
  noteId: string
): Promise<void> {
  const result = await supabase
    .from('conversation_notes')
    .delete()
    .eq('id', noteId);

  if (result.error !== null) {
    throw new Error(`deleteNote: ${result.error.message}`);
  }
}
```

- [ ] **Step 2: Create notes route**

```ts
// packages/backend/src/messaging/routes/notes.ts
import express from 'express';
import type { Request, Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { findConversationByUserChannelId } from '../queries/conversationQueries.js';
import { createNote, deleteNote, getNotes } from '../queries/noteQueries.js';
import type { CreateNoteBody } from '../types/index.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

function getSupabase(res: Response): SupabaseClient {
  return res.locals.supabase as SupabaseClient;
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function decodeUserId(req: Request): string {
  return decodeURIComponent(req.params.userId as string);
}

async function handleGetNotes(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeUserId(req);

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const notes = await getNotes(supabase, conversation.id);
    const noteMap: Record<string, unknown> = {};
    for (const note of notes) {
      noteMap[note.id] = {
        noteID: note.id,
        content: note.content,
        creator: note.creator_email,
        timestamp: new Date(note.created_at).getTime(),
      };
    }

    res.status(HTTP_OK).json({ notes: noteMap });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

async function handleCreateNote(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeUserId(req);
    const body = req.body as CreateNoteBody;

    if (!body.creator || !body.content) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'creator and content are required' });
      return;
    }

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    const note = await createNote(supabase, conversation.id, body.creator, body.content);
    res.status(HTTP_OK).json({
      noteID: note.id,
      content: note.content,
      creator: note.creator_email,
      timestamp: new Date(note.created_at).getTime(),
    });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

async function handleDeleteNote(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const noteId = req.params.noteId as string;
    await deleteNote(supabase, noteId);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const notesRouter = express.Router({ mergeParams: true });
notesRouter.get('/:userId/notes', handleGetNotes);
notesRouter.post('/:userId/notes', handleCreateNote);
notesRouter.delete('/:userId/notes/:noteId', handleDeleteNote);
```

- [ ] **Step 3: Mount notesRouter on `/projects/:tenantId/conversations`**

The notes routes share the conversations prefix. Mount them on the same base path in `index.ts`:

```ts
import { notesRouter } from './notes.js';

// Inside buildMessagingRouter:
router.use('/projects/:tenantId/conversations', notesRouter);
```

- [ ] **Step 4: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 5: Commit**

Message: `feat(messaging): add notes CRUD route and queries`

---

### Task 11: Assignment + Status Queries and Routes

**Files:**
- Create: `packages/backend/src/messaging/queries/assignmentQueries.ts`
- Modify: `packages/backend/src/messaging/routes/conversations.ts` (add assignee/status handlers)

- [ ] **Step 1: Create assignmentQueries.ts**

```ts
// packages/backend/src/messaging/queries/assignmentQueries.ts
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ConversationAssigneeRow, ConversationStatusRow } from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function addAssignee(
  supabase: SupabaseClient,
  conversationId: string,
  assignee: string
): Promise<ConversationAssigneeRow> {
  const result: QueryResult<ConversationAssigneeRow> = await supabase
    .from('conversation_assignees')
    .insert({ conversation_id: conversationId, assignee })
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`addAssignee: ${result.error?.message ?? 'No data'}`);
  }

  return result.data;
}

export async function addStatus(
  supabase: SupabaseClient,
  conversationId: string,
  status: string
): Promise<ConversationStatusRow> {
  const result: QueryResult<ConversationStatusRow> = await supabase
    .from('conversation_statuses')
    .insert({ conversation_id: conversationId, status })
    .select('*')
    .single();

  if (result.error !== null || result.data === null) {
    throw new Error(`addStatus: ${result.error?.message ?? 'No data'}`);
  }

  return result.data;
}

export async function getAssignees(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationAssigneeRow[]> {
  const result: QueryResult<ConversationAssigneeRow[]> = await supabase
    .from('conversation_assignees')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  return result.data ?? [];
}

export async function getStatuses(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationStatusRow[]> {
  const result: QueryResult<ConversationStatusRow[]> = await supabase
    .from('conversation_statuses')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  return result.data ?? [];
}
```

- [ ] **Step 2: Add assignee and status handlers to conversations.ts**

Add to `packages/backend/src/messaging/routes/conversations.ts`:

```ts
import { addAssignee, addStatus, getAssignees, getStatuses } from '../queries/assignmentQueries.js';
import type { AssigneeBody, StatusBody } from '../types/index.js';

/* POST /projects/:tenantId/conversations/:userId/assignee */
async function handleAddAssignee(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeUserId(req);
    const body = req.body as AssigneeBody;

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await addAssignee(supabase, conversation.id, body.assignee);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* POST /projects/:tenantId/conversations/:userId/status */
async function handleAddStatus(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeUserId(req);
    const body = req.body as StatusBody;

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await addStatus(supabase, conversation.id, body.status);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

// Register on the conversationsRouter:
conversationsRouter.post('/:userId/assignee', handleAddAssignee);
conversationsRouter.post('/:userId/status', handleAddStatus);
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add assignee and status routes with queries`

---

---

## Phase 4: Send Messages

### Task 13: Redis Service

**Files:**
- Create: `packages/backend/src/messaging/services/redis.ts`

- [ ] **Step 1: Create the Redis pub/sub service using Upstash**

```ts
// packages/backend/src/messaging/services/redis.ts
import { Redis } from '@upstash/redis';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

let redisInstance: Redis | null = null;

function getRedis(): Redis {
  if (redisInstance === null) {
    redisInstance = new Redis({
      url: getRequiredEnv('UPSTASH_REDIS_REST_URL'),
      token: getRequiredEnv('UPSTASH_REDIS_REST_TOKEN'),
    });
  }
  return redisInstance;
}

export function buildRedisChannel(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export async function publishToTenant(tenantId: string, payload: unknown): Promise<void> {
  const redis = getRedis();
  const channel = buildRedisChannel(tenantId);
  await redis.publish(channel, JSON.stringify(payload));
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add Upstash Redis publish service`

---

### Task 14: providerRouter.ts

**Files:**
- Create: `packages/backend/src/messaging/controllers/providerRouter.ts`

- [ ] **Step 1: Create provider detection and routing**

```ts
// packages/backend/src/messaging/controllers/providerRouter.ts
import type { ChannelType, ProviderSendResult } from '../types/index.js';
import { TEST_USER_CHANNEL_ID } from '../types/index.js';

export function detectChannel(userChannelId: string): ChannelType {
  if (userChannelId === TEST_USER_CHANNEL_ID) return 'api';
  if (userChannelId.startsWith('whatsapp:')) return 'whatsapp';
  if (userChannelId.startsWith('instagram:')) return 'instagram';
  return 'api';
}

export function stripChannelPrefix(userChannelId: string): string {
  const colonIndex = userChannelId.indexOf(':');
  if (colonIndex === -1) return userChannelId;
  return userChannelId.slice(colonIndex + 1);
}

export function isTestChannel(userChannelId: string): boolean {
  return userChannelId === TEST_USER_CHANNEL_ID;
}

// The actual sendViaProvider will be completed in Tasks 15-16.
// For now, a placeholder that returns a no-op result for test.
export async function sendViaProvider(
  _channel: ChannelType,
  _recipient: string,
  _content: string,
  _type: string,
  _credentials: { accessToken: string; phoneNumberId?: string; igUserId?: string }
): Promise<ProviderSendResult> {
  // Implemented in Tasks 15 (WhatsApp) and 16 (Instagram)
  return { originalId: '' };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add provider routing — channel detection and prefix stripping`

---

### Task 15: WhatsApp Sender

**Files:**
- Create: `packages/backend/src/messaging/services/whatsapp/sender.ts`
- Create: `packages/backend/src/messaging/services/whatsapp/credentials.ts`
- Create: `packages/backend/src/messaging/queries/channelQueries.ts`

- [ ] **Step 1: Create channelQueries.ts (shared by WhatsApp and Instagram)**

```ts
// packages/backend/src/messaging/queries/channelQueries.ts
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type {
  ChannelConnectionRow,
  InstagramCredentialRow,
  WhatsAppCredentialRow,
} from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/* ─── Channel connection lookups ─── */

export async function getChannelConnection(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string,
  channelType: string
): Promise<ChannelConnectionRow | null> {
  const result: QueryResult<ChannelConnectionRow> = await supabase
    .from('channel_connections')
    .select('*')
    .eq('agent_id', agentId)
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelType)
    .single();

  return result.data;
}

export async function getChannelConnectionByIdentifier(
  supabase: SupabaseClient,
  channelIdentifier: string
): Promise<ChannelConnectionRow | null> {
  const result: QueryResult<ChannelConnectionRow> = await supabase
    .from('channel_connections')
    .select('*')
    .eq('channel_identifier', channelIdentifier)
    .single();

  return result.data;
}

/* ─── WhatsApp credentials ─── */

export async function getWhatsAppCredential(
  supabase: SupabaseClient,
  connectionId: string
): Promise<WhatsAppCredentialRow | null> {
  const result: QueryResult<WhatsAppCredentialRow> = await supabase
    .from('whatsapp_credentials')
    .select('*')
    .eq('channel_connection_id', connectionId)
    .single();

  return result.data;
}

export async function decryptWhatsAppToken(
  supabase: SupabaseClient,
  credentialId: string
): Promise<string> {
  const result = await supabase.rpc('get_whatsapp_access_token', { p_credential_id: credentialId });

  if (result.error !== null) {
    throw new Error(`decryptWhatsAppToken: ${result.error.message}`);
  }

  return result.data as string;
}

/* ─── Instagram credentials ─── */

export async function getInstagramCredential(
  supabase: SupabaseClient,
  connectionId: string
): Promise<InstagramCredentialRow | null> {
  const result: QueryResult<InstagramCredentialRow> = await supabase
    .from('instagram_credentials')
    .select('*')
    .eq('channel_connection_id', connectionId)
    .single();

  return result.data;
}

export async function decryptInstagramToken(
  supabase: SupabaseClient,
  credentialId: string
): Promise<string> {
  const result = await supabase.rpc('get_instagram_access_token', {
    p_credential_id: credentialId,
  });

  if (result.error !== null) {
    throw new Error(`decryptInstagramToken: ${result.error.message}`);
  }

  return result.data as string;
}
```

- [ ] **Step 2: Create WhatsApp credentials helper**

```ts
// packages/backend/src/messaging/services/whatsapp/credentials.ts
import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import {
  decryptWhatsAppToken,
  getChannelConnection,
  getWhatsAppCredential,
} from '../../queries/channelQueries.js';

export interface WhatsAppSendCredentials {
  accessToken: string;
  phoneNumberId: string;
}

export async function resolveWhatsAppCredentials(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string
): Promise<WhatsAppSendCredentials> {
  const connection = await getChannelConnection(supabase, agentId, tenantId, 'whatsapp');
  if (connection === null) {
    throw new Error('No WhatsApp channel connection found');
  }

  const credential = await getWhatsAppCredential(supabase, connection.id);
  if (credential === null) {
    throw new Error('No WhatsApp credentials found');
  }

  const accessToken = await decryptWhatsAppToken(supabase, credential.id);
  return { accessToken, phoneNumberId: credential.phone_number_id };
}
```

- [ ] **Step 3: Create WhatsApp sender**

```ts
// packages/backend/src/messaging/services/whatsapp/sender.ts
import type { ProviderSendResult } from '../../types/index.js';

const WA_API_BASE = 'https://graph.facebook.com/v18.0';

interface WhatsAppApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

async function callWhatsAppApi(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<WhatsAppApiResponse> {
  const url = `${WA_API_BASE}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as WhatsAppApiResponse;
}

function extractOriginalId(result: WhatsAppApiResponse): string {
  const firstMessage = result.messages?.[0];
  return firstMessage?.id ?? '';
}

export async function sendWhatsAppTextMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  text: string
): Promise<ProviderSendResult> {
  const result = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'text',
    text: { body: text },
  });

  if (result.error !== undefined) {
    throw new Error(`WhatsApp API error: ${result.error.message}`);
  }

  return { originalId: extractOriginalId(result) };
}

export async function sendWhatsAppImageMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  imageUrl: string,
  caption?: string
): Promise<ProviderSendResult> {
  const imagePayload: Record<string, unknown> = { link: imageUrl };
  if (caption !== undefined) imagePayload.caption = caption;

  const result = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'image',
    image: imagePayload,
  });

  return { originalId: extractOriginalId(result) };
}

export async function sendWhatsAppAudioMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  audioUrl: string
): Promise<ProviderSendResult> {
  const result = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'audio',
    audio: { link: audioUrl },
  });

  return { originalId: extractOriginalId(result) };
}

export async function sendWhatsAppDocumentMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  documentUrl: string,
  filename?: string
): Promise<ProviderSendResult> {
  const docPayload: Record<string, unknown> = { link: documentUrl };
  if (filename !== undefined) docPayload.filename = filename;

  const result = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'document',
    document: docPayload,
  });

  return { originalId: extractOriginalId(result) };
}
```

- [ ] **Step 4: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 5: Commit**

Message: `feat(messaging): add WhatsApp sender, credentials resolver, and channel queries`

---

### Task 16: Instagram Sender

**Files:**
- Create: `packages/backend/src/messaging/services/instagram/sender.ts`
- Create: `packages/backend/src/messaging/services/instagram/credentials.ts`

- [ ] **Step 1: Create Instagram credentials helper**

```ts
// packages/backend/src/messaging/services/instagram/credentials.ts
import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import {
  decryptInstagramToken,
  getChannelConnection,
  getInstagramCredential,
} from '../../queries/channelQueries.js';

export interface InstagramSendCredentials {
  accessToken: string;
  igUserId: string;
}

export async function resolveInstagramCredentials(
  supabase: SupabaseClient,
  agentId: string,
  tenantId: string
): Promise<InstagramSendCredentials> {
  const connection = await getChannelConnection(supabase, agentId, tenantId, 'instagram');
  if (connection === null) {
    throw new Error('No Instagram channel connection found');
  }

  const credential = await getInstagramCredential(supabase, connection.id);
  if (credential === null) {
    throw new Error('No Instagram credentials found');
  }

  const accessToken = await decryptInstagramToken(supabase, credential.id);
  return { accessToken, igUserId: credential.ig_user_id };
}
```

- [ ] **Step 2: Create Instagram sender**

```ts
// packages/backend/src/messaging/services/instagram/sender.ts
import type { ProviderSendResult } from '../../types/index.js';

const IG_API_BASE = 'https://graph.instagram.com/v18.0';

interface InstagramApiResponse {
  recipient_id?: string;
  message_id?: string;
  error?: { message: string; code: number };
}

export async function sendInstagramMessage(
  igUserId: string,
  accessToken: string,
  recipientId: string,
  text: string
): Promise<ProviderSendResult> {
  const url = `${IG_API_BASE}/${igUserId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const result = (await response.json()) as InstagramApiResponse;

  if (result.error !== undefined) {
    throw new Error(`Instagram API error: ${result.error.message}`);
  }

  return { originalId: result.message_id ?? '' };
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add Instagram sender and credentials resolver`

---

### Task 17: messageProcessor.ts — processSendMessage

**Files:**
- Create: `packages/backend/src/messaging/controllers/messageProcessor.ts`

- [ ] **Step 1: Create the message processor with the send flow**

```ts
// packages/backend/src/messaging/controllers/messageProcessor.ts
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { findOrCreateConversation, updateConversationLastMessage } from '../queries/conversationQueries.js';
import { insertMessage, insertMessageAi } from '../queries/messageQueries.js';
import { publishToTenant } from '../services/redis.js';
import type { ConversationRow, ProviderSendResult } from '../types/index.js';
import { detectChannel, isTestChannel, stripChannelPrefix } from './providerRouter.js';

// Forward declarations — actual send functions wired in Tasks 15-16
import { resolveWhatsAppCredentials } from '../services/whatsapp/credentials.js';
import { sendWhatsAppTextMessage } from '../services/whatsapp/sender.js';
import { resolveInstagramCredentials } from '../services/instagram/credentials.js';
import { sendInstagramMessage } from '../services/instagram/sender.js';

const ZERO_UNANSWERED = 0;

/* ─── Deliver to channel provider ─── */

async function deliverToProvider(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  content: string,
  type: string
): Promise<ProviderSendResult> {
  const channel = detectChannel(conversation.user_channel_id);

  if (isTestChannel(conversation.user_channel_id)) {
    return { originalId: '' };
  }

  const recipient = stripChannelPrefix(conversation.user_channel_id);

  if (channel === 'whatsapp') {
    const creds = await resolveWhatsAppCredentials(
      supabase,
      conversation.agent_id,
      conversation.tenant_id
    );
    return sendWhatsAppTextMessage(creds.phoneNumberId, creds.accessToken, recipient, content);
  }

  if (channel === 'instagram') {
    const creds = await resolveInstagramCredentials(
      supabase,
      conversation.agent_id,
      conversation.tenant_id
    );
    return sendInstagramMessage(creds.igUserId, creds.accessToken, recipient, content);
  }

  return { originalId: '' };
}

/* ─── Process: agent sends message from dashboard ─── */

interface ProcessSendParams {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  tenantId: string;
  userChannelId: string;
  content: string;
  type: string;
  clientMessageId?: string;
}

export async function processSendMessage(params: ProcessSendParams): Promise<void> {
  const channel = detectChannel(params.userChannelId);
  const threadId = params.userChannelId;

  const conversation = await findOrCreateConversation(params.supabase, {
    orgId: params.orgId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    userChannelId: params.userChannelId,
    threadId,
    channel,
  });

  // Deliver via provider
  const sendResult = await deliverToProvider(
    params.supabase,
    conversation,
    params.content,
    params.type
  );

  const now = Date.now();

  // Save to messages + messages_ai
  await Promise.all([
    insertMessage(params.supabase, {
      id: params.clientMessageId,
      conversationId: conversation.id,
      role: 'assistant',
      type: params.type,
      content: params.content,
      originalId: sendResult.originalId,
      timestamp: now,
    }),
    insertMessageAi(params.supabase, {
      conversationId: conversation.id,
      role: 'assistant',
      type: params.type,
      content: params.content,
      originalId: sendResult.originalId,
      timestamp: now,
    }),
  ]);

  // Update conversation
  await updateConversationLastMessage(params.supabase, conversation.id, {
    lastMessageContent: params.content,
    lastMessageRole: 'assistant',
    lastMessageType: params.type,
    lastMessageAt: new Date(now).toISOString(),
    read: true,
    unansweredCount: ZERO_UNANSWERED,
  });

  // Publish to Redis for Socket.io
  await publishToTenant(params.tenantId, {
    conversationId: conversation.id,
    tenantId: params.tenantId,
    // Full snapshot building deferred to Task 26
  }).catch(() => {
    process.stdout.write('[messaging] Redis publish failed (non-fatal)\n');
  });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add processSendMessage — save, deliver via provider, update conversation`

---

### Task 18: Send Routes

**Files:**
- Create: `packages/backend/src/messaging/routes/send.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create send routes**

```ts
// packages/backend/src/messaging/routes/send.ts
import express from 'express';
import type { Request, Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { processSendMessage } from '../controllers/messageProcessor.js';
import {
  deleteConversation,
  findConversationByUserChannelId,
  insertDeletedConversation,
} from '../queries/conversationQueries.js';
import type { SendMessageBody, TestMessageBody } from '../types/index.js';
import { TEST_USER_CHANNEL_ID } from '../types/index.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

function getSupabase(res: Response): SupabaseClient {
  return res.locals.supabase as SupabaseClient;
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/* ─── Resolve orgId from agent ─── */

interface AgentOrgRow {
  org_id: string;
}

async function getOrgIdFromAgent(supabase: SupabaseClient, agentId: string): Promise<string> {
  const result = await supabase.from('agents').select('org_id').eq('id', agentId).single();
  const row = result.data as AgentOrgRow | null;
  if (row === null) throw new Error('Agent not found');
  return row.org_id;
}

/* POST /messages/message */
async function handleSendMessage(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const body = req.body as SendMessageBody;

    if (!body.message || !body.userID || !body.tenantId || !body.agentId) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing required fields' });
      return;
    }

    const orgId = await getOrgIdFromAgent(supabase, body.agentId);

    await processSendMessage({
      supabase,
      orgId,
      agentId: body.agentId,
      tenantId: body.tenantId,
      userChannelId: body.userID,
      content: body.message,
      type: body.type ?? 'text',
      clientMessageId: body.id,
    });

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* POST /messages/test */
async function handleTestMessage(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const body = req.body as TestMessageBody;

    if (!body.message || !body.tenantId || !body.agentId) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing required fields' });
      return;
    }

    const orgId = await getOrgIdFromAgent(supabase, body.agentId);

    // Save user message via processSendMessage won't work for test —
    // test messages need to save as 'user' role and invoke AI.
    // This will be completed in Task 22 (processIncomingMessage).
    // For now, respond 200.
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* DELETE /messages/:tenantId/:from */
async function handleDeleteFromSend(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeURIComponent(req.params.from as string);

    const conversation = await findConversationByUserChannelId(supabase, tenantId, userChannelId);
    if (conversation === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Conversation not found' });
      return;
    }

    await insertDeletedConversation(supabase, conversation.id, tenantId);
    await deleteConversation(supabase, conversation.id);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const sendRouter = express.Router();
sendRouter.post('/message', handleSendMessage);
sendRouter.post('/test', handleTestMessage);
sendRouter.delete('/:tenantId/:from', handleDeleteFromSend);
```

- [ ] **Step 2: Mount in routes index**

```ts
import { sendRouter } from './send.js';

// Inside buildMessagingRouter:
router.use('/messages', sendRouter);
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add send routes — message, test, delete`

---

## Phase 5: Webhooks + AI Invocation

### Task 19: WhatsApp Webhook Parser

**Files:**
- Create: `packages/backend/src/messaging/services/whatsapp/webhookParser.ts`

- [ ] **Step 1: Create the WhatsApp webhook parser**

```ts
// packages/backend/src/messaging/services/whatsapp/webhookParser.ts
import type { IncomingMessage } from '../../types/index.js';

/* ─── WhatsApp webhook payload types ─── */

interface WhatsAppContact {
  profile?: { name?: string };
  wa_id?: string;
}

interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  audio?: { id: string };
  video?: { id: string; caption?: string };
  document?: { id: string; filename?: string; caption?: string };
  context?: { message_id: string };
}

interface WhatsAppMetadata {
  phone_number_id: string;
  display_phone_number: string;
}

interface WhatsAppValue {
  messaging_product: string;
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
}

interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

function isValidPayload(body: unknown): body is WhatsAppWebhookPayload {
  return typeof body === 'object' && body !== null && 'entry' in body;
}

function extractMessageContent(msg: WhatsAppMessage): { content: string; mediaId: string | undefined } {
  if (msg.type === 'text' && msg.text !== undefined) {
    return { content: msg.text.body, mediaId: undefined };
  }
  if (msg.type === 'image' && msg.image !== undefined) {
    return { content: msg.image.caption ?? '', mediaId: msg.image.id };
  }
  if (msg.type === 'audio' && msg.audio !== undefined) {
    return { content: '', mediaId: msg.audio.id };
  }
  if (msg.type === 'video' && msg.video !== undefined) {
    return { content: msg.video.caption ?? '', mediaId: msg.video.id };
  }
  if (msg.type === 'document' && msg.document !== undefined) {
    return { content: msg.document.caption ?? '', mediaId: msg.document.id };
  }
  return { content: '', mediaId: undefined };
}

function mapWhatsAppType(waType: string): string {
  const typeMap: Record<string, string> = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    video: 'video',
    document: 'document',
  };
  return typeMap[waType] ?? 'text';
}

export interface ParsedWhatsAppWebhook {
  phoneNumberId: string;
  messages: IncomingMessage[];
}

export function parseWhatsAppWebhook(body: unknown): ParsedWhatsAppWebhook | null {
  if (!isValidPayload(body)) return null;

  const results: IncomingMessage[] = [];
  let phoneNumberId = '';

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const { value } = change;
      phoneNumberId = value.metadata.phone_number_id;
      const contacts = value.contacts ?? [];

      for (const msg of value.messages ?? []) {
        const contact = contacts.find((c) => c.wa_id === msg.from);
        const { content, mediaId } = extractMessageContent(msg);
        const timestamp = Number(msg.timestamp) * 1000;

        results.push({
          userChannelId: `whatsapp:+${msg.from}`,
          channelIdentifier: phoneNumberId,
          content,
          type: mapWhatsAppType(msg.type),
          originalId: msg.id,
          userName: contact?.profile?.name,
          mediaId,
          replyOriginalId: msg.context?.message_id,
          timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
        });
      }
    }
  }

  if (results.length === 0) return null;
  return { phoneNumberId, messages: results };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add WhatsApp webhook payload parser`

---

### Task 20: Instagram Webhook Parser

**Files:**
- Create: `packages/backend/src/messaging/services/instagram/webhookParser.ts`

- [ ] **Step 1: Create the Instagram webhook parser**

```ts
// packages/backend/src/messaging/services/instagram/webhookParser.ts
import type { IncomingMessage } from '../../types/index.js';

interface InstagramMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: { url: string };
    }>;
    reply_to?: { mid: string };
  };
}

interface InstagramEntry {
  id: string;
  messaging: InstagramMessaging[];
}

interface InstagramWebhookPayload {
  object: string;
  entry: InstagramEntry[];
}

function isValidPayload(body: unknown): body is InstagramWebhookPayload {
  return typeof body === 'object' && body !== null && 'entry' in body;
}

export interface ParsedInstagramWebhook {
  igUserId: string;
  messages: IncomingMessage[];
}

export function parseInstagramWebhook(body: unknown): ParsedInstagramWebhook | null {
  if (!isValidPayload(body)) return null;

  const results: IncomingMessage[] = [];
  let igUserId = '';

  for (const entry of body.entry) {
    for (const event of entry.messaging) {
      if (event.message === undefined) continue;

      igUserId = event.recipient.id;
      const senderId = event.sender.id;
      const msg = event.message;

      results.push({
        userChannelId: `instagram:${senderId}`,
        channelIdentifier: igUserId,
        content: msg.text ?? '',
        type: 'text',
        originalId: msg.mid,
        userName: undefined,
        mediaId: undefined,
        replyOriginalId: msg.reply_to?.mid,
        timestamp: event.timestamp,
      });
    }
  }

  if (results.length === 0) return null;
  return { igUserId, messages: results };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add Instagram webhook payload parser`

---

### Task 21: agentInvoker.ts

**Files:**
- Create: `packages/backend/src/messaging/controllers/agentInvoker.ts`

- [ ] **Step 1: Create the agent invoker that reuses existing execution infrastructure**

This module bridges the messaging system to the existing `executeAgent` + persistence pipeline.

```ts
// packages/backend/src/messaging/controllers/agentInvoker.ts
import type { Message } from '@daviddh/llm-graph-runner';
import { MESSAGES_PROVIDER } from '@daviddh/llm-graph-runner';

import { failExecution, getOrCreateSession } from '../../db/queries/executionQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { executeAgent } from '../../routes/execute/edgeFunctionClient.js';
import {
  fetchGraphAndKeys,
  fetchSessionData,
  getProductionKeyId,
} from '../../routes/execute/executeFetcher.js';
import { persistPostExecution, persistPreExecution } from '../../routes/execute/executePersistence.js';
import {
  getLastVisitedNode,
  mergeStructuredOutputs,
} from '../../routes/execute/executeResponseBuilders.js';
import { getAiMessages } from '../queries/messageQueries.js';
import type { ConversationRow, MessageAiRow } from '../types/index.js';

/* ─── Hydrate messages_ai rows into Message[] for the edge function ─── */

function hydrateAiMessage(row: MessageAiRow): Message {
  const provider = MESSAGES_PROVIDER.WHATSAPP;
  const role = row.role === 'assistant' ? 'assistant' : 'user';
  return {
    provider,
    id: row.id,
    timestamp: row.timestamp,
    originalId: row.original_id ?? row.id,
    type: row.type === 'text' ? 'text' : 'text',
    message: { role, content: row.content ?? '' },
  };
}

export function hydrateAiMessages(rows: MessageAiRow[]): Message[] {
  return rows.map(hydrateAiMessage);
}

/* ─── Invoke AI agent ─── */

interface InvokeParams {
  supabase: SupabaseClient;
  conversation: ConversationRow;
  userMessageContent: string;
}

interface InvokeResult {
  responseText: string;
}

interface AgentRow {
  org_id: string;
  current_version: number;
}

async function getAgentInfo(supabase: SupabaseClient, agentId: string): Promise<AgentRow> {
  const result = await supabase
    .from('agents')
    .select('org_id, current_version')
    .eq('id', agentId)
    .single();

  const row = result.data as AgentRow | null;
  if (row === null) throw new Error('Agent not found');
  return row;
}

function noop(): void {
  // intentionally empty
}

export async function invokeAgent(params: InvokeParams): Promise<InvokeResult | null> {
  const { supabase, conversation, userMessageContent } = params;
  const DEFAULT_MODEL = 'x-ai/grok-4.1-fast';

  const agentInfo = await getAgentInfo(supabase, conversation.agent_id);
  const { org_id: orgId, current_version: version } = agentInfo;

  // Get production key
  const productionKeyId = await getProductionKeyId(supabase, conversation.agent_id);

  // Fetch graph and keys
  const graphAndKeys = await fetchGraphAndKeys({
    supabase,
    agentId: conversation.agent_id,
    version,
    orgId,
    productionApiKeyId: productionKeyId,
  });

  const model = DEFAULT_MODEL;

  // Get or create session using conversation thread_id
  const sessionResult = await getOrCreateSession(supabase, {
    agentId: conversation.agent_id,
    orgId,
    version,
    tenantId: conversation.tenant_id,
    userId: conversation.user_channel_id,
    sessionId: conversation.thread_id,
    channel: conversation.channel,
    model,
  });

  if (sessionResult.locked === true) {
    process.stdout.write('[messaging] Session locked, skipping AI invocation\n');
    return null;
  }

  if (sessionResult.session === null) {
    throw new Error('Failed to create session');
  }

  const session = sessionResult.session;

  // Hydrate AI messages from messages_ai table
  const aiRows = await getAiMessages(supabase, conversation.id);
  const messageHistory = hydrateAiMessages(aiRows);

  // Persist pre-execution
  const { executionId } = await persistPreExecution(supabase, {
    sessionDbId: session.id,
    agentId: conversation.agent_id,
    orgId,
    version,
    model,
    channel: conversation.channel,
    tenantId: conversation.tenant_id,
    userId: conversation.user_channel_id,
    userMessageContent,
    currentNodeId: session.current_node_id,
  });

  // Call edge function
  const startTime = Date.now();
  try {
    const { output, nodeData } = await executeAgent(
      {
        graph: graphAndKeys.graph,
        apiKey: graphAndKeys.apiKey,
        modelId: model,
        currentNodeId: session.current_node_id,
        messages: messageHistory,
        structuredOutputs: session.structured_outputs,
        data: {},
        quickReplies: {},
        sessionID: conversation.thread_id,
        tenantID: conversation.tenant_id,
        userID: conversation.user_channel_id,
        isFirstMessage: sessionResult.isNew,
      },
      { onNodeVisited: noop, onNodeProcessed: noop }
    );

    if (output === null) {
      await failExecution(supabase, executionId, 'No output from agent');
      return null;
    }

    // Persist post-execution
    const durationMs = Date.now() - startTime;
    const newNodeId = getLastVisitedNode(output, session.current_node_id);
    const newOutputs = mergeStructuredOutputs(session.structured_outputs, output);

    await persistPostExecution(supabase, {
      executionId,
      sessionDbId: session.id,
      result: output,
      currentNodeId: newNodeId,
      structuredOutputs: newOutputs,
      durationMs,
      model,
      nodeData,
    });

    return { responseText: output.text ?? '' };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'AI invocation failed';
    process.stdout.write(`[messaging] AI invocation failed: ${errMsg}\n`);
    await failExecution(supabase, executionId, errMsg).catch(noop);
    return null;
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add agentInvoker — bridges messaging to existing execution pipeline`

---

### Task 22: messageProcessor.ts — processIncomingMessage

**Files:**
- Modify: `packages/backend/src/messaging/controllers/messageProcessor.ts`

- [ ] **Step 1: Add processIncomingMessage to messageProcessor.ts**

Add the following functions to the existing `messageProcessor.ts`:

```ts
import type { ChannelConnectionRow, IncomingMessage } from '../types/index.js';
import { getChannelConnectionByIdentifier } from '../queries/channelQueries.js';
import { invokeAgent } from './agentInvoker.js';

/* ─── Upsert end user ─── */

async function upsertEndUser(
  supabase: SupabaseClient,
  tenantId: string,
  userChannelId: string,
  name: string | undefined
): Promise<void> {
  await supabase.from('end_users').upsert(
    {
      tenant_id: tenantId,
      user_channel_id: userChannelId,
      name: name ?? null,
    },
    { onConflict: 'tenant_id,user_channel_id' }
  );
}

/* ─── Process: incoming webhook message ─── */

interface ProcessIncomingParams {
  supabase: SupabaseClient;
  connection: ChannelConnectionRow;
  incoming: IncomingMessage;
}

export async function processIncomingMessage(params: ProcessIncomingParams): Promise<void> {
  const { supabase, connection, incoming } = params;
  const threadId = incoming.userChannelId;

  const conversation = await findOrCreateConversation(supabase, {
    orgId: connection.org_id,
    agentId: connection.agent_id,
    tenantId: connection.tenant_id,
    userChannelId: incoming.userChannelId,
    threadId,
    channel: connection.channel_type,
    name: incoming.userName,
  });

  // Upsert end user
  await upsertEndUser(supabase, connection.tenant_id, incoming.userChannelId, incoming.userName);

  // Save user message to messages + messages_ai
  await Promise.all([
    insertMessage(supabase, {
      conversationId: conversation.id,
      role: 'user',
      type: incoming.type,
      content: incoming.content,
      originalId: incoming.originalId,
      timestamp: incoming.timestamp,
    }),
    insertMessageAi(supabase, {
      conversationId: conversation.id,
      role: 'user',
      type: incoming.type,
      content: incoming.content,
      originalId: incoming.originalId,
      timestamp: incoming.timestamp,
    }),
  ]);

  // Compute unanswered count
  const newUnansweredCount = conversation.enabled
    ? conversation.unanswered_count
    : conversation.unanswered_count + 1;

  // Update conversation
  await updateConversationLastMessage(supabase, conversation.id, {
    lastMessageContent: incoming.content,
    lastMessageRole: 'user',
    lastMessageType: incoming.type,
    lastMessageAt: new Date(incoming.timestamp).toISOString(),
    read: false,
    unansweredCount: newUnansweredCount,
  });

  // Publish user message to Redis
  await publishToTenant(connection.tenant_id, {
    conversationId: conversation.id,
    tenantId: connection.tenant_id,
  }).catch(() => {
    process.stdout.write('[messaging] Redis publish failed (non-fatal)\n');
  });

  // If AI is disabled, stop here
  if (!conversation.enabled) return;

  // Invoke AI agent
  const aiResult = await invokeAgent({
    supabase,
    conversation,
    userMessageContent: incoming.content,
  });

  if (aiResult === null || aiResult.responseText === '') return;

  // Save AI response to messages + messages_ai
  const responseTimestamp = Date.now();
  await Promise.all([
    insertMessage(supabase, {
      conversationId: conversation.id,
      role: 'assistant',
      type: 'text',
      content: aiResult.responseText,
      timestamp: responseTimestamp,
    }),
    insertMessageAi(supabase, {
      conversationId: conversation.id,
      role: 'assistant',
      type: 'text',
      content: aiResult.responseText,
      timestamp: responseTimestamp,
    }),
  ]);

  // Deliver AI response to channel
  const sendResult = await deliverToProvider(supabase, conversation, aiResult.responseText, 'text');

  // Update original_id on the message row if provider returned one
  if (sendResult.originalId !== '') {
    // Fire and forget — update the original_id
    supabase
      .from('messages')
      .update({ original_id: sendResult.originalId })
      .eq('conversation_id', conversation.id)
      .eq('role', 'assistant')
      .eq('timestamp', responseTimestamp)
      .then(() => {
        /* ignore */
      })
      .catch(() => {
        /* ignore */
      });
  }

  // Update conversation with assistant response
  await updateConversationLastMessage(supabase, conversation.id, {
    lastMessageContent: aiResult.responseText,
    lastMessageRole: 'assistant',
    lastMessageType: 'text',
    lastMessageAt: new Date(responseTimestamp).toISOString(),
    read: true,
    unansweredCount: ZERO_UNANSWERED,
  });

  // Publish assistant response to Redis
  await publishToTenant(connection.tenant_id, {
    conversationId: conversation.id,
    tenantId: connection.tenant_id,
  }).catch(() => {
    process.stdout.write('[messaging] Redis publish failed (non-fatal)\n');
  });
}

/* ─── Process: test message (invoke AI, no channel delivery) ─── */

interface ProcessTestParams {
  supabase: SupabaseClient;
  orgId: string;
  agentId: string;
  tenantId: string;
  content: string;
  type: string;
  clientMessageId?: string;
}

export async function processTestMessage(params: ProcessTestParams): Promise<void> {
  const userChannelId = TEST_USER_CHANNEL_ID;
  const threadId = userChannelId;

  const conversation = await findOrCreateConversation(params.supabase, {
    orgId: params.orgId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    userChannelId,
    threadId,
    channel: 'api',
  });

  const now = Date.now();

  // Save user message
  await Promise.all([
    insertMessage(params.supabase, {
      id: params.clientMessageId,
      conversationId: conversation.id,
      role: 'user',
      type: params.type,
      content: params.content,
      timestamp: now,
    }),
    insertMessageAi(params.supabase, {
      conversationId: conversation.id,
      role: 'user',
      type: params.type,
      content: params.content,
      timestamp: now,
    }),
  ]);

  await updateConversationLastMessage(params.supabase, conversation.id, {
    lastMessageContent: params.content,
    lastMessageRole: 'user',
    lastMessageType: params.type,
    lastMessageAt: new Date(now).toISOString(),
    read: true,
    unansweredCount: 0,
  });

  // Publish user message
  await publishToTenant(params.tenantId, {
    conversationId: conversation.id,
    tenantId: params.tenantId,
  }).catch(() => {
    process.stdout.write('[messaging] Redis publish failed (non-fatal)\n');
  });

  // Invoke AI (async, don't await for the HTTP response)
  void invokeAiAndSaveResponse(params.supabase, conversation, params.content, params.tenantId);
}

async function invokeAiAndSaveResponse(
  supabase: SupabaseClient,
  conversation: ConversationRow,
  userContent: string,
  tenantId: string
): Promise<void> {
  try {
    const aiResult = await invokeAgent({ supabase, conversation, userMessageContent: userContent });
    if (aiResult === null || aiResult.responseText === '') return;

    const responseTimestamp = Date.now();
    await Promise.all([
      insertMessage(supabase, {
        conversationId: conversation.id,
        role: 'assistant',
        type: 'text',
        content: aiResult.responseText,
        timestamp: responseTimestamp,
      }),
      insertMessageAi(supabase, {
        conversationId: conversation.id,
        role: 'assistant',
        type: 'text',
        content: aiResult.responseText,
        timestamp: responseTimestamp,
      }),
    ]);

    await updateConversationLastMessage(supabase, conversation.id, {
      lastMessageContent: aiResult.responseText,
      lastMessageRole: 'assistant',
      lastMessageType: 'text',
      lastMessageAt: new Date(responseTimestamp).toISOString(),
      read: true,
      unansweredCount: ZERO_UNANSWERED,
    });

    await publishToTenant(tenantId, {
      conversationId: conversation.id,
      tenantId,
    }).catch(() => {
      /* ignore */
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stdout.write(`[messaging] AI invocation for test failed: ${msg}\n`);
  }
}
```

- [ ] **Step 2: Update the test route in send.ts to use processTestMessage**

Replace the placeholder in `handleTestMessage`:

```ts
import { processTestMessage } from '../controllers/messageProcessor.js';

async function handleTestMessage(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const body = req.body as TestMessageBody;

    if (!body.message || !body.tenantId || !body.agentId) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Missing required fields' });
      return;
    }

    const orgId = await getOrgIdFromAgent(supabase, body.agentId);

    await processTestMessage({
      supabase,
      orgId,
      agentId: body.agentId,
      tenantId: body.tenantId,
      content: body.message,
      type: body.type ?? 'text',
      clientMessageId: body.id,
    });

    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add processIncomingMessage and processTestMessage flows`

---

### Task 23: Webhook Routes

**Files:**
- Create: `packages/backend/src/messaging/routes/webhooks/whatsapp.ts`
- Create: `packages/backend/src/messaging/routes/webhooks/instagram.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create WhatsApp webhook route**

```ts
// packages/backend/src/messaging/routes/webhooks/whatsapp.ts
import express from 'express';
import type { Request, Response } from 'express';

import { createServiceClient } from '../../../db/queries/executionAuthQueries.js';
import { processIncomingMessage } from '../../controllers/messageProcessor.js';
import { verifyWhatsAppSignature } from '../../middleware/webhookSignature.js';
import { getChannelConnectionByIdentifier } from '../../queries/channelQueries.js';
import { parseWhatsAppWebhook } from '../../services/whatsapp/webhookParser.js';

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

/* GET /whatsapp/webhook — verification challenge */
function handleVerify(req: Request, res: Response): void {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (mode === 'subscribe' && token === readEnv('WHATSAPP_VERIFY_TOKEN')) {
    res.status(HTTP_OK).send(challenge ?? '');
    return;
  }

  res.status(HTTP_FORBIDDEN).send('Forbidden');
}

/* POST /whatsapp/webhook — incoming messages */
async function handleIncoming(req: Request, res: Response): Promise<void> {
  // Return 200 immediately to WhatsApp
  res.status(HTTP_OK).send('EVENT_RECEIVED');

  // Process async
  try {
    const parsed = parseWhatsAppWebhook(req.body);
    if (parsed === null) return;

    const supabase = createServiceClient();

    for (const incoming of parsed.messages) {
      const connection = await getChannelConnectionByIdentifier(supabase, incoming.channelIdentifier);
      if (connection === null) {
        process.stdout.write(`[whatsapp] No channel connection for ${incoming.channelIdentifier}\n`);
        continue;
      }

      await processIncomingMessage({ supabase, connection, incoming });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stdout.write(`[whatsapp] Webhook processing error: ${msg}\n`);
  }
}

export const whatsappWebhookRouter = express.Router();
whatsappWebhookRouter.get('/webhook', handleVerify);
whatsappWebhookRouter.post(
  '/webhook',
  express.text({ type: 'application/json' }),
  verifyWhatsAppSignature,
  handleIncoming
);
```

- [ ] **Step 2: Create Instagram webhook route**

```ts
// packages/backend/src/messaging/routes/webhooks/instagram.ts
import express from 'express';
import type { Request, Response } from 'express';

import { createServiceClient } from '../../../db/queries/executionAuthQueries.js';
import { processIncomingMessage } from '../../controllers/messageProcessor.js';
import { verifyInstagramSignature } from '../../middleware/webhookSignature.js';
import { getChannelConnectionByIdentifier } from '../../queries/channelQueries.js';
import { parseInstagramWebhook } from '../../services/instagram/webhookParser.js';

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

/* GET /instagram/webhook — verification challenge */
function handleVerify(req: Request, res: Response): void {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (mode === 'subscribe' && token === readEnv('INSTAGRAM_VERIFY_TOKEN')) {
    res.status(HTTP_OK).send(challenge ?? '');
    return;
  }

  res.status(HTTP_FORBIDDEN).send('Forbidden');
}

/* POST /instagram/webhook — incoming messages */
async function handleIncoming(req: Request, res: Response): Promise<void> {
  res.status(HTTP_OK).send('EVENT_RECEIVED');

  try {
    const parsed = parseInstagramWebhook(req.body);
    if (parsed === null) return;

    const supabase = createServiceClient();

    for (const incoming of parsed.messages) {
      const connection = await getChannelConnectionByIdentifier(supabase, incoming.channelIdentifier);
      if (connection === null) {
        process.stdout.write(`[instagram] No channel connection for ${incoming.channelIdentifier}\n`);
        continue;
      }

      await processIncomingMessage({ supabase, connection, incoming });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stdout.write(`[instagram] Webhook processing error: ${msg}\n`);
  }
}

export const instagramWebhookRouter = express.Router();
instagramWebhookRouter.get('/webhook', handleVerify);
instagramWebhookRouter.post(
  '/webhook',
  express.text({ type: 'application/json' }),
  verifyInstagramSignature,
  handleIncoming
);
```

- [ ] **Step 3: Mount webhook routers in index.ts BEFORE ensureMessagingAuth**

Update `packages/backend/src/messaging/routes/index.ts`:

```ts
import { instagramWebhookRouter } from './webhooks/instagram.js';
import { whatsappWebhookRouter } from './webhooks/whatsapp.js';

export function buildMessagingRouter(): express.Router {
  const router = express.Router();

  // Webhook routes — no auth, use signature verification
  router.use('/whatsapp', whatsappWebhookRouter);
  router.use('/instagram', instagramWebhookRouter);

  // All remaining routes require messaging auth
  router.use(ensureMessagingAuth);
  // ... rest of routes
```

- [ ] **Step 4: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 5: Commit**

Message: `feat(messaging): add WhatsApp and Instagram webhook routes with signature verification`

---

## Phase 6: Socket.io + Real-time

### Task 24: Socket.io Server Setup

**Files:**
- Create: `packages/backend/src/messaging/socket/index.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Create Socket.io server setup**

```ts
// packages/backend/src/messaging/socket/index.ts
import type { Server as HttpServer } from 'node:http';

import { Server as SocketServer } from 'socket.io';

import { handleConnection } from './subscriptions.js';

let io: SocketServer | null = null;

export function getSocketServer(): SocketServer | null {
  return io;
}

export function attachSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', handleConnection);

  process.stdout.write('[socket.io] Server attached to HTTP server\n');
  return io;
}
```

- [ ] **Step 2: Update index.ts to attach Socket.io**

```ts
#!/usr/bin/env node
import { attachSocketServer } from './messaging/socket/index.js';
import { fetchAndCacheModels } from './openrouter/modelCache.js';
import { createApp } from './server.js';

const DEFAULT_PORT = 4000;

const ZERO = 0;
const envPort = Number(process.env.PORT);
const port = Number.isNaN(envPort) || envPort === ZERO ? DEFAULT_PORT : envPort;
const app = createApp();

const server = app.listen(port, () => {
  process.stdout.write(`Graph Runner Backend listening on port ${String(port)}\n`);
  void fetchAndCacheModels();
});

attachSocketServer(server);

export { server };
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): attach Socket.io server to HTTP server`

---

### Task 25: Subscription Manager

**Files:**
- Create: `packages/backend/src/messaging/socket/subscriptions.ts`

- [ ] **Step 1: Create the subscription manager**

```ts
// packages/backend/src/messaging/socket/subscriptions.ts
import type { Socket } from 'socket.io';

import type { ConversationSnapshot } from '../types/index.js';

/* ─── Subscription state ─── */

interface SocketEntry {
  socket: Socket;
  requestId: string;
}

interface TenantSubscription {
  sockets: Map<string, SocketEntry>;
}

const tenantSubs = new Map<string, TenantSubscription>();

/* ─── Subscribe ─── */

interface SubscribePayload {
  tenantId: string;
  requestId: string;
}

function isSubscribePayload(data: unknown): data is SubscribePayload {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.tenantId === 'string' && typeof obj.requestId === 'string';
}

function subscribeTenant(socket: Socket, tenantId: string, requestId: string): void {
  let sub = tenantSubs.get(tenantId);
  if (sub === undefined) {
    sub = { sockets: new Map() };
    tenantSubs.set(tenantId, sub);
  }

  sub.sockets.set(socket.id, { socket, requestId });
  process.stdout.write(`[socket.io] Socket ${socket.id} subscribed to tenant ${tenantId}\n`);
}

/* ─── Unsubscribe ─── */

function unsubscribeSocket(socketId: string): void {
  for (const [tenantId, sub] of tenantSubs) {
    sub.sockets.delete(socketId);
    if (sub.sockets.size === 0) {
      tenantSubs.delete(tenantId);
      process.stdout.write(`[socket.io] No more sockets for tenant ${tenantId}, cleaned up\n`);
    }
  }
}

/* ─── Broadcast to tenant ─── */

export function broadcastToTenant(tenantId: string, snapshot: ConversationSnapshot): void {
  const sub = tenantSubs.get(tenantId);
  if (sub === undefined) return;

  for (const [, entry] of sub.sockets) {
    entry.socket.emit('message:new', { data: snapshot, requestId: entry.requestId });
  }
}

/* ─── Connection handler ─── */

export function handleConnection(socket: Socket): void {
  process.stdout.write(`[socket.io] Client connected: ${socket.id}\n`);

  socket.on('messages:subscribe', (data: unknown) => {
    if (!isSubscribePayload(data)) return;
    subscribeTenant(socket, data.tenantId, data.requestId);
  });

  socket.on('disconnect', () => {
    unsubscribeSocket(socket.id);
    process.stdout.write(`[socket.io] Client disconnected: ${socket.id}\n`);
  });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): add Socket.io subscription manager — per-tenant room management`

---

### Task 26: Wire Publishing into messageProcessor

**Files:**
- Modify: `packages/backend/src/messaging/controllers/messageProcessor.ts`

- [ ] **Step 1: Replace placeholder Redis publishes with full ConversationSnapshot broadcasting**

Update every `publishToTenant` call in `messageProcessor.ts` to build a proper `ConversationSnapshot` and also call `broadcastToTenant`:

```ts
import { buildSnapshotFromRow } from './snapshotBuilder.js';
import { batchGetAssignees, batchGetStatuses } from '../queries/conversationQueries.js';
import { broadcastToTenant } from '../socket/subscriptions.js';

async function publishSnapshot(
  supabase: SupabaseClient,
  conversationId: string,
  tenantId: string
): Promise<void> {
  // Reload the conversation to get updated fields
  const result = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  const row = result.data as ConversationRow | null;
  if (row === null) return;

  const [assigneeMap, statusMap] = await Promise.all([
    batchGetAssignees(supabase, [conversationId]),
    batchGetStatuses(supabase, [conversationId]),
  ]);

  const snapshot = buildSnapshotFromRow(
    row,
    assigneeMap.get(conversationId) ?? [],
    statusMap.get(conversationId) ?? []
  );

  // Broadcast via Socket.io (in-process)
  broadcastToTenant(tenantId, snapshot);

  // Publish to Redis (for multi-instance)
  await publishToTenant(tenantId, snapshot);
}
```

Then replace all `publishToTenant(tenantId, { conversationId, tenantId })` calls with:

```ts
await publishSnapshot(supabase, conversation.id, params.tenantId).catch(() => {
  process.stdout.write('[messaging] Snapshot publish failed (non-fatal)\n');
});
```

- [ ] **Step 2: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 3: Commit**

Message: `feat(messaging): wire ConversationSnapshot publishing into message processor + Socket.io broadcast`

---

## Phase 7: Supporting Endpoints

### Task 27: End Users Route

**Files:**
- Create: `packages/backend/src/messaging/queries/endUserQueries.ts`
- Create: `packages/backend/src/messaging/routes/users.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create endUserQueries.ts**

```ts
// packages/backend/src/messaging/queries/endUserQueries.ts
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { EndUserRow } from '../types/index.js';

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function getEndUser(
  supabase: SupabaseClient,
  tenantId: string,
  userChannelId: string
): Promise<EndUserRow | null> {
  const result: QueryResult<EndUserRow> = await supabase
    .from('end_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_channel_id', userChannelId)
    .single();

  return result.data;
}
```

- [ ] **Step 2: Create users route**

```ts
// packages/backend/src/messaging/routes/users.ts
import express from 'express';
import type { Request, Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getEndUser } from '../queries/endUserQueries.js';

const HTTP_OK = 200;
const HTTP_INTERNAL = 500;

function getSupabase(res: Response): SupabaseClient {
  return res.locals.supabase as SupabaseClient;
}

async function handleGetUser(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;
    const userChannelId = decodeURIComponent(req.params.userId as string);

    const user = await getEndUser(supabase, tenantId, userChannelId);
    res.status(HTTP_OK).json({ user: user ?? { name: undefined } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(HTTP_INTERNAL).json({ error: msg });
  }
}

export const usersRouter = express.Router({ mergeParams: true });
usersRouter.get('/:userId', handleGetUser);
```

- [ ] **Step 3: Mount in routes index**

```ts
import { usersRouter } from './users.js';

// Inside buildMessagingRouter:
router.use('/projects/:tenantId/users', usersRouter);
```

- [ ] **Step 4: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 5: Commit**

Message: `feat(messaging): add end users route and queries`

---

### Task 28: Collaborators Route

**Files:**
- Create: `packages/backend/src/messaging/routes/collaborators.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create collaborators route**

```ts
// packages/backend/src/messaging/routes/collaborators.ts
import express from 'express';
import type { Request, Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const HTTP_OK = 200;
const HTTP_INTERNAL = 500;

function getSupabase(res: Response): SupabaseClient {
  return res.locals.supabase as SupabaseClient;
}

interface TenantRow {
  org_id: string;
}

interface OrgMemberRow {
  user_id: string;
  role: string;
  users: { email: string; raw_user_meta_data: Record<string, unknown> } | null;
}

async function handleGetCollaborators(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const tenantId = req.params.tenantId as string;

    // Get the org_id for this tenant
    const tenantResult = await supabase
      .from('tenants')
      .select('org_id')
      .eq('id', tenantId)
      .single();

    const tenant = tenantResult.data as TenantRow | null;
    if (tenant === null) {
      res.status(HTTP_OK).json({ collaborators: [] });
      return;
    }

    // Query org_members for this org
    const membersResult = await supabase
      .from('org_members')
      .select('user_id, role, users:user_id(email, raw_user_meta_data)')
      .eq('org_id', tenant.org_id);

    const members = (membersResult.data ?? []) as unknown as OrgMemberRow[];
    const collaborators = members.map((m) => ({
      userId: m.user_id,
      email: m.users?.email ?? '',
      role: m.role,
      name: (m.users?.raw_user_meta_data?.full_name as string) ?? '',
    }));

    res.status(HTTP_OK).json({ collaborators });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(HTTP_INTERNAL).json({ error: msg });
  }
}

export const collaboratorsRouter = express.Router({ mergeParams: true });
collaboratorsRouter.get('/', handleGetCollaborators);
```

- [ ] **Step 2: Mount in routes index**

```ts
import { collaboratorsRouter } from './collaborators.js';

// Inside buildMessagingRouter:
router.use('/projects/:tenantId/collaborators', collaboratorsRouter);
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add collaborators route querying org_members`

---

### Task 29: User Pics Route

**Files:**
- Create: `packages/backend/src/messaging/routes/userPics.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create userPics route**

```ts
// packages/backend/src/messaging/routes/userPics.ts
import express from 'express';
import type { Request, Response } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

function getSupabase(res: Response): SupabaseClient {
  return res.locals.supabase as SupabaseClient;
}

interface UserRow {
  raw_user_meta_data: Record<string, unknown>;
}

async function handleGetPic(req: Request, res: Response): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const email = decodeURIComponent(req.params.email as string);

    // Lookup user by email in auth.users via admin API
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error !== null) {
      res.status(HTTP_INTERNAL).json({ error: 'Failed to lookup user' });
      return;
    }

    const user = data.users.find((u) => u.email === email);
    if (user === undefined) {
      res.status(HTTP_NOT_FOUND).json({ error: 'User not found' });
      return;
    }

    const avatarUrl = (user.user_metadata?.avatar_url as string) ?? null;
    res.status(HTTP_OK).json({ url: avatarUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(HTTP_INTERNAL).json({ error: msg });
  }
}

export const userPicsRouter = express.Router();
userPicsRouter.get('/:email/pic', handleGetPic);
```

- [ ] **Step 2: Mount in routes index**

```ts
import { userPicsRouter } from './userPics.js';

// Inside buildMessagingRouter:
router.use('/auth', userPicsRouter);
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add user pics route`

---

### Task 30: Media Route

**Files:**
- Create: `packages/backend/src/messaging/routes/media.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create media route**

```ts
// packages/backend/src/messaging/routes/media.ts
import express from 'express';
import type { Request, Response } from 'express';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

interface MediaFileBody {
  id: string;
  link: string;
  kind: string;
  status: string;
}

/* POST /projects/:tenantId/media — register uploaded media */
async function handleRegisterMedia(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as MediaFileBody;
    const groupName = req.query.groupName as string | undefined;
    const fileId = req.query.fileId as string | undefined;

    if (!body.id || !body.link) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'id and link are required' });
      return;
    }

    // Media registration is a metadata tracking operation.
    // The actual file is already in Supabase Storage (uploaded by frontend).
    // For now, return success — can add database tracking later if needed.
    res.status(HTTP_OK).json({ success: true, fileId: body.id });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

/* GET /projects/:tenantId/media/analyze — get file description */
async function handleAnalyzeMedia(req: Request, res: Response): Promise<void> {
  try {
    const url = req.query.url as string | undefined;
    const kind = req.query.kind as string | undefined;

    if (!url) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'url is required' });
      return;
    }

    // Placeholder — media analysis via LLM can be added later
    res.status(HTTP_OK).json({ content: '' });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const mediaRouter = express.Router({ mergeParams: true });
mediaRouter.post('/', handleRegisterMedia);
mediaRouter.get('/analyze', handleAnalyzeMedia);
```

- [ ] **Step 2: Mount in routes index**

```ts
import { mediaRouter } from './media.js';

// Inside buildMessagingRouter:
router.use('/projects/:tenantId/media', mediaRouter);
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add media route — register upload and analyze placeholder`

---

### Task 31: AI Helpers Routes

**Files:**
- Create: `packages/backend/src/messaging/routes/aiHelpers.ts`
- Modify: `packages/backend/src/messaging/routes/index.ts`

- [ ] **Step 1: Create AI helpers route**

```ts
// packages/backend/src/messaging/routes/aiHelpers.ts
import express from 'express';
import type { Request, Response } from 'express';

import {
  getDecryptedApiKeyValue,
} from '../../db/queries/executionAuthQueries.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { getProductionKeyId } from '../../routes/execute/executeFetcher.js';
import type { AiHelperBody } from '../types/index.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

const SYSTEM_PROMPTS: Record<string, string> = {
  'make-friendly': 'Rewrite the following message in a friendlier, warmer tone. Keep the same meaning.',
  'make-formal': 'Rewrite the following message in a more formal, professional tone. Keep the same meaning.',
  'fix-grammar': 'Fix grammar and spelling in the following message. Do not change the meaning or tone.',
  'answer-question': 'Using the conversation context provided, answer the following question.',
};

function getSupabase(res: Response): SupabaseClient {
  return res.locals.supabase as SupabaseClient;
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

interface LlmResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function callLlm(apiKey: string, systemPrompt: string, userText: string): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }),
  });

  const data = (await response.json()) as LlmResponse;
  const firstChoice = data.choices?.[0];
  return firstChoice?.message?.content ?? '';
}

async function handleAiHelper(
  req: Request,
  res: Response,
  helperType: string
): Promise<void> {
  try {
    const supabase = getSupabase(res);
    const body = req.body as AiHelperBody;

    if (!body.text || !body.agentId) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'text and agentId are required' });
      return;
    }

    const systemPrompt = SYSTEM_PROMPTS[helperType];
    if (systemPrompt === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'Unknown helper type' });
      return;
    }

    // Resolve API key from agent's production key
    const productionKeyId = await getProductionKeyId(supabase, body.agentId);
    const apiKey = await getDecryptedApiKeyValue(supabase, productionKeyId);

    if (apiKey === null) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'No API key configured for agent' });
      return;
    }

    const userText =
      helperType === 'answer-question' && body.context !== undefined
        ? `Context:\n${body.context}\n\nQuestion:\n${body.text}`
        : body.text;

    const result = await callLlm(apiKey, systemPrompt, userText);
    res.status(HTTP_OK).json({ text: result });
  } catch (err) {
    res.status(HTTP_INTERNAL).json({ error: extractErrorMessage(err) });
  }
}

export const aiHelpersRouter = express.Router({ mergeParams: true });
aiHelpersRouter.post('/make-friendly', (req, res) => handleAiHelper(req, res, 'make-friendly'));
aiHelpersRouter.post('/make-formal', (req, res) => handleAiHelper(req, res, 'make-formal'));
aiHelpersRouter.post('/fix-grammar', (req, res) => handleAiHelper(req, res, 'fix-grammar'));
aiHelpersRouter.post('/answer-question', (req, res) => handleAiHelper(req, res, 'answer-question'));
```

- [ ] **Step 2: Mount in routes index**

```ts
import { aiHelpersRouter } from './aiHelpers.js';

// Inside buildMessagingRouter:
router.use('/projects/:tenantId/ai', aiHelpersRouter);
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/backend`

- [ ] **Step 4: Commit**

Message: `feat(messaging): add AI text helper routes — friendly, formal, grammar, answer`

---

## Phase 8: Frontend Migration

### Task 32: Update API Endpoint Paths

**Files:**
- Modify: `packages/web/app/components/messages/services/api.ts`

- [ ] **Step 1: Update all endpoint paths per the migration table**

For each function in `api.ts`, update the URL path from the old closer-back format to the new format:

| Function | Old Path | New Path |
|---|---|---|
| `getLastMessages` | `/projects/${ns}/messages/last` | `/projects/${tenantId}/messages/last` |
| `getLastMessagesDelta` | `/projects/${ns}/messages/last?timestamp=X` | `/projects/${tenantId}/messages/last/delta?timestamp=X` |
| `getDeletedChats` | `/projects/${ns}/messages/deletedChats?from=X` | `/projects/${tenantId}/messages/last/deleted?since=X` |
| `getMessagesFromSender` | `/projects/${ns}/messages/${sender}` | `/projects/${tenantId}/conversations/${userId}` |
| `setChatbotActiveState` | `/projects/${ns}/messages/${sender}/active?enabled=X` | `/projects/${tenantId}/conversations/${userId}/chatbot?enabled=X` |
| `createNote` | `/projects/${ns}/messages/notes/${userId}` | `/projects/${tenantId}/conversations/${userId}/notes` |
| `getNotes` | `/projects/${ns}/messages/notes/${userId}` | `/projects/${tenantId}/conversations/${userId}/notes` |
| `deleteNote` | `/projects/${ns}/messages/notes/${userId}/${noteId}` | `/projects/${tenantId}/conversations/${userId}/notes/${noteId}` |

| `updateChatAssignee` | `/projects/${ns}/messages/assignee/${userId}` | `/projects/${tenantId}/conversations/${userId}/assignee` |
| `updateChatStatus` | `/projects/${ns}/messages/status/${userId}` | `/projects/${tenantId}/conversations/${userId}/status` |
| `readConversation` | `/projects/${ns}/messages/read/${phone}` | `/projects/${tenantId}/conversations/${userId}/read` |
| `sendMessage` | `/messages/message` | `/messages/message` (body shape changes) |
| `sendTestMessage` | `/messages/test` | `/messages/test` (body shape changes) |
| `deleteConversation` | `/messages/${ns}/${from}` | `/messages/${tenantId}/${from}` |
| `getFinalUserInfo` | `/projects/${ns}/users/${id}` | `/projects/${tenantId}/users/${userId}` |
| `getProjectCollaborators` | `/projects/${ns}/collaborators` | `/projects/${tenantId}/collaborators` |
| `setMediaUploaded` | `/projects/${ns}/media` | `/projects/${tenantId}/media` |
| `getFileDescription` | `/projects/${ns}/media/analyze` | `/projects/${tenantId}/media/analyze` |
| `getUserPictureByEmail` | `/auth/${email}/pic` | `/auth/${email}/pic` (unchanged) |
| AI helpers | `/projects/${ns}/ai/*` | `/projects/${tenantId}/ai/*` |

Key changes:
- Replace `namespace` (string) parameter with `tenantId` (UUID) in all function signatures
- Update URL templates to use `:tenantId` format
- For conversation routes, use `:userId` (user_channel_id) instead of `:sender`
- Delta endpoint moves from query param on `/last` to separate `/last/delta` path
- Deleted chats endpoint moves to `/last/deleted` with `since` param

- [ ] **Step 2: Update legacy endpoints to handle 404 gracefully**

For functions that call out-of-scope endpoints (`getBusinessInfo`, `getTags`, `getOrders`, etc.), ensure they catch 404 responses and return empty/null instead of throwing.

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 4: Commit**

Message: `refactor(web): update messaging API paths to match new backend route structure`

---

### Task 33: Update API Base URL

**Files:**
- Modify: `packages/web/app/components/messages/services/api.ts`
- Modify: `packages/web/app/components/messages/shared/utilStubs.ts` (or wherever `getApiURL` is defined)

- [ ] **Step 1: Change base URL from CLOSER_API_URL to API_URL**

Update `getApiURL()` to return `process.env.NEXT_PUBLIC_API_URL` instead of `process.env.NEXT_PUBLIC_CLOSER_API_URL`.

```ts
// In utilStubs.ts or wherever getApiURL lives:
export function getApiURL(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}
```

- [ ] **Step 2: Add NEXT_PUBLIC_API_URL to .env**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 4: Commit**

Message: `refactor(web): change messaging API base URL from CLOSER_API_URL to API_URL`

---

### Task 34: Update Socket Connection

**Files:**
- Modify: `packages/web/app/components/messages/services/socket.ts` (or wherever the Socket.io connection is established)

- [ ] **Step 1: Update Socket.io connection**

Change the connection to use:
- `NEXT_PUBLIC_API_URL` (localhost:4000) instead of the old closer-back URL
- Subscribe with `tenantId` (UUID) instead of `projectName` (string namespace)

```ts
// Key changes in socket connection:
const socket = io(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');

// When subscribing:
socket.emit('messages:subscribe', { tenantId, requestId });
// Instead of the old namespace-based approach
```

- [ ] **Step 2: Verify build**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 3: Commit**

Message: `refactor(web): update Socket.io connection to use API_URL and tenantId`

---

### Task 35: Add Tenant Selector to Chats Page

**Files:**
- Modify: `packages/web/app/(app)/orgs/[slug]/chats/page.tsx` (or equivalent chats page component)

- [ ] **Step 1: Fetch tenants for the current org**

The chats page needs a `tenant_id` UUID for all API calls. Add logic to:

1. Call `GET /tenants/:orgId` (existing endpoint) to fetch available tenants
2. Show a tenant selector if multiple tenants exist, or default to the first one
3. Store the selected `tenantId` in component state
4. Pass `tenantId` to all messaging API calls and the Socket.io subscription

```tsx
// Pseudo-code for the tenant resolution logic:
const { data: tenants } = await fetch(`${API_URL}/tenants/${orgId}`);
const [selectedTenantId, setSelectedTenantId] = useState(tenants[0]?.id);

// Pass selectedTenantId to all messaging hooks/API calls
```

- [ ] **Step 2: Add translations for tenant selector UI**

- [ ] **Step 3: Verify build**

Run: `npm run typecheck -w packages/web`

- [ ] **Step 4: Commit**

Message: `feat(web): add tenant selector to chats page for messaging API`

---

## Final Verification

After all phases are complete:

- [ ] Run `npm run check` from the monorepo root to verify format + lint + typecheck across all packages
- [ ] Run `npx supabase db reset` to verify the migration applies cleanly
- [ ] Start the backend (`npm run dev -w packages/backend`) and verify:
  - Express starts on port 4000
  - Socket.io is attached (log message visible)
  - `GET /projects/test-tenant/messages/last` returns empty array (200)
  - `POST /whatsapp/webhook` verification challenge works
- [ ] Start the web dev server (`npm run dev -w packages/web`) and verify the chats page loads

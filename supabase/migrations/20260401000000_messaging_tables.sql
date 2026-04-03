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

-- ============================================================================
-- Pending invitations: invite users who don't have an account yet
-- ============================================================================

-- 1. Create org_invitations table
-- ============================================================================

CREATE TABLE public.org_invitations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email      text NOT NULL,
  role       text NOT NULL CHECK (role IN ('admin', 'developer', 'agent')),
  invited_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE INDEX idx_org_invitations_email ON public.org_invitations(email);
CREATE INDEX idx_org_invitations_org_id ON public.org_invitations(org_id);

-- 2. RLS on org_invitations
-- ============================================================================

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read invitations"
  ON public.org_invitations FOR SELECT
  USING (public.is_org_member(org_id));

CREATE POLICY "Org owners can create invitations"
  ON public.org_invitations FOR INSERT
  WITH CHECK (public.is_org_owner(org_id));

CREATE POLICY "Org owners can delete invitations"
  ON public.org_invitations FOR DELETE
  USING (public.is_org_owner(org_id));

-- 3. Replace add_org_member_by_email to handle invitations + return status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_org_member_by_email(
  p_org_id uuid,
  p_email  text,
  p_role   text
)
RETURNS text  -- 'added' | 'invited' | 'already_member' | 'already_invited'
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id   uuid;
  v_is_member boolean;
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Only owners can add members';
  END IF;

  SELECT id INTO v_user_id FROM public.users WHERE email = p_email;

  IF v_user_id IS NOT NULL THEN
    -- User exists: check if already a member
    SELECT EXISTS(
      SELECT 1 FROM public.org_members
      WHERE org_id = p_org_id AND user_id = v_user_id
    ) INTO v_is_member;

    IF v_is_member THEN
      RETURN 'already_member';
    END IF;

    -- Add to org directly
    IF p_role = 'owner' THEN
      UPDATE public.org_members SET role = 'admin'
      WHERE org_id = p_org_id AND role = 'owner';

      INSERT INTO public.org_members (org_id, user_id, role)
      VALUES (p_org_id, v_user_id, 'owner');
    ELSE
      INSERT INTO public.org_members (org_id, user_id, role)
      VALUES (p_org_id, v_user_id, p_role);
    END IF;

    RETURN 'added';
  ELSE
    -- User doesn't exist: create pending invitation
    INSERT INTO public.org_invitations (org_id, email, role, invited_by)
    VALUES (p_org_id, p_email, p_role, (SELECT auth.uid()))
    ON CONFLICT (org_id, email) DO NOTHING;

    IF NOT FOUND THEN
      RETURN 'already_invited';
    END IF;

    RETURN 'invited';
  END IF;
END;
$$;

-- 4. RPC: list pending invitations for an org
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_org_invitations(p_org_id uuid)
RETURNS TABLE(
  id         uuid,
  email      text,
  role       text,
  invited_by uuid,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT i.id, i.email, i.role, i.invited_by, i.created_at
  FROM public.org_invitations i
  WHERE i.org_id = p_org_id
    AND public.is_org_member(p_org_id)
  ORDER BY i.created_at;
$$;

-- 5. RPC: cancel a pending invitation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_org_invitation(
  p_org_id        uuid,
  p_invitation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Only owners can cancel invitations';
  END IF;

  DELETE FROM public.org_invitations
  WHERE id = p_invitation_id AND org_id = p_org_id;
END;
$$;

-- 6. Trigger: when a user signs up, process any pending invitations
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_pending_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.org_members (org_id, user_id, role)
  SELECT i.org_id, new.id, i.role
  FROM public.org_invitations i
  WHERE i.email = new.email;

  DELETE FROM public.org_invitations
  WHERE email = new.email;

  RETURN new;
END;
$$;

CREATE TRIGGER on_user_created_process_invitations
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.process_pending_invitations();

-- ============================================================================
-- Team members: expand roles & add RPC functions for member management
-- ============================================================================

-- 1. Expand role constraint: owner | admin | developer | agent
-- ============================================================================

ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_role_check;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('owner', 'admin', 'developer', 'agent'));

-- Migrate legacy 'member' rows (if any) to 'developer'
UPDATE public.org_members SET role = 'developer' WHERE role = 'member';

-- 2. RPC: list members with user info (bypasses users-table RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_org_members(p_org_id uuid)
RETURNS TABLE(
  user_id   uuid,
  role      text,
  email     text,
  full_name text,
  joined_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT m.user_id, m.role, u.email, u.full_name, m.created_at
  FROM public.org_members m
  JOIN public.users u ON u.id = m.user_id
  WHERE m.org_id = p_org_id
    AND public.is_org_member(p_org_id)
  ORDER BY
    CASE m.role
      WHEN 'owner'     THEN 0
      WHEN 'admin'     THEN 1
      WHEN 'developer' THEN 2
      WHEN 'agent'     THEN 3
    END,
    m.created_at;
$$;

-- 3. RPC: invite a user by email
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_org_member_by_email(
  p_org_id uuid,
  p_email  text,
  p_role   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Only owners can add members';
  END IF;

  SELECT id INTO v_user_id FROM public.users WHERE email = p_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No account found for that email';
  END IF;

  IF p_role = 'owner' THEN
    -- Transfer ownership: demote current owner, promote new one
    UPDATE public.org_members SET role = 'admin'
    WHERE org_id = p_org_id AND role = 'owner';

    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (p_org_id, v_user_id, 'owner')
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
  ELSE
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (p_org_id, v_user_id, p_role)
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;

  RETURN v_user_id;
END;
$$;

-- 4. RPC: update a member's role (ownership transfer handled atomically)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_org_member_role(
  p_org_id  uuid,
  p_user_id uuid,
  p_role    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Only owners can change roles';
  END IF;

  IF p_role = 'owner' THEN
    -- Transfer ownership
    UPDATE public.org_members SET role = 'admin'
    WHERE org_id = p_org_id AND role = 'owner';

    UPDATE public.org_members SET role = 'owner'
    WHERE org_id = p_org_id AND user_id = p_user_id;
  ELSE
    -- Prevent owner from demoting themselves
    IF p_user_id = (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'Cannot change your own role';
    END IF;

    UPDATE public.org_members SET role = p_role
    WHERE org_id = p_org_id AND user_id = p_user_id;
  END IF;
END;
$$;

-- 5. RPC: remove a member (owner cannot remove themselves)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_org_member(
  p_org_id  uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Only owners can remove members';
  END IF;

  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;

  DELETE FROM public.org_members
  WHERE org_id = p_org_id AND user_id = p_user_id;
END;
$$;

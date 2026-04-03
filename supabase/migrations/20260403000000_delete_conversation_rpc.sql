CREATE OR REPLACE FUNCTION public.delete_conversation_with_tombstone(
  p_conversation_id uuid,
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.deleted_conversations (conversation_id, tenant_id)
  VALUES (p_conversation_id, p_tenant_id);

  DELETE FROM public.conversations WHERE id = p_conversation_id;
END;
$$;

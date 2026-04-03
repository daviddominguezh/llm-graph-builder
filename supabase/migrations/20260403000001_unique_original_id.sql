CREATE UNIQUE INDEX idx_messages_conversation_original_id
  ON public.messages(conversation_id, original_id)
  WHERE original_id IS NOT NULL;

CREATE UNIQUE INDEX idx_messages_ai_conversation_original_id
  ON public.messages_ai(conversation_id, original_id)
  WHERE original_id IS NOT NULL;

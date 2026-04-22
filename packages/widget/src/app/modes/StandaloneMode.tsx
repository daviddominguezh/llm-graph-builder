import { useAgent } from '../../app/agentContext.js';
import { StandaloneLayout } from '../../ui/standalone/StandaloneLayout.js';
import { useChatStream } from '../../ui/useChatStream.js';
import { useSessions } from '../../ui/useSessions.js';

export function StandaloneMode() {
  const agent = useAgent();
  const sessions = useSessions({ tenant: agent.tenant, agentSlug: agent.agentSlug });
  const chat = useChatStream({ agent, sessions });

  return <StandaloneLayout sessions={sessions} chat={chat} />;
}

import { useMemo } from 'react';

import { useAgent } from '../../app/agentContext.js';
import { StandaloneLayout } from '../../ui/standalone/StandaloneLayout.js';
import { useChatStream } from '../../ui/useChatStream.js';
import { useSessions } from '../../ui/useSessions.js';
import { useUser } from '../userContext.js';

export function StandaloneMode() {
  const agent = useAgent();
  const user = useUser();
  const sessions = useSessions({ tenant: agent.tenant, agentSlug: agent.agentSlug });
  const metadata = useMemo(
    () => (user === null ? undefined : { userName: user.displayName }),
    [user]
  );
  const chat = useChatStream({
    agent,
    sessions,
    userId: user?.userId,
    metadata,
  });

  return <StandaloneLayout sessions={sessions} chat={chat} />;
}

import { useAgent } from '../../app/agentContext.js';
import { useT } from '../../app/i18nContext.js';
import { ComposerInput } from './ComposerInput.js';
import { TopBar } from './TopBar.js';

export interface WelcomeViewProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  onOpenSidebar?: () => void;
}

function TenantAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  if (avatarUrl !== null && avatarUrl !== '') {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="size-10 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || '•';
  return (
    <div
      className="size-10 rounded-full bg-muted text-foreground text-sm font-semibold flex items-center justify-center ring-1 ring-border"
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function WelcomeView({ onSend, isStreaming, onOpenSidebar }: WelcomeViewProps) {
  const t = useT();
  const agent = useAgent();

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full min-h-0 bg-card dark:bg-background">
      <TopBar onOpenSidebar={onOpenSidebar} />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="relative w-full max-w-2xl">
          <div className="absolute bottom-full left-0 right-0 mb-10 flex flex-col items-center gap-3">
            <TenantAvatar avatarUrl={agent.tenantAvatarUrl} name={agent.tenantName} />
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t('welcomeGreeting', { tenant: agent.tenantName })}
              </h1>
              <p className="text-sm text-muted-foreground">{t('welcomeSubtitle')}</p>
            </div>
          </div>
          <ComposerInput variant="welcome" onSend={onSend} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
}

import { useT } from '../../app/i18nContext.js';
import { ComposerInput } from './ComposerInput.js';
import { TopBar } from './TopBar.js';

export interface WelcomeViewProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  onOpenSidebar?: () => void;
}

function WelcomeBrand() {
  return (
    <div className="flex items-center gap-2 justify-center">
      <img src="/favicon.png" alt="" className="h-8 w-auto" />
      <img src="/logo-black.png" alt="OpenFlow" className="h-5 mt-1 w-auto dark:hidden" />
      <img src="/logo-white.png" alt="OpenFlow" className="h-5 mt-1 w-auto hidden dark:block" />
    </div>
  );
}

export function WelcomeView({ onSend, isStreaming, onOpenSidebar }: WelcomeViewProps) {
  const t = useT();

  return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar onOpenSidebar={onOpenSidebar} />
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-2xl flex flex-col gap-8">
          <div className="flex flex-col items-center gap-3">
            <WelcomeBrand />
            <h1 className="font-display text-4xl tracking-tight">{t('welcomeTitle')}</h1>
          </div>
          <ComposerInput variant="welcome" onSend={onSend} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
}

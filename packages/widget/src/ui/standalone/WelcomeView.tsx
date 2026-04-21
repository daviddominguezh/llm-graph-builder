import { useT } from '../../app/i18nContext.js';
import { ComposerInput } from './ComposerInput.js';

export interface WelcomeViewProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
}

export function WelcomeView({ onSend, isStreaming }: WelcomeViewProps) {
  const t = useT();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div className="flex items-center gap-3 justify-center">
          <img src="/favicon.png" alt="" className="size-8" />
          <h1 className="text-3xl font-serif">{t('welcomeTitle')}</h1>
        </div>
        <ComposerInput variant="welcome" onSend={onSend} isStreaming={isStreaming} />
      </div>
    </div>
  );
}

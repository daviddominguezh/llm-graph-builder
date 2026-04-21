import { CopilotPanel } from '../../ui/CopilotPanel.js';

export function StandaloneMode() {
  return (
    <div className="w-full h-dvh flex justify-center bg-background">
      <div
        role="main"
        aria-labelledby="openflow-panel-title"
        className="w-full max-w-3xl h-full flex flex-col"
      >
        <CopilotPanel standalone />
      </div>
    </div>
  );
}

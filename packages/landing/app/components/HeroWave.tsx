'use client';

import { useCallback, useState } from 'react';
import { DEFAULT_WAVE_PARAMS, type WaveParams } from '../lib/waveControlsConfig';
import { FoldedSilkCanvas } from './FoldedSilkCanvas';
import { WaveControls } from './WaveControls';

// Holds the live wave parameters, wiring the tuning panel to the silk canvas.
export function HeroWave({ className }: { className: string }) {
  const [params, setParams] = useState<WaveParams>(DEFAULT_WAVE_PARAMS);

  const setParam = useCallback((id: string, value: number) => {
    setParams((prev) => ({ ...prev, [id]: value }));
  }, []);

  const reset = useCallback(() => setParams(DEFAULT_WAVE_PARAMS), []);

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(JSON.stringify(params, null, 2));
  }, [params]);

  return (
    <>
      <FoldedSilkCanvas variant="solid" className={className} params={params} />
      <WaveControls params={params} onChange={setParam} onReset={reset} onCopy={copy} />
    </>
  );
}

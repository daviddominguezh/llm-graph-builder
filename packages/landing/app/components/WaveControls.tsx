'use client';

import { useState } from 'react';
import { WAVE_CONTROL_GROUPS, type WaveControl, type WaveParams } from '../lib/waveControlsConfig';

function formatValue(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.001) return value.toExponential(1);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function ControlRow({
  control,
  value,
  onChange,
}: {
  control: WaveControl;
  value: number;
  onChange: (id: string, value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px] leading-4 text-white/70">
        <span className="truncate">{control.label}</span>
        <span className="ml-2 shrink-0 tabular-nums text-white/45">{formatValue(value)}</span>
      </span>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(event) => onChange(control.id, Number(event.target.value))}
        className="mt-1 h-1 w-full cursor-pointer accent-[#7c6cff]"
      />
    </label>
  );
}

function ControlGroup({
  title,
  controls,
  params,
  onChange,
}: {
  title: string;
  controls: WaveControl[];
  params: WaveParams;
  onChange: (id: string, value: number) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="text-[10px] font-semibold tracking-[0.08em] text-white/40 uppercase">{title}</div>
      {controls.map((control) => (
        <ControlRow
          key={control.id}
          control={control}
          value={params[control.id] ?? control.default}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function PanelHeader({ onCopy, onReset, onClose }: { onCopy: () => void; onReset: () => void; onClose: () => void }) {
  const btn = 'rounded px-2 py-0.5 text-[10px] text-white/70 transition-colors hover:bg-white/10 hover:text-white';
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
      <span className="text-[11px] font-semibold text-white">Wave controls</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onCopy} className={btn}>
          Copy
        </button>
        <button type="button" onClick={onReset} className={btn}>
          Reset
        </button>
        <button type="button" onClick={onClose} className={btn} aria-label="Collapse">
          –
        </button>
      </div>
    </div>
  );
}

type WaveControlsProps = {
  params: WaveParams;
  onChange: (id: string, value: number) => void;
  onReset: () => void;
  onCopy: () => void;
};

export function WaveControls({ params, onChange, onReset, onCopy }: WaveControlsProps) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-4 left-4 z-[60] rounded-lg border border-white/15 bg-black/80 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur transition-colors hover:text-white"
      >
        Wave controls
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 z-[60] flex max-h-[500px] w-[264px] flex-col overflow-hidden rounded-lg border border-white/12 bg-black/80 text-white shadow-2xl backdrop-blur">
      <PanelHeader onCopy={onCopy} onReset={onReset} onClose={() => setOpen(false)} />
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {WAVE_CONTROL_GROUPS.map((group) => (
          <ControlGroup
            key={group.title}
            title={group.title}
            controls={group.controls}
            params={params}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

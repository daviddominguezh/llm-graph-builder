'use client';

import { useState } from 'react';
import { WAVE_CONTROL_GROUPS, type WaveControl, type WaveParams } from '../lib/waveControlsConfig';

function formatValue(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.001) return value.toExponential(1);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, '');
}

// Keep only finite numeric entries from a parsed JSON blob.
function parseParams(text: string): WaveParams | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const out: WaveParams = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
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

const HEADER_BTN =
  'rounded px-1.5 py-0.5 text-[10px] text-white/70 transition-colors hover:bg-white/10 hover:text-white';

function PanelHeader({
  onCopy,
  onPaste,
  onReset,
  onClose,
}: {
  onCopy: () => void;
  onPaste: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
      <span className="text-[11px] font-semibold text-white">Wave controls</span>
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={onCopy} className={HEADER_BTN}>
          Copy
        </button>
        <button type="button" onClick={onPaste} className={HEADER_BTN}>
          Paste
        </button>
        <button type="button" onClick={onReset} className={HEADER_BTN}>
          Reset
        </button>
        <button type="button" onClick={onClose} className={HEADER_BTN} aria-label="Collapse">
          –
        </button>
      </div>
    </div>
  );
}

function PasteModal({ onApply, onClose }: { onApply: (params: WaveParams) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  const apply = () => {
    const parsed = parseParams(text);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    onApply(parsed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-[440px] max-w-full rounded-lg border border-white/12 bg-[#0d0d0d] p-4 text-white shadow-2xl">
        <div className="mb-2 text-[13px] font-semibold">Set wave from JSON</div>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setInvalid(false);
          }}
          placeholder={'{ "zoom": 1, "posX": 640, "rotZ": 1.874, … }'}
          className="h-52 w-full resize-none rounded border border-white/12 bg-black/50 p-2 font-mono text-[11px] text-white/80 outline-none focus:border-white/30"
        />
        {invalid ? (
          <div className="mt-1 text-[11px] text-red-400">Invalid JSON — expected an object of numbers.</div>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1 text-[12px] text-white/70 transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded bg-[#533afd] px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[#4430d4]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

type WaveControlsProps = {
  params: WaveParams;
  onChange: (id: string, value: number) => void;
  onReset: () => void;
  onCopy: () => void;
  onSetJson: (params: WaveParams) => void;
};

export function WaveControls({ params, onChange, onReset, onCopy, onSetJson }: WaveControlsProps) {
  const [open, setOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-23 left-59 z-[60] rounded-lg border border-white/15 bg-black/80 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur transition-colors hover:text-white"
      >
        Wave controls
      </button>
    );
  }

  return (
    <>
      <div className="absolute bottom-4 left-4 z-[60] flex max-h-[500px] w-[300px] flex-col overflow-hidden rounded-lg border border-white/12 bg-black/80 text-white shadow-2xl backdrop-blur">
        <PanelHeader
          onCopy={onCopy}
          onPaste={() => setPasteOpen(true)}
          onReset={onReset}
          onClose={() => setOpen(false)}
        />
        <div data-lenis-prevent className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
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
      {pasteOpen ? <PasteModal onApply={onSetJson} onClose={() => setPasteOpen(false)} /> : null}
    </>
  );
}

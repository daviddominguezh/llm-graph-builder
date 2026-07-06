import type { FoldedSilk } from './foldedSilk';

// Every live-tweakable parameter of the folded-silk 'solid' wave, grouped for
// the hero tuning panel. Defaults mirror the 'solid' VariantConfig in
// foldedSilk.ts. (Geometry — sheet size, subdivisions, fold half-width — is
// baked at build time and not live-adjustable, so it is intentionally absent.)

type Target =
  | { kind: 'uniform'; name: string }
  | { kind: 'mesh'; prop: 'position' | 'rotation' | 'scale'; axis: 0 | 1 | 2 }
  | { kind: 'grain' }
  | { kind: 'zoom' };

export type WaveControl = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  target: Target;
};

export type WaveControlGroup = { title: string; controls: WaveControl[] };

const u = (name: string): Target => ({ kind: 'uniform', name });
const m = (prop: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2): Target => ({ kind: 'mesh', prop, axis });
const grain: Target = { kind: 'grain' };
const zoom: Target = { kind: 'zoom' };

const c = (id: string, label: string, min: number, max: number, step: number, def: number, target: Target): WaveControl => ({ id, label, min, max, step, default: def, target });

const PI = Math.PI;

export const WAVE_CONTROL_GROUPS: WaveControlGroup[] = [
  {
    title: 'Transform',
    controls: [
      c('zoom', 'Zoom', 0.1, 5, 0.01, 1.18, zoom),
      c('posX', 'Position X', -2000, 2000, 1, 640, m('position', 0)),
      c('posY', 'Position Y', -2000, 2000, 1, -301.7, m('position', 1)),
      c('posZ', 'Position Z', -2000, 2000, 1, -11.1, m('position', 2)),
      c('rotX', 'Rotation X', -PI, PI, 0.001, -0.4496, m('rotation', 0)),
      c('rotY', 'Rotation Y', -PI, PI, 0.001, -0.1176, m('rotation', 1)),
      c('rotZ', 'Rotation Z', -PI, PI, 0.001, 1.8744, m('rotation', 2)),
      c('sclX', 'Scale X', 0, 25, 0.1, 9, m('scale', 0)),
      c('sclY', 'Scale Y', 0, 25, 0.1, 8, m('scale', 1)),
      c('sclZ', 'Scale Z', 0, 25, 0.1, 5, m('scale', 2)),
    ],
  },
  {
    title: 'Fold displacement',
    controls: [
      c('dispFreqX', 'Frequency X', 0, 0.05, 0.0001, 0.0031, u('u_displaceFrequencyX')),
      c('dispFreqZ', 'Frequency Z', 0, 0.05, 0.0001, 0.0026, u('u_displaceFrequencyZ')),
      c('dispAmount', 'Amount', -20, 20, 0.01, -20, u('u_displaceAmount')),
    ],
  },
  {
    title: 'Twist',
    controls: [
      c('twFreqX', 'Frequency X', -2, 2, 0.001, -0.65, u('u_twistFrequencyX')),
      c('twFreqY', 'Frequency Y', -2, 2, 0.001, 0.41, u('u_twistFrequencyY')),
      c('twFreqZ', 'Frequency Z', -2, 2, 0.001, -0.58, u('u_twistFrequencyZ')),
      c('twPowX', 'Power X', 0, 10, 0.01, 4.7, u('u_twistPowerX')),
      c('twPowY', 'Power Y', 0, 10, 0.01, 0.7, u('u_twistPowerY')),
      c('twPowZ', 'Power Z', 0, 10, 0.01, 4.29, u('u_twistPowerZ')),
    ],
  },
  {
    title: 'Color',
    controls: [
      c('contrast', 'Contrast', 0, 3, 0.01, 0.7, u('u_colorContrast')),
      c('saturation', 'Saturation', 0, 3, 0.01, 0, u('u_colorSaturation')),
      c('hueShift', 'Hue shift', -1, 1, 0.001, -1, u('u_colorHueShift')),
    ],
  },
  {
    title: 'Motion & grain',
    controls: [
      c('speed', 'Speed', 0, 0.0002, 0.000001, 0.000038, u('u_speed')),
      c('grain', 'Grain', 0, 3, 0.01, 3, grain),
    ],
  },
  {
    title: 'Fold glow',
    controls: [
      c('glowAmount', 'Amount', 0, 5, 0.01, 0, u('u_glowAmount')),
      c('glowPower', 'Power', 0, 3, 0.001, 0, u('u_glowPower')),
      c('glowRamp', 'Ramp', 0, 2, 0.001, 0, u('u_glowRamp')),
    ],
  },
  {
    title: 'Fibers',
    controls: [
      c('fiberStrength', 'Strength', 0, 2, 0.01, 2, u('u_fiberStrength')),
      c('fiberFrequency', 'Frequency', 0, 2000, 1, 38, u('u_fiberFrequency')),
      c('fiberAtten', 'Color atten.', 0, 2, 0.01, 2, u('u_fiberColorAttenuation')),
      c('fiberParabola', 'Parabola power', 0, 10, 0.1, 10, u('u_fiberParabolaPower')),
    ],
  },
];

export type WaveParams = Record<string, number>;

export const DEFAULT_WAVE_PARAMS: WaveParams = Object.fromEntries(
  WAVE_CONTROL_GROUPS.flatMap((group) => group.controls.map((control) => [control.id, control.default]))
);

// Push a full params set onto a live silk instance via its setters.
export function applyWaveParams(silk: FoldedSilk, params: WaveParams): void {
  for (const group of WAVE_CONTROL_GROUPS) {
    for (const control of group.controls) {
      const value = params[control.id];
      if (value === undefined) continue;
      const t = control.target;
      if (t.kind === 'uniform') silk.setUniform(t.name, value);
      else if (t.kind === 'grain') silk.setGrain(value);
      else if (t.kind === 'zoom') silk.setZoom(value);
      else silk.setMesh(t.prop, t.axis, value);
    }
  }
}

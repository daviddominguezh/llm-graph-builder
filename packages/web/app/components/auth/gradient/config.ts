import type { GradientConfig } from './types';

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

export const DARK_CONFIG: GradientConfig = {
  baseColor: hexToRgb('#1a0533'),
  waveLayers: [
    {
      color: hexToRgb('#7c3aed'),
      noiseFreq: [3, 2.5],
      noiseSpeed: 0.7,
      noiseFlow: 0.6,
      noiseSeed: 2,
      noiseFloor: 0.1,
      noiseCeil: 0.63,
    },
    {
      color: hexToRgb('#5b21b6'),
      noiseFreq: [2, 3.5],
      noiseSpeed: 0.4,
      noiseFlow: 0.5,
      noiseSeed: 5,
      noiseFloor: 0.1,
      noiseCeil: 0.55,
    },
    {
      color: hexToRgb('#a78bfa'),
      noiseFreq: [1.5, 3],
      noiseSpeed: 0.3,
      noiseFlow: 0.4,
      noiseSeed: 8,
      noiseFloor: 0.15,
      noiseCeil: 0.45,
    },
  ],
  speed: 0.4,
  noiseFreq: 4,
  noiseSpeed: 5,
  darkenTop: true,
};

export const LIGHT_CONFIG: GradientConfig = {
  baseColor: hexToRgb('#f5f3ff'),
  waveLayers: [
    {
      color: hexToRgb('#c4b5fd'),
      noiseFreq: [3, 2.5],
      noiseSpeed: 0.7,
      noiseFlow: 0.6,
      noiseSeed: 2,
      noiseFloor: 0.1,
      noiseCeil: 0.63,
    },
    {
      color: hexToRgb('#a78bfa'),
      noiseFreq: [2, 3.5],
      noiseSpeed: 0.4,
      noiseFlow: 0.5,
      noiseSeed: 5,
      noiseFloor: 0.1,
      noiseCeil: 0.55,
    },
    {
      color: hexToRgb('#ddd6fe'),
      noiseFreq: [1.5, 3],
      noiseSpeed: 0.3,
      noiseFlow: 0.4,
      noiseSeed: 8,
      noiseFloor: 0.15,
      noiseCeil: 0.45,
    },
  ],
  speed: 0.4,
  noiseFreq: 4,
  noiseSpeed: 5,
  darkenTop: false,
};

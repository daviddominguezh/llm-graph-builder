export interface WaveLayer {
  readonly color: readonly [number, number, number];
  readonly noiseFreq: readonly [number, number];
  readonly noiseSpeed: number;
  readonly noiseFlow: number;
  readonly noiseSeed: number;
  readonly noiseFloor: number;
  readonly noiseCeil: number;
}

export interface GradientConfig {
  readonly baseColor: readonly [number, number, number];
  readonly waveLayers: readonly [WaveLayer, WaveLayer, WaveLayer];
  readonly speed: number;
  readonly noiseFreq: number;
  readonly noiseSpeed: number;
  readonly darkenTop: boolean;
}

export interface GradientHandle {
  destroy: () => void;
}

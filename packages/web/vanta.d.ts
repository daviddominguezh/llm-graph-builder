declare module 'vanta/dist/vanta.rings.min' {
  export interface VantaEffect {
    destroy: () => void;
    restart: () => void;
    colors: number[];
    genRing: (
      color: number,
      radius: number,
      width: number,
      startAngle?: number,
      arcAngle?: number,
      yPosition?: number,
      speed?: number
    ) => void;
  }

  interface VantaRingsOptions {
    el: HTMLElement;
    THREE: typeof import('three');
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    scale?: number;
    scaleMobile?: number;
    backgroundColor?: number;
    color?: number;
  }

  export default function RINGS(options: VantaRingsOptions): VantaEffect;
}

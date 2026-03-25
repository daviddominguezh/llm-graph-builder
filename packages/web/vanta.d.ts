declare module 'vanta/dist/vanta.rings.min' {
  export interface VantaEffect {
    destroy: () => void;
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

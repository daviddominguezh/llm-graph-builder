'use client';

import type { CSSProperties, ReactNode } from 'react';

type GlassVariant = 'background' | 'foreground';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  variant?: GlassVariant;
  style?: CSSProperties;
}

export function GlassPanel({ children, className, variant = 'background', style }: GlassPanelProps) {
  return (
    <div className={`relative glass-panel glass-panel--${variant} ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}

export function GlassFilters() {
  return (
    <svg className="hidden" aria-hidden="true">
      <filter id="glass-bg" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.02" numOctaves="3" seed="92" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="0.02" result="blur" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="blur"
          scale="20"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
      <filter id="glass-fg" primitiveUnits="objectBoundingBox">
        <feImage href="/glass-fg-map.png" x="0" y="0" width="1" height="1" result="map" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.02" result="blur" />
        <feDisplacementMap in="blur" in2="map" scale="1" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

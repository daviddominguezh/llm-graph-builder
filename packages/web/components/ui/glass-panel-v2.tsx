'use client';

import { Filter } from '@/components/glass-v2/Filter';
import {
  CONCAVE,
  CONVEX,
  CONVEX_CIRCLE,
  LIP,
  type SurfaceFnDef,
} from '@/components/glass-v2/lib/surfaceEquations';
import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type GlassPanelV2Surface = 'convex' | 'convex_circle' | 'concave' | 'lip';

const SURFACES: Record<GlassPanelV2Surface, SurfaceFnDef> = {
  convex: CONVEX,
  convex_circle: CONVEX_CIRCLE,
  concave: CONCAVE,
  lip: LIP,
};

interface GlassPanelV2Props {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  radius?: number;
  blur?: number;
  glassThickness?: number;
  bezelWidth?: number;
  refractiveIndex?: number;
  specularOpacity?: number;
  specularSaturation?: number;
  surface?: GlassPanelV2Surface;
  background?: string;
  shadow?: string;
}

type Size = { width: number; height: number };

function useElementSize(ref: React.RefObject<HTMLDivElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

export function GlassPanelV2({
  children,
  className,
  style,
  radius = 24,
  blur = 1,
  glassThickness = 50,
  bezelWidth = 24,
  refractiveIndex = 1.5,
  specularOpacity = 0.3,
  specularSaturation = 4,
  surface = 'convex',
  background = 'rgba(255, 255, 255, 0.12)',
  shadow = '0 4px 16px rgba(0, 0, 0, 0.16)',
}: GlassPanelV2Props) {
  const reactId = useId();
  const filterId = `glass-panel-v2-${reactId.replace(/[:]/g, '')}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width, height } = useElementSize(containerRef);
  const ready = width > 0 && height > 0;

  const containerStyle: CSSProperties = {
    position: 'relative',
    borderRadius: radius,
    isolation: 'isolate',
    ...style,
  };

  const glassStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    backdropFilter: ready ? `url(#${filterId})` : undefined,
    WebkitBackdropFilter: ready ? `url(#${filterId})` : undefined,
    backgroundColor: background,
    boxShadow: shadow,
    pointerEvents: 'none',
    transform: 'translateZ(0)',
    zIndex: 0,
  };

  const contentStyle: CSSProperties = {
    position: 'relative',
    borderRadius: 'inherit',
    zIndex: 1,
  };

  return (
    <div ref={containerRef} className={`glass-panel-v2 ${className ?? ''}`.trim()} style={containerStyle}>
      {ready ? (
        <Filter
          id={filterId}
          width={width}
          height={height}
          radius={Math.min(radius, Math.min(width, height) / 2)}
          blur={blur}
          glassThickness={glassThickness}
          bezelWidth={Math.min(bezelWidth, Math.min(width, height) / 2)}
          refractiveIndex={refractiveIndex}
          specularOpacity={specularOpacity}
          specularSaturation={specularSaturation}
          bezelHeightFn={SURFACES[surface].fn}
        />
      ) : null}
      <div style={glassStyle} aria-hidden="true" />
      <div style={contentStyle}>{children}</div>
    </div>
  );
}

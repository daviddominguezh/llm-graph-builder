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
  /** When omitted, the panel uses a theme-aware tint (white/0.6 light, #222222/0.6 dark) */
  background?: string;
  shadow?: string;
}

interface Size {
  width: number;
  height: number;
}

type StyleWithVars = CSSProperties & { [key: `--${string}`]: string | number };

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
  glassThickness = 70,
  bezelWidth = 27,
  refractiveIndex = 1.5,
  specularOpacity = 0.2,
  specularSaturation = 4,
  surface = 'convex',
  background,
  shadow = '0 4px 16px rgba(0, 0, 0, 0.16)',
}: GlassPanelV2Props) {
  const reactId = useId();
  const filterId = `glass-panel-v2-${reactId.replace(/[:]/g, '')}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width, height } = useElementSize(containerRef);
  const ready = width > 0 && height > 0;

  console.log('[GlassPanelV2] render', { filterId, width, height, ready });

  useEffect(() => {
    console.log('[GlassPanelV2] mount', filterId);
    return () => console.log('[GlassPanelV2] unmount', filterId);
  }, [filterId]);

  const containerStyle: StyleWithVars = {
    borderRadius: radius,
    '--glass-v2-shadow': shadow,
    '--glass-v2-filter': ready ? `url(#${filterId})` : 'none',
    ...(background !== undefined ? { '--glass-v2-bg': background } : {}),
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={`glass-panel-v2 ${className ?? ''}`.trim()}
      style={containerStyle}
    >
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
      {children}
    </div>
  );
}

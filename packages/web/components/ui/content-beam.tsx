'use client';

import { cn } from '@/lib/utils';
import { motion, type MotionStyle, type Transition } from 'motion/react';
import { type ReactNode } from 'react';

interface ContentBeamProps {
  children: ReactNode;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  className?: string;
  transition?: Transition;
}

export function ContentBeam({
  children,
  duration = 4,
  delay = 0,
  colorFrom = '#ffaa40',
  colorTo = '#9c40ff',
  className,
  transition,
}: ContentBeamProps) {
  const mask = 'linear-gradient(90deg, transparent 40%, black 46%, black 54%, transparent 60%)';

  return (
    <span className={cn('relative inline-flex items-center gap-1', className)}>
      {children}
      <motion.span
        className="pointer-events-none absolute inset-0 inline-flex items-center gap-1"
        aria-hidden="true"
        style={
          {
            color: colorFrom,
            WebkitTextFillColor: 'transparent',
            backgroundImage: `linear-gradient(90deg, ${colorFrom}, ${colorTo})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            maskImage: mask,
            maskSize: '300% 100%',
          } as MotionStyle
        }
        animate={{ maskPosition: ['100% center', '0% center'] }}
        transition={{
          repeat: Infinity,
          ease: 'linear',
          duration,
          delay: -delay,
          ...transition,
        }}
      >
        {children}
      </motion.span>
    </span>
  );
}

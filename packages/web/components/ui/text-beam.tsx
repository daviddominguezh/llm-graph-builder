'use client';

import { cn } from '@/lib/utils';
import { motion, type Transition } from 'motion/react';
import { type ReactNode } from 'react';

interface TextBeamProps {
  children: ReactNode;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  baseColor?: string;
  className?: string;
  transition?: Transition;
}

export function TextBeam({
  children,
  duration = 4,
  delay = 0,
  colorFrom = '#ffaa40',
  colorTo = '#9c40ff',
  baseColor = 'var(--muted-foreground)',
  className,
  transition,
}: TextBeamProps) {
  const gradient = [
    `${baseColor} 0%`,
    `${baseColor} 40%`,
    `${colorFrom} 46%`,
    `${colorTo} 54%`,
    `${baseColor} 60%`,
    `${baseColor} 100%`,
  ].join(', ');

  return (
    <motion.span
      className={cn('inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage: `linear-gradient(90deg, ${gradient})`,
        backgroundSize: '300% 100%',
      }}
      animate={{ backgroundPosition: ['100% center', '0% center'] }}
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
  );
}

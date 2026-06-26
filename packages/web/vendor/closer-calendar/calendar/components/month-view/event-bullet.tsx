import { cva } from "class-variance-authority";

import { cn } from "@cc/lib/utils";

import type { TEventColor } from "@cc/calendar/types";

const eventBulletVariants = cva("twcal:size-2 twcal:rounded-full", {
  variants: {
    color: {
      blue: "twcal:bg-blue-600 dark:twcal:bg-blue-500",
      green: "twcal:bg-green-600 dark:twcal:bg-green-500",
      red: "twcal:bg-red-600 dark:twcal:bg-red-500",
      yellow: "twcal:bg-yellow-600 dark:twcal:bg-yellow-500",
      purple: "twcal:bg-purple-600 dark:twcal:bg-purple-500",
      gray: "twcal:bg-neutral-600 dark:twcal:bg-neutral-500",
      orange: "twcal:bg-orange-600 dark:twcal:bg-orange-500",
    },
  },
  defaultVariants: {
    color: "blue",
  },
});

export function EventBullet({ color, className }: { color: TEventColor; className: string }) {
  return <div className={cn(eventBulletVariants({ color, className }))} />;
}

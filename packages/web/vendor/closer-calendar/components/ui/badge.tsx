import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@cc/lib/utils";

const badgeVariants = cva(
  "twcal:inline-flex twcal:items-center twcal:rounded-md twcal:border twcal:px-2.5 twcal:py-0.5 twcal:text-xs twcal:font-semibold twcal:transition-colors twcal:focus:outline-none twcal:focus:ring-2 twcal:focus:ring-ring twcal:focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "twcal:border-transparent twcal:bg-primary twcal:text-primary-foreground twcal:shadow twcal:hover:bg-primary/80",
        secondary: "twcal:border-transparent twcal:bg-secondary twcal:text-secondary-foreground twcal:hover:bg-secondary/80",
        destructive: "twcal:border-transparent twcal:bg-destructive twcal:text-destructive-foreground twcal:shadow twcal:hover:bg-destructive/80",
        outline: "twcal:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

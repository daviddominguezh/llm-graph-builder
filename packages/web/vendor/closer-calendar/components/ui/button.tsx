import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@cc/lib/utils";

const buttonVariants = cva(
  "twcal:inline-flex twcal:items-center twcal:justify-center twcal:gap-2 twcal:whitespace-nowrap twcal:rounded-md twcal:text-sm twcal:font-medium twcal:transition-colors twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring twcal:disabled:pointer-events-none twcal:disabled:opacity-50 twcal:[&_svg]:pointer-events-none twcal:[&_svg]:size-4 twcal:[&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "twcal:cursor-pointer twcal:bg-primary twcal:text-primary-foreground twcal:shadow twcal:hover:bg-primary/90",
        destructive: "twcal:cursor-pointer twcal:bg-destructive twcal:text-destructive-foreground twcal:shadow-sm twcal:hover:bg-destructive/90",
        outline: "twcal:cursor-pointer twcal:border twcal:border-input twcal:bg-background twcal:shadow-sm twcal:hover:bg-accent twcal:hover:text-accent-foreground",
        secondary: "twcal:cursor-pointer twcal:bg-secondary twcal:text-secondary-foreground twcal:shadow-sm twcal:hover:bg-secondary/80",
        ghost: "twcal:cursor-pointer twcal:hover:bg-accent twcal:hover:text-accent-foreground",
        link: "twcal:cursor-pointer twcal:text-primary twcal:underline-offset-4 twcal:hover:underline",
      },
      size: {
        default: "twcal:h-9 twcal:px-4 twcal:py-2",
        sm: "twcal:h-8 twcal:rounded-md twcal:px-3 twcal:text-xs",
        lg: "twcal:h-10 twcal:rounded-md twcal:px-8",
        icon: "twcal:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };

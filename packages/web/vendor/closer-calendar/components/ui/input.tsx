import * as React from "react";

import { cn } from "@cc/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "twcal:flex twcal:h-9 twcal:w-full twcal:rounded-md twcal:border twcal:border-input twcal:bg-transparent twcal:px-3 twcal:py-1 twcal:text-base twcal:shadow-sm twcal:transition-colors twcal:file:border-0 twcal:file:bg-transparent twcal:file:text-sm twcal:file:font-medium twcal:file:text-foreground twcal:placeholder:text-muted-foreground twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring twcal:disabled:cursor-not-allowed twcal:disabled:opacity-50 twcal:md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };

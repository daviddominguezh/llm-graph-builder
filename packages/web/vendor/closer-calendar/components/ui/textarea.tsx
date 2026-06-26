import * as React from "react";

import { cn } from "@cc/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "twcal:flex twcal:min-h-[60px] twcal:w-full twcal:rounded-md twcal:border twcal:border-input twcal:bg-transparent twcal:px-3 twcal:py-2 twcal:text-base twcal:shadow-sm twcal:placeholder:text-muted-foreground twcal:focus-visible:outline-none twcal:focus-visible:ring-1 twcal:focus-visible:ring-ring twcal:disabled:cursor-not-allowed twcal:disabled:opacity-50 twcal:md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };

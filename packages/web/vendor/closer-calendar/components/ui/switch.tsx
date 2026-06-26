"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@cc/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "twcal:peer twcal:inline-flex twcal:h-5 twcal:w-9 twcal:shrink-0 twcal:cursor-pointer twcal:items-center twcal:rounded-full twcal:border-2 twcal:border-transparent twcal:shadow-sm twcal:transition-colors twcal:focus-visible:outline-none twcal:focus-visible:ring-2 twcal:focus-visible:ring-ring twcal:focus-visible:ring-offset-2 twcal:focus-visible:ring-offset-background twcal:disabled:cursor-not-allowed twcal:disabled:opacity-50 twcal:data-[state=checked]:bg-primary twcal:data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "twcal:pointer-events-none twcal:block twcal:h-4 twcal:w-4 twcal:rounded-full twcal:bg-background twcal:shadow-lg twcal:ring-0 twcal:transition-transform twcal:data-[state=checked]:translate-x-4 twcal:data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }

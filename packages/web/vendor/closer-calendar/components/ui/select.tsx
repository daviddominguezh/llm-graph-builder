"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@cc/lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "twcal:flex twcal:h-9 twcal:w-full twcal:items-center twcal:justify-between twcal:whitespace-nowrap twcal:rounded-md twcal:border twcal:border-input twcal:bg-transparent twcal:px-3 twcal:py-2 twcal:text-sm twcal:shadow-sm twcal:ring-offset-background twcal:focus:outline-none twcal:focus:ring-1 twcal:focus:ring-ring twcal:disabled:cursor-not-allowed twcal:disabled:opacity-50 twcal:data-[placeholder]:text-muted-foreground twcal:[&>span]:line-clamp-1",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="twcal:size-4 twcal:opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton ref={ref} className={cn("twcal:flex twcal:cursor-default twcal:items-center twcal:justify-center twcal:py-1", className)} {...props}>
    <ChevronUp className="twcal:size-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton ref={ref} className={cn("twcal:flex twcal:cursor-default twcal:items-center twcal:justify-center twcal:py-1", className)} {...props}>
    <ChevronDown className="twcal:size-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(
  ({ className, children, position = "popper", ...props }, ref) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "twcal:relative twcal:z-50 twcal:max-h-[--radix-select-content-available-height] twcal:min-w-[8rem] twcal:origin-[--radix-select-content-transform-origin] twcal:overflow-y-auto twcal:overflow-x-hidden twcal:rounded-md twcal:border twcal:bg-popover twcal:text-popover-foreground twcal:shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "twcal:data-[side=bottom]:translate-y-1 twcal:data-[side=left]:-translate-x-1 twcal:data-[side=right]:translate-x-1 twcal:data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn("twcal:p-1", position === "popper" && "twcal:h-[var(--radix-select-trigger-height)] twcal:w-full twcal:min-w-[var(--radix-select-trigger-width)]")}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Label>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>>(
  ({ className, ...props }, ref) => <SelectPrimitive.Label ref={ref} className={cn("twcal:px-2 twcal:py-1.5 twcal:text-sm twcal:font-semibold", className)} {...props} />
);
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "twcal:relative twcal:flex twcal:w-full twcal:cursor-default twcal:select-none twcal:items-center twcal:rounded-sm twcal:py-1.5 twcal:pl-2 twcal:pr-8 twcal:text-sm twcal:outline-none twcal:focus:bg-accent twcal:focus:text-accent-foreground twcal:data-[disabled]:pointer-events-none twcal:data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="twcal:absolute twcal:right-2 twcal:flex twcal:size-3.5 twcal:items-center twcal:justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="twcal:size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
);
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>>(
  ({ className, ...props }, ref) => <SelectPrimitive.Separator ref={ref} className={cn("twcal:-mx-1 twcal:my-1 twcal:h-px twcal:bg-muted", className)} {...props} />
);
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};

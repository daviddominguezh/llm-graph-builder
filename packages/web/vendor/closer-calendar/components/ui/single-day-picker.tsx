import { format } from "date-fns";

import { useDisclosure } from "@cc/hooks/use-disclosure";

import { Button } from "@cc/components/ui/button";
import { SingleCalendar } from "@cc/components/ui/single-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@cc/components/ui/popover";

import { cn } from "@cc/lib/utils";

import type { ButtonHTMLAttributes } from "react";

// ================================== //

type TProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect" | "value"> & {
  onSelect: (value: Date | undefined) => void;
  value?: Date | undefined;
  placeholder: string;
  labelVariant?: "P" | "PP" | "PPP";
};

function SingleDayPicker({ id, onSelect, className, placeholder, labelVariant = "PPP", value, ...props }: TProps) {
  const { isOpen, onClose, onToggle } = useDisclosure();

  const handleSelect = (date: Date | undefined) => {
    onSelect(date);
    onClose();
  };

  return (
    <Popover open={isOpen} onOpenChange={onToggle} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn("twcal:group twcal:relative twcal:h-9 twcal:w-full twcal:justify-start twcal:whitespace-nowrap twcal:px-3 twcal:py-2 twcal:font-normal twcal:hover:bg-inherit", className)}
          {...props}
        >
          {value && <span>{format(value, labelVariant)}</span>}
          {!value && <span className="twcal:text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="center" className="twcal:w-fit twcal:p-0">
        <SingleCalendar mode="single" selected={value} onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}

// ================================== //

export { SingleDayPicker };

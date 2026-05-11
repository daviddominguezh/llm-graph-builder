import { forwardRef } from "react";
import { DateInput, DateSegment, TimeField } from "react-aria-components";

import { cn } from "@cc/lib/utils";

import type { TimeFieldProps, TimeValue } from "react-aria-components";

// ================================== //

type TTimeInputRef = HTMLDivElement;
type TTimeInputProps = Omit<TimeFieldProps<TimeValue>, "isDisabled" | "isInvalid"> & {
  readonly dateInputClassName?: string;
  readonly segmentClassName?: string;
  readonly disabled?: boolean;
  readonly "data-invalid"?: boolean;
};

const TimeInput = forwardRef<TTimeInputRef, TTimeInputProps>(
  ({ className, dateInputClassName, segmentClassName, disabled, "data-invalid": dataInvalid, ...props }, ref) => {
    return (
      <TimeField
        ref={ref}
        className={cn("twcal:relative", className)}
        isDisabled={disabled}
        isInvalid={dataInvalid}
        {...props}
        aria-label="Time"
        shouldForceLeadingZeros
      >
        <DateInput
          className={cn(
            "twcal:peer twcal:inline-flex twcal:h-9 twcal:w-full twcal:items-center twcal:overflow-hidden twcal:whitespace-nowrap twcal:rounded-md twcal:border twcal:bg-background twcal:px-3 twcal:py-2 twcal:text-sm twcal:shadow-black",
            "data-[focus-within]:twcal:outline-none data-[focus-within]:twcal:ring-1 data-[focus-within]:twcal:ring-ring",
            "data-[disabled]:twcal:cursor-not-allowed data-[disabled]:twcal:opacity-50",
            dateInputClassName
          )}
        >
          {segment => (
            <DateSegment
              segment={segment}
              className={cn(
                "twcal:inline twcal:rounded twcal:p-0.5 twcal:caret-transparent twcal:outline twcal:outline-0",
                "data-[focused]:twcal:bg-foreground/10 data-[focused]:twcal:text-foreground",
                "data-[placeholder]:twcal:text-muted-foreground",
                "data-[disabled]:twcal:cursor-not-allowed data-[disabled]:twcal:opacity-50",
                segmentClassName
              )}
            />
          )}
        </DateInput>
      </TimeField>
    );
  }
);

TimeInput.displayName = "TimeInput";

// ================================== //

export { TimeInput };

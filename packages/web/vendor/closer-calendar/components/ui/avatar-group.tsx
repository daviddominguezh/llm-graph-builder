import { cloneElement, Children, forwardRef, useMemo } from "react";

import { cn } from "@cc/lib/utils";

import type { ElementRef, HTMLAttributes, ReactElement, CSSProperties } from "react";

// ================================== //

type TAvatarGroupRef = ElementRef<"div">;
type TAvatarGroupProps = HTMLAttributes<HTMLDivElement> & { max?: number; spacing?: number };

const AvatarGroup = forwardRef<TAvatarGroupRef, TAvatarGroupProps>(({ className, children, max = 1, spacing = 10, ...props }, ref) => {
  const avatarItems = Children.toArray(children) as ReactElement<{ className?: string; style?: CSSProperties }>[];

  const renderContent = useMemo(() => {
    return (
      <>
        {avatarItems.slice(0, max).map((child, index) => {
          return cloneElement(child, {
            className: cn(child.props?.className, "twcal:border-2 twcal:border-background"),
            style: { marginLeft: index === 0 ? 0 : -spacing, ...child.props?.style },
          });
        })}

        {avatarItems.length > max && (
          <div
            className={cn("twcal:relative twcal:flex twcal:items-center twcal:justify-center twcal:rounded-full twcal:border-2 twcal:border-background twcal:bg-muted", avatarItems[0]?.props?.className)}
            style={{ marginLeft: -spacing }}
          >
            <p>+{avatarItems.length - max}</p>
          </div>
        )}
      </>
    );
  }, [avatarItems, max, spacing]);

  return (
    <div ref={ref} className={cn("twcal:relative twcal:flex", className)} {...props}>
      {renderContent}
    </div>
  );
});

AvatarGroup.displayName = "AvatarGroup";

// ================================== //

export { AvatarGroup };

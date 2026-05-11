import { cn } from "@cc/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("twcal:animate-pulse twcal:rounded-md twcal:bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }

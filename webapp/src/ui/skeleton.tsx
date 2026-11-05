import { cn } from "@/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

function PageSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-full max-w-sm flex-col gap-3", className)}
      {...props}
    >
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-3/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

export { Skeleton, PageSkeleton }

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Dialog({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4",
        className,
      )}
      {...props}
    />
  );
}
export function DialogContent({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      role="dialog"
      aria-modal="true"
      className={cn(
        "max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl",
        className,
      )}
      {...props}
    />
  );
}

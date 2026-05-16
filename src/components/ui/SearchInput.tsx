import { cn } from "@/lib/cn";
import { forwardRef } from "react";

export const SearchInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function SearchInput(props, ref) {
  const { className, ...rest } = props;
  return (
    <input
      ref={ref}
      type="search"
      className={cn(
        "focus-ring min-h-touch w-full rounded-xl border border-border bg-surface-muted px-4 py-3 text-base text-foreground outline-none placeholder:text-foreground-muted",
        className,
      )}
      {...rest}
    />
  );
});

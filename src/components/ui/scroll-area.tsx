"use client";

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as React from "react";

import { cn } from "@/src/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    viewportClassName?: string;
  }
>(({ className, children, viewportClassName, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    className={cn("relative overflow-hidden", className)}
    ref={ref}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      className={cn(
        "h-full w-full rounded-[inherit] [overscroll-behavior-y:contain] [-webkit-overflow-scrolling:touch]",
        viewportClassName,
      )}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar
      className="flex touch-none select-none p-1 transition-colors data-[orientation=vertical]:h-full data-[orientation=vertical]:w-3 data-[orientation=horizontal]:h-3 data-[orientation=horizontal]:flex-col"
      orientation="vertical"
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-[var(--panel-border-strong)]" />
    </ScrollAreaPrimitive.Scrollbar>
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export { ScrollArea };

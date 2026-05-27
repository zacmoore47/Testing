import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-zinc-800 text-zinc-100",
        blue: "bg-blue-500/20 text-blue-400 border border-blue-400/30",
        green: "bg-green-500/20 text-green-400 border border-green-400/30",
        yellow: "bg-yellow-500/20 text-yellow-400 border border-yellow-400/30",
        red: "bg-red-500/20 text-red-400 border border-red-400/30",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-xl text-sm font-black transition-all duration-150 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px active:scale-[0.99]",
  {
    variants: {
      variant: {
        default:
          "border border-primary/90 bg-primary text-primary-foreground shadow-[0_14px_32px_-22px_rgba(37,99,235,0.95)] hover:-translate-y-0.5 hover:brightness-105",
        cta: "border border-white/20 bg-[linear-gradient(115deg,hsl(var(--primary))_0%,hsl(var(--accent))_100%)] text-primary-foreground shadow-[0_18px_46px_-24px_rgba(79,70,229,0.95)] hover:-translate-y-0.5 hover:brightness-105",
        ghost:
          "border border-border/80 bg-white/70 text-foreground/80 shadow-sm hover:border-primary/35 hover:bg-white hover:text-foreground",
        outline:
          "border border-slate-300 bg-white text-foreground shadow-sm hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:text-primary",
        accent: "border border-accent/75 bg-accent text-accent-foreground shadow-[0_14px_32px_-24px_rgba(124,58,237,0.95)] hover:-translate-y-0.5 hover:brightness-105",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-12 px-5 text-sm leading-none",
        xl: "h-14 px-7 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

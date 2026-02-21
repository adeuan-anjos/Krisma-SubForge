import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary/90 text-primary-foreground shadow-[0_0_12px_rgba(217,119,6,0.25)] hover:bg-primary",
        secondary:
          "border border-white/10 bg-card/50 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        outline:
          "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
        ghost:
          "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
        destructive:
          "bg-destructive/90 text-white hover:bg-destructive",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "px-3 py-1.5",
        sm: "px-2 py-1",
        lg: "px-4 py-2 text-sm",
        icon: "h-8 w-8",
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

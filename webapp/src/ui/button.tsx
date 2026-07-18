import * as React from "react"
import { Slot as SlotPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/index"

const buttonVariants = cva(
  // Foco de teclado: anel de 2px COM afastamento do próprio botão.
  // Era `ring-1` colado na borda — em botão `ghost` (fundo igual ao da tela) e sob
  // sol, 1px na cor primária some. O afastamento é o que garante o contorno visível
  // mesmo quando o botão tem fundo da mesma família de cor do anel.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // No escuro o azul "default" (#0B6FCE) sobre o navy do fundo mede 3,77:1 —
        // reprova nos 4,5:1. O "-light" (#63A6EC) mede 7,39:1. É a mesma regra que o
        // Badge já segue (ver comentário em theme/tokens/color.ts): "default" nunca
        // vai puro sobre fundo escuro. Vale para "Esqueceu a senha?" e "Criar conta",
        // que são links de verdade na tela de login.
        link: "text-primary dark:text-primary-light underline-offset-4 hover:underline",
        contrast: "bg-black text-white dark:bg-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9 cursor-pointer",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? SlotPrimitive.Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

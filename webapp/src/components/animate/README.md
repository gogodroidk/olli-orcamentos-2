# Movimento no painel OLLI — leia antes de animar

Perfil "SaaS genérico" (85% funcional, 10% personalidade, 5% editorial). As regras:

1. **Número só dos tokens.** Duração, curva, distância, escala e mola vêm de
   `tokens.ts` (Motion, em segundos) ou das variáveis de `tokens.css` (CSS/Tailwind,
   em ms). Os dois lados são conferidos por `scripts/teste-motion-painel.ts`.
2. **Só `transform` e `opacity`.** Nada de animar `width`, `height`, `top`, cor de
   fundo em loop. Barra de progresso = `scaleX`.
3. **Entrada de conteúdo é CSS** (`surgir`, `surgir-pagina`): aparece mesmo se o
   chunk do Motion não carregar. `m.*` com `initial` invisível é proibido para
   conteúdo — use o Motion para SAÍDA (`exit`) e LAYOUT (`layout`), com `initial={false}`.
4. **"Reduzir movimento" sempre.** CSS: os tokens zeram sozinhos. Motion: passe por
   `useMovimento()` (ou `useReducedMotion`) — o teste falha se faltar. O
   `MotionConfig reducedMotion="user"` em `motion-lazy.tsx` é só a rede de segurança.
5. **Uma engine:** Motion (`m`, nunca `motion.*` — o LazyMotion é `strict`) + CSS.
   Nada de GSAP, nada de canvas contínuo atrás de formulário ou tabela.
6. **Animação nunca esconde lentidão** e toda celebração termina numa ação
   (ex.: "Agendar o serviço" no card de aprovado). Celebração ≤ 700 ms, uma vez.

Os momentos que existem hoje: troca de tela (`layouts/dashboard/main.tsx`), valor que
surge no lugar do esqueleto, "Recebido no mês" que sobe desde a última visita
(`contador-dinheiro.tsx`), radar de dinheiro parado entrando escalonado e fechando
quando um item é pago, card "aprovado pelo cliente" (`pages/olli/inicio`), barra da
ativação em `scaleX`, aperto dos botões, gaveta na mola `drawer`, cartão do Quadro
que "levanta" no arraste.

`motion-container`, `motion-viewport`, `scroll-progress` e `variants/` abaixo são
herança do template (Slash Admin) e não são usados por tela nenhuma — os números
deles NÃO seguem os tokens. Não use em código novo.

---

# Animate Component Library

A collection of animation components and utilities based on Framer Motion, designed to provide easy-to-use animation solutions.

## Directory Structure

```
animate/
├── motion-container.tsx    # General animation container component
├── motion-lazy.tsx        # Lazy loading animation component
├── motion-viewport.tsx    # Viewport animation component
├── types.ts              # Type definitions
├── variants/            # Animation variants
└── scroll-progress/     # Scroll progress components
```

## Component Documentation

### MotionContainer

A general-purpose animation container component that wraps content with animation effects.

```tsx
import MotionContainer from '@/components/animate/motion-container';

// Usage example
<MotionContainer>
  <YourComponent />
</MotionContainer>
```

Features:
- Automatically applies initial, animate, and exit states
- Supports custom className for styling
- Implements animation using the variants system
- Inherits animation properties to child components
- Provides consistent animation behavior across the application

Props:
- `children`: React nodes to be animated
- `className`: Optional CSS class name
- `...MotionProps`: All Framer Motion props are supported

### MotionLazy

A component for lazy loading animation features to reduce bundle size.

```tsx
import { MotionLazy } from '@/components/animate/motion-lazy';

// Usage example
<MotionLazy>
  <YourComponent />
</MotionLazy>
```

Features:
- Dynamically loads animation features on demand
- Reduces initial bundle size
- Supports strict mode for better development experience
- Wraps content in a full-height container
- Uses domMax features for optimal performance

Props:
- `children`: React nodes to be wrapped in lazy loading context

### MotionViewport

A component for implementing scroll-triggered animations.

```tsx
import MotionViewport from '@/components/animate/motion-viewport';

// Usage example
<MotionViewport>
  <YourComponent />
</MotionViewport>
```

Features:
- Triggers animations when elements enter the viewport
- Configurable trigger threshold (default: 0.3)
- Supports one-time animation triggers
- Inherits animation variants from container
- Optimized for scroll performance

Props:
- `children`: React nodes to be animated
- `className`: Optional CSS class name
- `viewport`: Viewport configuration object
  - `once`: Boolean to trigger animation only once
  - `amount`: Number (0-1) for trigger threshold
- `...MotionProps`: All Framer Motion props are supported

## Animation Variants

The `variants` directory contains predefined animation variants that can be used with these components. These variants provide consistent animation patterns across the application.

Common variants include:
- Fade in/out
- Slide in/out
- Scale
- Stagger children animations

To use custom variants:
```tsx
import { varContainer } from './variants';

const customVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

<MotionContainer variants={customVariants}>
  <YourComponent />
</MotionContainer>
```

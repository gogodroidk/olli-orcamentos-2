# Arquivo — OLLI (código antigo, guardado)

Coisas **antigas** do OLLI, movidas pra cá pra não poluir o projeto ativo, mas
**preservadas no git** (reversível). **Nada aqui entra no build.**

## `web-landing-setpoint/`

A **primeira** landing (design "SETPOINT" — tema escuro industrial), que foi
**substituída** pela landing nova (clara, com hero 3D + celular premium). São
componentes que ninguém mais importa:

- `ThermalScroll.tsx`, `SetpointComparador.tsx`, `Subsolo.tsx`
- `secoes/*.astro` (BarraConfianca, ComoFunciona, Depoimentos, Faq, Planos, Pmoc, …)

Ficam aqui só como referência/histórico. Se um dia não precisar mais, dá pra
apagar a pasta inteira sem afetar nada.

> Observação: a limpeza "de verdade" do **Cloudflare** e do **GitHub** (apagar
> deploys/branches antigos) é um passo feito **com o dono**, numa sessão
> interativa — não dá pra automatizar sem autenticação, e o histórico avisa que
> mexer errado ali derruba o worker/APK que estão no ar.

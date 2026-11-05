# Prévia Z-01 — site GR Tech

Prévia estática, sem publicação. O site no ar continua o v7 em `grtechrefrigeracao.com.br`. Esta pasta não entra no deploy do OLLI (`site/wrangler.jsonc` aponta para `web/dist`).

## O que é

Landing da GR Tech no estilo de página de produto: iPhone primeiro, foco em empresa, VRF, manutenção e contrato. Uma ilustração 3D em CSS (telhado, linha e salas) na página inicial e na página de VRF. Sem WebGL, sem Three.js e sem modelo de terceiro.

Reuso: banco de fotos licenciado de 26/10/2026, logo oficial, foto real de tubulação já publicada no v7 e tokens de cor da casa. Não usei Three.js. A geometria 3D é nossa, em CSS.

## Como abrir

```bash
node preview/grtech-z01/test.mjs
python3 -m http.server 8791 --bind 127.0.0.1 --directory preview/grtech-z01/publico
```

O teste regrava o HTML e confere preço, CNPJ, WhatsApp, `noindex` e a ausência de promessa proibida. Não rode o `npm test` da raiz do OLLI para esta prévia: a suíte é grande e pede segredo.

Edite `build.mjs`, `publico/estilo.css` e `publico/cena-vrf.js`. O HTML em `publico/` é gerado.

## Preço que a página pode dizer

- Visita técnica R$ 150, abatida se fechar.
- Limpeza de split 9 a 12 mil BTU a partir de R$ 450 por aparelho. Valor final na visita.
- Instalação de split nessa faixa, até 3 m, a partir de R$ 1.000.
- VRF e contrato: proposta por escrito. Sem mensalidade publicada.

Não usar R$ 39 nem R$ 99 aqui. Esses valores são do OLLI Orçamentos.

## O que esta prévia não faz

Não publica, não mexe em DNS, não troca o v7 e não leva formulário nem analytics. A página de privacidade aponta para a política do site no ar.

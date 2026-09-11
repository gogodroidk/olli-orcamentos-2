# Aceite local C9 — precificação e packs de ofício

Data: **2026-09-05**

## Resultado

Foi criado um motor puro e explicável de preço que combina materiais, horas,
valor/hora, deslocamento, imposto e margem alvo. Entradas inválidas ou margens
inviáveis falham fechadas; o resultado devolve a memória da conta, custo direto,
preço sugerido e lucro estimado.

Também foram publicados packs iniciais para elétrica, hidráulica, pintura,
dedetização e jardinagem. Eles são estruturas de catálogo, não tabelas mágicas:
o preço sempre depende dos custos reais informados pelo negócio.

## Evidência

- `npm run test:c9-precificacao` — passou.
- A tela Ferramentas de ofício exibe os packs e mantém as calculadoras existentes.
- `npm run typecheck` e build do painel — passaram.


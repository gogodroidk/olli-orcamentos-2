# Inventário e reuso do acervo existente

Data do inventário: 30/08/2026

## Conclusão

O OLLI não estava sem pesquisa. Já existiam documentos maduros sobre concorrência, jornada, documentos, motion, landing, 3D, performance e pesquisa de campo. Esta rodada é uma atualização delta e uma centralização de acesso, não uma substituição.

## Documentos-base verificados

| Documento | Linhas | SHA-256 em 30/08/2026 | Uso nesta rodada |
|---|---:|---|---|
| `docs/ENXAME/PESQUISA_CONCORRENCIA_2026.md` | 315 | `be02fd78132d73e47012bef95b067d375d0b350e1918239bef40d290d038bb80` | preços, lacunas e aquisição já pesquisados |
| `docs/ENXAME/LANDING_3D_E_TELAS.md` | 472 | `0b9306f7e31ba4a5162dfcbe5eb1187ef0abdddd2e697f6e4af1131c7c5c2bb9` | decisão prévia sobre telas reais e 3D |
| `docs/ENXAME/LANDING_MOTION.md` | 533 | `cbb307e7b0858ee6462e7ea168ee2868a1411c95ec373f8dd045cfc89f7c9234` | motion da landing sem JS excessivo |
| `docs/ENXAME/LANDING_PERF.md` | 94 | `e27ce7c96b5f72b5ede0851a86cb1f5694467892a25567c7d8be0e3d2e5a466a` | cache/redirects; medições antigas, não estado atual |
| `docs/ENXAME/CATALOGO_VISUAL.md` | 49 | `843b357d946986c1f0b7d39dd9e4a8a9d80371bd470f67acf84517efc870d631` | divergências visuais entre app, web e landing |
| `docs/MOTION_SPEC.md` | 300 | `9c3d82fe83a842e3e08adffb84c2b236fb843f6dc225e7be7d468e6c8809e1ba` | especificação principal de motion e hápticos |
| `docs/ONDA_1/JANELA_1_1/HYPOTHESES_AND_RESEARCH_QUESTIONS.md` | 225 | `3486fd0e280c47f32012e5c7044906e5f8ed23e5318e2db30d3867af9ef180e7` | hipóteses e perguntas existentes |
| `docs/ONDA_1/JANELA_1_2/FIELD_RESEARCH_PROTOCOL.md` | 272 | `661147cbd28d5f22125093a76aeb009b455306344c44e9e9d89bad0f0fec058c` | protocolo de campo, consentimento e baseline |
| `docs/ONDA_1/JANELA_1_2/COMPETITOR_JOURNEY_MATRIX.md` | 122 | `f551c5708d617c71adab23ee2e62f4ed74033f27930f477957e78c929851d29e` | jornada e dez concorrentes já mapeados |
| `docs/ONDA_1/JANELA_1_2/JTBD_JOURNEY_AND_PAIN_RANKING.md` | 143 | `34544f8647caa6386fa06c9449276564505a29f05ba9fc9d16c87738d29cffa0` | jobs, dores e arquitetura de produto |
| `docs/ONDA_1/JANELA_1_2/SOURCE_LEDGER.md` | 113 | `fc460d7ba075e63e1e7a1a7d3aefebfa135c4f4fd367bb1cc69a9e7ba4ac7384` | proveniência e classificação de fontes |

## O que já estava decidido e deve ser preservado

- O problema não é apenas “gerar PDF”; é preservar a cadeia pedido → orçamento → aceite → agenda → execução → evidência → cobrança/recibo.
- O app é offline-first e o usuário não pode perder o que digitou por uma falha de rede.
- IA auxilia, rascunha e explica; não decide preço, não envia e não cria autoridade automática.
- A landing não deve esconder H1 e CTA no primeiro paint.
- Motion deve comunicar estado; decoração contínua deve ser evitada em fluxo operacional.
- `transform` e `opacity` são o caminho padrão para animações.
- Reduced motion, contraste, área de toque e foco são gates.
- Pesquisa pública e documento próprio não são validação de mercado.
- O protocolo de entrevista já existe e não precisa ser reinventado.

## Lacunas novas ou ainda abertas

1. Aplicar a especificação de motion no componente real de botão.
2. Aumentar alvos de toque no app e no dashboard.
3. Padronizar press/loading/success/error sem salto de largura.
4. Remover háptico de navegação/cartão e manter apenas eventos semânticos.
5. Mostrar versão atualizada e reenvio no orçamento editado.
6. Atualizar o recorte de concorrentes leves brasileiros.
7. Validar a landing atual com trace novo antes de usar números antigos como atuais.
8. Capturar telas reais sanitizadas após convergência visual entre app, web e landing.
9. Completar e testar a recuperação de senha no app nativo.
10. Validar e-mail transacional em ambiente correto; a existência do código não prova entrega.
11. Decidir WhatsApp OTP apenas após avaliar segurança, custo, aprovação Meta e fallback.
12. Executar sessões reais com prestadores; até lá, as hipóteses permanecem hipóteses.

## Stack verificada

- Expo `~57.0.18`;
- React Native `0.86.3`;
- React Native Web `^0.21.2`;
- Expo Haptics `~57.0.2`;
- landing Astro `^7.0.7` com Motion `^12.42.2`;
- dashboard React `^19.1.0` com Vite `^6.4.3`.

Qualquer referência antiga a Expo 56 precisa ser atualizada antes de implementação, sem descartar as decisões de UX que continuam válidas.

# HANDOFF — rastreio de telas (claude/rastreio-telas, 22/10/2026)
Estado: código escrito, NÃO testado (sem node_modules nesta máquina → sem tsc/jest), NÃO aplicado em produção, NÃO pushado.
Feito: migration `20261022100000_user_tela_log.sql` (tabela + RPC em lote + view telas_resumo), `src/services/rastreioTelas.ts`
(flag EXPO_PUBLIC_RASTREIO_TELAS=1, desligado por padrão), gancho `onStateChange` no App.tsx.
Falta: (1) npm i + tsc + teste do módulo; (2) chamar appEmSegundoPlano() num AppState listener e resetarRastreioTelas() no logout;
(3) toqueRegistrado() nos botões-chave; (4) job de retenção; (5) tela no painel admin lendo user_tela_log (service_role);
(6) atualizar texto de privacidade (src/content/legal/privacidade.ts, linha "Uso do app") ANTES de ligar — LGPD; (7) PR → CI → merge → reparar.mjs.
Quem mexeu por último: Claude. Branch claude/rastreio-telas.

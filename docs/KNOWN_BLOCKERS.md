# KNOWN_BLOCKERS — bloqueios que dependem de gente, não de código

> Regra do mestre §45: mesmo bloqueado, TODA a parte independente é implementada.
> Status honesto de cada uma abaixo. Atualizado 2026-07-08.

| # | Bloqueio | Causa | Parte independente JÁ FEITA | O que o dono faz | Desbloqueia |
| --- | --- | --- | --- | --- | --- |
| B1 | Stripe 12x + Empresa live | "Installments" (parcelamento BR) precisa ser habilitado no dashboard Stripe; Prices `olli_pro_12x`, `olli_empresa_mensal`, `olli_empresa_anual` precisam existir com lookup_keys | Worker completo: mode=payment com `installments.enabled`, `processar12x` (acesso 12 meses), `LOOKUP_PARA_PLANO`, PlanosScreen com 3 preços | 1) habilitar installments; 2) criar os 3 Prices; 3) confirmar preço Empresa (R$ 99?) | Onda 1 100% live |
| B2 | Chave Resend (e-mail transacional) | Não existe conta/API key no cofre | Decisão tomada (Resend + subdomínio `mail.olliorcamentos.online`); DNS Hostinger eu configuro via MCP; espec do worker `/email` pronta no roadmap | Criar conta em resend.com, gerar API key, salvar em `CONFIG CLAUDE/credenciais-locais.env` (~5 min) | Onda de e-mail: envio de orçamento/recibo/convite/boas-vindas |
| B3 | OAuth client Android | Login Google nativo + Google Calendar exigem OAuth client ANDROID com SHA-1 do keystore de release no Google Cloud Console | `googleAgenda.ts` completo atrás de flag; login Google web funciona; `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID` plugável | Criar o OAuth client Android no console (precisa do SHA-1 do keystore) | Login nativo + Agenda no APK final |
| B4 | Billing Google Cloud (Maps/Speech) | Maps SDK embutido e trânsito exigem cartão no projeto | Deep-link para Google Maps FUNCIONA hoje (`rotas.ts`, `EquipeAoVivoScreen` com "Ver no mapa"); flag `EXPO_PUBLIC_MAPS_KEY`/mapa embutido desligada; voz já é Gemini (não precisa Speech) | Decidir se ativa billing (opcional — produto funciona sem) | Mapa embutido da equipe no APK final |
| B5 | Cloudflare: Workers Build do olli-diagnostico | Pode clobberar produção no push (memória `olli-cloudflare-git-integracoes.md`) | Deploys manuais cuidadosos; previews de Pages já excluídos | Desativar o build automático no dash do olli-diagnostico | Deploy seguro contínuo |
| B6 | APK único final | Regra do dono: SÓ 1 APK, quando o ciclo comercial estiver perfeito e testado | Tudo que exige prebuild (expo-location/task-manager, login nativo) está escrito atrás de flag/import dinâmico | Aprovar o momento do build + roteiro de teste | Onda final |

## Sequência recomendada para o dono (custo ~30 min total)

1. **B1 Stripe** (10 min) — destrava receita imediatamente; é o único que bloqueia dinheiro.
2. **B2 Resend** (5 min) — destrava convites de equipe por e-mail + envio de orçamento.
3. **B5 Cloudflare** (5 min) — remove risco de clobber em produção.
4. **B3 OAuth Android** (10 min) — pode esperar até perto do APK final.
5. **B4 Billing Google** — decisão, sem pressa; o produto está inteiro sem ela.

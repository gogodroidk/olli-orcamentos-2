# FOLLOWUPS — tarefas adiadas (recriar como chips ao retomar)

> Os chips de tarefa não sobrevivem ao reinício do app. Este arquivo é a fonte
> durável: ao retomar a sessão, recriar cada item abaixo como chip (spawn_task)
> ou atacá-los diretamente. Todos são melhorias fora do caminho crítico —
> nenhum bloqueia o que já está no ar.

## Pendentes (5)

1. **Badge financeiro na tabela desktop de orçamentos**
   - `src/screens/desktop/OrcamentosDesktopScreen.tsx` não recebeu o badge de estado
     financeiro (Pago / Recibo emitido / Aguardando) nem o atalho "Registrar pagamento"
     que o mobile (`OrcamentosScreen`) ganhou na Onda 3. Portar `getStatusFinanceiro` +
     `BadgeFinanceiroPill` de `src/services/pagamentos.ts` (carregar `getRecibos` junto
     de `getOrcamentos`). Paridade desktop, não elo quebrado.

2. **Limpar versões órfãs de orçamento na nuvem ao excluir**
   - `src/database/database.ts` `deleteOrcamento` apaga versões locais + tombstone do
     orçamento, mas NÃO propaga a exclusão de `orcamento_versoes` para a nuvem (a tabela
     não tem FK/cascade). Linhas órfãs podem ressuscitar histórico apagado se o
     `orcamento_id` reaparecer. Propagar a exclusão via o mecanismo de tombstone existente
     (ou cascade na nuvem). Protegido por RLS (não vaza) — é lixo, não vulnerabilidade.

3. **Campo `concluidoEm` na Ordem de Serviço**
   - "Concluídas no mês" (`src/screens/desktop/InicioDesktopScreen.tsx`) usa `atualizadoEm`
     como proxy de conclusão — qualquer edição posterior (foto/observação) re-carimba e
     conta no mês errado. Adicionar `concluidoEm?: string` ao tipo `OrdemServico`, gravado
     só na transição de status→`concluida` (em `atualizarStatusOS`), com coluna
     (migration aditiva + local + cloudSync como as demais colunas de OS), e filtrar por
     `noMesAtual(o.concluidoEm)`.

4. **KPIs do dashboard abrem lista já filtrada**
   - No `InicioDesktopScreen`, "Em aberto" e "Contas a receber" navegam para `OrcamentosTab`
     SEM filtro → abrem a lista completa (enganoso). Estender o param de `OrcamentosTab`
     (`AppNavigator` TabParamList) com um recorte inicial (ex.: `recorteInicial?: 'em_aberto'
     | 'a_receber' | StatusOrcamento`) e `OrcamentosDesktopScreen` inicializar o filtro a
     partir dele (recortes derivados via `propostaJaEnviada`/`getReciboDoOrcamento`).

5. **Role de checkbox no `OlliPressable` (acessibilidade)**
   - O toggle de checklist (`CheckRow` em `src/screens/HojeScreen.tsx`) usa `OlliPressable`,
     que hardcoda `accessibilityRole="button"` e não expõe `accessibilityRole/State`. Para
     leitor de tela soa como "botão", não "caixa marcada/desmarcada". Estender
     `src/components/OlliPressable.tsx` para repassar `accessibilityRole`+`accessibilityState`
     e usar `role="checkbox"` + `{checked: item.feito}` no CheckRow.

---

## RETOMAR AQUI (estado da sessão ao pausar — 2026-07-08)

**No ar em produção** (main até `6c29e70`): Ondas 1, 2, 3, 4, 5, 7, 10.

**PMOC Fase 1 — inventário HVAC + etiqueta QR — feita mas AINDA NÃO no gate/main:**
- Fundação `20260709_pmoc_fundacao.sql` APLICADA + RLS testada 4/4 (isolamento, membro,
  autoria carimbada, `user_id` imutável; QR opaco/único). `20260711_assets_fotos.sql`
  APLICADA (coluna `fotos` jsonb). Worker `/q/<token>` DEPLOYADO (v `c64671f4`).
- Código no working tree do branch (typecheck 0): `equipamentos.ts` (service),
  integração cloudSync `equipamentos`→`assets` (via `REMOTE_TABLE`, `qr_token`
  preservado/omitido), `EquipamentoScreen`, nav/SidebarNav, `worker/src/pmoc.js`.
- **A recuperar ao retomar:** o gate Fable da PMOC Fase 1 foi INTERROMPIDO na pausa.
  Resumir o workflow (runId `wf_ce6ac9c8-728`, os revisores estão em cache) → aplicar
  findings até zero critical/high/medium → re-typecheck → (se tocar worker, redeploy)
  → push main → atualizar cabeçalho de `20260709_pmoc_fundacao.sql` (era "NÃO APLICAR"
  → APLICADA) → `EXECUTION_LOG.md`.

**Próximo depois disso:** PMOC Fase 2 (plano PMOC + periodicidade + geração de ordens
recorrentes reusando `ordens_servico`).

**Bloqueios humanos (destravam ondas paradas):** chaves no cofre
`CONFIG CLAUDE/credenciais-locais.env` — Sentry DSN + PostHog key (Onda 2.5), Resend
key (Onda 6). Ver `docs/KNOWN_BLOCKERS.md`. Chrome extension desconectada (OAuth Android).

**Contas QA:** A=`e4f2858f-440f-469d-aca5-18bf0c35569a`, B=`daeb08b4-b1a3-4f96-b568-33b6eea879f0`.
</content>

## Novos follow-ups (Bloco A, 2026-07-09)

Nenhum é bloqueante; todos saíram dos dois gates e foram deliberadamente adiados.

1. **Deep link de convite deslogado perde o token.** `Convite` não está em `ROTAS_PUBLICAS`
   (App.tsx): um convidado que clica no link sem estar logado é mandado para a porta e o
   token some. É **pré-existente** (o reset já fazia isso antes da Landing), mas agora que
   há equipe de verdade vale resolver: guardar o token e reaplicar após o login.
2. **Copy do HERO da landing** ("cobre e gerencie a equipe") e o pilar 3 ainda falam de
   equipe como pronta. A FAQ e os bullets por plano já foram sincronizados com
   `PlanosScreen` ("em breve"); o HERO é copy de posicionamento e ficou de fora — decisão
   de produto, não de código.
3. **`MeuNegocio` some da lista de Ferramentas do técnico, mas o card de perfil no topo da
   ContaScreen continua levando lá.** Não é furo de permissão (o técnico edita o próprio
   negócio, não o do dono), é inconsistência de UX. Decidir se o técnico deve ter perfil.
4. **SEO por rota só cobre a home.** `seoWeb.ts` tem a API (`aplicarSeo`), mas só a Landing
   chama. Como `web.output='single'`, `/planos`, `/ajuda`, `/privacidade` e `/termos`
   servem o mesmo `index.html` e herdam o canonical da raiz — o Google as trata como
   duplicatas. Chamar `aplicarSeo` nessas 4 telas (ou pré-renderizar) resolve.
5. **`EmitirRecibo` está gateado por `ver_valores_agregados`.** É fail-safe, mas discutível:
   um técnico talvez precise emitir recibo em campo. Decisão de produto.
6. **Restaurar backup traz de volta como ATIVOS os itens que estavam na lixeira.**
   `importAllData` substitui o SQLite inteiro e o snapshot só contém itens ativos. Coerente,
   mas convém confirmar que é a semântica desejada (a Central de Ajuda já documenta assim).
7. **Upgrade sobre vigência paga registra a subscription nova mas o cliente paga duas vezes.**
   Quem tem Pro 12x e assina Empresa passa a ser cobrado pelos dois. O worker preserva o
   maior nível e a maior vigência (não entrega menos do que foi pago), mas o ideal comercial
   é a `PlanosScreen` avisar/creditar o saldo do 12x antes de deixar assinar.

## PMOC Fase 2 (2026-07-09) — notas LOW não bloqueantes

8. **`houveExclusaoDefinitiva` retorna `true` no catch.** É a direção segura (não ressuscita), mas
   se a leitura de `exclusoes` falhar isoladamente, uma reserva órfã é rotulada "removida de vez"
   em vez de "recuperada". Auto-cura na geração seguinte. Para precisão, devolver um terceiro
   estado ("indeterminado") em vez de colapsar erro em `true`.
9. **Read-view do plano mostra a versão VIGENTE, mas "Editar" salva na versão de TRABALHO.** Em
   plano já aprovado, salvar cria uma v2 rascunho e a seção de periodicidades continua exibindo a
   v1. Há banner de rascunho pendente; falta rotular a seção.
10. **Se um dia existir soft-delete de reserva** (`pmoc_ordens_geradas.excluido_em`), o
   reconciliador fica cego: `getOrdensGeradas` filtra ativos, a reserva soft-deletada some do
   snapshot mas continua ocupando o índice único → bloqueia a regeração em silêncio. Não é bug
   hoje (nada soft-deleta reserva); é um convite a cuidado.

## Sign in with Apple / SEO (2026-07-09)

11. ~~PASSO HUMANO — Supabase → Providers → Apple~~ **FEITO (2026-07-09).** Provider habilitado via
   Management API com `external_apple_client_id = online.olliorcamentos.app`, verificado relendo a
   config. Login nativo não precisa de Services ID / Team ID / `.p8`.
12. **Sign in with Apple NÃO foi testado**, e não dá para testar antes da conta Developer (a
   entitlement `com.apple.developer.applesignin` exige provisioning profile). O ponto mais frágil é
   o nonce: se o login falhar com "invalid nonce", a alternativa documentada é remover o argumento
   `nonce` das DUAS chamadas (Apple e Supabase).
13. **Preview de link (WhatsApp/Slack) ainda mostra o cartão da home** em todas as rotas: esses
   crawlers não executam JavaScript e leem o `index.html` estático. `aplicarSeo` só conserta para o
   Googlebot, que renderiza JS. Solução completa: pré-render por rota (SSG), que troca o pipeline
   de build.
14. **HERO da landing** (`LandingSecoes.tsx`) ainda diz "cobre e gerencie a equipe". Não é meta
   description, mas é a mesma promessa que `PlanosScreen` marca "(em breve)". Decisão de produto.
15. **`expo-crypto` e `expo-apple-authentication` são módulos nativos novos:** o APK v1.1.0 atual
   não os tem. Nada quebra (o Apple é iOS-only e o crypto só é chamado por ele), mas o próximo
   build precisa ser feito do zero.
16. **Dica do técnico:** "Toque numa OS para ver os detalhes" navega para a tela de OS sem id, não
   para o detalhe daquela OS. Imprecisão leve de navegação, não promessa falsa.

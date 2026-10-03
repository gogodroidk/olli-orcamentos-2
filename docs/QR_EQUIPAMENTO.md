# QR do equipamento — check-in do técnico e etiqueta que vende

Estado: código pronto no branch `claude/t-qr-equipamento`. **Migration NÃO aplicada; worker NÃO publicado.**

## O que faz

1. **Check-in pelo QR (técnico).** Escanear (Equipamentos → ícone de QR) abre a ficha do equipamento.
   Se o QR não está no aparelho, o app puxa da nuvem uma vez antes de desistir. A ficha mostra:
   - o botão **Iniciar atendimento**: retoma a OS aberta do equipamento (em execução > pausada >
     agendada mais cedo > aberta) ou cria uma OS nova ligada a ele (`ordens_servico.asset_id`),
     já em execução, com o cliente do equipamento e o checklist do ofício. Se quem escaneou é técnico
     de equipe, a OS sai atribuída a ele;
   - o **histórico**: último serviço, próxima manutenção (OS agendada ou vencimento PMOC), visita
     PMOC vencida, garantia (texto do orçamento; "vale até" só quando o texto traz prazo legível),
     OS do equipamento e fotos (do equipamento e das OS).
2. **Etiqueta que vende (cliente final).** PDF A4 com 3 tamanhos de adesivo (4,2 cm / 6 cm /
   9 × 4,5 cm), cópias, logo/nome/contato/cor do prestador e o selo "Feito com OLLI" só no Grátis.
   O QR continua apontando para `/q/<token>` (as etiquetas já coladas seguem valendo; `/e/<token>` é
   apelido). A página pública mostra a marca do prestador, a última manutenção, a próxima recomendada
   (só datas), **Chamar no WhatsApp** e **Pedir orçamento**. O pedido vira registro em
   `pedidos_orcamento_qr` e aparece no app (aviso no topo de Equipamentos + bloco na ficha), com
   "Responder no WhatsApp" e "Atendido". O primeiro contato continua humano.

## Arquivos

- Regra pura: `src/utils/historicoEquipamento.ts`, `src/utils/qrEtiqueta.ts`, `src/utils/pedidoQr.ts`,
  `src/utils/etiquetaQrPdf.ts`
- Serviços: `src/services/atendimentoEquipamento.ts`, `src/services/pedidosQr.ts`,
  `src/services/etiquetaEquipamento.ts`
- UI: `src/components/equipamento/FichaAtendimentoEquipamento.tsx`,
  `src/components/equipamento/PedidosQrBloco.tsx`, `src/screens/EquipamentoScreen.tsx`
- Dados: SQLite local v10 (`ordens_servico.asset_id`), `cloudSync` com a escada de coluna ausente
- Worker: `worker/src/pmoc.js` (página, POST do pedido, resumo, selo), `worker/src/index.js` (rotas)
- Migration: `supabase/migrations/20261002153217_qr_equipamento_atendimento.sql`
- Testes: `scripts/teste-qr-equipamento.ts`, `scripts/teste-qr-equipamento-sql.ts` (PGlite),
  `worker/scripts/teste-etiqueta-qr.js`

## Ordem de publicação

1. Aplicar a migration `20261002153217` (coluna `asset_id`, tabela `pedidos_orcamento_qr`, RPC
   `resumo_manutencao_equipamento`).
2. Publicar o worker (página nova + POST do pedido).
3. APK/painel novos.

Sem a migration nada quebra: o app sincroniza a OS sem `asset_id` (vínculo fica só no aparelho), a
página pública omite as datas e o formulário responde "não consegui registrar" (503), nunca "enviado".

## Encaixe sugerido na Home/Hoje (telas congeladas nesta leva)

`PedidosQrBloco` em `modo="aviso"` é isolado e some quando não há pedido novo (ou quando a leitura
falha — é aviso, não lista). Para pôr na Home/Hoje:

```tsx
<PedidosQrBloco
  modo="aviso"
  nomeEquipamento={(id) => nomes.get(id) ?? 'equipamento'}
  nomeEmpresa={empresa?.nome}
  onAbrirEquipamento={() => nav.navigate('Equipamento')}
/>
```

## Decisões que ficam com o dono

- Equipamentos/QR hoje são livres em todos os planos (como antes). Se o QR que vende for exclusivo do
  Empresa (PMOC), isso precisa entrar em `RECURSOS_POR_PLANO` (`src/services/entitlements.ts`) e no gate.
- Aviso por push/e-mail do pedido novo ainda não existe: o aviso é dentro do app.

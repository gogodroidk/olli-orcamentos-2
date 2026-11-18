# NFS-e (nota de serviço) — Fase 1

Orçamento aprovado → "Emitir nota" → número, PDF e XML. **Tudo desligado por padrão** (`NFSE_ENABLED=0`).
Plano de origem: `Entregas Claude/OLLI/2026-11-17-plano-fiscal-comercio/PLANO.md` (§2).

## Peças
| Onde | O quê |
|---|---|
| `worker/src/nfse.js` | Rotas `GET /nfse/config`, `POST /nfse/emitir`, `GET /nfse/status?orcamento=`. Flag, plano Empresa, idempotência |
| `worker/src/nfse/provedor.js` | Interface de provedor + escolha (`NFSE_PROVEDOR`: `mock` padrão, `focus`) |
| `worker/src/nfse/provedorMock.js` | Simulado; usado nos testes. `[erro]` / `[processando]` na descrição forçam cenários |
| `worker/src/nfse/provedorFocus.js` | Focus NFe **só homologação**; token só por `FOCUS_NFE_TOKEN` |
| `worker/src/nfse/validacao.js` | CPF/CNPJ, valor em centavos, perfil fiscal completo, referência idempotente |
| `supabase/migrations/20261118120000_nfse_f1.sql` | `perfil_fiscal`, `nota_fiscal` com RLS. **NÃO APLICADA** |
| `src/components/EmitirNotaBotao.tsx` | Botão + conferência + resultado. Só com flag + Empresa + orçamento aprovado |
| `src/services/nfse.ts`, `nfseRegras.ts` | Cliente do worker e regras puras |

## Como testar (sem rede, sem conta)
`npm run test:nfse` (raiz) e `npm run test:nfse` em `worker/`.

## Como ligar (só com decisão do Igor — ver HANDOFF.md)
1. Aplicar a migration (revisar antes).
2. `NFSE_ENABLED` = `"1"` no `wrangler.jsonc`. Com `NFSE_PROVEDOR` ausente sai nota **simulada** (sem valor fiscal; o app avisa).
3. Para homologação real: `NFSE_PROVEDOR=focus`, `FOCUS_NFE_AMBIENTE=homologacao` e `wrangler secret put FOCUS_NFE_TOKEN`.
   **Produção não existe neste código** (decisão futura: nova URL, certificado A1 e CNPJ do cliente).

## O que é de memória (conferir na homologação)
Os nomes de campo do payload `/v2/nfsen` em `provedorFocus.js` (`montarPayload`/`traduzirResposta`) não foram conferidos
contra a documentação viva (sem conta de teste). Ajustar após a 1ª emissão em homologação; há testes que travam o formato atual.

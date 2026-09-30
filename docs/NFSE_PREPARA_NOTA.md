# "OLLI prepara a nota" (NFS-e) — como funciona e como ligar

Ação 7 do plano do ecossistema (antes de 01/11/2026). Custo R$ 0: **o OLLI não emite a nota**.
A partir de um recibo, ele monta os dados da NFS-e para o prestador copiar no
[Emissor Nacional](https://www.nfse.gov.br/EmissorNacional), onde a nota é emitida com a conta gov.br dele.

## Onde está

| Parte | Arquivo |
|---|---|
| Regra pura (app e painel usam a mesma) | `src/utils/notaServico.ts` |
| Nuvem no app | `src/services/notaPreparada.ts` |
| Tela do app (mobile e desktop) | `src/screens/PrepararNotaScreen.tsx` — rota `PrepararNota`, link `/nota-fiscal/:reciboId` |
| Entradas no app | Recibos → "Emitidos" (mobile), Recibos (desktop), detalhe do orçamento (um botão por recibo) |
| Painel | `webapp/src/pages/olli/recibos/PrepararNota.tsx` — menu do recibo → "Preparar nota fiscal" |
| Banco | `supabase/migrations/20260930130700_nota_preparada.sql` |
| Testes | `scripts/teste-nota-preparada.ts` (`npm run test:nota-preparada`, na cadeia do `npm test`) |

## Regras fiscais usadas (com fonte)

- Quem é obrigado: MEI desde 01/09/2023; ME/EPP do Simples a partir de 01/11/2026
  ([Receita, CGSN 191/2026](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026)).
  A 191/2026 revogou a 189/2026 (que dizia 01/09/2026).
- Código de tributação nacional (cTribNac, 6 dígitos): [tabela oficial](https://www.gov.br/nfse/pt-br/mei-e-demais-empresas/codigos-de-tributacao-nacional-nbs).
  Sugestão por ofício: refrigeração 14.01.01 · elétrica e hidráulica 07.02.02 · pintura 07.05.01 ·
  dedetização 07.13.01 · jardinagem 07.11.02 (com alternativas e explicação na tela). Sem ofício/"Serviços em Geral": sem sugestão.
- Onde o ISS é devido: LC 116/2003, art. 3º (7.02, 7.05, 7.10 e 7.11 no local do serviço; o resto no estabelecimento do prestador).
- Retenção por tomador pessoa jurídica: LC 116, art. 6º, §2º, II (7.02, 7.05, 7.10 entre os do app). MEI não sofre retenção (LC 123, art. 21, §4º, IV).
- NBS: o emissor oferece os NBS ligados ao código escolhido — o OLLI não chuta, o checklist manda escolher lá.
- CPF/CNPJ do tomador: aceita o CNPJ alfanumérico (letra = ASCII − 48 no dígito).

## Banco

- `notas_preparadas`: uma por recibo do tenant (`user_id` = dono, default `auth.uid()`), `dados` = snapshot,
  `status` `preparada` | `emitida` (com número de até 13 dígitos ou chave de 50). Leitura: dono + equipe
  (`donos_visiveis()`); escrita: só o dono; sem DELETE; dados de nota emitida imutáveis.
- `nota_automatica_interesse`: uma linha por conta que tocou em "Quero a nota automática". Sem preço, sem cobrança.

## Passos de produção (depois do merge)

1. Aplicar `20260930130700_nota_preparada.sql` (MCP/Management API) e conferir:
   `select count(*) from public.notas_preparadas;` e `select count(*) from public.nota_automatica_interesse;`
2. Deploy do painel (a tela aparece no menu do recibo). Sem a migration, a tela funciona para copiar e diz
   "Guardar a nota preparada ainda está desligado no servidor".
3. App: entra no próximo APK/AAB.

## Medir a pré-venda

```sql
select origem, count(*) from public.nota_automatica_interesse group by 1;
select status, count(*) from public.notas_preparadas group by 1;
```

Meta do plano: ~30 interessados antes de contratar emissão automática (NFE.io/Focus).

# ADR-0007 — PDF autoritativo: local (aparelho) vs Gotenberg (servidor)

- **Status:** Proposta (POC) — bloqueada por B9 (host Docker) para produção.
- **Gatilho:** Onda 7 (PDF v2 + identidade). Ver `TECHNOLOGY_RADAR.md` §5.
- **Núcleo:** COMERCIAL (documento enviado) + PLATAFORMA (porta/fila).
- **Porta:** `DocumentRenderer` (`src/services/ports/DocumentRenderer.ts`).
- **Data:** 2026-07-08.

---

## Contexto

O PDF do orçamento/recibo é gerado HOJE **no aparelho**: `src/utils/pdfGenerator.ts`
monta o HTML do documento (modelos minimalista, faixa_lateral, etc.) e o motor de
impressão do sistema (expo-print) transforma esse HTML em PDF. Isso funciona para
**preview** e é um **fallback offline** valioso.

A arquitetura-alvo (`TARGET_ARCHITECTURE.md` §4) fixa que o **documento enviado**
(orçamento congelado, recibo, futuro relatório PMOC) é um **objeto versionado com
hash** — imutável por construção, verificável, o que se anexa ao e-mail, se arquiva
e se audita. O artefato definitivo não pode depender de qual aparelho, qual versão
de OS ou qual motor de impressão gerou o arquivo.

## Problema

Gerar o **PDF de autoridade** no aparelho tem três defeitos que o preview não tem:

1. **Fragilidade no Hermes.** O app roda em Hermes (RN 0.85). Já queimamos um APK
   (v6, `TextDecoder latin1`) que só quebrava no aparelho. Documento longo/complexo
   no motor de impressão do dispositivo é justamente onde a variabilidade morde —
   e um PDF de autoridade que falha silenciosamente é pior do que não ter PDF.
2. **Sem hash confiável / não reprodutível.** O mesmo HTML pode render diferente
   entre dispositivos/versões. Sem uma renderização canônica no servidor não há
   `hash` estável para carimbar a versão imutável nem para provar integridade
   depois (aprovação com trilha, auditoria).
3. **Acoplamento ao cliente.** Colocar a geração de autoridade no caminho do clique
   viola o padrão "nada lento/falível no caminho do clique" (§3): PDF de autoridade
   deve nascer de forma assíncrona, idempotente e reprocessável.

## Opções consideradas

### Opção A — Manter só o cliente atual (`pdfGenerator.ts` / expo-print)
- **Prós:** zero custo, zero infra, offline nativo, já existe e é bom para preview.
- **Contras:** não resolve hash canônico nem fragilidade Hermes para o artefato de
  autoridade; renderização não reprodutível; sem trilha verificável de integridade.

### Opção B — Gotenberg (Chromium headless em Docker) atrás de `DocumentRenderer`
- **Prós:** renderização Chromium canônica e reprodutível a partir do HTML já
  versionado; roda **fora** do aparelho e fora do Worker, via fila; produz PDF
  autoritativo + hash estável; licença Apache-2.0 (radar §2.3); endpoint HTTP
  simples (`/forms/chromium/convert/html`). POC roda em **Docker local sem custo**.
- **Contras:** é um **serviço Docker separado** — não cabe dentro de um Cloudflare
  Worker; produção exige um **host** (VPS/Fly/Render, ~US$5/mês) — bloqueio B9.

### Opção C — Serviço SaaS de PDF de terceiros (DocRaptor, Api2Pdf, etc.)
- **Prós:** sem host próprio.
- **Contras:** custo por documento, mais um provider com segredo/lock-in, dado do
  cliente sai para terceiro sem ganho sobre a Opção B. Reprovada.

## Critérios de decisão (matriz do radar, peso do projeto)

| Critério | Peso | A (local) | B (Gotenberg) |
| --- | --- | --- | --- |
| Não degrada o offline (diferencial de marca) | 10 | mantém | mantém (local segue de fallback) |
| PDF autoritativo + hash reprodutível | alto | não | **sim** |
| Robustez fora do Hermes | alto | não | **sim** |
| Custo / infra | médio | zero | ~US$5/mês (host) — POC local grátis |
| Licença livre p/ SaaS | gate | — | Apache-2.0 |
| Encaixa no padrão outbox→fila | alto | não | **sim** |

Nota agregada do radar: **Gotenberg = 78** — "passa condicional: POC (host Docker)".

## Decisão

Adotar a **Opção B em modo POC**, atrás da porta `DocumentRenderer`
(`renderPdf(htmlVersionado) → { pdf, hash }`), com estas condições:

1. **POC primeiro, em Docker LOCAL, sem custo.** Provar paridade visual com o
   preview atual e estabilidade do hash antes de qualquer host pago.
2. **`pdfGenerator.ts` continua vivo** como caminho de **preview** e **fallback**
   permanente. Se o Gotenberg (ou o host) cair, o produto entrega o PDF local —
   **nada trava** (regra "zero em breve").
3. **Chamada só via fila.** `outbox → Cloudflare Queues → consumidor idempotente`
   chama o Gotenberg **fora** do Worker e **fora** do caminho do clique (§3). O
   consumidor carimba a versão imutável com o `hash` retornado.
4. **Produção bloqueada até:** (a) esta ADR aprovada com evidência da POC
   (paridade visual + hash estável) **e** (b) host Docker decidido/provisionado
   pelo dono — **bloqueio B9** (`KNOWN_BLOCKERS.md`). Sai da feature flag
   "Gotenberg (PDF servidor)" (`TARGET_ARCHITECTURE.md` §5) só então.
5. **Segredo/host só no backend.** O app nunca fala com o Gotenberg direto; a URL
   do serviço e qualquer credencial ficam no worker/host (regra §6 do radar).

## Consequências

- Documento enviado ganha um artefato **canônico, imutável e verificável** (hash),
  fechando o requisito de "documento enviado = objeto versionado + hash" (§4).
- Uma peça de infra nova (host Docker) passa a existir — custo e operação pequenos,
  mas reais; entram na conta de manutenção da PLATAFORMA.
- `pdfGenerator.ts` não é descartado: vira oficialmente o **preview/fallback**, o
  que reduz o risco de regressão (o caminho atual segue funcionando o tempo todo).
- Entitlement de marca é **ortogonal** a esta decisão: `remove_olli_brand`
  (Pro/Empresa, D-07) controla o rodapé discreto "Orçamento feito com OLLI ·
  olliorcamentos.online" tanto no preview local quanto no PDF autoritativo — a
  porta só renderiza o HTML que já vem com/sem a marca resolvida pela frente do PDF.

## Plano de rollback

Rollback é **barato por construção** porque o local nunca saiu:

1. Desligar a feature flag "Gotenberg (PDF servidor)" — o consumidor da fila deixa
   de chamar o Gotenberg e o app volta a usar exclusivamente o PDF de
   `pdfGenerator.ts` (preview/fallback). Nenhum documento de autoridade novo passa
   a exigir o servidor.
2. Documentos já carimbados com hash do Gotenberg permanecem válidos (o hash é do
   conteúdo HTML versionado, não do motor); não há migração reversa de dado.
3. Se o host precisar sumir, basta parar o container/host — sem impacto no app,
   que degrada para o local. `DocumentRenderer.disponivel()` passa a `false`.

## Como rodar a POC local (Docker, sem custo)

> **Não faz parte deste commit rodar Docker.** Este é o passo-a-passo para quem
> executar a POC na Onda 7. Nada aqui provisiona host pago.

1. Subir o Gotenberg local:
   ```
   docker run --rm -p 3000:3000 gotenberg/gotenberg:8
   ```
2. Converter um HTML (o mesmo HTML versionado que `pdfGenerator.ts` monta) em PDF
   pelo endpoint Chromium:
   ```
   curl --request POST http://localhost:3000/forms/chromium/convert/html \
     --form "files=@orcamento.html" \
     -o orcamento.pdf
   ```
   - O arquivo enviado **deve** se chamar `index.html` OU usar o campo `files`
     apontando para o HTML de entrada, conforme a doc do endpoint.
   - Ativos (logo/fotos) precisam ser **inline** (data: URI) OU enviados como
     `files` adicionais no mesmo form — o HTML versionado do OLLI já embute o
     essencial, o que mantém a renderização autossuficiente.
3. Validar a POC (critérios de aprovação desta ADR):
   - **Paridade visual** entre `orcamento.pdf` (Gotenberg) e o preview atual do
     `pdfGenerator.ts` para os modelos existentes (minimalista, faixa_lateral, …).
   - **Estabilidade do hash:** rodar a conversão do mesmo HTML N vezes e conferir
     que o `hash` do conteúdo carimbado é determinístico.
   - **Comportamento de fila:** simular indisponibilidade do Gotenberg e confirmar
     que o consumidor reencadeia (backoff/DLQ) e o app segue no PDF local.

## Data de revisão

Revisar quando a POC da Onda 7 tiver evidência (paridade + hash), ou até
**2026-10-08**, o que vier primeiro. A promoção para produção depende de B9
(host Docker) decidido pelo dono.

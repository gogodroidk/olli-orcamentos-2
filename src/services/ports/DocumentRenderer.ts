import type { PortaDisponivel } from './comum';

/**
 * DocumentRenderer — renderiza HTML VERSIONADO em um PDF AUTORITATIVO com hash.
 *
 * Distinção que justifica a porta existir:
 *   - `src/utils/pdfGenerator.ts` monta o HTML do orçamento/recibo (vários
 *     modelos: minimalista, faixa_lateral, etc.) e hoje o transforma em PDF NO
 *     APARELHO (motor de impressão via expo-print). Isso é ótimo para PREVIEW e
 *     como FALLBACK offline, mas é frágil no Hermes para documentos longos/de
 *     autoridade e não produz um artefato imutável e verificável no servidor.
 *   - Esta porta é o outro lado: recebe o HTML JÁ CONGELADO (a versão imutável
 *     do documento — ver `*_versions` na arquitetura-alvo §4, "Documento enviado
 *     = objeto versionado + hash") e devolve o PDF definitivo + o hash desse
 *     conteúdo, para o orçamento congelado, o recibo e, no futuro, o relatório
 *     PMOC. O PDF autoritativo é o que se anexa ao e-mail, se arquiva e se audita.
 *
 * Provider escolhido para a impl futura: Gotenberg (radar nota 78, POC — ver
 * ADR-0007 em `docs/ADR-0007-gotenberg-pdf.md`). Gotenberg é um serviço Docker
 * separado (endpoint `/forms/chromium/convert/html`) que NÃO roda dentro de um
 * Cloudflare Worker — por isso a chamada acontece FORA do caminho do clique, via
 * `outbox → Cloudflare Queues → consumidor idempotente` (arquitetura-alvo §3).
 *
 * Impl de-facto HOJE: NÃO EXISTE renderização de PDF no servidor. O PDF é gerado
 * localmente por `src/utils/pdfGenerator.ts` (HTML → expo-print), que segue sendo
 * o caminho de PREVIEW e o FALLBACK permanente: se o Gotenberg (ou seu host)
 * estiver indisponível, o produto continua entregando o PDF local — nada trava.
 * O `hash` autoritativo só passa a existir quando esta porta tiver adaptador.
 *
 * Onda de fiação: Onda 7 (PDF v2). Bloqueio humano B9 — provisionar um host
 * Docker para o Gotenberg (VPS/Fly/Render). A POC roda em Docker LOCAL sem custo
 * atrás desta porta; produção só depois da ADR-0007 aprovada e do host decidido.
 * Ver `docs/KNOWN_BLOCKERS.md` (B9) e `docs/INTEGRATION_BACKLOG.md`.
 */
export interface DocumentRenderer extends PortaDisponivel {
  /**
   * Renderiza o `htmlVersionado` (o HTML JÁ congelado da versão do documento)
   * em um PDF autoritativo e devolve, junto, o hash do conteúdo para carimbar a
   * versão imutável e permitir verificação posterior (auditoria/aprovação).
   *
   * Contrato de erro: diferente das demais portas (que devolvem
   * `ResultadoPorta<T>`), esta assinatura é fixada pelo contrato entre frentes —
   * resolve com `{ pdf, hash }` ou REJEITA a Promise em falha. Como a chamada
   * vive num consumidor de fila (nunca no caminho do clique), a rejeição é
   * tratada pela fila (retry com backoff / DLQ) e o app continua exibindo o PDF
   * local de `pdfGenerator.ts` como preview/fallback — a UX nunca depende disto.
   *
   * @param htmlVersionado HTML completo e autossuficiente da versão congelada do
   *   documento (mesmo HTML que `pdfGenerator.ts` monta para o preview local).
   * @returns `pdf` — bytes do PDF (`Uint8Array` no worker; `Blob` quando o
   *   ambiente de execução preferir Blob) — e `hash` — digest hex estável do
   *   conteúdo, usado para carimbar/validar a versão imutável do documento.
   */
  renderPdf(htmlVersionado: string): Promise<{ pdf: Uint8Array | Blob; hash: string }>;
}

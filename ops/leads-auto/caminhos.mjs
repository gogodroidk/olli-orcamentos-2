// Caminhos fixos. A supressão é o CSV de hash, não a base de CNPJ.

export const ENTREGA = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-14-leads-auto';
export const CSV_AUTO = `${ENTREGA}/PROSPECTS-AUTO.csv`;
export const PROSPECTS = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-07-prospeccao-servicos/PROSPECTS.csv';
export const LOG = '/home/igor/Desktop/Entregas Claude/OLLI/2026-10-24-envios/LOG.csv';
export const SUPRESSAO = '/home/igor/dados-receita/supressao-telefones.csv';
export const ESTADO = '/home/igor/chatwoot-central/data/leads-auto-estado.json';

export function caminhosPadrao() {
  return {
    entrega: ENTREGA,
    auto: CSV_AUTO,
    prospects: PROSPECTS,
    log: LOG,
    supressao: SUPRESSAO,
    estado: ESTADO,
  };
}

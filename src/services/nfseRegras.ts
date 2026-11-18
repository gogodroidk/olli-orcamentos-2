/**
 * NFS-e (Fase 1) — regras PURAS do app: zero import de rede/AsyncStorage, testáveis em Node.
 * O servidor revalida tudo (worker/src/nfse/validacao.js); aqui é só para o botão aparecer certo e a conferência
 * mostrar o que falta ANTES de chamar o servidor.
 */
import type { Orcamento, StatusOrcamento } from '../types';

export type PlanoNfse = 'gratis' | 'pro' | 'empresa';

/** Só orçamento aprovado (ou já convertido em OS) gera nota. */
const STATUS_QUE_EMITEM: readonly StatusOrcamento[] = ['aprovado', 'convertido'];

/**
 * O botão "Emitir nota" aparece? Os TRÊS precisam valer: servidor com a flag ligada, plano Empresa, orçamento aprovado.
 * `flagServidor` só é true quando o worker confirmou (GET /nfse/config); sem confirmação = false (fail closed).
 */
export function podeMostrarEmitirNota(a: { flagServidor: boolean; plano: PlanoNfse; status: StatusOrcamento }): boolean {
  return a.flagServidor === true && a.plano === 'empresa' && STATUS_QUE_EMITEM.includes(a.status);
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export function cpfValido(valor: unknown): boolean {
  const c = digitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}

export function cnpjValido(valor: unknown): boolean {
  const c = digitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  for (const t of [12, 13]) {
    let soma = 0;
    let peso = t - 7;
    for (let i = 0; i < t; i++) {
      soma += Number(c[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (dv !== Number(c[t])) return false;
  }
  return true;
}

export interface PedidoNfse {
  orcamentoId: string;
  tomador: { documento: string; nome: string };
  servico: { descricao: string; valorCentavos: number; issRetido: boolean };
}

export type FaltaNfse = 'cpf_cnpj_cliente' | 'nome_cliente' | 'descricao_servico' | 'valor';

/** Texto curto (pt-BR) para cada pendência — mostrado na conferência. */
export const ROTULO_FALTA: Record<FaltaNfse, string> = {
  cpf_cnpj_cliente: 'CPF ou CNPJ do cliente (válido)',
  nome_cliente: 'Nome do cliente',
  descricao_servico: 'Descrição do serviço',
  valor: 'Valor total maior que zero',
};

/** Descrição da nota = itens de SERVIÇO do orçamento (produto sozinho é NF-e, outra fase). Máx. 1000 caracteres. */
export function descricaoDoServico(orc: Pick<Orcamento, 'itens'>): string {
  const nomes = (orc.itens || []).filter((i) => i.tipo === 'servico' && i.nome).map((i) => (i.quantidade > 1 ? `${i.nome} (${i.quantidade} ${i.unidade || 'un'})` : i.nome));
  return nomes.join('; ').slice(0, 1000);
}

/** Orçamento → pedido para o servidor, ou a lista do que falta (nunca emite com dado incompleto). */
export function montarPedidoNfse(orc: Orcamento, issRetido = false): { ok: true; pedido: PedidoNfse } | { ok: false; faltando: FaltaNfse[] } {
  const faltando: FaltaNfse[] = [];
  const doc = digitos(orc.clienteCpfCnpj);
  if (!(doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false)) faltando.push('cpf_cnpj_cliente');
  const nome = (orc.clienteNome || '').trim();
  if (nome.length < 2) faltando.push('nome_cliente');
  const descricao = descricaoDoServico(orc);
  if (descricao.length < 3) faltando.push('descricao_servico');
  const valorCentavos = Math.round((Number(orc.valorTotal) || 0) * 100);
  if (!(valorCentavos > 0)) faltando.push('valor');
  if (faltando.length) return { ok: false, faltando };
  return { ok: true, pedido: { orcamentoId: orc.id, tomador: { documento: doc, nome }, servico: { descricao, valorCentavos, issRetido } } };
}

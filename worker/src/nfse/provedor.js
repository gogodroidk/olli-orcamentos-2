/**
 * Interface de provedor de NFS-e. Todo provedor devolve o mesmo formato, para o servidor e o app não saberem quem emitiu.
 *
 * @typedef {Object} ResultadoNfse
 * @property {'processando'|'autorizada'|'erro'} status
 * @property {string|null} [numero]
 * @property {string|null} [chave]
 * @property {string|null} [pdfUrl]
 * @property {string|null} [xmlUrl]
 * @property {string} [mensagem]   texto em português para o usuário (só em 'erro')
 * @property {'simulado'|'homologacao'} ambiente   F1 NÃO tem 'producao' — de propósito
 *
 * @typedef {Object} ProvedorNfse
 * @property {string} nome
 * @property {'simulado'|'homologacao'} ambiente
 * @property {(a:{ref:string, prestador:object, tomador:object, servico:object}) => Promise<ResultadoNfse>} emitir
 * @property {(ref:string) => Promise<ResultadoNfse>} consultar
 *
 * Provedor que não consegue falar com a rede LANÇA (Error); quem chama grava 'erro' e deixa tentar de novo.
 */
import { criarProvedorFocus } from './provedorFocus.js';
import { criarProvedorMock } from './provedorMock.js';

/**
 * NFSE_PROVEDOR: "mock" (padrão) ou "focus". Qualquer outro valor cai no mock — falha SEGURA: nunca emite de verdade por engano.
 * @returns {ProvedorNfse}
 */
export function criarProvedor(env, fetchImpl) {
  if (env.NFSE_PROVEDOR === 'focus') return criarProvedorFocus(env, fetchImpl);
  return MOCK;
}

/** Instância única: o mock guarda estado em memória e o Worker atende cada request em chamada separada. */
const MOCK = criarProvedorMock();

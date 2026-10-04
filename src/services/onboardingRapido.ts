/**
 * onboardingRapido.ts — a regra do onboarding em 4 telas (Onda I5.2).
 *
 * Objetivo único: o PRIMEIRO ORÇAMENTO ENVIADO em até 3 minutos. Em 30/09/2026,
 * 47 de 60 contas nunca orçaram. O cadastro antigo tinha 5 etapas (empresa,
 * você, endereço, logo/assinatura, serviço) antes de qualquer valor aparecer.
 * Agora são 4 telas, e a última já É o orçamento, montado pelo ofício escolhido:
 *
 *   1. Olá          — o que a OLLI faz por você, em 3 linhas.
 *   2. Seu ofício   — um toque; liga catálogo, checklist e documentos do ofício.
 *   3. Você e a base — nome, WhatsApp, cidade (o CEP preenche). Só o necessário.
 *   4. 1º orçamento — os itens do ofício já com valor de exemplo, editáveis.
 *
 * Logo, Pix, assinatura e CNPJ completo ficam para o checklist de ativação do
 * Início (`AtivacaoInicio`), sem bloquear ninguém.
 *
 * TypeScript PURO (testes em `scripts/teste-dicas-roteiro.ts`). Os valores de
 * exemplo vêm de `ativacao.ts` (fonte única): nada de tabela de preço aqui.
 */
import { exemploOrcamentoPara, itensPrefillDoExemplo, type ExemploOrcamento } from './ativacao.ts';
import { ferramentasSugeridas, type FerramentaId, type VerticalId } from './verticais.ts';
import { VERTICAL_PARA_SEGMENTO } from './verticalSegmento.ts';
import type { Segmento } from '../types/index.ts';

/** Os ofícios da tela 2, em ícones grandes. "Outro" é o ofício geral. */
export interface OficioOnboarding {
  vertical: VerticalId;
  /** Rótulo curto (cabe embaixo do ícone). */
  label: string;
  /** Ícone do MaterialCommunityIcons (string pura). */
  icone: string;
}

export const OFICIOS_ONBOARDING: readonly OficioOnboarding[] = [
  { vertical: 'refrigeracao', label: 'Ar-condicionado', icone: 'air-conditioner' },
  { vertical: 'eletrica', label: 'Elétrica', icone: 'flash' },
  { vertical: 'hidraulica', label: 'Hidráulica', icone: 'water-pump' },
  { vertical: 'pintura', label: 'Pintura', icone: 'format-paint' },
  { vertical: 'dedetizacao', label: 'Dedetização', icone: 'bug-outline' },
  { vertical: 'caixa_dagua', label: "Caixa d'água", icone: 'water-outline' },
  { vertical: 'piscina', label: 'Piscina', icone: 'pool' },
  { vertical: 'extintores', label: 'Extintores', icone: 'fire-extinguisher' },
  { vertical: 'jardinagem', label: 'Jardinagem', icone: 'flower-outline' },
  { vertical: 'geral', label: 'Outro', icone: 'dots-horizontal' },
];

export function oficioPorVertical(v: VerticalId | null | undefined): OficioOnboarding | undefined {
  return OFICIOS_ONBOARDING.find((o) => o.vertical === v);
}

/** O que a escolha do ofício grava na empresa (mesmo trio do cadastro antigo). */
export function camposDoOficio(v: VerticalId): {
  segmento: Segmento;
  verticais: VerticalId[];
  ferramentasAtivas: FerramentaId[];
} {
  return {
    segmento: VERTICAL_PARA_SEGMENTO[v],
    verticais: [v],
    ferramentasAtivas: ferramentasSugeridas([v]),
  };
}

/** Os dados da tela 3. */
export interface DadosBase {
  tipoNegocio: 'autonomo' | 'empresa' | undefined;
  nomePrestador: string;
  nomeNegocio: string;
  whatsapp: string;
  cnpj: string;
  cidade: string;
  estado: string;
}

export type CampoBase = keyof DadosBase;

/** Telefone só com dígitos, sem o 55 do país (10 ou 11 dígitos é válido). */
export function telefoneNormalizado(valor: string): string {
  return valor.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
}

/**
 * Valida a tela 3. Devolve as mensagens por campo (vazio = pode seguir). As
 * mesmas exigências do perfil operacional (`perfilOperacional.ts`): o app não
 * deixa a conta "pronta" sem nome, telefone e cidade.
 */
export function validarBase(d: DadosBase, cnpjValido: (digitos: string) => boolean): Partial<Record<CampoBase, string>> {
  const e: Partial<Record<CampoBase, string>> = {};
  if (d.tipoNegocio !== 'autonomo' && d.tipoNegocio !== 'empresa') e.tipoNegocio = 'Escolha como você trabalha.';
  if (!d.nomePrestador.trim()) e.nomePrestador = 'Diga seu nome.';
  if (d.tipoNegocio === 'empresa' && !d.nomeNegocio.trim()) e.nomeNegocio = 'Conte o nome da empresa.';
  const tel = telefoneNormalizado(d.whatsapp);
  if (tel.length < 10 || tel.length > 11) e.whatsapp = 'Informe um WhatsApp com DDD.';
  const cnpj = d.cnpj.replace(/\D/g, '');
  if (d.tipoNegocio === 'empresa' && cnpj.length === 0) e.cnpj = 'Informe o CNPJ da empresa.';
  else if (cnpj.length > 0 && !cnpjValido(cnpj)) e.cnpj = 'CNPJ inválido.';
  if (!d.cidade.trim()) e.cidade = 'Informe sua cidade.';
  if (!/^[A-Z]{2}$/i.test(d.estado.trim())) e.estado = 'UF com duas letras.';
  return e;
}

/**
 * Valida a tela 3 SEM exigir nada (T-006, 04/10/2026): o onboarding não trava
 * mais por cadastro incompleto — igual ao painel (#139). Só barra o que foi
 * preenchido errado; o que falta é cobrado ao gerar/enviar PDF, recibo ou
 * contrato (services/exigirCadastro.ts).
 */
export function validarBaseFormato(d: DadosBase, cnpjValido: (digitos: string) => boolean): Partial<Record<CampoBase, string>> {
  const e: Partial<Record<CampoBase, string>> = {};
  const tel = telefoneNormalizado(d.whatsapp);
  if (tel.length > 0 && (tel.length < 10 || tel.length > 11)) e.whatsapp = 'Informe um WhatsApp com DDD.';
  const cnpj = d.cnpj.replace(/\D/g, '');
  if (cnpj.length > 0 && !cnpjValido(cnpj)) e.cnpj = 'CNPJ inválido.';
  if (d.estado.trim() && !/^[A-Z]{2}$/i.test(d.estado.trim())) e.estado = 'UF com duas letras.';
  return e;
}

/**
 * O nome que sai no cabeçalho do orçamento. Autônomo pode deixar em branco: vale
 * o nome dele (é assim que o cliente o conhece). Empresa exige o nome (validado).
 */
export function nomeDoNegocio(d: Pick<DadosBase, 'nomeNegocio' | 'nomePrestador'>): string {
  return d.nomeNegocio.trim() || d.nomePrestador.trim();
}

// ─── Tela 4: o primeiro orçamento pré-montado ─────────────────────────────────

export interface ItemRascunho {
  tipo: 'servico' | 'produto';
  nome: string;
  descricao?: string;
  quantidade: number;
  unidade: string;
  /** Valor por unidade, em reais (começa no valor de exemplo; o prestador edita). */
  preco: number;
}

/** Os itens do exemplo do ofício, prontos para editar. Sem ofício, lista vazia. */
export function itensIniciais(v: VerticalId | null | undefined): { exemplo: ExemploOrcamento | null; itens: ItemRascunho[] } {
  const exemplo = exemploOrcamentoPara(v);
  if (!exemplo) return { exemplo: null, itens: [] };
  const itens = itensPrefillDoExemplo(exemplo).map((i) => ({
    tipo: i.tipo,
    nome: i.nome,
    ...(i.descricao ? { descricao: i.descricao } : {}),
    quantidade: i.quantidade,
    unidade: i.unidade,
    preco: i.precoSugerido,
  }));
  return { exemplo, itens };
}

/** Total em reais, somado em centavos (sem erro de arredondamento). Preço inválido conta 0. */
export function totalRascunho(itens: readonly ItemRascunho[]): number {
  const centavos = itens.reduce((s, i) => {
    const p = Number.isFinite(i.preco) && i.preco > 0 ? Math.round(i.preco * 100) : 0;
    return s + p * i.quantidade;
  }, 0);
  return centavos / 100;
}

/**
 * Os params do editor (`NovoOrcamento`) para continuar daqui: itens com o preço
 * que o prestador deixou, o cliente digitado e a marca de exemplo (o editor
 * mostra o aviso "troque pelos seus valores"). O editor continua a autoridade.
 */
export function paramsPrimeiroOrcamento(
  vertical: VerticalId,
  itens: readonly ItemRascunho[],
  clienteNome: string,
): {
  exemploVertical: VerticalId;
  clienteNome?: string;
  prefillItems: { tipo: 'servico' | 'produto'; nome: string; descricao?: string; quantidade: number; unidade: string; precoSugerido: number }[];
} {
  const nome = clienteNome.trim().slice(0, 160);
  return {
    exemploVertical: vertical,
    ...(nome ? { clienteNome: nome } : {}),
    prefillItems: itens
      .filter((i) => i.nome.trim())
      .map((i) => ({
        tipo: i.tipo,
        nome: i.nome.trim(),
        ...(i.descricao ? { descricao: i.descricao } : {}),
        quantidade: i.quantidade,
        unidade: i.unidade,
        precoSugerido: Number.isFinite(i.preco) && i.preco >= 0 ? Math.round(i.preco * 100) / 100 : 0,
      })),
  };
}

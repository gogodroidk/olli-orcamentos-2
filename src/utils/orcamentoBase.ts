/**
 * Base COMUM de um orçamento novo no app — usada pelo wizard (NovoOrcamentoScreen)
 * e pela OLLI por voz (OlliVozScreen). Antes cada tela montava o seu: o da voz
 * nascia sem validade, garantia, condições, cor e modelo de PDF da empresa, sem
 * `round2` nos subtotais e sem ligar o cliente falado ao cadastro. Um lugar só
 * garante que os dois caminhos saiam iguais.
 *
 * Funções puras (sem banco, sem tela): dá para testar com `node` direto —
 * ver scripts/teste-orcamento-base.ts.
 */
import type { Cliente, Empresa, FormaPagamento, Orcamento } from '../types';
import { generateId } from './id.ts';
import { nowISO, todayISO } from './date.ts';

// Compatibilidade: o domínio ainda mantém o campo para abrir backups/documentos
// antigos, mas orçamentos novos não anunciam nem processam forma de pagamento.
// O acerto financeiro acontece diretamente entre cliente e empresa; o OLLI só
// registra recibos depois, em fluxo próprio.
export const FORMAS_PAGAMENTO_VAZIAS: FormaPagamento = { credito: false, debito: false, dinheiro: false, pix: false };

/** Validade padrão quando a empresa não definiu uma em "Meu Negócio". */
export const VALIDADE_DIAS_PADRAO = 15;

/** Data de hoje + N dias, já formatada em DD/MM/AAAA (mesmo padrão do Step4Personalizacao). */
export function validadeEmDias(days: number, hoje: Date = new Date()): string {
  const d = new Date(hoje.getTime());
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Orçamento em branco, já com os padrões de negócio da empresa (quando
 * cadastrados em "Meu Negócio" > Personalização) para o técnico não precisar
 * redigitar validade/garantia/condições/observações em todo orçamento novo.
 * Aparência e identidade vêm do padrão central da empresa; cobrança/Pix não
 * fazem parte do documento comercial nesta versão.
 *
 * `numero` pode vir vazio: o número da sequência só é reservado na hora de
 * SALVAR (abrir e desistir não queima número). Ver `NovoOrcamentoScreen`.
 */
export function emptyOrcamento(
  numero: string,
  empresa: Empresa | null,
  /** Injetável só para teste (o uuid do RN não carrega no `node` puro). */
  gerarId: () => string = generateId,
): Orcamento {
  const validadeDias = empresa?.validadeDiasPadrao ?? VALIDADE_DIAS_PADRAO;
  const agora = nowISO();
  return {
    id: gerarId(),
    numero,
    clienteId: '',
    clienteNome: '',
    clienteTelefone: '',
    itens: [],
    subtotalServicos: 0,
    subtotalProdutos: 0,
    subtotal: 0,
    desconto: 0,
    descontoTipo: 'valor',
    valorTotal: 0,
    status: 'rascunho',
    dataEmissao: todayISO(),
    // Validade padrão vem da empresa (ou 15 dias) — evita orçamento sair sem
    // prazo algum (o técnico pode ajustar/limpar depois em Step4Personalizacao).
    validadeOrcamento: validadeEmDias(validadeDias),
    garantia: empresa?.garantiaPadrao || undefined,
    condicoesPagamento: empresa?.condicoesPagamentoPadrao || undefined,
    informacoesAdicionais: empresa?.observacoesPadrao || undefined,
    corMarca: empresa?.corMarca || undefined,
    // Modelo de PDF padrão escolhido em Conta → Modelos de documento (o técnico
    // ainda troca por orçamento em Step4). Sem padrão, Step4 assume 'editorial'.
    modeloPdf: empresa?.modeloPdfPadrao || undefined,
    formasPagamento: FORMAS_PAGAMENTO_VAZIAS,
    exibirAssinatura: true,
    solicitarAssinaturaCliente: false,
    exibirAprovacao: true,
    exibirRecusa: true,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

/** Mapeia um Cliente para os campos de cliente do orçamento (igual ao Step1Cliente). */
export function clienteParaOrc(c: Cliente): Partial<Orcamento> {
  return {
    clienteId: c.id,
    clienteNome: c.nome,
    clienteTelefone: c.telefone,
    clienteCpfCnpj: c.cpf ?? c.cnpj,
    clienteEndereco: c.endereco
      ? [c.endereco, c.complemento, c.cidade, c.estado].filter(Boolean).join(', ')
      : undefined,
  };
}

export const round2 = (x: number) => Math.round(x * 100) / 100;

export function calcTotais(o: Orcamento): Orcamento {
  const servicos = round2(o.itens.filter(i => i.tipo === 'servico').reduce((s, i) => s + i.subtotal, 0));
  const produtos = round2(o.itens.filter(i => i.tipo === 'produto').reduce((s, i) => s + i.subtotal, 0));
  const subtotal = round2(servicos + produtos);
  // Desconto em valor fixo (R$) é reclampado ao subtotal atual sempre que os
  // itens mudarem, para não ficar "preso" a um valor maior que os itens que
  // restaram (ex.: desconto de R$100 definido com R$500 em itens, depois o
  // técnico apaga itens e sobra R$50 — o desconto exibido cai para R$50).
  const descontoBruto = o.descontoTipo === 'valor'
    ? round2(Math.max(0, Math.min(subtotal, o.desconto)))
    : round2(o.desconto);
  const desconto = o.descontoTipo === 'percentual'
    ? round2(subtotal * (descontoBruto / 100))
    : descontoBruto;
  const valorTotal = round2(Math.max(0, subtotal - desconto));
  // Sinal/entrada em VALOR (R$) também é reclampado ao novo total, pela mesma razão do
  // desconto: um sinal definido com o total maior não pode ficar PRESO acima do total
  // quando os itens caem — senão o Pix/PDF cobraria MAIS que o próprio orçamento. O modo
  // PERCENTUAL (sinalValor ausente) fica intacto: um % é sempre válido sobre qualquer total.
  const sinalValor = o.sinalValor && o.sinalValor > 0 ? round2(Math.min(o.sinalValor, valorTotal)) : o.sinalValor;
  const sinalPercentual = sinalValor && sinalValor > 0 && valorTotal > 0
    ? Math.round((sinalValor / valorTotal) * 100)
    : o.sinalPercentual;
  return { ...o, subtotalServicos: servicos, subtotalProdutos: produtos, subtotal, desconto: descontoBruto, valorTotal, sinalValor, sinalPercentual };
}

/** Nome comparável: sem acento, minúsculo, sem pontuação e com espaços únicos. */
export function normalizarNome(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Liga o nome que a OLLI ouviu a um cliente JÁ cadastrado. Conservador de
 * propósito — ligar ao cliente ERRADO é pior que não ligar (o WhatsApp iria
 * para outra pessoa):
 *  1. nome igual ignorando acento/maiúscula → liga, se for um só;
 *  2. senão, o nome falado é o COMEÇO de um nome cadastrado ("João" →
 *     "João da Silva") → liga só se houver exatamente um candidato.
 * Dois ou mais candidatos = ambíguo = não liga (o prestador escolhe no editor).
 */
export function casarClientePorNome(nome: string | null | undefined, clientes: readonly Cliente[]): Cliente | null {
  const alvo = normalizarNome(nome);
  if (alvo.length < 2) return null;
  const exatos = clientes.filter(c => normalizarNome(c.nome) === alvo);
  if (exatos.length === 1) return exatos[0];
  if (exatos.length > 1) return null;
  const prefixo = clientes.filter(c => normalizarNome(c.nome).startsWith(`${alvo} `));
  return prefixo.length === 1 ? prefixo[0] : null;
}

/** Teto do catálogo aceito pelo worker da voz (`VOZ_MAX.catalogoItens` em worker/src/voz.js). */
export const CATALOGO_VOZ_MAX = 100;
/** Serviços entram primeiro (são o grosso do orçamento); produtos ocupam o resto. */
export const CATALOGO_VOZ_MAX_SERVICOS = 60;

export interface ItemCatalogoVoz {
  nome: string;
  preco?: number;
}

/**
 * Catálogo enxuto que vai junto para a IA da voz casar o que foi falado com o
 * preço já cadastrado. Antes só iam os SERVIÇOS — "2 capacitores" nunca achava
 * o preço do produto. Só nome (e preço quando > 0), no máximo `CATALOGO_VOZ_MAX`.
 */
export function catalogoParaVoz(
  servicos: readonly { nome: string; preco: number }[],
  produtos: readonly { nome: string; preco: number }[] = [],
): ItemCatalogoVoz[] {
  const leve = (s: { nome: string; preco: number }): ItemCatalogoVoz =>
    (s.preco > 0 ? { nome: s.nome, preco: s.preco } : { nome: s.nome });
  const comNome = (s: { nome: string }) => !!s.nome?.trim();
  const daServico = servicos.filter(comNome).slice(0, CATALOGO_VOZ_MAX_SERVICOS).map(leve);
  const daProduto = produtos.filter(comNome).slice(0, CATALOGO_VOZ_MAX - daServico.length).map(leve);
  return [...daServico, ...daProduto];
}

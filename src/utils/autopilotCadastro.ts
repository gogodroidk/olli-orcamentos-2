/**
 * Autopilot que CADASTRA (item 2.13) — regras puras, sem banco e sem tela.
 *
 * A prévia da IA (services/iaAutopilot.ts) só sugere. Esta camada transforma a
 * sugestão em um checklist que o usuário confirma e grava pelos MESMOS
 * `saveCliente` / `saveProduto` / `saveServico` das telas de cadastro (que
 * carimbam o relógio de sync e espelham na nuvem). As funções de gravação
 * entram por injeção para dar para testar com `node` direto —
 * ver scripts/teste-autopilot-cadastra.ts.
 *
 * Regras que este arquivo segura:
 *  - possível duplicado (telefone via `encontrarClientesDuplicados`, nome
 *    normalizado, ou repetido na própria prévia) é AVISADO e nasce desmarcado;
 *    o resto nasce marcado. Nada é bloqueado: a decisão é do usuário;
 *  - se a leitura do cadastro existente falhou, a conferência fica
 *    "não verificada" (3º estado) — nunca vira "não tem duplicado";
 *  - cada item gravado devolve sucesso OU erro próprio. Erro nunca vira
 *    sucesso silencioso, e um item que falhou não derruba os outros;
 *  - abrir o orçamento leva cliente (id quando existe, senão só o nome),
 *    itens com o tipo certo e o preço sugerido como referência.
 */
import type { PrefillItem } from '../navigation/AppNavigator';
import type { AutopilotCandidato, AutopilotPrevia } from '../services/iaAutopilot';
import type { Cliente, ProdutoItem, ServicoItem } from '../types';
import { encontrarClientesDuplicados } from './clientesDuplicados.ts';

export type TipoCadastro = 'cliente' | 'produto' | 'servico';

export type PossivelDuplicado =
  | { origem: 'cadastro'; id: string; nome: string; motivo: 'telefone' | 'nome' }
  | { origem: 'previa'; nome: string; motivo: 'telefone' | 'nome' };

export type CandidatoCadastro = {
  /** Chave estável dentro da prévia (`tipo:índice`). */
  chave: string;
  tipo: TipoCadastro;
  nome: string;
  telefone: string;
  descricao: string;
  unidade: string;
  precoSugerido: number;
  confianca: number;
  evidencia: string;
  duplicado: PossivelDuplicado | null;
  /** `false` quando o cadastro existente não pôde ser lido: duplicidade DESCONHECIDA. */
  conferido: boolean;
};

/** `null` = a leitura falhou (ou o papel não pode ler). Nunca use `[]` para "não sei". */
export type CadastroExistente = {
  clientes: Cliente[] | null;
  produtos: ProdutoItem[] | null;
  servicos: ServicoItem[] | null;
};

/**
 * Acentos que o `normalize('NFD')` separa da letra. Escape em STRING (não o
 * caractere combinante literal, invisível no editor e apagado calado por um
 * salvamento com encoding errado). Mesma regra de `services/cep.ts`.
 */
const DIACRITICOS = new RegExp('[\u0300-\u036f]', 'g');

export function normalizarNome(valor?: string | null): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const soDigitos = (valor?: string | null): string => (valor ?? '').replace(/\D/g, '');

function ativos<T extends { excluidoEm?: string }>(lista: T[] | null): T[] | null {
  return lista ? lista.filter((item) => !item.excluidoEm) : null;
}

function duplicadoNoCadastro(
  tipo: TipoCadastro,
  candidato: AutopilotCandidato,
  existentes: CadastroExistente,
): PossivelDuplicado | null {
  const nome = normalizarNome(candidato.nome);
  if (tipo === 'cliente') {
    const clientes = ativos(existentes.clientes);
    if (!clientes) return null;
    const porTelefone = encontrarClientesDuplicados(clientes, { telefone: candidato.telefone })[0];
    if (porTelefone) return { origem: 'cadastro', id: porTelefone.id, nome: porTelefone.nome, motivo: 'telefone' };
    const porNome = nome ? clientes.find((c) => normalizarNome(c.nome) === nome) : undefined;
    return porNome ? { origem: 'cadastro', id: porNome.id, nome: porNome.nome, motivo: 'nome' } : null;
  }
  const catalogo = ativos(tipo === 'produto' ? existentes.produtos : existentes.servicos);
  if (!catalogo || !nome) return null;
  const igual = catalogo.find((item) => normalizarNome(item.nome) === nome);
  return igual ? { origem: 'cadastro', id: igual.id, nome: igual.nome, motivo: 'nome' } : null;
}

/**
 * Monta o checklist a partir da prévia. Ordem: clientes, produtos, serviços —
 * a mesma dos contadores da tela.
 */
export function montarCandidatosCadastro(
  candidatos: Pick<AutopilotPrevia['candidatos'], 'clientes' | 'produtos' | 'servicos'>,
  existentes: CadastroExistente,
): CandidatoCadastro[] {
  const grupos: Array<[TipoCadastro, AutopilotCandidato[], unknown[] | null]> = [
    ['cliente', candidatos.clientes, existentes.clientes],
    ['produto', candidatos.produtos, existentes.produtos],
    ['servico', candidatos.servicos, existentes.servicos],
  ];
  const resultado: CandidatoCadastro[] = [];
  for (const [tipo, lista, base] of grupos) {
    const vistosNome = new Map<string, string>();
    const vistosTelefone = new Map<string, string>();
    lista.forEach((candidato, indice) => {
      const nomeNorm = normalizarNome(candidato.nome);
      const tel = tipo === 'cliente' ? soDigitos(candidato.telefone) : '';
      let duplicado = duplicadoNoCadastro(tipo, candidato, existentes);
      if (!duplicado && tel.length >= 10 && vistosTelefone.has(tel)) {
        duplicado = { origem: 'previa', nome: vistosTelefone.get(tel)!, motivo: 'telefone' };
      }
      if (!duplicado && nomeNorm && vistosNome.has(nomeNorm)) {
        duplicado = { origem: 'previa', nome: vistosNome.get(nomeNorm)!, motivo: 'nome' };
      }
      if (nomeNorm && !vistosNome.has(nomeNorm)) vistosNome.set(nomeNorm, candidato.nome);
      if (tel.length >= 10 && !vistosTelefone.has(tel)) vistosTelefone.set(tel, candidato.nome);
      resultado.push({
        chave: `${tipo}:${indice}`,
        tipo,
        nome: candidato.nome,
        telefone: candidato.telefone ?? '',
        descricao: candidato.descricao,
        unidade: candidato.unidade || 'un',
        precoSugerido: candidato.precoSugerido,
        confianca: candidato.confianca,
        evidencia: candidato.evidencia,
        duplicado,
        conferido: base !== null,
      });
    });
  }
  return resultado;
}

/** Caixas marcadas por padrão — exceto os possíveis duplicados, que o usuário marca se quiser. */
export function selecaoInicial(candidatos: CandidatoCadastro[]): Set<string> {
  return new Set(candidatos.filter((c) => !c.duplicado).map((c) => c.chave));
}

export function textoDuplicado(d: PossivelDuplicado): string {
  if (d.origem === 'previa') return `Repetido nesta prévia (${d.nome})`;
  return d.motivo === 'telefone'
    ? `Possível duplicado: mesmo telefone de "${d.nome}"`
    : `Possível duplicado: já existe "${d.nome}"`;
}

export type ResultadoItemCadastro =
  | { chave: string; tipo: TipoCadastro; nome: string; ok: true; id: string }
  | { chave: string; tipo: TipoCadastro; nome: string; ok: false; erro: string };

export type ResultadoCadastro = {
  itens: ResultadoItemCadastro[];
  cadastrados: number;
  falhas: number;
};

export type DependenciasCadastro = {
  saveCliente: (c: Cliente) => Promise<void>;
  saveProduto: (p: ProdutoItem) => Promise<void>;
  saveServico: (s: ServicoItem) => Promise<void>;
  gerarId: () => string;
  agora: () => string;
  /** Mesmas portas das telas: Clientes (`ver_clientes`) e catálogo (`ver_valores_agregados`). */
  permissoes: { clientes: boolean; catalogo: boolean };
};

const ROTULO_TIPO: Record<TipoCadastro, string> = { cliente: 'cliente', produto: 'produto', servico: 'serviço' };

function detalheErro(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : typeof erro === 'string' ? erro : '';
  return msg.trim().slice(0, 160);
}

/**
 * Grava os candidatos marcados, um por um. Cada item tem resultado próprio:
 * a falha de um não derruba os outros e nunca é contada como sucesso.
 */
export async function cadastrarSelecionados(
  candidatos: CandidatoCadastro[],
  selecionados: ReadonlySet<string>,
  deps: DependenciasCadastro,
): Promise<ResultadoCadastro> {
  const itens: ResultadoItemCadastro[] = [];
  for (const c of candidatos) {
    if (!selecionados.has(c.chave)) continue;
    const base = { chave: c.chave, tipo: c.tipo, nome: c.nome };
    const falhar = (erro: string) => itens.push({ ...base, ok: false, erro });
    const nome = c.nome.trim();
    if (!nome) { falhar('Sem nome — não dá para cadastrar.'); continue; }
    if (c.tipo === 'cliente' ? !deps.permissoes.clientes : !deps.permissoes.catalogo) {
      falhar(`Seu papel na empresa não permite cadastrar ${ROTULO_TIPO[c.tipo]}.`);
      continue;
    }
    const id = deps.gerarId();
    const criadoEm = deps.agora();
    try {
      if (c.tipo === 'cliente') {
        const tel = soDigitos(c.telefone);
        if (tel.length > 0 && tel.length < 10) {
          falhar('Telefone incompleto (falta DDD + número). Cadastre pela tela de Clientes.');
          continue;
        }
        await deps.saveCliente({ id, nome, telefone: c.telefone.trim(), criadoEm });
      } else {
        const item = {
          id, nome, descricao: c.descricao.trim() || undefined,
          preco: Number.isFinite(c.precoSugerido) && c.precoSugerido > 0 ? c.precoSugerido : 0,
          unidade: c.unidade || 'un', criadoEm,
        };
        if (c.tipo === 'produto') await deps.saveProduto(item);
        else await deps.saveServico(item);
      }
      itens.push({ ...base, ok: true, id });
    } catch (erro) {
      const detalhe = detalheErro(erro);
      falhar(`Não foi gravado no aparelho${detalhe ? `: ${detalhe}` : '.'}`);
    }
  }
  const cadastrados = itens.filter((i) => i.ok).length;
  return { itens, cadastrados, falhas: itens.length - cadastrados };
}

export function resumoCadastro(r: ResultadoCadastro): string {
  if (!r.itens.length) return 'Nenhum item marcado para cadastrar.';
  const ok = `${r.cadastrados} ${r.cadastrados === 1 ? 'item cadastrado' : 'itens cadastrados'}`;
  return r.falhas ? `${ok} · ${r.falhas} com erro` : ok;
}

export type ParamsOrcamentoAutopilot = {
  clienteId?: string;
  clienteNome?: string;
  prefillItems: PrefillItem[];
};

/**
 * Cliente do orçamento: nome que a IA indicou (ou o único cliente da prévia).
 * O id vem do cadastro feito agora ou do cadastro que já existia com o mesmo
 * nome/telefone. Sem id, segue só o nome — o usuário liga ao cadastro no Orçar.
 */
export function resolverClienteOrcamento(
  orcamento: Pick<AutopilotPrevia['candidatos']['orcamento'], 'clienteNome'>,
  candidatos: CandidatoCadastro[],
  cadastrados: ReadonlyMap<string, string>,
  clientesExistentes: Cliente[] | null,
): { id?: string; nome: string } | null {
  const clientes = candidatos.filter((c) => c.tipo === 'cliente');
  const nomeAlvo = orcamento.clienteNome.trim() || (clientes.length === 1 ? clientes[0].nome.trim() : '');
  if (!nomeAlvo) return null;
  const alvo = normalizarNome(nomeAlvo);
  const candidato = clientes.find((c) => normalizarNome(c.nome) === alvo);
  if (candidato) {
    const idNovo = cadastrados.get(candidato.chave);
    if (idNovo) return { id: idNovo, nome: candidato.nome };
    // Só liga ao cadastro existente quando o NOME bate. Telefone igual com nome
    // diferente pode ser outra pessoa (marido/esposa, filiais): ligar ali poria
    // o orçamento no cliente errado sem ninguém perceber.
    if (candidato.duplicado?.origem === 'cadastro' && candidato.duplicado.motivo === 'nome') {
      return { id: candidato.duplicado.id, nome: candidato.duplicado.nome };
    }
  }
  const existente = ativos(clientesExistentes)?.find((c) => normalizarNome(c.nome) === alvo);
  if (existente) return { id: existente.id, nome: existente.nome };
  return { nome: nomeAlvo };
}

/**
 * Parâmetros do fluxo Orçar (`NovoOrcamento`). Os itens do orçamento chegam da
 * IA como tipo genérico: viram `produto` quando o nome bate com um produto da
 * prévia ou do catálogo, senão `servico`. Preço sugerido só vai quando > 0
 * (zero = a IA não achou preço; o editor pede o valor).
 */
export function montarParamsOrcamento(input: {
  itens: AutopilotCandidato[];
  nomesProdutos: string[];
  cliente: { id?: string; nome: string } | null;
}): ParamsOrcamentoAutopilot | null {
  const produtos = new Set(input.nomesProdutos.map(normalizarNome).filter(Boolean));
  const prefillItems: PrefillItem[] = input.itens
    .filter((item) => item.nome.trim())
    .map((item) => {
      const tipo: PrefillItem['tipo'] = item.tipo === 'produto' || produtos.has(normalizarNome(item.nome)) ? 'produto' : 'servico';
      const prefill: PrefillItem = {
        tipo,
        nome: item.nome.trim(),
        quantidade: item.quantidade > 0 ? item.quantidade : 1,
        unidade: item.unidade || 'un',
      };
      if (item.descricao.trim()) prefill.descricao = item.descricao.trim();
      if (Number.isFinite(item.precoSugerido) && item.precoSugerido > 0) prefill.precoSugerido = item.precoSugerido;
      return prefill;
    });
  if (!prefillItems.length && !input.cliente) return null;
  const params: ParamsOrcamentoAutopilot = { prefillItems };
  if (input.cliente?.id) params.clienteId = input.cliente.id;
  if (input.cliente?.nome) params.clienteNome = input.cliente.nome;
  return params;
}

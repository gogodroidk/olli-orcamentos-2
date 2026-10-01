/**
 * Regras PURAS da OS que nasce de um orçamento (B70 / item 1.18 do plano).
 *
 * Antes, `criarOSDeOrcamento` copiava só cliente, título e valor: o técnico abria a
 * OS e não via o que fazer (itens), onde (endereço), quando (data) nem o roteiro do
 * ofício (checklist). Aqui fica tudo o que é decisão — sem banco, sem rede, sem
 * React Native — para o teste (`scripts/teste-os-do-orcamento.ts`) prender a regra.
 *
 * Nenhuma coluna nova: a OS (types/index.ts → OrdemServico) não tem campo de
 * endereço nem de itens, então os dois entram no texto de `descricao`, que a tela
 * da OS já mostra. Preço dos itens NÃO entra na descrição: o técnico pode não ter
 * permissão de ver valores, e o valor total já está no campo `valor`.
 */
import type { ItemChecklist, Orcamento, OrdemServico } from '../types';
import { dataBrParaIsoSeguro } from './date.ts';

/** `OS-0001` a partir do sequencial (mesmo formato do motor de contratos e do painel). */
export function formatarNumeroOS(sequencial: number): string {
  return `OS-${String(Math.max(1, Math.floor(sequencial))).padStart(4, '0')}`;
}

/** Maior sufixo numérico entre os números de OS conhecidos (`OS-0012` → 12). 0 se nenhum. */
export function maiorSequencialOS(numeros: readonly unknown[]): number {
  let maior = 0;
  for (const numero of numeros) {
    const m = /(\d+)\s*$/.exec(String(numero ?? ''));
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return maior;
}

/**
 * Próximo número de OS somando TODAS as fontes que o aparelho conseguiu ler.
 *
 * `null` numa fonte = "não consegui ler" (diferente de `[]`, "li e não tem nada").
 * Se NENHUMA fonte foi lida, devolve `null`: emitir `OS-0001` por não saber seria
 * reemitir um número que já existe (erro nunca vira vazio).
 */
export function proximoNumeroOSDasFontes(
  ...fontes: readonly (readonly unknown[] | null)[]
): string | null {
  const lidas = fontes.filter((f): f is readonly unknown[] => Array.isArray(f));
  if (!lidas.length) return null;
  return formatarNumeroOS(maiorSequencialOS(lidas.flat()) + 1);
}

function quantidadeLegivel(q: number): string {
  if (!Number.isFinite(q) || q <= 0) return '1';
  return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
}

/**
 * Texto da OS: itens (quantidade, unidade, nome e a descrição do item) e o endereço
 * do serviço. `undefined` quando não há nada a dizer.
 */
export function descricaoDaOSDoOrcamento(orc: Pick<Orcamento, 'itens' | 'clienteEndereco'>): string | undefined {
  const blocos: string[] = [];
  const itens = Array.isArray(orc.itens) ? orc.itens : [];
  const linhas = itens
    .filter((i) => i && (i.nome || '').trim())
    .map((i) => {
      const unidade = (i.unidade || '').trim();
      const qtd = `${quantidadeLegivel(Number(i.quantidade))}${unidade ? ` ${unidade}` : 'x'}`;
      const detalhe = (i.descricao || '').trim();
      return `• ${qtd} — ${i.nome.trim()}${detalhe ? ` (${detalhe})` : ''}`;
    });
  if (linhas.length) blocos.push(`O que fazer:\n${linhas.join('\n')}`);

  const endereco = (orc.clienteEndereco || '').trim();
  if (endereco) blocos.push(`Endereço do serviço: ${endereco}`);

  return blocos.length ? blocos.join('\n\n') : undefined;
}

/**
 * Data da OS: o "Agendamento do serviço" do orçamento e, sem ele, a "Data de
 * prestação". O formulário grava DD/MM/AAAA; o painel pode gravar ISO. Data sem
 * hora vira o SENTINELA de dia (`isoDoDiaSemHora`: meio-dia UTC + 1 s) e a tela
 * mostra só o dia (`ehDiaSemHora`). Texto inválido = sem data, nunca uma data
 * inventada.
 */
export function dataAgendadaDoOrcamento(
  orc: Pick<Orcamento, 'agendamentoServico' | 'dataPrestacaoServico'>,
): string | undefined {
  for (const bruto of [orc.agendamentoServico, orc.dataPrestacaoServico]) {
    const texto = (bruto || '').trim();
    if (!texto) continue;
    if (texto.includes('/')) {
      const iso = isoDoDiaSemHora(dataBrParaIsoSeguro(texto));
      if (iso) return iso;
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      const iso = isoDoDiaSemHora(dataBrParaIsoSeguro(texto.split('-').reverse().join('/')));
      if (iso) return iso;
      continue;
    }
    const t = Date.parse(texto);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return undefined;
}

/**
 * Sentinela de "só o DIA, sem hora": meio-dia UTC + 1 SEGUNDO (09:00:01 em Brasília).
 *
 * Por que não o meio-dia UTC puro de `dataBrParaIsoSeguro`: 12:00:00Z é exatamente
 * 09:00 em Brasília — o horário que o técnico mais agenda (contrato com
 * `horarioVisita` 09:00, agenda do painel, form de OS do webapp). Tratar 12:00:00Z
 * como "sem hora" escondia o "às 09:00" de OS agendadas de verdade. Nenhum seletor
 * do app grava segundos, então o `:01` só nasce aqui.
 */
export function isoDoDiaSemHora(isoMeioDia: string | null | undefined): string | null {
  if (!isoMeioDia) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T12:00:00(?:\.000)?Z$/.exec(isoMeioDia);
  return m ? `${m[1]}T12:00:01.000Z` : null;
}

/**
 * A OS guarda um DIA sem hora (sentinela de `isoDoDiaSemHora`)? Compara o INSTANTE,
 * não o texto: a nuvem devolve `+00:00` em vez de `Z` e pode omitir os milissegundos.
 */
export function ehDiaSemHora(iso: string | undefined): boolean {
  if (typeof iso !== 'string' || !iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return d.getUTCHours() === 12 && d.getUTCMinutes() === 0
    && d.getUTCSeconds() === 1 && d.getUTCMilliseconds() === 0;
}

/** Checklist do ofício como itens desmarcados (ids vêm de fora: UUID estável). */
export function checklistDoModelo(modelo: readonly string[], novoId: () => string): ItemChecklist[] {
  return modelo
    .map((texto) => (texto || '').trim())
    .filter(Boolean)
    .map((texto) => ({ id: novoId(), texto, feito: false }));
}

/** Fotos do orçamento, sem vazio e sem repetição. */
export function fotosDoOrcamento(orc: Pick<Orcamento, 'fotosServico'>): string[] {
  const fotos = Array.isArray(orc.fotosServico) ? orc.fotosServico : [];
  return [...new Set(fotos.filter((f) => typeof f === 'string' && f.trim()))];
}

/** Monta a OS completa a partir do orçamento. Não grava nada. */
export function montarOSDoOrcamento(
  orc: Orcamento,
  opcoes: {
    id: string;
    numero: string;
    agora: string;
    modeloChecklist: readonly string[];
    novoId: () => string;
  },
): OrdemServico {
  return {
    id: opcoes.id,
    numero: opcoes.numero,
    orcamentoId: orc.id,
    clienteId: orc.clienteId || undefined,
    clienteNome: orc.clienteNome ?? '',
    titulo: orc.numero ? `Orçamento ${orc.numero}` : (orc.clienteNome ?? 'Ordem de serviço'),
    descricao: descricaoDaOSDoOrcamento(orc),
    status: 'aberta',
    dataAgendada: dataAgendadaDoOrcamento(orc),
    checklist: checklistDoModelo(opcoes.modeloChecklist, opcoes.novoId),
    fotos: fotosDoOrcamento(orc),
    valor: orc.valorTotal,
    criadoEm: opcoes.agora,
    atualizadoEm: opcoes.agora,
  };
}

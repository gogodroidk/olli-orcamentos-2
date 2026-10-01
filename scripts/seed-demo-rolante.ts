/**
 * DEMO GR TECH VIVA — "seed rolante" da conta de demonstração.
 *
 *     node --env-file=<arquivo com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY> scripts/seed-demo-rolante.ts
 *         → SIMULAÇÃO (padrão): lê a conta demo e mostra o que mudaria. Não escreve nada.
 *     node --env-file=... scripts/seed-demo-rolante.ts --aplicar
 *         → escreve na conta demo (e SÓ nela).
 *
 * POR QUE EXISTE
 *   A demo foi semeada em 10/07 com datas fixas — e em UTC. Três meses depois a agenda
 *   abre vazia, as visitas antigas aparecem às 4h/5h da manhã, o mapa não tem técnico,
 *   a chave Pix e o CNPJ são inválidos e não há contrato. Quem avalia o OLLI pela demo
 *   vê um app parado. Este script reposiciona a demo em torno de HOJE.
 *
 * O QUE ELE GARANTE (relativo ao dia em que roda, horário de Brasília):
 *   - visitas de −7 a +14 dias, todas entre 8h e 17h, com técnico responsável; as que já
 *     terminaram ficam "concluído", as outras "agendado"; domingo vira sábado;
 *   - 1 série mensal na agenda (recorrência projetada pela própria agenda);
 *   - 1 contrato PMOC mensal vigente, com a visita do mês gerada pelo MESMO motor do app
 *     (`gerarVisitasDosContratos`) — idempotente pela chave (contrato, mês);
 *   - 1 orçamento aprovado no mês corrente (um por mês, número da sequência do tenant);
 *   - CNPJ, CPF e chave Pix da empresa válidos; CPF/CNPJ dos clientes com dígito válido;
 *   - pelo menos 2 técnicos membros ativos, com última posição no mapa.
 *
 * IDEMPOTENTE: ids determinísticos. Rodar duas vezes no mesmo dia não muda nada além dos
 *   carimbos (`criado_em`/`atualizado_em`) e do status das visitas; rodar uma vez por semana (recomendado) reposiciona as visitas. A série,
 *   o contrato e o orçamento do mês são criados UMA vez e depois deixados em paz (não
 *   reescrevemos documento que já existe). Nada é apagado.
 *
 * NÃO É "MODO DEMO": o app não tem caminho especial para esta conta. É uma conta comum
 *   de uma empresa fictícia, com dados gravados pelos mesmos formatos do `cloudSync.ts`.
 *
 * DINHEIRO: a chave Pix da demo é uma chave ALEATÓRIA (EVP) fixa que não está registrada
 *   em banco nenhum — o QR é bem formado (o app mostra o Pix), mas um pagamento real é
 *   recusado pelo banco em vez de cair na conta de um desconhecido. CNPJ/CPF são números
 *   fictícios com dígito verificador válido (o app e o "Preparar nota" validam o dígito).
 *
 * TRAVA: só escreve se o usuário dono for `demo@grtech.com.br` (conferido no Auth antes
 *   de qualquer escrita). Qualquer outra conta → aborta sem tocar em nada.
 *
 * SEGREDOS: lidos só do ambiente; nunca impressos. A senha dos técnicos criados é
 *   aleatória e descartada (só o dono da demo tem senha conhecida).
 *
 * AGENDAR (passo humano, depois do aval): Agendador de Tarefas do Windows, toda segunda
 *   às 06:00, rodando o comando com `--aplicar`. Ver o corpo do PR.
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Agendamento, ContratoRecorrente, Orcamento } from '../src/types/index.ts';
import {
  type Linha,
  contratoParaLinha,
  diaBR,
  hojeNoBrasil,
  instanteNoBrasil,
  linhaParaContrato,
  nomeDoEquipamento,
  somarDias,
  validarContrato,
} from '../src/utils/contratoRecorrente.ts';
import { gerarVisitasDosContratos } from '../src/utils/contratoRecorrenteGeracao.ts';
import { portaSupabase } from '../src/utils/contratoRecorrenteSupabase.ts';
import { numeroDocumentoAposColisao } from '../src/utils/numeroDocumento.ts';
import { cnpjValido, cpfValido, normalizarChavePix } from '../src/utils/pixBrCode.ts';

// ─── Constantes da demo ───────────────────────────────────────────────────────

export const DEMO_EMAIL = 'demo@grtech.com.br';
/** Chave aleatória (EVP) fixa, sem registro no DICT: Pix bem formado, pagamento recusado. */
export const DEMO_CHAVE_PIX = '6c611288-cdc9-424a-a24b-b1500d470f3f';
/** CNPJ fictício com dígito verificador válido. */
export const DEMO_CNPJ = '47061893000149';
/** CPF fictício com dígito verificador válido (responsável pela empresa). */
export const DEMO_CPF = '38472910504';

export const JANELA_DIAS = { de: -7, ate: 14 } as const;
export const ID_SERIE_MENSAL = 'ag_demo_serie_mensal';
export const ID_CONTRATO_PMOC = 'ctr_demo_pmoc';
export const idVisita = (n: number): string => `ag_demo_rol_${String(n).padStart(2, '0')}`;
export const idOrcamentoDoMes = (mes: string): string => `orc_demo_aprovado_${mes.replace('-', '')}`;

/** Técnicos que o script cria se a equipe tiver menos de 2 (só nome e e-mail fictícios). */
const TECNICOS_RESERVA = [
  { email: 'carlos.tecnico@grtech.com.br', nome: 'Carlos Lima' },
  { email: 'rafael.tecnico@grtech.com.br', nome: 'Rafael Souza' },
];

/** Última posição de cada técnico no mapa (zona oeste/centro de São Paulo). */
const POSICOES_TECNICOS = [
  { lat: -23.5614, lng: -46.6559 },
  { lat: -23.5329, lng: -46.6395 },
];

const SERVICOS_RESERVA = [
  { id: '', nome: 'Manutenção preventiva de split', preco: 250, unidade: 'un' },
  { id: '', nome: 'Higienização completa', preco: 180, unidade: 'un' },
];

/** O que cada visita é, em rodízio (tipo do app + título + duração em minutos). */
const ROTEIRO: ReadonlyArray<{ tipo: Agendamento['tipo']; titulo: string; minutos: number }> = [
  { tipo: 'manutencao', titulo: 'Manutenção preventiva', minutos: 90 },
  { tipo: 'limpeza', titulo: 'Limpeza de split', minutos: 60 },
  { tipo: 'instalacao', titulo: 'Instalação de split 12.000 BTUs', minutos: 120 },
  { tipo: 'visita', titulo: 'Visita técnica', minutos: 60 },
  { tipo: 'orcamento', titulo: 'Visita para orçamento', minutos: 60 },
];
const HORAS_MANHA = ['08:00', '09:30', '10:00'];
const HORAS_TARDE = ['13:30', '14:00', '15:00'];

// ─── Entrada lida do banco (forma mínima) ─────────────────────────────────────

export interface ClienteDemo {
  id: string;
  nome: string;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
}

export interface EntradaSeed {
  ownerId: string;
  orgId: string;
  tecnicos: ReadonlyArray<{ id: string; nome: string }>;
  clientes: readonly ClienteDemo[];
  servicos: ReadonlyArray<{ id: string; nome: string; preco: number; unidade?: string | null }>;
  /** Equipamentos do inventário (assets) com o cliente a que pertencem. */
  ativos: ReadonlyArray<{ id: string; clienteId: string | null; nome: string }>;
  empresa: Record<string, unknown> | null;
  serieExiste: boolean;
  contratoExiste: boolean;
  orcamentoDoMesExiste: boolean;
  /** Todos os números de orçamento do tenant (lixeira inclusive). */
  numerosOrcamento: readonly string[];
  contadorOrcamento: number;
}

export interface PlanoSeed {
  hoje: string;
  agendamentos: Linha[];
  serie: Linha | null;
  contrato: ContratoRecorrente | null;
  orcamento: Linha | null;
  contadorOrcamento: number | null;
  empresaDados: Record<string, unknown> | null;
  clientesCorrigidos: Array<{ id: string; cpf?: string; cnpj?: string }>;
  localizacoes: Linha[];
}

// ─── Funções puras ────────────────────────────────────────────────────────────

const soDigitos = (s: unknown): string => String(s ?? '').replace(/\D/g, '');

/** Dígito verificador módulo 11 (mesma regra de `pixBrCode.ts`). */
function dv(d: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(d[i]) * pesos[i];
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

/** Dígitos determinísticos a partir de um texto (FNV-1a) — mesmo cliente, mesmo número. */
function digitosDe(semente: string, n: number): string {
  let h = 0x811c9dc5;
  let out = '';
  for (let rodada = 0; out.length < n; rodada++) {
    for (const ch of `${semente}#${rodada}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += String(h % 1_000_000_000).padStart(9, '0');
  }
  const d = out.slice(0, n);
  // Sequência repetida (000…, 111…) é inválida por regra: troca o primeiro dígito.
  return /^(\d)\1+$/.test(d) ? `${(Number(d[0]) + 1) % 10}${d.slice(1)}` : d;
}

/** CPF fictício, com dígito válido, estável para a mesma semente. */
export function cpfFicticio(semente: string): string {
  let d = digitosDe(`cpf:${semente}`, 9);
  d += dv(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  d += dv(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d;
}

/** CNPJ fictício (matriz 0001), com dígito válido, estável para a mesma semente. */
export function cnpjFicticio(semente: string): string {
  let d = `${digitosDe(`cnpj:${semente}`, 8)}0001`;
  d += dv(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  d += dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d;
}

/** Sábado no lugar de domingo (a GR Tech atende de segunda a sábado). */
function diaUtil(dia: string): { dia: string; domingo: boolean } {
  const domingo = new Date(`${dia}T12:00:00Z`).getUTCDay() === 0;
  return domingo ? { dia: somarDias(dia, -1), domingo } : { dia, domingo };
}

function enderecoDe(c: ClienteDemo | undefined): string | null {
  if (!c) return null;
  const partes = [c.endereco, c.cidade && c.estado ? `${c.cidade}/${c.estado}` : c.cidade].filter(
    (s): s is string => !!s?.trim(),
  );
  return partes.length ? partes.join(' — ') : null;
}

const centavos = (v: number): number => Math.round(v * 100) / 100;

/**
 * As visitas da janela. A QUANTIDADE e os ids são fixos (não dependem do dia da semana):
 * uma visita por dia de −7 a +14 e uma segunda a cada 3 dias. Assim a rodada seguinte
 * reaproveita exatamente as mesmas linhas — nenhuma visita "órfã" fica para trás com
 * data velha.
 */
export function planejarVisitas(e: EntradaSeed, agora: Date): Linha[] {
  const hoje = hojeNoBrasil(agora);
  const agoraIso = agora.toISOString();
  const clientes = [...e.clientes].sort((a, b) => a.id.localeCompare(b.id));
  const linhas: Linha[] = [];
  let n = 0;
  for (let o = JANELA_DIAS.de; o <= JANELA_DIAS.ate; o++) {
    const { dia, domingo } = diaUtil(somarDias(hoje, o));
    const k = ((o % 3) + 3) % 3;
    const horas = domingo ? ['11:00'] : o % 3 === 0 ? [HORAS_MANHA[k], HORAS_TARDE[k]] : [HORAS_MANHA[k]];
    // Domingo com segunda visita: a da tarde vai para sábado 14h30 (não colide com 11h
    // e termina antes das 17h mesmo na visita mais longa).
    if (domingo && o % 3 === 0) horas.push('14:30');
    for (const hora of horas) {
      n++;
      const roteiro = ROTEIRO[(n - 1) % ROTEIRO.length];
      const cliente = clientes.length ? clientes[(n - 1) % clientes.length] : undefined;
      const tecnico = e.tecnicos.length ? e.tecnicos[(n - 1) % e.tecnicos.length] : undefined;
      const inicio = instanteNoBrasil(dia, hora);
      const fim = new Date(new Date(inicio).getTime() + roteiro.minutos * 60_000).toISOString();
      linhas.push({
        id: idVisita(n),
        user_id: e.ownerId,
        cliente_id: cliente?.id ?? null,
        cliente_nome: cliente?.nome ?? 'Cliente',
        titulo: roteiro.titulo,
        tipo: roteiro.tipo,
        inicio,
        fim,
        endereco: enderecoDe(cliente),
        status: fim <= agoraIso ? 'concluido' : 'agendado',
        orcamento_id: null,
        observacao: null,
        responsavel_id: tecnico?.id ?? null,
        responsavel_nome: tecnico?.nome ?? null,
        recorrencia: null,
        recorrencia_ate: null,
        contrato_id: null,
        criado_em: agoraIso,
        atualizado_em: agoraIso,
        excluido_em: null,
      });
    }
  }
  return linhas;
}

/** Cliente pessoa jurídica (contrato/PMOC) e pessoa física (orçamento), já corrigidos. */
function escolherClientes(clientes: readonly ClienteDemo[]): { pj?: ClienteDemo; pf?: ClienteDemo } {
  const ordenados = [...clientes].sort((a, b) => a.id.localeCompare(b.id));
  const pj = ordenados.find((c) => soDigitos(c.cnpj).length > 0) ?? ordenados[0];
  const pf = ordenados.find((c) => soDigitos(c.cpf).length > 0 && c.id !== pj?.id) ?? ordenados.find((c) => c.id !== pj?.id) ?? pj;
  return { pj, pf };
}

export function planejarSeed(e: EntradaSeed, agora: Date = new Date()): PlanoSeed {
  const hoje = hojeNoBrasil(agora);
  const agoraIso = agora.toISOString();
  const mes = hoje.slice(0, 7);

  // CPF/CNPJ dos clientes: só corrige o que está PREENCHIDO e inválido (vazio continua vazio).
  const clientesCorrigidos: PlanoSeed['clientesCorrigidos'] = [];
  const clientes = e.clientes.map((c) => {
    const cpf = soDigitos(c.cpf);
    const cnpj = soDigitos(c.cnpj);
    const fix: { id: string; cpf?: string; cnpj?: string } = { id: c.id };
    if (cpf && !cpfValido(cpf)) fix.cpf = cpfFicticio(c.id);
    if (cnpj && !cnpjValido(cnpj)) fix.cnpj = cnpjFicticio(c.id);
    if (fix.cpf || fix.cnpj) clientesCorrigidos.push(fix);
    return { ...c, cpf: fix.cpf ?? c.cpf, cnpj: fix.cnpj ?? c.cnpj };
  });
  const entrada: EntradaSeed = { ...e, clientes };
  const { pj, pf } = escolherClientes(clientes);
  const tec1 = e.tecnicos[0];
  const tec2 = e.tecnicos[1] ?? tec1;

  // Empresa: só troca o campo inválido (o que já é válido fica como o dono deixou).
  let empresaDados: Record<string, unknown> | null = null;
  if (e.empresa) {
    const atual = e.empresa;
    const patch: Record<string, unknown> = {};
    if (!cnpjValido(soDigitos(atual.cnpj))) patch.cnpj = DEMO_CNPJ;
    if (!cpfValido(soDigitos(atual.cpf))) patch.cpf = DEMO_CPF;
    if (!normalizarChavePix(String(atual.chavePix ?? ''))) patch.chavePix = DEMO_CHAVE_PIX;
    if (atual.tipoNegocio !== 'empresa') patch.tipoNegocio = 'empresa';
    if (Object.keys(patch).length) empresaDados = { ...atual, ...patch, atualizadoEm: agoraIso };
  }
  const chavePix = String((empresaDados ?? e.empresa)?.chavePix ?? DEMO_CHAVE_PIX);

  // Série mensal: criada uma vez; depois a agenda projeta as ocorrências sozinha.
  let serie: Linha | null = null;
  if (!e.serieExiste) {
    const { dia } = diaUtil(somarDias(hoje, 2));
    const inicio = instanteNoBrasil(dia, '10:00');
    serie = {
      id: ID_SERIE_MENSAL,
      user_id: e.ownerId,
      cliente_id: pj?.id ?? null,
      cliente_nome: pj?.nome ?? 'Cliente',
      titulo: 'Limpeza mensal dos filtros',
      tipo: 'limpeza',
      inicio,
      fim: new Date(new Date(inicio).getTime() + 60 * 60_000).toISOString(),
      endereco: enderecoDe(pj),
      status: 'agendado',
      orcamento_id: null,
      observacao: 'Série mensal: a agenda mostra todo mês no mesmo dia.',
      responsavel_id: tec2?.id ?? null,
      responsavel_nome: tec2?.nome ?? null,
      recorrencia: 'mensal',
      recorrencia_ate: null,
      contrato_id: null,
      criado_em: agoraIso,
      atualizado_em: agoraIso,
      excluido_em: null,
    };
  }

  // Contrato PMOC mensal: o motor do app gera a visita do mês a partir dele.
  let contrato: ContratoRecorrente | null = null;
  if (!e.contratoExiste) {
    const doCliente = e.ativos.filter((a) => pj && a.clienteId === pj.id).slice(0, 4);
    const ativos = doCliente.length
      ? doCliente.map((a) => ({ id: `ativo_${a.id}`, nome: a.nome, assetId: a.id }))
      : [
          { id: 'ativo_demo_recepcao', nome: 'Split Recepção' },
          { id: 'ativo_demo_sala_reuniao', nome: 'Split Sala de reunião' },
        ];
    contrato = {
      id: ID_CONTRATO_PMOC,
      userId: e.ownerId,
      titulo: 'PMOC — manutenção mensal dos splits',
      clienteId: pj?.id,
      clienteNome: pj?.nome ?? 'Cliente',
      endereco: enderecoDe(pj) ?? undefined,
      situacao: 'vigente',
      periodicidade: 'mensal',
      dataInicio: diaUtil(somarDias(hoje, 3)).dia,
      renovacao: 'automatica',
      horarioVisita: '08:30',
      ativos,
      atividades: [
        'Limpar filtros e bandeja',
        'Medir corrente e temperatura de insuflamento',
        'Verificar dreno e isolamento',
        'Registrar a visita no relatório do PMOC',
      ],
      modoCobranca: 'mensal',
      valor: 480,
      responsavelId: tec1?.id,
      responsavelNome: tec1?.nome,
      criadoEm: agoraIso,
      atualizadoEm: agoraIso,
    };
  }

  // Orçamento aprovado do mês: um por mês, número da sequência do tenant.
  let orcamento: Linha | null = null;
  let contadorOrcamento: number | null = null;
  if (!e.orcamentoDoMesExiste) {
    const { numero, sequencia } = numeroDocumentoAposColisao('orcamentos', e.numerosOrcamento, e.contadorOrcamento, new Date(`${hoje}T12:00:00Z`));
    contadorOrcamento = sequencia;
    const primeiroDoMes = `${mes}-01`;
    const emissao = [primeiroDoMes, somarDias(hoje, -4)].sort()[1];
    const fonte = e.servicos.length >= 2 ? e.servicos.slice(0, 2) : SERVICOS_RESERVA;
    const itens = fonte.map((s, i) => {
      const quantidade = i === 0 ? 3 : 1;
      return {
        id: `item_${idOrcamentoDoMes(mes)}_${i + 1}`,
        tipo: 'servico' as const,
        catalogoId: s.id,
        nome: s.nome,
        preco: s.preco,
        quantidade,
        unidade: s.unidade || 'un',
        subtotal: centavos(s.preco * quantidade),
      };
    });
    const subtotal = centavos(itens.reduce((t, i) => t + i.subtotal, 0));
    const criadoEm = instanteNoBrasil(emissao, '09:10');
    const aprovadoEm = [instanteNoBrasil([somarDias(emissao, 2), hoje].sort()[0], '16:40'), agoraIso].sort()[0];
    const doc: Orcamento = {
      id: idOrcamentoDoMes(mes),
      numero,
      clienteId: pf?.id ?? '',
      clienteNome: pf?.nome ?? 'Cliente',
      clienteTelefone: pf?.telefone ?? '',
      clienteCpfCnpj: soDigitos(pf?.cpf) || soDigitos(pf?.cnpj) || undefined,
      clienteEndereco: enderecoDe(pf) ?? undefined,
      itens,
      subtotalServicos: subtotal,
      subtotalProdutos: 0,
      subtotal,
      desconto: 0,
      descontoTipo: 'valor',
      valorTotal: subtotal,
      status: 'aprovado',
      dataEmissao: emissao,
      validadeOrcamento: diaBR(somarDias(emissao, 15)),
      garantia: '90 dias para o serviço executado',
      formasPagamento: { credito: true, debito: true, dinheiro: true, pix: true },
      chavePix,
      exibirAssinatura: true,
      solicitarAssinaturaCliente: false,
      exibirAprovacao: true,
      exibirRecusa: true,
      criadoEm,
      atualizadoEm: aprovadoEm,
    };
    orcamento = {
      id: doc.id,
      user_id: e.ownerId,
      numero: doc.numero,
      cliente_id: doc.clienteId || null,
      cliente_nome: doc.clienteNome,
      status: doc.status,
      subtotal: doc.subtotal,
      desconto: doc.desconto,
      valor_total: doc.valorTotal,
      data_emissao: doc.dataEmissao,
      dados: doc,
      criado_em: doc.criadoEm,
      atualizado_em: doc.atualizadoEm,
      excluido_em: null,
    };
  }

  const localizacoes: Linha[] = e.tecnicos.slice(0, POSICOES_TECNICOS.length).map((t, i) => ({
    org_id: e.orgId,
    user_id: t.id,
    lat: POSICOES_TECNICOS[i].lat,
    lng: POSICOES_TECNICOS[i].lng,
    precisao: 15,
    capturado_em: agoraIso,
  }));

  return {
    hoje,
    agendamentos: planejarVisitas(entrada, agora),
    serie,
    contrato,
    orcamento,
    contadorOrcamento,
    empresaDados,
    clientesCorrigidos,
    localizacoes,
  };
}

// ─── Execução contra o Supabase (service role) ────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: client do supabase-js usado de forma estrutural (mesmo motivo de contratoRecorrenteSupabase.ts).
type Admin = any;

type Passo = { nome: string; estado: 'ok' | 'erro' | 'pulado'; detalhe: string };

async function ler<T>(promessa: PromiseLike<{ data: T | null; error: { message?: string } | null }>, oque: string): Promise<T> {
  const { data, error } = await promessa;
  if (error) throw new Error(`não consegui ler ${oque}: ${error.message ?? 'erro desconhecido'}`);
  return (data ?? ([] as unknown)) as T;
}

async function acharDono(admin: Admin): Promise<{ id: string; email: string }> {
  const fixo = process.env.DEMO_OWNER_ID?.trim();
  if (fixo) {
    const { data, error } = await admin.auth.admin.getUserById(fixo);
    if (error || !data?.user) throw new Error('DEMO_OWNER_ID não encontrado no Auth.');
    return { id: data.user.id, email: String(data.user.email ?? '') };
  }
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`não consegui listar usuários do Auth: ${error.message}`);
    const users = (data?.users ?? []) as Array<{ id: string; email?: string }>;
    const achado = users.find((u) => (u.email ?? '').toLowerCase() === DEMO_EMAIL);
    if (achado) return { id: achado.id, email: String(achado.email) };
    if (users.length < 200) break;
  }
  throw new Error(`a conta ${DEMO_EMAIL} não existe neste projeto.`);
}

function nomeDoUsuario(u: { email?: string; user_metadata?: Record<string, unknown> } | null | undefined): string {
  const m = u?.user_metadata ?? {};
  const nome = [m.full_name, m.name, m.nome].find((v) => typeof v === 'string' && v.trim());
  return (nome as string | undefined)?.trim() || String(u?.email ?? 'Técnico').split('@')[0];
}

async function principal(): Promise<number> {
  const aplicar = process.argv.includes('--aplicar');
  const url = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !chave) {
    console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente. Nada foi feito.');
    return 2;
  }
  const { createClient } = await import('@supabase/supabase-js');
  const admin: Admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const agora = new Date();

  // 1) Trava: SÓ a conta demo.
  const dono = await acharDono(admin);
  if (dono.email.toLowerCase() !== DEMO_EMAIL) {
    console.error(`Recusado: o dono resolvido não é ${DEMO_EMAIL}. Nada foi feito.`);
    return 3;
  }
  const ownerId = dono.id;

  const orgs = await ler<Array<{ id: string }>>(
    admin.from('organizacoes').select('id').eq('owner_user_id', ownerId).limit(1),
    'a organização da demo',
  );
  const orgId = orgs[0]?.id;
  if (!orgId) {
    console.error('A conta demo não tem organização (equipe). Nada foi feito.');
    return 4;
  }

  // 2) Leitura (nenhuma escrita até aqui).
  const passos: Passo[] = [];
  const membros = await ler<Array<{ user_id: string; papel: string; ativo: boolean }>>(
    admin.from('organizacao_membros').select('user_id, papel, ativo').eq('org_id', orgId),
    'a equipe',
  );
  const idsTecnicos = membros.filter((m) => m.papel === 'tecnico' && m.ativo).map((m) => m.user_id).sort();
  const tecnicos: Array<{ id: string; nome: string }> = [];
  for (const id of idsTecnicos) {
    const { data } = await admin.auth.admin.getUserById(id);
    tecnicos.push({ id, nome: nomeDoUsuario(data?.user) });
  }

  if (tecnicos.length < 2) {
    const faltam = TECNICOS_RESERVA.slice(0, 2 - tecnicos.length);
    if (!aplicar) {
      passos.push({ nome: 'técnicos', estado: 'pulado', detalhe: `simulação: criaria ${faltam.length} técnico(s)` });
      for (const t of faltam) tecnicos.push({ id: `(novo:${t.email})`, nome: t.nome });
    } else {
      for (const t of faltam) {
        try {
          // Senha aleatória e descartada na hora: ninguém entra como técnico da demo.
          const senhaDescartavel = randomUUID() + randomUUID();
          const { data, error } = await admin.auth.admin.createUser({
            email: t.email,
            password: senhaDescartavel,
            email_confirm: true,
            user_metadata: { full_name: t.nome },
          });
          if (error || !data?.user) throw new Error(error?.message ?? 'sem usuário');
          const { error: eMembro } = await admin
            .from('organizacao_membros')
            .insert({ org_id: orgId, user_id: data.user.id, papel: 'tecnico', ativo: true });
          if (eMembro) throw new Error(eMembro.message);
          tecnicos.push({ id: data.user.id, nome: t.nome });
          passos.push({ nome: `técnico ${t.nome}`, estado: 'ok', detalhe: 'criado e incluído na equipe' });
        } catch (err) {
          passos.push({ nome: `técnico ${t.nome}`, estado: 'erro', detalhe: (err as Error).message });
        }
      }
    }
  } else {
    passos.push({ nome: 'técnicos', estado: 'ok', detalhe: `${tecnicos.length} técnicos ativos na equipe` });
  }

  const clientes = (
    await ler<Array<ClienteDemo & { excluido_em: string | null }>>(
      admin.from('clientes').select('id, nome, telefone, endereco, cidade, estado, cpf, cnpj, excluido_em').eq('user_id', ownerId),
      'os clientes',
    )
  ).filter((c) => !c.excluido_em);
  const servicos = (
    await ler<Array<{ id: string; nome: string; preco: number; unidade: string | null; excluido_em: string | null }>>(
      admin.from('servicos').select('id, nome, preco, unidade, excluido_em').eq('user_id', ownerId),
      'os serviços',
    )
  )
    .filter((s) => !s.excluido_em && Number(s.preco) > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({ ...s, preco: Number(s.preco) }));
  const assets = (
    await ler<Array<Record<string, unknown>>>(
      admin
        .from('assets')
        .select('id, cliente_id, categoria, localizacao, modelo, codigo_interno, patrimonio, numero_serie, excluido_em')
        .eq('user_id', ownerId),
      'os equipamentos',
    )
  ).filter((a) => !a.excluido_em);
  const ativos = assets.map((a) => ({
    id: String(a.id),
    clienteId: (a.cliente_id as string | null) ?? null,
    nome: nomeDoEquipamento({
      categoria: (a.categoria as string) ?? undefined,
      localizacao: (a.localizacao as string) ?? undefined,
      modelo: (a.modelo as string) ?? undefined,
      codigoInterno: (a.codigo_interno as string) ?? undefined,
      patrimonio: (a.patrimonio as string) ?? undefined,
      numeroSerie: (a.numero_serie as string) ?? undefined,
    } as Parameters<typeof nomeDoEquipamento>[0]),
  }));
  const empresaLinhas = await ler<Array<{ dados: Record<string, unknown> | null }>>(
    admin.from('empresa').select('dados').eq('user_id', ownerId).limit(1),
    'a empresa',
  );
  const serie = await ler<Array<{ id: string }>>(
    admin.from('agendamentos').select('id').eq('id', ID_SERIE_MENSAL).is('excluido_em', null),
    'a série mensal',
  );
  const contrato = await ler<Array<{ id: string }>>(
    admin.from('service_contracts').select('id').eq('id', ID_CONTRATO_PMOC),
    'o contrato PMOC',
  );
  const orcs = await ler<Array<{ id: string; numero: string | null }>>(
    admin.from('orcamentos').select('id, numero').eq('user_id', ownerId),
    'os orçamentos',
  );
  const contadores = await ler<Array<{ valor: number }>>(
    admin.from('contadores').select('valor').eq('user_id', ownerId).eq('chave', 'orcamento'),
    'o contador de orçamentos',
  );

  const mes = hojeNoBrasil(agora).slice(0, 7);
  const entrada: EntradaSeed = {
    ownerId,
    orgId,
    tecnicos,
    clientes,
    servicos,
    ativos,
    empresa: empresaLinhas[0]?.dados ?? null,
    serieExiste: serie.length > 0,
    contratoExiste: contrato.length > 0,
    orcamentoDoMesExiste: orcs.some((o) => o.id === idOrcamentoDoMes(mes)),
    numerosOrcamento: orcs.map((o) => String(o.numero ?? '')),
    contadorOrcamento: Number(contadores[0]?.valor ?? 0) || 0,
  };
  const plano = planejarSeed(entrada, agora);

  console.log(`\nDemo GR Tech — ${aplicar ? 'APLICANDO' : 'SIMULAÇÃO (use --aplicar para escrever)'} — hoje ${diaBR(plano.hoje)}`);
  console.log(`  visitas na janela: ${plano.agendamentos.length}`);
  console.log(`  série mensal: ${plano.serie ? 'criar' : 'já existe'}`);
  console.log(`  contrato PMOC: ${plano.contrato ? 'criar' : 'já existe'}`);
  console.log(`  orçamento aprovado do mês: ${plano.orcamento ? `criar nº ${String(plano.orcamento.numero)}` : 'já existe'}`);
  console.log(`  empresa: ${plano.empresaDados ? 'corrigir CNPJ/CPF/Pix inválidos' : 'já válida'}`);
  console.log(`  clientes com CPF/CNPJ a corrigir: ${plano.clientesCorrigidos.length}`);
  if (!entrada.empresa) console.log('  ATENÇÃO: a conta demo não tem linha em `empresa` — nada a corrigir ali.');

  if (!aplicar) return 0;

  const passo = async (nome: string, fn: () => Promise<string>): Promise<void> => {
    try {
      passos.push({ nome, estado: 'ok', detalhe: await fn() });
    } catch (err) {
      passos.push({ nome, estado: 'erro', detalhe: (err as Error).message });
    }
  };
  const semErro = (r: { error: { message?: string } | null }): void => {
    if (r.error) throw new Error(r.error.message ?? 'erro desconhecido');
  };
  const agoraIso = agora.toISOString();

  if (plano.empresaDados) {
    await passo('empresa', async () => {
      semErro(await admin.from('empresa').update({ dados: plano.empresaDados, atualizado_em: agoraIso }).eq('user_id', ownerId));
      return 'CNPJ/CPF/Pix válidos';
    });
  }
  for (const c of plano.clientesCorrigidos) {
    await passo(`cliente ${c.id}`, async () => {
      semErro(await admin.from('clientes').update({ ...(c.cpf ? { cpf: c.cpf } : {}), ...(c.cnpj ? { cnpj: c.cnpj } : {}), atualizado_em: agoraIso }).eq('id', c.id).eq('user_id', ownerId));
      return 'documento com dígito válido';
    });
  }
  await passo('visitas', async () => {
    semErro(await admin.from('agendamentos').upsert(plano.agendamentos, { onConflict: 'id' }));
    return `${plano.agendamentos.length} visitas entre ${diaBR(somarDias(plano.hoje, JANELA_DIAS.de))} e ${diaBR(somarDias(plano.hoje, JANELA_DIAS.ate))}`;
  });
  if (plano.serie) {
    await passo('série mensal', async () => {
      semErro(await admin.from('agendamentos').upsert(plano.serie, { onConflict: 'id' }));
      return 'criada';
    });
  }
  if (plano.contrato) {
    const c = plano.contrato;
    const erros = validarContrato(c);
    await passo('contrato PMOC', async () => {
      if (erros.length) throw new Error(erros[0]);
      semErro(await admin.from('service_contracts').upsert({ ...contratoParaLinha(c), user_id: ownerId, criado_por: ownerId }, { onConflict: 'id' }));
      return 'criado (mensal, vigente)';
    });
  }
  await passo('visitas do contrato', async () => {
    const linha = await ler<Linha[]>(admin.from('service_contracts').select('*').eq('id', ID_CONTRATO_PMOC), 'o contrato PMOC');
    if (!linha.length) return 'sem contrato — nada a gerar';
    const r = await gerarVisitasDosContratos(portaSupabase(admin), [linhaParaContrato(linha[0])], { agora });
    if (r.falhas > 0) throw new Error(`${r.falhas} visita(s) falharam`);
    return `${r.criadas} criada(s), ${r.jaExistiam} já existiam`;
  });
  if (plano.orcamento) {
    await passo('orçamento aprovado do mês', async () => {
      semErro(await admin.from('orcamentos').insert(plano.orcamento));
      semErro(
        await admin
          .from('contadores')
          .upsert({ user_id: ownerId, chave: 'orcamento', valor: Math.max(plano.contadorOrcamento ?? 0, entrada.contadorOrcamento) }, { onConflict: 'user_id,chave' }),
      );
      return `nº ${String(plano.orcamento?.numero)}`;
    });
  }
  const locais = plano.localizacoes.filter((l) => !String(l.user_id).startsWith('('));
  if (locais.length) {
    await passo('posição dos técnicos no mapa', async () => {
      semErro(await admin.from('localizacoes_equipe').upsert(locais, { onConflict: 'org_id,user_id' }));
      return `${locais.length} técnico(s)`;
    });
  }

  console.log('');
  for (const p of passos) console.log(`  ${p.estado === 'ok' ? 'ok    ' : p.estado === 'erro' ? 'ERRO  ' : 'pulado'} ${p.nome}: ${p.detalhe}`);
  const erros = passos.filter((p) => p.estado === 'erro').length;
  console.log(`\n${erros ? `TERMINOU COM ${erros} ERRO(S)` : 'PRONTO'}\n`);
  return erros ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then(
    (codigo) => process.exit(codigo),
    (err) => {
      console.error(`Falhou antes de escrever qualquer coisa: ${(err as Error).message}`);
      process.exit(1);
    },
  );
}

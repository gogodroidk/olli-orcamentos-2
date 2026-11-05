import { DIAGNOSTICO_URL } from '../config';
import { getCacheIA, setCacheIA, searchCodigosErro } from '../database/database';
import { track, Eventos } from './analytics';
import { supabase } from './supabase';
import { DiagnosticoInput, DiagnosticoIA, DiagnosticoResultado, CodigoErro } from '../types';
import { tipoLimiteIA } from './erroIA';
import { resolverTipoEquipamento, type TipoEquipamentoDiagnostico } from './tiposEquipamentoDiagnostico';

/** Token de acesso da sessão atual (ou null se deslogado/sem backend). Nunca lança. */
async function accessTokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function norm(s?: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// v4: a família entra na chave. Sem isso, um diagnóstico de split em cache
// seria servido para a TV da mesma marca e do mesmo código.
function chave(input: DiagnosticoInput): string {
  const tipo = resolverTipoEquipamento(input.tipoEquipamento).id;
  return `diag:v4:${tipo}|${norm(input.marca)}|${norm(input.modelo)}|${norm(input.codigo)}|${norm(input.sintoma)}`;
}

/** Timeout do diagnóstico por IA: 30s (campo, conexão instável). */
const TIMEOUT_DIAGNOSTICO_MS = 30_000;

export type MotivoFalhaIA =
  | 'timeout'
  | 'offline'
  | 'servidor'
  | 'cancelado'
  | 'auth'
  | 'limite_diario'
  | 'limite_global'
  | null;

/** Último motivo de falha da chamada de IA (para a UI diferenciar timeout/offline/erro). */
let ultimoMotivoFalha: MotivoFalhaIA = null;
export function motivoFalhaDiagnostico(): MotivoFalhaIA {
  return ultimoMotivoFalha;
}

/**
 * Etapa 2 — diagnóstico da OLLI Técnica. Camadas (protege a margem):
 *   1. cache local (SQLite) — instantâneo e offline;
 *   2. Cloudflare Worker (OpenRouter server-side, com cota e privacidade);
 *   3. fallback: a base de 698 códigos, para nunca deixar o técnico na mão.
 *
 * `sinalCancelamento` (opcional) permite que a UI cancele a chamada manualmente
 * (botão "Cancelar" durante o loading) — o cancelamento cai no mesmo caminho do
 * timeout/offline e resolve com o fallback da base, nunca trava nem rejeita.
 */
export async function diagnosticarCaso(
  input: DiagnosticoInput,
  sinalCancelamento?: AbortSignal,
  opts?: { forcarOffline?: boolean },
): Promise<DiagnosticoResultado> {
  const key = chave(input);
  ultimoMotivoFalha = null;

  // 1) cache local
  const cached = await getCacheIA(key);
  if (cached) {
    const diag = safeParse(cached);
    if (diag) return { fonte: 'cache', diagnostico: diag };
  }

  // 2) IA via Cloudflare Worker (OpenRouter em produção) — só se
  //    configurado E com sessão logada (o Worker exige JWT do Supabase).
  //    Sem token (deslogado) → pula direto para o fallback offline (698 códigos).
  //    forcarOffline (cota de IA do plano Grátis esgotada) também pula a nuvem.
  if (DIAGNOSTICO_URL && !opts?.forcarOffline) {
    const token = await accessTokenAtual();
    if (!token) {
      // Com login obrigatório na v3, chegar aqui sem token significa sessão
      // corrompida/expirada — não é mais o caso "opcional" de antes. Sinaliza
      // 'auth' para a UI avisar de forma visível (nunca silêncio) e cai na base.
      ultimoMotivoFalha = 'auth';
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_DIAGNOSTICO_MS);
      const onCancelar = () => controller.abort();
      sinalCancelamento?.addEventListener('abort', onCancelar);
      try {
        const contextoBase = await contextoDaBase(input);
        const r = await fetch(DIAGNOSTICO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...input,
            tipoEquipamento: resolverTipoEquipamento(input.tipoEquipamento).id,
            contextoBase,
          }),
          signal: controller.signal,
        });
        if (r.ok) {
          const data: any = await r.json();
          if (data?.ok && data.diagnostico) {
            await setCacheIA(key, JSON.stringify(data.diagnostico));
            const modelo = data.modelo ?? data.provedor;
            track(Eventos.aiUsed, { fonte: data.fonte, modelo });
            return {
              fonte: data.fonte === 'cache' ? 'cache' : 'ia',
              modelo,
              diagnostico: data.diagnostico,
            };
          }
          // data.motivo === 'ia_nao_configurada' → segue para o fallback
        } else if (r.status === 401) {
          // Sessão expirada/token inválido: hoje caía mudo no fallback. Agora é
          // motivo VISÍVEL ('auth') — o worker respondeu 401 com um token que
          // deveria valer, então a sessão precisa ser renovada em Conta.
          ultimoMotivoFalha = 'auth';
        } else if (r.status === 429) {
          const erro = await r.json().catch(() => null);
          ultimoMotivoFalha = tipoLimiteIA(erro?.erro) ?? 'servidor';
        } else if (r.status >= 500) {
          // 429 (muitas_requisicoes) e 5xx (503 sobrecarregado, 502 falha_ia etc.) — o worker
          // realmente retorna esses códigos (ver worker/src/index.js) quando está sobrecarregado.
          ultimoMotivoFalha = 'servidor';
        }
        // outro erro → fallback offline
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          ultimoMotivoFalha = sinalCancelamento?.aborted ? 'cancelado' : 'timeout';
        } else {
          ultimoMotivoFalha = 'offline';
        }
      } finally {
        clearTimeout(timer);
        sinalCancelamento?.removeEventListener('abort', onCancelar);
      }
    }
  }

  // 3) fallback: base de códigos
  return await fallbackBase(input);
}

async function melhorMatch(input: DiagnosticoInput): Promise<CodigoErro | null> {
  const q = (input.codigo || input.sintoma || '').trim();
  const rows = await searchCodigosErro({ marca: input.marca || null, q });
  if (rows.length === 0) return null;
  const cod = norm(input.codigo);
  return rows.find(r => norm(r.codigo) === cod) ?? rows[0];
}

async function contextoDaBase(input: DiagnosticoInput): Promise<string | undefined> {
  // A base local é de ar-condicionado. Mandá-la num caso de TV só confunde.
  if (!resolverTipoEquipamento(input.tipoEquipamento).usaBaseHvac) return undefined;
  const m = await melhorMatch(input);
  if (!m) return undefined;
  return [
    `marca: ${m.marca}`,
    m.familia && `família: ${m.familia}`,
    m.codigo && `código: ${m.codigo}`,
    m.falha && `falha: ${m.falha}`,
    m.causa && `causa provável: ${m.causa}`,
    m.acao && `ação inicial: ${m.acao}`,
    m.severidade && `severidade: ${m.severidade}`,
    m.confianca && `confiança da base: ${m.confianca}`,
  ].filter(Boolean).join(' · ');
}

/** Mensagem de aviso amigável conforme o motivo real da falha (timeout/offline/servidor). */
function avisoFallback(): string {
  if (!DIAGNOSTICO_URL) {
    return 'Diagnóstico por IA ainda não ligado — mostrando a base de códigos. Configure o Worker de diagnóstico para análise guiada.';
  }
  switch (ultimoMotivoFalha) {
    case 'auth':
      return 'Sua sessão expirou — entre de novo em Conta para usar a OLLI. Mostrando a base de códigos.';
    case 'timeout':
      return 'A IA demorou demais para responder (conexão lenta) — mostrando o que a base de códigos tem.';
    case 'offline':
      return 'Sem conexão com a internet agora — mostrando o que a base de códigos tem.';
    case 'servidor':
      return 'A OLLI está muito requisitada agora — mostrando o que a base de códigos tem. Tente de novo em alguns instantes.';
    case 'limite_diario':
      return 'O limite diário da OLLI online foi atingido. Ele volta às 21h (horário de Brasília) — mostrando a base offline agora.';
    case 'limite_global':
      return 'A capacidade gratuita da OLLI online acabou por hoje. Ela volta às 21h (horário de Brasília) — mostrando a base offline agora.';
    case 'cancelado':
      return 'Análise cancelada — mostrando o que a base de códigos tem.';
    default:
      return 'A IA não respondeu agora — mostrando o que a base de códigos tem.';
  }
}

function complementoDaFamilia(tipo: TipoEquipamentoDiagnostico): Pick<
  DiagnosticoIA,
  'riscos' | 'ferramentas' | 'quandoParar' | 'tipoEquipamento' | 'rotuloEquipamento'
> {
  return {
    riscos: tipo.riscos,
    ferramentas: tipo.ferramentas,
    quandoParar: tipo.quandoParar,
    tipoEquipamento: tipo.id,
    rotuloEquipamento: tipo.label,
  };
}

/**
 * Fora do ar-condicionado não existe base offline. O aviso não pode dizer
 * que estamos "mostrando a base de códigos".
 */
function avisoSemBaseHvac(): string {
  switch (ultimoMotivoFalha) {
    case 'auth':
      return 'Sua sessão expirou — entre de novo em Conta para usar a OLLI. A base offline só tem códigos de ar-condicionado, então seguem os cuidados desta família.';
    case 'timeout':
      return 'A IA demorou demais para responder. A base offline só tem códigos de ar-condicionado, então seguem os cuidados desta família.';
    case 'offline':
      return 'Sem conexão agora. A base offline só tem códigos de ar-condicionado, então seguem os cuidados desta família.';
    case 'servidor':
      return 'A OLLI está muito requisitada. A base offline só tem códigos de ar-condicionado, então seguem os cuidados desta família.';
    case 'limite_diario':
      return 'O limite diário da OLLI online foi atingido. Ele volta às 21h (horário de Brasília). A base offline só tem códigos de ar-condicionado.';
    case 'limite_global':
      return 'A capacidade gratuita da OLLI online acabou por hoje. Ela volta às 21h (horário de Brasília). A base offline só tem códigos de ar-condicionado.';
    case 'cancelado':
      return 'Análise cancelada. A base offline só tem códigos de ar-condicionado, então seguem os cuidados desta família.';
    default:
      return DIAGNOSTICO_URL
        ? 'A IA não respondeu agora. A base offline só tem códigos de ar-condicionado, então seguem os cuidados desta família — não é um diagnóstico fechado.'
        : 'Diagnóstico por IA ainda não ligado. A base offline só tem códigos de ar-condicionado, então seguem os cuidados desta família.';
  }
}

/** Monta um diagnóstico estruturado a partir da base local (sem IA). */
async function fallbackBase(input: DiagnosticoInput): Promise<DiagnosticoResultado> {
  const aviso = avisoFallback();
  const tipo = resolverTipoEquipamento(input.tipoEquipamento);

  // Fora do ar-condicionado a base de 698 códigos não se aplica. Dizer que
  // achou um código de split numa geladeira seria mentira.
  if (!tipo.usaBaseHvac) {
    const local = tipo.semNuvem;
    return {
      fonte: 'base',
      aviso: avisoSemBaseHvac(),
      diagnostico: {
        resumo: local.resumo,
        significadoProvavel: local.significado,
        causasComuns: [],
        testesEmOrdem: local.testes,
        pecasSuspeitas: [],
        naoFacaAinda: local.naoFaca,
        nivelConfianca: 'Baixa',
        confiancaJustificativa: 'A base offline do OLLI só cobre códigos de ar-condicionado.',
        mensagemCliente: local.mensagem,
        sugestaoOrcamento: local.orcamento,
        fontes: [],
        ...complementoDaFamilia(tipo),
      },
    };
  }

  const m = await melhorMatch(input);
  if (!m) {
    return {
      fonte: 'base',
      aviso,
      diagnostico: {
        resumo: 'Não encontrei esse caso na base.',
        significadoProvavel: 'Código/sintoma não localizado com segurança para esta marca/modelo.',
        causasComuns: [],
        testesEmOrdem: [
          'Foto da etiqueta da evaporadora e da condensadora',
          'Confira se o erro aparece no display, no controle ou por LED (quantas piscadas)',
          'Veja se há código também na placa externa',
        ],
        pecasSuspeitas: [],
        naoFacaAinda: ['Não troque peça sem confirmar marca + modelo'],
        nivelConfianca: 'Baixa',
        mensagemCliente: 'Preciso confirmar o modelo do aparelho para fechar o diagnóstico com segurança.',
        sugestaoOrcamento: 'Visita técnica + diagnóstico; orçamento da peça após confirmação.',
        fontes: [],
        ...complementoDaFamilia(tipo),
      },
    };
  }

  return {
    fonte: 'base',
    aviso,
    diagnostico: {
      resumo: m.falha || 'Falha registrada na base',
      significadoProvavel: [m.falha, m.causa].filter(Boolean).join(' — '),
      causasComuns: m.causa ? [m.causa] : [],
      testesEmOrdem: m.acao ? [m.acao] : ['Confirme marca + modelo e meça antes de trocar.'],
      pecasSuspeitas: [],
      naoFacaAinda: [
        'Não condene a placa antes de eliminar alimentação, comunicação, sensor, cabo e mau contato.',
      ],
      nivelConfianca: m.confianca || 'Média',
      confiancaJustificativa: m.fonteId ? `Base de códigos (fonte ${m.fonteId})` : 'Base de códigos',
      mensagemCliente: `Identifiquei um indício de "${m.falha}". Vou confirmar com alguns testes antes de orçar qualquer peça.`,
      sugestaoOrcamento: 'Diagnóstico + mão de obra; peça suspeita orçada após teste.',
      fontes: m.url ? [m.url] : [],
      ...complementoDaFamilia(tipo),
    },
  };
}

function safeParse(s: string): DiagnosticoIA | null {
  try {
    return JSON.parse(s) as DiagnosticoIA;
  } catch {
    return null;
  }
}

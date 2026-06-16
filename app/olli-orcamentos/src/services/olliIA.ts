import { DIAGNOSTICO_URL } from '../config';
import { getCacheIA, setCacheIA, searchCodigosErro } from '../database/database';
import { track, Eventos } from './analytics';
import { DiagnosticoInput, DiagnosticoIA, DiagnosticoResultado, CodigoErro } from '../types';

function norm(s?: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function chave(input: DiagnosticoInput): string {
  return `diag:v1:${norm(input.marca)}|${norm(input.modelo)}|${norm(input.codigo)}|${norm(input.sintoma)}`;
}

/**
 * Etapa 2 — diagnóstico da OLLI Técnica. Camadas (protege a margem):
 *   1. cache local (SQLite) — instantâneo e offline;
 *   2. Edge Function `diagnostico` (chave Anthropic server-side + cache na nuvem);
 *   3. fallback: a base de 602 códigos, para nunca deixar o técnico na mão.
 */
export async function diagnosticarCaso(input: DiagnosticoInput): Promise<DiagnosticoResultado> {
  const key = chave(input);

  // 1) cache local
  const cached = await getCacheIA(key);
  if (cached) {
    const diag = safeParse(cached);
    if (diag) return { fonte: 'cache', diagnostico: diag };
  }

  // 2) IA via Cloudflare Worker (Gemini por padrão; Claude opcional) — só se configurado
  if (DIAGNOSTICO_URL) {
    try {
      const contextoBase = await contextoDaBase(input);
      const r = await fetch(DIAGNOSTICO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, contextoBase }),
      });
      if (r.ok) {
        const data: any = await r.json();
        if (data?.ok && data.diagnostico) {
          await setCacheIA(key, JSON.stringify(data.diagnostico));
          track(Eventos.aiUsed, { fonte: data.fonte, modelo: data.modelo });
          return {
            fonte: data.fonte === 'cache' ? 'cache' : 'ia',
            modelo: data.modelo,
            diagnostico: data.diagnostico,
          };
        }
        // data.motivo === 'ia_nao_configurada' → segue para o fallback
      }
    } catch {
      // worker indisponível/offline → fallback
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

/** Monta um diagnóstico estruturado a partir da base local (sem IA). */
async function fallbackBase(input: DiagnosticoInput): Promise<DiagnosticoResultado> {
  const aviso = DIAGNOSTICO_URL
    ? 'A IA não respondeu agora — mostrando o que a base de códigos tem.'
    : 'Diagnóstico por IA ainda não ligado — mostrando a base de códigos. Configure o Worker de diagnóstico para análise guiada.';

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

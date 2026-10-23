/**
 * Rastreio de uso: telas com tempo de permanência + os 10 eventos do funil.
 *
 * Alimenta `public.user_tela_log` (migrations 20261022100000 e 20261023160000). Só manda o NOME
 * da rota (sem params, ids ou texto), o nome fixo do evento do funil e a duração. Acumula e
 * descarrega em lote. Best-effort: nunca lança nem bloqueia a UX.
 *
 * DESLIGADO por padrão: só roda com `EXPO_PUBLIC_RASTREIO_TELAS=1` (a migration precisa estar
 * aplicada e a política de privacidade já publicada, com 7 dias de aviso, ANTES de ligar). Com a
 * flag ligada, respeita o opt-out da pessoa ("Ajudar a melhorar o OLLI") e NÃO envia se não
 * conseguir ler a preferência.
 */
import { AppState, Platform } from 'react-native';
import { getCurrentUser, supabase } from './supabase';
import { esquecerPreferenciaRastreio, lerPreferenciaRastreio } from './rastreioPreferencia';
import { empilhar, itemAcao, itemTela, LOTE_MAX, podeEnviar, reenfileirar, type ItemComTentativa } from './rastreioNucleo';

const LIGADO = process.env.EXPO_PUBLIC_RASTREIO_TELAS === '1';

let fila: ItemComTentativa[] = [];
let descartadosPorFalha = 0; // contador de lotes perdidos (visível no dev; evita falha silenciosa)
let telaAtual: string | null = null;
let entrouEm = 0;
let descarregando = false;
let sessaoMarcada = false;
let escutando = false;

function plataforma(): string {
  return ['web', 'ios', 'android'].includes(Platform.OS) ? Platform.OS : 'unknown';
}

async function descarregar(): Promise<void> {
  if (descarregando || fila.length === 0 || !supabase) return;
  descarregando = true;
  const lote = fila.splice(0, LOTE_MAX);
  try {
    if (!podeEnviar(await lerPreferenciaRastreio())) return; // opt-out ou não sei: descarta, nada sai
    if (!(await getCurrentUser())) return; // deslogado: descarta, nada a ligar a ninguém.
    const { error } = await supabase.rpc('registrar_telas_usuario', {
      p_itens: lote.map(({ tela, acao, duracao_ms }) => ({ tela, acao, duracao_ms })),
      p_plataforma: plataforma(),
    });
    if (error) falhouEnvio(lote); // erro do servidor/rede: devolve à fila (até 3 tentativas), nunca "ignora"
  } catch {
    falhouEnvio(lote);
  } finally {
    descarregando = false;
  }
}

function falhouEnvio(lote: ItemComTentativa[]): void {
  const r = reenfileirar(fila, lote);
  fila = r.fila;
  descartadosPorFalha += r.descartados;
  if (__DEV__ && r.descartados > 0) console.warn(`[rastreio] ${descartadosPorFalha} item(ns) descartado(s) após falhas de envio`);
}

function fecharTelaAtual(agora: number): void {
  const item = itemTela(telaAtual ?? undefined, agora - entrouEm);
  telaAtual = null;
  if (item) fila = empilhar(fila, item);
}

/** Chame a cada mudança de rota com o NOME da rota (nunca a URL). */
export function telaMudou(nome: string | undefined): void {
  if (!LIGADO || !nome || nome === telaAtual || !itemTela(nome, 0)) return;
  const agora = Date.now();
  fecharTelaAtual(agora);
  telaAtual = nome;
  entrouEm = agora;
  if (fila.length >= LOTE_MAX / 2) void descarregar();
}

/** Evento do funil (só os 10 de rastreioNucleo; qualquer outro é ignorado aqui e fica só no SQLite local). */
export function eventoFunil(evento: string): void {
  if (!LIGADO) return;
  const item = itemAcao(evento, telaAtual);
  if (!item) return;
  fila = empilhar(fila, item);
  if (fila.length >= LOTE_MAX) void descarregar();
}

/** App foi para segundo plano: fecha a tela, grava e descarrega. */
export function appEmSegundoPlano(): void {
  if (!LIGADO) return;
  const nome = telaAtual;
  fecharTelaAtual(Date.now());
  void descarregar().finally(() => {
    // ao voltar, a mesma tela recomeça a contar.
    if (nome) {
      telaAtual = nome;
      entrouEm = Date.now();
    }
  });
}

/** Logout: descarta o que não foi enviado (não pode vazar para o próximo usuário). */
export function resetarRastreioTelas(): void {
  fila = [];
  esquecerPreferenciaRastreio();
  telaAtual = null;
  sessaoMarcada = false;
}

/** Uma vez por abertura do app: marca `sessao_iniciada` e liga o descarregamento ao ir para segundo plano. */
export function iniciarRastreio(): void {
  if (!LIGADO) return;
  if (!sessaoMarcada) {
    sessaoMarcada = true;
    eventoFunil('sessao_iniciada');
  }
  if (escutando) return;
  escutando = true;
  AppState.addEventListener('change', (estado) => {
    if (estado === 'background' || estado === 'inactive') appEmSegundoPlano();
    else if (estado === 'active') {
      sessaoMarcada = false; // voltou do segundo plano: nova sessão
      iniciarRastreio();
    }
  });
}

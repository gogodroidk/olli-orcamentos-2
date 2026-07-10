import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { GOOGLE_AGENDA_CLIENT_ID } from '../config';
import { getDb } from '../database/database';
import { Agendamento } from '../types';

// expo-web-browser/expo-linking são carregados sob demanda (mesmo padrão de
// services/supabase.ts): evita qualquer custo/efeito de módulo nativo em
// module-scope quando o recurso está desligado (client id vazio).

/**
 * ─────────────────────────────────────────────────────────────────────────
 * GOOGLE AGENDA — sincronização opcional (scaffold atrás de flag)
 * ─────────────────────────────────────────────────────────────────────────
 * LIGA quando o dono criar o OAuth client Android (ver passos humanos da
 * planta): console.cloud.google.com/apis/credentials → "Criar credenciais" →
 * "ID do cliente OAuth" → tipo Android → pacote online.olliorcamentos.app →
 * SHA-1 do keystore de assinatura. Copiar o client ID para
 * `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID` no `.env` do build.
 *
 * Enquanto essa env var estiver vazia, `googleAgendaDisponivel()` retorna
 * false e NADA deste serviço é chamado pela UI — código inerte, sem crash,
 * sem prompts, sem custo.
 *
 * O OLLI já avisa o técnico 60 min antes de cada compromisso com lembretes
 * locais (expo-notifications, ver services/agenda.ts) mesmo sem o Google
 * conectado — a sincronização aqui é só para o compromisso também aparecer
 * no calendário do celular do técnico.
 *
 * Nota de implementação (PKCE): o app não tem `expo-auth-session` nem
 * `expo-crypto` instalados (fora do escopo desta frente mexer em
 * package.json). Por isso o fluxo abaixo é montado manualmente com
 * `expo-web-browser` (abre a tela de login do Google e captura o
 * redirect) e usa PKCE com `code_challenge_method=plain` (RFC 7636) — o
 * Google aceita esse método e ele dispensa hash SHA-256, que exigiria uma
 * lib de crypto extra. O `code_verifier` continua sendo uma string aleatória
 * de alta entropia gerada localmente; nada disso reduz a segurança do fluxo
 * "authorization code", só troca S256 por plain no desafio PKCE.
 * ─────────────────────────────────────────────────────────────────────────
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const EVENTS_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const TOKENS_KEY = 'olli.googleagenda.tokens';

interface TokensSalvos {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms em que o access token expira. */
  expiraEm: number;
}

/**
 * true quando existe um client OAuth Android configurado (env var não vazia)
 * e a plataforma suporta o fluxo (web não tem o redirect nativo do app).
 * A UI (AgendaScreen) só deve mostrar qualquer coisa de Google Agenda quando
 * isto for true.
 */
export function googleAgendaDisponivel(): boolean {
  return !!GOOGLE_AGENDA_CLIENT_ID && Platform.OS !== 'web';
}

// ─── PKCE helpers (sem dependência de crypto nativa) ──────────────────────

const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function gerarCodeVerifier(): string {
  let out = '';
  for (let i = 0; i < 64; i++) {
    out += VERIFIER_CHARS[Math.floor(Math.random() * VERIFIER_CHARS.length)];
  }
  return out;
}

/**
 * Redirect URI aceito pelo Google para client OAuth do tipo ANDROID.
 *
 * O Google NÃO aceita um custom scheme arbitrário (ex.: `olliorcamentos://`)
 * para client Android — só o "reverse client ID": o client ID vem no formato
 * `<num>-<hash>.apps.googleusercontent.com`, e o scheme válido é ele invertido,
 * `com.googleusercontent.apps.<num>-<hash>:/oauthredirect`. Esse scheme precisa
 * estar registrado como intent filter no app.json ao ATIVAR o recurso (passo
 * humano, junto com o env var e o rebuild) e o "Custom URI scheme" habilitado
 * nas Advanced Settings do client no console. Enquanto GOOGLE_AGENDA_CLIENT_ID
 * é vazio, nada disto roda (googleAgendaDisponivel() é false).
 */
function reverseClientIdScheme(): string {
  const sufixo = '.apps.googleusercontent.com';
  const base = GOOGLE_AGENDA_CLIENT_ID.endsWith(sufixo)
    ? GOOGLE_AGENDA_CLIENT_ID.slice(0, -sufixo.length)
    : GOOGLE_AGENDA_CLIENT_ID;
  return `com.googleusercontent.apps.${base}`;
}

function redirectUri(): string {
  return `${reverseClientIdScheme()}:/oauthredirect`;
}

// ─── Armazenamento seguro dos tokens ───────────────────────────────────────

async function salvarTokens(t: TokensSalvos): Promise<void> {
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(t));
}

async function lerTokens(): Promise<TokensSalvos | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKENS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TokensSalvos;
  } catch {
    return null;
  }
}

async function apagarTokens(): Promise<void> {
  try { await SecureStore.deleteItemAsync(TOKENS_KEY); } catch {}
}

/** true se há tokens salvos localmente (não valida se ainda são válidos no Google). */
export async function estaConectado(): Promise<boolean> {
  const t = await lerTokens();
  return !!t?.accessToken;
}

/**
 * Troca o refresh_token por um novo access_token quando o atual expirou.
 * Retorna null se não há como renovar (sem refresh_token, ou falha na troca) —
 * quem chama deve tratar isso como "desconectado".
 */
async function renovarTokenSeNecessario(t: TokensSalvos): Promise<TokensSalvos | null> {
  if (t.expiraEm > Date.now() + 30_000) return t; // ainda válido (com folga de 30s)
  if (!t.refreshToken || !GOOGLE_AGENDA_CLIENT_ID) return null;

  try {
    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_AGENDA_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: t.refreshToken,
      }).toString(),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json.access_token) return null;
    const novo: TokensSalvos = {
      accessToken: json.access_token,
      refreshToken: t.refreshToken, // o Google não reenvia refresh_token no refresh
      expiraEm: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    };
    await salvarTokens(novo);
    return novo;
  } catch {
    return null;
  }
}

/** Access token válido para chamar a API do Calendar, renovando se preciso. Null = precisa reconectar. */
async function tokenValido(): Promise<string | null> {
  const t = await lerTokens();
  if (!t) return null;
  const renovado = await renovarTokenSeNecessario(t);
  return renovado?.accessToken ?? null;
}

/**
 * Abre a tela de login do Google (PKCE, offline access) e troca o código por
 * tokens. Retorna true em caso de sucesso. Nunca lança — falhas de rede/
 * cancelamento do usuário resolvem para false.
 */
export async function conectarGoogleAgenda(): Promise<boolean> {
  if (!googleAgendaDisponivel()) return false;
  try {
    const WebBrowser = await import('expo-web-browser');
    const codeVerifier = gerarCodeVerifier();
    const redirect = redirectUri();
    const params = new URLSearchParams({
      client_id: GOOGLE_AGENDA_CLIENT_ID,
      redirect_uri: redirect,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: codeVerifier,
      code_challenge_method: 'plain',
    });
    const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
    if (result.type !== 'success' || !result.url) return false;

    const code = new URL(result.url).searchParams.get('code');
    if (!code) return false;

    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_AGENDA_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect,
        code_verifier: codeVerifier,
      }).toString(),
    });
    if (!resp.ok) return false;
    const json = await resp.json();
    if (!json.access_token) return false;

    await salvarTokens({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiraEm: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Desconecta: apaga os tokens locais. Não revoga no lado do Google (o usuário pode fazer isso pela própria conta). */
export async function desconectarGoogleAgenda(): Promise<void> {
  await apagarTokens();
}

// ─── Mapeamento agendamento local ↔ evento do Google ──────────────────────
// Tabela local simples e isolada desta frente (não mexe em database.ts).

async function garantirTabelaMapa(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS agenda_google_map (id TEXT PRIMARY KEY NOT NULL, google_event_id TEXT NOT NULL)'
  );
}

async function getGoogleEventId(agendamentoId: string): Promise<string | null> {
  await garantirTabelaMapa();
  const db = await getDb();
  const row = await db.getFirstAsync<{ google_event_id: string }>(
    'SELECT google_event_id FROM agenda_google_map WHERE id = ?',
    [agendamentoId],
  );
  return row?.google_event_id ?? null;
}

async function setGoogleEventId(agendamentoId: string, googleEventId: string): Promise<void> {
  await garantirTabelaMapa();
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO agenda_google_map (id, google_event_id) VALUES (?, ?)',
    [agendamentoId, googleEventId],
  );
}

async function removerMapa(agendamentoId: string): Promise<void> {
  await garantirTabelaMapa();
  const db = await getDb();
  await db.runAsync('DELETE FROM agenda_google_map WHERE id = ?', [agendamentoId]);
}

function eventoBody(a: Agendamento) {
  return {
    summary: `${a.titulo} · ${a.clienteNome}`,
    location: a.endereco || undefined,
    description: 'OLLI Orçamentos',
    start: { dateTime: a.inicio, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: a.fim || a.inicio, timeZone: 'America/Sao_Paulo' },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 60 }],
    },
  };
}

/**
 * Cria ou atualiza o evento correspondente no Google Agenda. Silencioso: se
 * não houver conexão/token válido, apenas não faz nada (a tela chamadora
 * decide se avisa o usuário). NUNCA lança.
 */
export async function pushAgendamento(a: Agendamento): Promise<boolean> {
  if (!googleAgendaDisponivel()) return false;
  const token = await tokenValido();
  if (!token) return false;

  try {
    const existenteId = await getGoogleEventId(a.id);
    const url = existenteId ? `${EVENTS_BASE}/${existenteId}` : EVENTS_BASE;
    const method = existenteId ? 'PATCH' : 'POST';

    const resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventoBody(a)),
    });
    if (!resp.ok) return false;
    const json = await resp.json();
    if (json.id) await setGoogleEventId(a.id, json.id);
    return true;
  } catch {
    // best-effort: sincronização com o Google nunca pode travar o salvamento local
    return false;
  }
}

/**
 * Remove o evento correspondente no Google Agenda (se existir mapeamento).
 * Silencioso: NUNCA lança.
 */
export async function deleteEventoGoogle(a: Agendamento): Promise<void> {
  if (!googleAgendaDisponivel()) return;
  const token = await tokenValido();
  if (!token) return;

  try {
    const existenteId = await getGoogleEventId(a.id);
    if (!existenteId) return;
    await fetch(`${EVENTS_BASE}/${existenteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await removerMapa(a.id);
  } catch {
    // best-effort
  }
}

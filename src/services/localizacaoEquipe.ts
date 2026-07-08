/**
 * Localização da equipe (Onda 2 — "equipe ao vivo" sem billing).
 *
 * Este service tem DUAS responsabilidades bem separadas:
 *
 *  1) LER a última localização conhecida de cada membro da equipe
 *     (`localizacoesEquipe()`), consumida pela `EquipeAoVivoScreen`.
 *  2) ENVIAR a localização do próprio usuário logado
 *     (`enviarMinhaLocalizacao()`), chamada pelo técnico em campo.
 *
 * Tabela `localizacoes_equipe` (PK composta org_id+user_id, lat, lng,
 * precisao, capturado_em) e RLS são da frente "Schema multi-tenant + RLS"
 * desta onda (ver `supabase/migrations/20260707_multitenant.sql`): SELECT é
 * "própria linha OU gestão da org"; INSERT/UPDATE é só a própria linha, e
 * exige ser membro ATIVO da org (`eh_membro_ativo`). Este service só lê/
 * escreve — a RLS é quem garante o isolamento entre organizações.
 *
 * `services/equipe.ts` (frente "Convites + papéis") já resolve org/papéis —
 * reusamos `getMinhaOrganizacao()` (para o org_id do upsert) e
 * `listarMembros()` (para nome/papel de cada membro) em vez de duplicar esse
 * conhecimento aqui. Se o usuário ainda não pertence a nenhuma organização
 * (conta pessoal, sem equipe), toda função aqui devolve vazio/no-op — nunca
 * lança para a tela.
 *
 * CAPTURA PERIÓDICA EM BACKGROUND (expo-location + expo-task-manager) é da
 * Onda 8 (prebuild único do dono — ver AGENTS.md/roadmap). Por isso
 * `enviarMinhaLocalizacao()` faz um import DINÂMICO de 'expo-location' dentro
 * da função, protegido por try/catch: hoje o pacote não está instalado, então
 * a chamada é um no-op silencioso (só loga um aviso uma vez). Quando a Onda 8
 * instalar o módulo e ligar `LOCALIZACAO_DISPONIVEL`, esta mesma função passa
 * a funcionar sem precisar reescrever a tela que já a chama. NADA de
 * `import 'expo-location'` no topo do arquivo — módulo nativo em
 * module-scope quebra o bundle Hermes mesmo sem uso (lição do release v6).
 *
 * Web: sem módulo nativo nenhum, `enviarMinhaLocalizacaoWeb()` usa
 * `navigator.geolocation` (padrão do browser, funciona hoje) — é o que dá
 * vida à feature imediatamente na versão desktop/web, sem esperar a Onda 8.
 */
import { Platform } from 'react-native';
import { supabase, getCurrentUser } from './supabase';
import { EXPO_PUBLIC_MAPS_KEY } from '../config';
import { getMinhaOrganizacao, listarMembros, type Papel } from './equipe';

export interface LocalizacaoMembro {
  userId: string;
  nome: string;
  papel?: Papel;
  lat: number;
  lng: number;
  precisao?: number | null;
  capturadoEm: string;
}

/**
 * `true` quando o app tem os módulos nativos de localização instalados e a
 * captura periódica em background pode ligar de verdade. Fica `false` até a
 * Onda 8 (prebuild único) — hoje é sempre `false` porque expo-location nem
 * está no package.json. Não é uma env var: é uma constante de código que o
 * dono muda quando o prebuild acontecer, para não depender de configurar
 * mais uma variável de ambiente só para isto.
 */
export const LOCALIZACAO_DISPONIVEL = false;

/**
 * Decide se um dia mostramos um mapa EMBUTIDO (Google Maps SDK) em vez da
 * lista + deep-link. Depende de billing no Google Cloud (Maps SDK) — por
 * isso é uma flag de env, não uma constante: liga sozinha quando
 * EXPO_PUBLIC_MAPS_KEY existir, sem precisar editar código. Hoje sempre
 * `false` (a env não está setada em nenhum ambiente), então a tela usa
 * SEMPRE lista + "abrir no mapa" — que já funciona hoje, sem chave nenhuma.
 */
export function mapaEmbutidoDisponivel(): boolean {
  return !!EXPO_PUBLIC_MAPS_KEY;
}

let avisouIndisponivel = false;

/**
 * Envia a localização do usuário LOGADO para `localizacoes_equipe` (upsert
 * em (org_id,user_id) — a RLS garante que cada um só escreve a própria linha
 * e só se for membro ativo da org). Precisa que o usuário pertença a uma
 * organização (`getMinhaOrganizacao`); sem org, é no-op (não há "equipe" para
 * compartilhar localização).
 *
 * Nativo (Android/iOS): tenta importar `expo-location` dinamicamente. Como o
 * pacote não está instalado até a Onda 8, o import falha e a função vira
 * no-op silencioso (loga um aviso UMA vez por processo, nunca lança e nunca
 * mostra Alert — o chamador não deve tratar isso como erro visível ao
 * usuário, é uma feature ainda não ligada).
 *
 * Web: delega para `enviarMinhaLocalizacaoWeb()` (navigator.geolocation).
 *
 * Retorna `true` só quando de fato gravou uma localização nova.
 */
export async function enviarMinhaLocalizacao(): Promise<boolean> {
  if (Platform.OS === 'web') return enviarMinhaLocalizacaoWeb();

  if (!LOCALIZACAO_DISPONIVEL) {
    if (!avisouIndisponivel) {
      avisouIndisponivel = true;
      console.log('[localizacaoEquipe] captura nativa ainda não ligada (chega na Onda 8) — no-op.');
    }
    return false;
  }

  try {
    // Import dinâmico de propósito: expo-location só entra no bundle quando
    // o prebuild da Onda 8 o instalar. Em module-scope quebraria o Hermes
    // mesmo sem uso (lição do release v6 — ver AGENTS.md).
    const Location = await import('expo-location' as any);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return gravarLocalizacao(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null);
  } catch (erro) {
    // Módulo ausente, permissão negada, GPS desligado etc. — tudo silencioso.
    console.log('[localizacaoEquipe] não foi possível capturar localização nativa:', erro);
    return false;
  }
}

/**
 * Web: usa a Geolocation API do próprio navegador (sem módulo nativo, sem
 * billing, funciona hoje). Pede a localização uma vez e grava.
 */
export async function enviarMinhaLocalizacaoWeb(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;

  try {
    const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p.coords),
        (e) => reject(e),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
    return gravarLocalizacao(coords.latitude, coords.longitude, coords.accuracy ?? null);
  } catch (erro) {
    console.log('[localizacaoEquipe] geolocalização web indisponível/negada:', erro);
    return false;
  }
}

/** Upsert best-effort em `localizacoes_equipe` (PK composta org_id+user_id). Nunca lança. */
async function gravarLocalizacao(lat: number, lng: number, precisao: number | null): Promise<boolean> {
  if (!supabase) return false;
  try {
    const [user, org] = await Promise.all([getCurrentUser(), getMinhaOrganizacao()]);
    if (!user || !org) return false; // sem organização = sem "equipe" para compartilhar

    const { error } = await supabase
      .from('localizacoes_equipe')
      .upsert(
        { org_id: org.id, user_id: user.id, lat, lng, precisao, capturado_em: new Date().toISOString() },
        { onConflict: 'org_id,user_id' },
      );
    if (error) {
      console.log('[localizacaoEquipe] falha ao gravar localização:', error.message);
      return false;
    }
    return true;
  } catch (erro) {
    console.log('[localizacaoEquipe] erro inesperado ao gravar localização:', erro);
    return false;
  }
}

/**
 * Última localização conhecida de cada membro da equipe do usuário logado.
 * A RLS de `localizacoes_equipe` já resolve quem pode ver o quê (gestão vê
 * a org toda; técnico só a própria linha) — aqui só buscamos as linhas da
 * org atual e enriquecemos com nome/papel via `listarMembros` (mesma fonte
 * que a tela de Equipe usa, com o fallback dela para quando a view de
 * nome/e-mail ainda não existir). [] quando o usuário não tem organização
 * (conta pessoal) ou em qualquer falha — nunca lança para a tela.
 */
export async function localizacoesEquipe(): Promise<LocalizacaoMembro[]> {
  if (!supabase) return [];

  try {
    const org = await getMinhaOrganizacao();
    if (!org) return [];

    const [locRes, membros] = await Promise.all([
      supabase
        .from('localizacoes_equipe')
        .select('user_id, lat, lng, precisao, capturado_em')
        .eq('org_id', org.id)
        .order('capturado_em', { ascending: false }),
      listarMembros(org.id),
    ]);

    if (locRes.error || !locRes.data) return [];

    const membroPorId = new Map(membros.map((m) => [m.userId, m]));
    return locRes.data.map((linha: any) => {
      const membro = membroPorId.get(linha.user_id);
      return {
        userId: linha.user_id,
        nome: membro?.nome || membro?.email || 'Técnico da equipe',
        papel: membro?.papel,
        lat: Number(linha.lat),
        lng: Number(linha.lng),
        precisao: linha.precisao ?? null,
        capturadoEm: linha.capturado_em,
      } satisfies LocalizacaoMembro;
    });
  } catch {
    return [];
  }
}

/** "há X min" / "há X h" / "há X dias" a partir de um ISO. Nunca lança. */
export function tempoRelativo(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms) || ms < 0) return 'agora';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'agora mesmo';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d === 1 ? '' : 's'}`;
  } catch {
    return '';
  }
}

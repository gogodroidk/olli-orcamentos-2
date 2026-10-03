/**
 * Localização da equipe ("equipe ao vivo").
 *
 * ESTADO REAL (2026-09-30, auditoria B10): DESLIGADO de ponta a ponta.
 *  - `expo-location` (e task-manager/mapas) NÃO está instalado e o manifest Android
 *    não pede permissão de localização → `LOCALIZACAO_DISPONIVEL = false` e o celular
 *    nunca envia posição;
 *  - o caminho web (`navigator.geolocation`, abaixo) só existe no build RN-web, que
 *    NÃO está mais publicado — o painel de produção é o webapp Vite, sem esta página;
 *  - por isso a tabela `localizacoes_equipe` está vazia em produção, e as entradas da
 *    tela Equipe mostram o selo "Em breve — localização desligada";
 *  - não é tempo real: a tela lê a última posição ao abrir/puxar para atualizar.
 * O que vem depois (decisão do dono, plano "só em rota"): captura só entre "Estou a
 * caminho" e "Cheguei", com expo-location num APK novo.
 *
 * Este service tem DUAS responsabilidades bem separadas:
 *
 *  1) LER a última localização conhecida de cada membro da equipe
 *     (`localizacoesEquipe()`), consumida pela `EquipeAoVivoScreen`. Devolve três
 *     estados — `ok` | `sem_org` | `erro` — porque "não consegui ler" NÃO é "ninguém
 *     compartilhou" (erro nunca vira vazio).
 *  2) ENVIAR a localização do próprio usuário logado
 *     (`enviarMinhaLocalizacao()`). Hoje só faz algo no RN-web.
 *
 * Tabela `localizacoes_equipe` (PK composta org_id+user_id, lat, lng, precisao,
 * capturado_em) e RLS em `supabase/migrations/20260707_multitenant.sql`: SELECT é
 * "própria linha OU gestão da org"; INSERT/UPDATE é só a própria linha, e exige ser
 * membro ATIVO da org (`eh_membro_ativo`). Este service só lê/escreve — a RLS é quem
 * garante o isolamento entre organizações.
 *
 * `services/equipe.ts` já resolve org/papéis — reusamos `carregarMinhaOrganizacao()`
 * (3 estados) e `listarMembros()` (nome/papel de cada membro).
 *
 * `enviarMinhaLocalizacao()` faz import DINÂMICO de 'expo-location' dentro da função,
 * protegido por try/catch e só quando `LOCALIZACAO_DISPONIVEL` for `true`. NADA de
 * `import 'expo-location'` no topo do arquivo — módulo nativo em module-scope quebra
 * o bundle Hermes mesmo sem uso (lição do release v6).
 */
import { Platform } from 'react-native';
import { supabase, getCurrentUser } from './supabase';
import { EXPO_PUBLIC_MAPS_KEY } from '../config';
import { carregarMinhaOrganizacao, getMinhaOrganizacao, listarMembros, type Papel } from './equipe';

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
 * `true` quando o app tem os módulos nativos de localização instalados e a captura
 * pode ligar de verdade. Hoje é `false` porque expo-location nem está no
 * package.json. Enquanto for `false`, as entradas "Equipe ao vivo" mostram o selo
 * "Em breve — localização desligada" (EquipeScreen e EquipeDesktopScreen). Não é env
 * var: é uma constante de código que muda junto com o APK que instalar o módulo.
 * ATENÇÃO ao ligar: o app.json BLOQUEIA `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`
 * (o manifest do MapLibre as traz sem o OLLI usar). Ligar a captura exige tirá-las de
 * `android.blockedPermissions`, divulgação em destaque e o Data safety da Play.
 */
export const LOCALIZACAO_DISPONIVEL = false;

/**
 * Decide se um dia mostramos um mapa EMBUTIDO (Google Maps SDK) em vez da
 * lista + deep-link. Depende de billing no Google Cloud (Maps SDK) — por
 * isso é uma flag de env, não uma constante: liga sozinha quando
 * EXPO_PUBLIC_MAPS_KEY existir. Hoje sempre `false` (a env não está setada em
 * nenhum ambiente) e nenhum componente de mapa embutido existe ainda: a tela usa
 * lista + "Abrir no mapa" (deep-link do Google Maps, sem chave).
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
 * Nativo (Android/iOS): com `LOCALIZACAO_DISPONIVEL = false` (hoje) é no-op e
 * devolve `false` (loga um aviso UMA vez por processo, nunca lança). A tela não
 * oferece o botão no nativo, então ninguém chega aqui por engano.
 *
 * Web (só o build RN-web, que não está publicado hoje): delega para
 * `enviarMinhaLocalizacaoWeb()` (navigator.geolocation).
 *
 * Retorna `true` só quando de fato gravou uma localização nova.
 */
export async function enviarMinhaLocalizacao(): Promise<boolean> {
  if (Platform.OS === 'web') return enviarMinhaLocalizacaoWeb();

  if (!LOCALIZACAO_DISPONIVEL) {
    if (!avisouIndisponivel) {
      avisouIndisponivel = true;
      console.log('[localizacaoEquipe] captura nativa desligada (expo-location não instalado) — no-op.');
    }
    return false;
  }

  try {
    // Import dinâmico de propósito: expo-location só entra no bundle quando um
    // APK novo o instalar. Em module-scope quebraria o Hermes mesmo sem uso
    // (lição do release v6 — ver AGENTS.md).
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
 * Web (build RN-web): usa a Geolocation API do navegador (sem módulo nativo, sem
 * billing). Pede a localização uma vez e grava. O painel de produção (webapp
 * Vite) não usa esta função.
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
 * Resultado da leitura da equipe ao vivo — três estados, nunca colapsados:
 *  - `ok`: li a tabela (lista pode vir vazia = ninguém compartilhou de verdade);
 *  - `sem_org`: conta pessoal, sem equipe (não há de quem mostrar posição);
 *  - `erro`: não consegui ler (rede, RLS, app sem nuvem) — a tela mostra erro com
 *    "Tentar de novo", nunca "ninguém compartilhou".
 */
export type LeituraLocalizacoesEquipe =
  | { estado: 'ok'; itens: LocalizacaoMembro[] }
  | { estado: 'sem_org' }
  | { estado: 'erro'; mensagem: string };

const MENSAGEM_ERRO_LEITURA = 'Confira sua conexão e tente de novo.';

/**
 * Última localização conhecida de cada membro da equipe do usuário logado. A RLS de
 * `localizacoes_equipe` resolve quem pode ver o quê (gestão vê a org toda; técnico
 * só a própria linha) — aqui só buscamos as linhas da org atual e enriquecemos com
 * nome/papel via `listarMembros`. Nunca lança: falha vira `{ estado: 'erro' }`.
 */
export async function localizacoesEquipe(): Promise<LeituraLocalizacoesEquipe> {
  if (!supabase) {
    return { estado: 'erro', mensagem: 'O app está sem conexão com a nuvem. Entre de novo e tente outra vez.' };
  }

  try {
    const leituraOrg = await carregarMinhaOrganizacao();
    if (leituraOrg.status === 'erro') return { estado: 'erro', mensagem: MENSAGEM_ERRO_LEITURA };
    const org = leituraOrg.org;
    if (!org) return { estado: 'sem_org' };

    const [locRes, membros] = await Promise.all([
      supabase
        .from('localizacoes_equipe')
        .select('user_id, lat, lng, precisao, capturado_em')
        .eq('org_id', org.id)
        .order('capturado_em', { ascending: false }),
      listarMembros(org.id),
    ]);

    if (locRes.error || !Array.isArray(locRes.data)) return { estado: 'erro', mensagem: MENSAGEM_ERRO_LEITURA };

    // `listarMembros` falhar só tira o NOME (cai no rótulo genérico) — a posição
    // lida é real, então não vira erro da tela inteira.
    const membroPorId = new Map(membros.map((m) => [m.userId, m]));
    const itens = locRes.data.map((linha: any) => {
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
    return { estado: 'ok', itens };
  } catch {
    return { estado: 'erro', mensagem: MENSAGEM_ERRO_LEITURA };
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

/**
 * Religa a sincronização quando o app volta ao primeiro plano ou o browser
 * anuncia que a rede voltou.
 *
 * O BURACO QUE ISTO FECHA. Toda mutação local espelha na nuvem na hora
 * (`mirrorPush`). Offline, esse espelho falha — e falha em silêncio, de
 * propósito, para não travar o técnico em campo. A recuperação é o
 * `pushAllLocal` de dentro do `syncOnLogin`, que até aqui só era disparado pelo
 * `onAuthStateChange` em `SIGNED_IN`/`INITIAL_SESSION`.
 *
 * Só que `INITIAL_SESSION` é evento de BOOT FRIO. Trazer o app do segundo plano
 * para a frente não emite nada. Então o caminho real do campo — fecha a OS no
 * subsolo, bloqueia a tela, sobe pro carro com 4G, desbloqueia — não empurrava
 * nada: o dado esperava o app ser MORTO e reaberto. A landing promete
 * "sincroniza quando a rede volta" (`web/src/pages/index.astro:148`); era
 * verdade só com uma condição que ninguém contava ao usuário.
 *
 * POR QUE NÃO TEM FILA AQUI. A tentação seria construir uma outbox. Não
 * precisa: o `pushAllLocal` já varre o banco local inteiro e reenvia por
 * `id` (upsert idempotente), e o `syncOnLogin` já carrega TODAS as travas —
 * `if (syncing) return`, sessão, partição por usuário, `podeSincronizar`
 * fail-closed, e nunca lança. Uma fila paralela seria um segundo estado para
 * divergir do primeiro. Aqui só existe o GATILHO.
 *
 * LIMITE HONESTO, PORQUE ELE EXISTE: se o app ficar em primeiro plano o tempo
 * todo e a rede voltar sozinha, nada dispara até a próxima ida-e-volta ao
 * segundo plano. Cobrir isso exigiria sondar a rede em laço para todo usuário
 * (bateria) ou entrar com o NetInfo (dependência nova). Os dois foram
 * descartados para esta correção; o gatilho de foreground cobre o caso de campo
 * de verdade, que é o celular no bolso com a tela apagada.
 *
 * ESTE ARQUIVO NÃO IMPORTA `react-native` — e não é estilo, é o que torna a
 * regra testável. O `node` do gate não parseia a sintaxe Flow do RN, então um
 * import aqui faria `scripts/teste-religar-sync.ts` morrer antes da primeira
 * asserção e a regra de janela ficaria sem cobertura nenhuma. Os ouvintes de
 * AppState/'online' moram em `iniciarReligarSync.ts`. Mesmo motivo pelo qual
 * `theme/fonts.ts` e `theme/aplicarFontPatch.ts` são dois arquivos.
 */

/**
 * Espaço mínimo entre dois sincronismos disparados por AQUI. Trocar de app duas
 * vezes em cinco segundos não deve render dois pulls completos. Não protege o
 * `syncOnLogin` (ele já tem o `if (syncing) return`) — protege a REDE de quem
 * está no 4G do interior, que é quem mais precisa desta correção funcionar.
 */
const ESPERA_MINIMA_MS = 30_000;

export interface DependenciasReligador {
  /** O que rodar quando religar. Em produção, `syncOnLogin`. */
  sincronizar: () => Promise<void>;
  /** Relógio injetável — sem isto o teste teria que dormir 30 segundos. */
  agora: () => number;
}

export interface Religador {
  /** Chame quando o app voltar ao primeiro plano / a rede voltar. */
  aoReligar: () => void;
  /** Quantas vezes o sync foi de fato disparado (só para teste/diagnóstico). */
  disparos: () => number;
}

/**
 * Núcleo testável: decide QUANDO chamar, sem tocar em RN nem em rede.
 * Separado do `iniciarReligarSync` porque a regra de janela é a única coisa
 * aqui que pode estar errada de um jeito que ninguém percebe.
 */
export function criarReligador(deps: DependenciasReligador): Religador {
  let ultimoDisparo = Number.NEGATIVE_INFINITY;
  let total = 0;
  return {
    aoReligar() {
      const t = deps.agora();
      if (t - ultimoDisparo < ESPERA_MINIMA_MS) return;
      ultimoDisparo = t;
      total += 1;
      // Fire-and-forget e engolindo: `syncOnLogin` já promete não lançar, mas
      // um `.catch` aqui garante que uma promessa rejeitada nunca vire
      // "unhandled rejection" derrubando o app do usuário por causa de rede.
      void deps.sincronizar().catch(() => {});
    },
    disparos() {
      return total;
    },
  };
}

export { ESPERA_MINIMA_MS };

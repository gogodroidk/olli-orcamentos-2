/**
 * PONTO DE ENTRADA — exporta o app para a web SEM NUVEM e captura as telas.
 *
 *     node scripts/telas/gerar.mjs            (build + captura)
 *     node scripts/telas/gerar.mjs --so-captura   (reaproveita o build anterior)
 *
 * Um comando só, de propósito: "repetível" só é verdade se a pessoa seguinte
 * não precisar lembrar de duas variáveis de ambiente e da ordem dos passos.
 *
 * ─── Por que exportar com a nuvem DESLIGADA ────────────────────────────────
 *
 * `EXPO_PUBLIC_SUPABASE_URL=offline` não é gambiarra: é o modo que o próprio
 * app já tem. `src/services/supabase.ts` só cria o client quando a URL começa
 * com "http"; com "offline" ele fica `null`, e `App.tsx` trata `!supabase` como
 * "build sem nuvem: não existe login possível" e abre direto nas abas.
 *
 * O efeito colateral é o que mais importa aqui: as credenciais reais do
 * Supabase (que estão como padrão em `src/config.ts`) NÃO entram no bundle
 * gerado — este script confere isso e recusa continuar se elas aparecerem. Ou
 * seja, o browser de captura não tem como alcançar dado de cliente de verdade
 * nem por acidente nem por bug.
 *
 * `EXPO_PUBLIC_DIAGNOSTICO_URL=` vazio pelo mesmo motivo: sem worker de IA
 * configurado, a tela de diagnóstico mostra o caminho honesto em vez de tentar
 * a rede.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { conferirBundleSemCredenciais } from './guarda-bundle.mjs';

const RAIZ = resolve(process.cwd());
// Saída do export DENTRO de `.expo/`, que já é ignorado pelo git: um build de
// 19 MB não pode aparecer como arquivo novo no `git status` de quem só quis
// gerar imagens. Também evita brigar com o `dist/` do `npm run export:web`.
const DIST = resolve('.expo/telas-build');
const soCaptura = process.argv.includes('--so-captura');

/**
 * `shell` só para o `npx` (no Windows ele é um .cmd e não roda sem shell). Para
 * o próprio node, shell é PROIBIDO: o caminho do executável tem espaço
 * ("C:\Program Files\...") e o cmd.exe o parte no meio.
 */
function rodar(comando, args, env, { usarShell = false } = {}) {
  const r = spawnSync(comando, args, {
    cwd: RAIZ,
    stdio: 'inherit',
    shell: usarShell && process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!soCaptura) {
  console.log('1/3  Exportando o app para a web, com a nuvem DESLIGADA…');
  rodar(
    'npx',
    ['expo', 'export', '-p', 'web', '--output-dir', '.expo/telas-build'],
    {
      EXPO_PUBLIC_SUPABASE_URL: 'offline',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
      EXPO_PUBLIC_DIAGNOSTICO_URL: '',
    },
    { usarShell: true },
  );
}

console.log('\n2/3  Conferindo o bundle…');
conferirBundleSemCredenciais(DIST);

console.log('\n3/3  Capturando as telas…');
rodar(process.execPath, ['scripts/telas/capturar-telas.mjs'], {});

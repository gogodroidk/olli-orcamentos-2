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
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(process.cwd());
// Saída do export DENTRO de `.expo/`, que já é ignorado pelo git: um build de
// 19 MB não pode aparecer como arquivo novo no `git status` de quem só quis
// gerar imagens. Também evita brigar com o `dist/` do `npm run export:web`.
const DIST = resolve('.expo/telas-build');
const soCaptura = process.argv.includes('--so-captura');

/**
 * O identificador do projeto Supabase de produção, lido de `src/config.ts` (o
 * mesmo lugar de onde o app o tiraria). Procurar por "supabase.co" não serve:
 * essa string aparece no código da biblioteca e no texto de onboarding, e o
 * portão dispararia sempre. O que precisa NÃO estar no bundle é o projeto.
 */
function refDoProjetoDeProducao() {
  const config = readFileSync(resolve('src/config.ts'), 'utf8');
  const m = config.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!m) {
    console.error('\nPAREI: não consegui ler a URL do Supabase em src/config.ts.');
    console.error('Sem saber qual é o projeto de produção, não dá para garantir que ele');
    console.error('ficou FORA do bundle — e "não sei" aqui não pode virar "tudo certo".\n');
    process.exit(1);
  }
  return m[1];
}

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

function conferirBundleSemCredenciais() {
  const ref = refDoProjetoDeProducao();
  const dirJs = join(DIST, '_expo/static/js/web');
  let achou = false;
  for (const arquivo of readdirSync(dirJs)) {
    if (!arquivo.endsWith('.js')) continue;
    if (readFileSync(join(dirJs, arquivo), 'utf8').includes(ref)) {
      console.error(`\nPAREI: o projeto "${ref}" apareceu em ${arquivo}.`);
      console.error('O export saiu COM a nuvem ligada. Um browser de captura com credencial de');
      console.error('produção na mão pode fotografar dado de cliente real — e screenshot');
      console.error('publicado não se despublica. Confira as variáveis do export.\n');
      process.exit(1);
    }
    achou = true;
  }
  if (!achou) {
    console.error(`\nPAREI: não achei nenhum bundle .js em ${dirJs}. O export falhou?\n`);
    process.exit(1);
  }
  console.log(`Bundle conferido: o projeto "${ref}" não está lá dentro.`);
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
conferirBundleSemCredenciais();

console.log('\n3/3  Capturando as telas…');
rodar(process.execPath, ['scripts/telas/capturar-telas.mjs'], {});

/**
 * GUARDA DO BUNDLE — confere que o export de captura saiu SEM as credenciais de
 * produção antes de qualquer browser abrir.
 *
 * Estava embutido no `gerar.mjs`. Saiu para cá quando `loja.mjs` (screenshots da
 * Google Play) passou a precisar da mesma conferência: duas cópias da regra que
 * decide se um browser de captura pode ou não alcançar dado de cliente real é
 * exatamente a regra que se conserta num arquivo e continua furada no outro.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * O identificador do projeto Supabase de produção, lido de `src/config.ts` (o
 * mesmo lugar de onde o app o tiraria). Procurar por "supabase.co" não serve:
 * essa string aparece no código da biblioteca e no texto de onboarding, e o
 * portão dispararia sempre. O que precisa NÃO estar no bundle é o projeto.
 */
export function refDoProjetoDeProducao() {
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
 * Falha o processo se a URL do Supabase de produção aparecer no JS exportado.
 * @param {string} dist diretório do export web
 */
export function conferirBundleSemCredenciais(dist) {
  const ref = refDoProjetoDeProducao();
  const dirJs = join(dist, '_expo/static/js/web');
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

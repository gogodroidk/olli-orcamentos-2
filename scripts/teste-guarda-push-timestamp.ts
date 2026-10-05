/**
 * Teste da guarda de timestamp do PUSH (cloudSync.pushAllLocal).
 *
 *     node scripts/teste-guarda-push-timestamp.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O BUG QUE ISTO TRANCA: `carregarTimestampsRemotos` devolvia um mapa VAZIO quando
 * a leitura da nuvem falhava. Mapa vazio = "a nuvem não tem nada mais novo", então
 * o push subia TODAS as linhas locais por cima da nuvem — uma cópia velha desfazia
 * a edição ou a exclusão feita no painel ou em outro aparelho. E sem paginação a
 * guarda ficava cega acima de 1000 linhas (teto padrão do PostgREST).
 *
 * O cloudSync importa RN/Expo, então o teste confere o CONTRATO no fonte
 * (mesmo padrão dos outros testes de contrato deste repo).
 */
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../src/services/cloudSync.ts', import.meta.url), 'utf8');

let falhas = 0;
let passes = 0;

function checar(nome: string, ok: boolean): void {
  if (ok) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}`);
  }
}

function corpo(nomeFuncao: string): string {
  const ini = fonte.indexOf(`function ${nomeFuncao}(`);
  if (ini < 0) return '';
  const fim = fonte.indexOf('\n}\n', ini);
  return fonte.slice(ini, fim < 0 ? undefined : fim);
}

const carregar = corpo('carregarTimestampsRemotos');
const guarda = corpo('remoteMaisNovoNoMapa');

console.log('\n1) Erro ao ler a nuvem não vira "nuvem vazia"');
checar('carregarTimestampsRemotos existe', carregar.length > 0);
checar('tipo de retorno admite null', /Promise<Map<string, string> \| null>/.test(carregar));
checar('erro do Supabase devolve null', /if \(error \|\| !Array\.isArray\(data\)\) return null;/.test(carregar));
checar('exceção devolve null', /catch \{\s*return null;\s*\}/.test(carregar));
checar('nenhum "return mapa" dentro do caminho de erro', !/if \(error[^\n]*return mapa/.test(carregar));

console.log('\n2) Paginação acima do teto do PostgREST');
checar('usa .range(...)', /\.range\(/.test(carregar));
checar('ordena por id (página estável)', /\.order\('id'/.test(carregar));
checar('para quando a página vem incompleta', /data\.length < TIMESTAMPS_PAGINA\) break/.test(carregar));

console.log('\n3) Guarda com mapa null PULA o push');
checar('remoteMaisNovoNoMapa aceita null', /mapa: Map<string, string> \| null/.test(guarda));
checar('null → true (não sobrescreve)', /if \(mapa === null\) return true;/.test(guarda));
checar('checagem de null vem antes do "sem localTs"',
  guarda.indexOf('mapa === null') >= 0 && guarda.indexOf('mapa === null') < guarda.indexOf('if (!localTs)'));

console.log(falhas === 0 ? `\nPASSOU: ${passes} ok, 0 falha(s)` : `\nFALHOU: ${falhas} falha(s), ${passes} ok`);
process.exit(falhas === 0 ? 0 : 1);

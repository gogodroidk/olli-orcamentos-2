/**
 * Contrato do BYO de IA (D-1438 G22). Não há rede, chave real nem preço novo.
 *
 *     node scripts/teste-byo-ia.ts
 * Exit 0 = passou; 1 = falhou.
 */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHAVE_MIN_CARACTERES,
  COBRANCA_IA_NA_PLATAFORMA,
  MODOS_BYO,
  PLUGIN_USA_MCP,
  classificarChave,
  exigirSemCobrancaNova,
  frasePlanoPublicado,
  modoPedeChave,
  redigirTexto,
  textoDoModo,
} from '../src/services/byoIa.ts';
import { PRECO_EMPRESA, PRECO_PRO, reais } from '../src/services/precosPlanos.ts';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

function ok(nome: string, cond: boolean, detalhe = ''): void {
  if (cond) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`);
  }
}

console.log('\n1) preço publicado e cobrança nova');
checar('Pro mensal segue 3900 centavos', PRECO_PRO.mensalCentavos, 3900);
checar('Empresa mensal segue 9900 centavos', PRECO_EMPRESA.mensalCentavos, 9900);
checar('cobrança na plataforma bloqueada', COBRANCA_IA_NA_PLATAFORMA.estado, 'bloqueada');
checar('plugin é casca do MCP', PLUGIN_USA_MCP, true);
exigirSemCobrancaNova(COBRANCA_IA_NA_PLATAFORMA.estado);
passes++;
console.log('  ok   estado de produção não estoura');

let estourou = false;
try {
  exigirSemCobrancaNova('liberada');
} catch {
  estourou = true;
}
ok('liberar cobrança nova estoura', estourou);

const plano = frasePlanoPublicado();
ok('frase traz o Pro da fonte', plano.includes(reais(PRECO_PRO.mensalCentavos)));
ok('frase traz a Empresa da fonte', plano.includes(reais(PRECO_EMPRESA.mensalCentavos)));

console.log('\n2) texto honesto, sem compra de IA');
for (const modo of MODOS_BYO) {
  const texto = textoDoModo(modo);
  ok(`${modo} repete o plano publicado`, texto.includes(plano));
  ok(`${modo} não vende crédito`, !/cr[eé]dito|pague a IA|R\$\s*49|ilimitad/i.test(texto));
  ok(`${modo} avisa que ainda não liga`, /Ainda não há/.test(texto));
}
ok('API não pede para pagar no OLLI', textoDoModo('api').includes('não no OLLI'));
ok('MCP diz que a chave do modelo fica fora', textoDoModo('mcp').includes('não vê a chave'));
checar('só API pede chave', MODOS_BYO.map(modoPedeChave), [true, false, false]);

console.log('\n3) classificar chave sem devolver o segredo');
const miolo = 'exemplo-nunca-real-corpo-unico';
const chaves: Array<[string, 'claude' | 'gpt' | 'gemini']> = [
  [`sk-ant-${miolo}-claude`, 'claude'],
  [`sk-proj-${miolo}-gptkey`, 'gpt'],
  [`sk-${miolo}-gptcurto`, 'gpt'],
  [`AIza${miolo}gemini`, 'gemini'],
];
for (const [chave, provedor] of chaves) {
  const r = classificarChave(`  ${chave.slice(0, 8)}\n${chave.slice(8)}  `);
  checar(`${provedor} aceita e não ecoa o miolo`, r, {
    aceita: true,
    provedor,
    ultimos4: chave.slice(-4),
  });
  ok(`${provedor} some do JSON`, !JSON.stringify(r).includes(miolo));
}

checar('vazia', classificarChave('   '), { aceita: false, motivo: 'vazia' });
checar('curta', classificarChave('sk-ant-curta'), { aceita: false, motivo: 'curta' });
checar(
  'chave da casa',
  classificarChave(`sk-or-v1-${'a'.repeat(CHAVE_MIN_CARACTERES)}`),
  { aceita: false, motivo: 'chave_da_casa' },
);
checar(
  'segredo do banco não é chave de IA',
  classificarChave(`sb_secret_${'a'.repeat(CHAVE_MIN_CARACTERES)}`),
  { aceita: false, motivo: 'nao_e_chave_de_ia' },
);
checar('formato estranho', classificarChave(`x${'abc'.repeat(10)}`), { aceita: false, motivo: 'formato' });

const frase = `cole ${chaves[0][0]} e também ${chaves[3][0]} no log`;
const limpo = redigirTexto(frase);
ok('redação tira o miolo', !limpo.includes(miolo) && limpo.includes('[chave]'));
ok('redação não devolve a chave do Claude', !limpo.includes('sk-ant-'));

console.log('\n4) o módulo não fala com a rede e ninguém no app importa');
const fonte = ler('../src/services/byoIa.ts');
ok('sem fetch', !fonte.includes('fetch('));
ok('sem supabase', !/supabase/i.test(fonte));
ok('sem preço digitado fora da fonte', !/mensalCentavos\s*:/.test(fonte));

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (nome === 'node_modules' || nome === 'dist') continue;
    const st = statSync(caminho);
    if (st.isDirectory()) arquivos(caminho, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

const importa = /from\s+['"][^'"]*byoIa(?:\.ts)?['"]/;
const alvos = ['src', 'worker/src', 'webapp/src'].flatMap((dir) => arquivos(join(RAIZ, dir)));
const app = join(RAIZ, 'App.tsx');
alvos.push(app);
const quemImporta = alvos.filter((arquivo) => importa.test(readFileSync(arquivo, 'utf8')));
checar('nenhuma tela ou worker importa byoIa', quemImporta, []);

console.log('\n5) spec presente, migration ausente');
const spec = ler('../docs/BYO_IA_D1438_G22.md');
ok('spec marca a cobrança bloqueada', spec.includes('BLOQUEADO'));
ok('spec manda não aplicar a tabela', spec.includes('NÃO APLICAR'));
ok('spec repete o Pro publicado', spec.includes('Pro continua R$ 39'));
ok('spec repete a Empresa publicada', spec.includes('Empresa continua R$ 99'));
const migrations = readdirSync(join(RAIZ, 'supabase/migrations'));
ok(
  'nenhuma migration deste item',
  !migrations.some((nome) => /byo|d1438-g22/i.test(nome)),
);

console.log('\n6) mutação: classificação frouxa não passa');
const mutacoes: Array<[string, () => void]> = [
  [
    'chave da casa não pode virar GPT',
    () => {
      const r = classificarChave(`sk-or-v1-${miolo}`);
      assert.equal(r.aceita, false);
      if (!r.aceita) assert.equal(r.motivo, 'chave_da_casa');
    },
  ],
  [
    'resultado aceito não carrega a chave',
    () => {
      const chave = `sk-ant-${miolo}-claude`;
      const r = classificarChave(chave);
      assert.equal(JSON.stringify(r).includes(miolo), false);
    },
  ],
  [
    'texto de API não cria outro preço',
    () => {
      assert.equal(/R\$\s*(?!39\b|99\b)\d/.test(textoDoModo('api')), false);
    },
  ],
];
let mutacoesPegas = 0;
for (const [nome, fn] of mutacoes) {
  try {
    fn();
    mutacoesPegas++;
    console.log(`  ok   ${nome}`);
  } catch (erro) {
    falhas++;
    console.error(`  FALHA mutação NÃO pega — ${nome}\n        ${erro instanceof Error ? erro.message : erro}`);
  }
}

console.log(
  `\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s), ${mutacoesPegas}/${mutacoes.length} mutações\n`,
);
process.exit(falhas === 0 ? 0 : 1);

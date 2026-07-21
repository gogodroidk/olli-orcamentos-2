/**
 * Teste do TENANT DE ESCRITA e dos restos apontados pelos revisores
 * (docs/ENXAME/REVISAO_MIGRATIONS.md e REVISAO_CONTRATO_CEP.md).
 *
 *     node scripts/teste-tenant-escrita.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * O QUE ESTE ARQUIVO TRANCA, em ordem de dano:
 *
 *  1. A ESCOLHA DA MEMBRESIA (`carregarMinhaOrganizacao`, equipe.ts). Esta é a
 *     consulta que decide, para o app inteiro, EM QUAL EMPRESA o usuário está
 *     gravando: `cloudSync` lê o `ownerUserId` que sai daqui e carimba com ele
 *     cada linha que sobe. `.limit(1)` sem `order by` não devolve "a primeira" —
 *     devolve a que o Postgres escolher naquele plano de execução, e ele pode
 *     escolher diferente entre duas chamadas do MESMO aparelho. Quem é membro
 *     legítimo de duas organizações teria o orçamento gravado na org A hoje e na
 *     org B amanhã. Dado de uma empresa dentro da outra, sem erro na tela.
 *
 *  2. A CONCORDÂNCIA COM O PAINEL. O celular e o navegador do mesmo usuário
 *     precisam responder a mesma coisa a "em qual empresa eu estou?". Ordenações
 *     diferentes nos dois lados é o mesmo bug do item 1, só que pior: ninguém
 *     compara as duas superfícies, então ele nunca aparece. Por isso o teste lê
 *     `webapp/src/olli/mutacoes.ts` e exige IGUALDADE — não "os dois ordenam",
 *     mas "os dois ordenam pela MESMA coluna na MESMA direção".
 *
 *  3. O 402 `plano_requer_empresa` (Achado 2 da REVISAO_MIGRATIONS). O worker
 *     está publicado e a cobrança passou a valer de verdade: quem tem Empresa
 *     vencido bate nesse 402 hoje, em produção. Cair no `default` genérico
 *     ("Não consegui criar o convite agora. Tente de novo.") é a variante
 *     "negativa vira ruído" do bug da casa — o dono tentaria de novo para sempre
 *     sem nunca ficar sabendo que o problema é o pagamento.
 *
 *  4. OS TETOS DO CONTRATO em fonte única (nota menor da REVISAO_CONTRATO_CEP:
 *     "o app é a cópia que vai envelhecer"). O teto da multa é o art. 52, §1º,
 *     do CDC. Ter o número escrito em dois arquivos é combinar de divergir: a
 *     tela promete ao prestador um limite que o gerador não aplica, ou o gerador
 *     corta um valor que a tela deixou digitar — sem dizer que cortou.
 *
 * As asserções sobre FONTE sempre removem comentários antes de buscar: a prosa
 * deste código cita nominalmente `order`, `criado_em` e `plano_requer_empresa`
 * ao explicar as regras, e sem isso o teste atestaria o comentário em vez do
 * código. As asserções sobre os tetos são EXECUÇÃO do gerador real.
 */
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Mesmo resolvedor de `teste-contrato-prestacao.ts`: o Node exige extensão em
 *  ESM, o app proíbe escrevê-la. O teste aprende a resolver como o app resolve. */
registerHooks({
  resolve(especificador: string, contexto: any, next: any) {
    if (especificador.startsWith('.') && !especificador.endsWith('.ts')) {
      const base = new URL(especificador, contexto.parentURL);
      for (const cand of [`${base.href}.ts`, `${base.href}/index.ts`]) {
        if (existsSync(fileURLToPath(cand))) return next(cand, contexto);
      }
    }
    return next(especificador, contexto);
  },
});

const {
  termosPadraoContrato,
  MULTA_ATRASO_MAX,
  JUROS_MES_MAX,
  AVISO_PREVIO_MAX,
} = await import('../src/utils/contratoPdf.ts');

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

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

/** Tira comentários: sem isto o teste atestaria a PROSA que descreve o código. */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Recorta o trecho entre dois marcadores. Serve para afirmar sobre UMA função em
 * vez do arquivo: `equipe.ts` tem três `.from('organizacao_membros')` e só a de
 * `carregarMinhaOrganizacao` decide o tenant de escrita — procurar no arquivo
 * todo deixaria o teste passar com a consulta certa no lugar errado.
 */
function bloco(src: string, inicio: string, fim: string): string {
  const i = src.indexOf(inicio);
  if (i < 0) return '';
  const j = src.indexOf(fim, i + inicio.length);
  return src.slice(i, j < 0 ? src.length : j);
}

const equipe = semComentarios(ler('../src/services/equipe.ts'));
const painel = semComentarios(ler('../webapp/src/olli/mutacoes.ts'));

/* ─── 1) A membresia é escolhida de forma DETERMINÍSTICA ─────────────────── */
console.log('\n1) equipe.ts — a consulta que decide o tenant de escrita');

const carregar = bloco(
  equipe,
  'export async function carregarMinhaOrganizacao',
  'export async function getMinhaOrganizacao',
);

checar('achei o corpo de carregarMinhaOrganizacao', carregar.length > 0, true);
checar(
  'é ele quem consulta organizacao_membros',
  carregar.includes("from('organizacao_membros')"),
  true,
);
checar('a consulta ORDENA (sem isto o Postgres escolhe)', /\.order\(/.test(carregar), true);
checar('ordena por criado_em', /\.order\(\s*'criado_em'/.test(carregar), true);
checar(
  'ascendente — a membresia MAIS ANTIGA vence',
  /\.order\(\s*'criado_em'\s*,\s*\{\s*ascending:\s*true\s*\}\s*\)/.test(carregar),
  true,
);
checar('continua pegando UMA linha (.limit(1))', /\.limit\(\s*1\s*\)/.test(carregar), true);

// A regressão exata, escrita como a ausência do anti-padrão: filtrar por ativo e
// já cair no limit é o bug que estava aqui. Se alguém apagar a linha do `.order`,
// esta asserção acusa junto com as de cima — de propósito, é a mais legível.
checar(
  'NÃO existe `.eq(ativo,true).limit()` direto (o bug de origem)',
  /\.eq\(\s*'ativo'\s*,\s*true\s*\)\s*\.limit\(/.test(carregar),
  false,
);

const iOrder = carregar.indexOf('.order(');
const iLimit = carregar.indexOf('.limit(');
checar('o order vem antes do limit', iOrder >= 0 && iOrder < iLimit, true);

/* ─── 2) App e painel concordam sobre a MESMA membresia ──────────────────── */
console.log('\n2) o celular e o navegador respondem a mesma coisa');

/** Extrai (coluna, direção) do primeiro `.order(...)` de um trecho. */
function ordenacao(trecho: string): { coluna: string; ascendente: boolean } | null {
  const m = /\.order\(\s*["']([a-z_]+)["']\s*,\s*\{\s*ascending:\s*(true|false)\s*\}/.exec(trecho);
  return m ? { coluna: m[1], ascendente: m[2] === 'true' } : null;
}

const contextoPainel = bloco(painel, 'opcoesContextoDeEscrita', 'export ');
checar(
  'achei o contexto de escrita do painel',
  contextoPainel.includes('organizacao_membros'),
  true,
);

const ordApp = ordenacao(carregar);
const ordPainel = ordenacao(contextoPainel);
checar('o app declara uma ordenação', ordApp !== null, true);
checar('o painel declara uma ordenação', ordPainel !== null, true);
// Igualdade, não "ambos ordenam": duas ordens diferentes mandariam o mesmo
// usuário para empresas diferentes conforme o aparelho.
checar('app e painel usam a MESMA ordenação', ordApp, ordPainel);

/* ─── 3) O 402 do paywall diz o que aconteceu ────────────────────────────── */
console.log('\n3) plano_requer_empresa (402) — a cobrança está viva em produção');

const traduzir = bloco(equipe, 'function traduzirErroConvite', '\n}\n');
checar('achei traduzirErroConvite', traduzir.length > 0, true);
checar(
  'o 402 tem case próprio (não cai no default)',
  /case\s+'plano_requer_empresa'\s*:/.test(traduzir),
  true,
);

/** A frase que o `case` devolve — para conferir o TEXTO, não só a existência. */
const msg402 = (() => {
  const m = /case\s+'plano_requer_empresa'\s*:\s*return\s+'([^']*)'/.exec(traduzir);
  return m ? m[1] : '';
})();

checar('a frase do 402 não está vazia', msg402.length > 0, true);
checar(
  'ela NÃO é a genérica "tente de novo" (tentar de novo nunca funciona aqui)',
  /tente de novo/i.test(msg402),
  false,
);
checar('ela nomeia o plano Empresa', /empresa/i.test(msg402), true);
checar('ela diz PARA ONDE IR (os planos)', /plano/i.test(msg402), true);

/* ─── 4) Os tetos do contrato têm UMA fonte ──────────────────────────────── */
console.log('\n4) tetos do contrato — fonte única entre a tela e o gerador');

checar('MULTA_ATRASO_MAX é 2% (CDC art. 52, §1º)', MULTA_ATRASO_MAX, 2);
checar('JUROS_MES_MAX é 10%', JUROS_MES_MAX, 10);
checar('AVISO_PREVIO_MAX é 90 dias', AVISO_PREVIO_MAX, 90);

const ORCAMENTO: any = {
  id: 'o1',
  numero: '0042',
  clienteNome: 'Maria Souza',
  itens: [{ id: 'i1', descricao: 'Limpeza de split', quantidade: 1, valorUnitario: 300 }],
  total: 300,
  criadoEm: '2026-07-19T10:00:00.000Z',
};
const EMPRESA: any = { id: 'e1', nome: 'Frio Certo', cidade: 'Campinas', estado: 'SP' };

// EXECUÇÃO: manda valores acima do teto e confere que o gerador grampeia no
// MESMO número que a tela mostra. Se o gerador voltar a um literal solto, este
// bloco falha no dia em que o literal e a constante discordarem.
const acimaDoTeto = termosPadraoContrato(ORCAMENTO, EMPRESA, {
  multaAtrasoPercent: 99,
  jurosMesPercent: 99,
  avisoPrevioDias: 999,
} as any);

checar('multa acima do teto é grampeada no teto', acimaDoTeto.multaAtrasoPercent, MULTA_ATRASO_MAX);
checar('juros acima do teto são grampeados no teto', acimaDoTeto.jurosMesPercent, JUROS_MES_MAX);
checar('aviso acima do teto é grampeado no teto', acimaDoTeto.avisoPrevioDias, AVISO_PREVIO_MAX);

const editor = semComentarios(ler('../src/components/documentos/EditorClausulasContrato.tsx'));
checar(
  'a tela IMPORTA os tetos do gerador',
  /MULTA_ATRASO_MAX/.test(editor) && /JUROS_MES_MAX/.test(editor) && /AVISO_PREVIO_MAX/.test(editor),
  true,
);
// A cópia que o revisor apontou: `const MULTA_MAX = 2` no arquivo da tela.
// Qualquer número literal aqui é a divergência esperando para acontecer.
checar(
  'a tela NÃO redeclara os tetos como número literal',
  /const\s+(MULTA_MAX|JUROS_MAX|AVISO_MAX)\s*=\s*\d/.test(editor),
  false,
);

/* ─── Veredito ───────────────────────────────────────────────────────────── */
console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'} — ${passes} ok, ${falhas} falhas\n`);
process.exit(falhas === 0 ? 0 : 1);

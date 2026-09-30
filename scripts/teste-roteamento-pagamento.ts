/**
 * Teste de ROTEAMENTO DE PAGAMENTO — lado CLIENTE (app `src/` + painel `webapp/src/`).
 *
 *     node scripts/teste-roteamento-pagamento.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * ═══ O QUE ESTÁ SENDO TRANCADO ═══
 * Decisões do dono: "deixe os pagamentos do CARTÃO no STRIPE, e os pagamentos PIX
 * no MERCADO PAGO" (jul/2026) e, em 29/09/2026, "vamos utilizar o AbacatePay para
 * fazer os pagamentos através do Pix" — para o PLANO. Invariante de código:
 *
 *   CARTÃO        → `/stripe/*`   (checkout, portal, faturas, método)
 *   PIX CRÉDITOS  → `/mp/*`       (recarga de créditos, arquivo dono único)
 *   PIX DO PLANO  → `/abacate/*`  (período de plano, arquivo dono único)
 *   NADA          → `/mp/plano/*` (plano no MP — o Pix de plano é da AbacatePay)
 *
 * Este script NÃO testa comportamento em runtime — ele tranca o DESTINO das chamadas.
 * É a rede que pega "alguém colou um botão que cobra pelo provedor errado", que é o
 * tipo de erro que só aparece na fatura do cliente. O custo do erro aqui é dinheiro
 * real, então a checagem é por INVENTÁRIO FECHADO: não basta a rota proibida estar
 * ausente, o conjunto de rotas chamadas tem de ser exatamente o esperado — uma rota
 * nova de pagamento no cliente falha o teste até alguém dizer, aqui, quem é o dono dela.
 *
 * COMENTÁRIO NÃO É CHAMADA: a varredura roda sobre o código com os comentários
 * removidos, senão o próprio docblock que documenta a rota proibida derrubaria o teste
 * (e o remédio seria apagar a documentação — exatamente o contrário do que se quer).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

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

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

/** Todos os .ts/.tsx sob `dir` (relativo à raiz do repo), em caminho relativo com '/'. */
function arquivosDe(dir: string): string[] {
  const abs = join(RAIZ, dir);
  const achados: string[] = [];
  const andar = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        andar(p);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        achados.push(relative(RAIZ, p).split(sep).join('/'));
      }
    }
  };
  if (!statSync(abs, { throwIfNoEntry: false })?.isDirectory()) return achados;
  andar(abs);
  return achados;
}

/**
 * Remove comentários de bloco e as linhas iniciadas por `//`, preservando o resto.
 * Deliberadamente NÃO tenta remover `//` no meio de uma linha: isso mutilaria
 * `https://...` dentro de string, que é justamente o que precisamos ler.
 */
function semComentarios(src: string): string {
  const semBloco = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return semBloco
    .split('\n')
    .map((l) => (l.trimStart().startsWith('//') ? '' : l))
    .join('\n');
}

/** Rotas de gateway citadas em código (string literal começando por /stripe, /mp ou /abacate). */
function rotasDeGateway(codigo: string): string[] {
  const achadas = new Set<string>();
  const re = /['"`](\/(?:stripe|mp|abacate)\/[A-Za-z0-9/_-]*)['"`]/g;
  for (const m of codigo.matchAll(re)) achadas.add(m[1]);
  // Também pega o caso interpolado: `${PAGAMENTOS_URL}/mp/pix?...`
  const re2 = /\$\{[A-Za-z_$][\w$]*\}(\/(?:stripe|mp|abacate)\/[A-Za-z0-9/_-]*)/g;
  for (const m of codigo.matchAll(re2)) achadas.add(m[1]);
  return [...achadas];
}

interface Alvo {
  rotulo: string;
  dir: string;
  /** Conjunto FECHADO de rotas de gateway que este lado pode chamar. */
  esperadas: string[];
  /** Arquivo único que pode falar com o Mercado Pago (`/mp/*`), ou null se nenhum. */
  donoDoPix: string | null;
  /** Arquivos que podem falar com a Stripe. */
  donosDoCartao: string[];
  /** Arquivo único que pode chamar `/abacate/*` (Pix do plano), ou null. */
  donoDoPixPlano: string | null;
  /** Arquivos que podem CITAR a AbacatePay (o dono + a UI do Pix do plano). */
  citamAbacate: string[];
}

const ALVOS: Alvo[] = [
  {
    rotulo: 'APP (src/)',
    dir: 'src',
    esperadas: [
      '/abacate/config',
      '/abacate/plano/pix',
      '/abacate/status',
      '/mp/pacotes',
      '/mp/pix',
      '/mp/status',
      '/stripe/checkout',
      '/stripe/faturas',
      '/stripe/metodo',
      '/stripe/portal',
    ],
    donoDoPix: 'src/services/pixCreditos.ts',
    donosDoCartao: ['src/screens/PlanosScreen.tsx', 'src/services/assinatura.ts'],
    donoDoPixPlano: 'src/services/pixPlano.ts',
    // Além do código do Pix do plano, os TEXTOS ao usuário que precisam nomear o
    // provedor: Termos §4 e Privacidade §5 (LGPD: operador que recebe dado de
    // pagamento) e o artigo de Planos da Central de Ajuda. Texto, não rota.
    citamAbacate: [
      'src/components/PixPlanoModal.tsx',
      'src/content/ajuda/index.ts',
      'src/content/legal/privacidade.ts',
      'src/content/legal/termos.ts',
      'src/screens/PlanosScreen.tsx',
      'src/services/pixPlano.ts',
    ],
  },
  {
		rotulo: 'PAINEL (webapp/src/)',
		dir: 'webapp/src',
		esperadas: [
			'/abacate/config',
			'/abacate/plano/pix',
			'/abacate/status',
			'/stripe/checkout',
			'/stripe/faturas',
			'/stripe/metodo',
			'/stripe/portal',
			'/stripe/status',
		],
		donoDoPix: null,
		donosDoCartao: [
			'webapp/src/pages/olli/planos/checkout.ts',
			'webapp/src/pages/olli/planos/portal.tsx',
		],
		donoDoPixPlano: 'webapp/src/pages/olli/planos/pix.ts',
		citamAbacate: [
			'webapp/src/pages/olli/planos/DialogPix.tsx',
			'webapp/src/pages/olli/planos/index.tsx',
			'webapp/src/pages/olli/planos/pix.ts',
		],
  },
];

for (const alvo of ALVOS) {
  console.log(`\n── ${alvo.rotulo} ──`);
  const arquivos = alvo.dir === 'src'
    // `src/` do app: NÃO varrer o `src/` do painel nem o da landing (dirs distintos).
    ? arquivosDe('src')
    : arquivosDe(alvo.dir);
  checar(`${alvo.dir} tem arquivos para varrer`, arquivos.length > 0, true);

  const proibidos: Record<string, string[]> = {
    '/mp/plano': [],       // plano no MP: o Pix de plano está dormente e o cartão saiu
    'mercadopago.com': [], // o cliente NUNCA fala direto com o gateway
    'preapproval': [],     // assinatura recorrente por cartão no MP
  };
  const porArquivo = new Map<string, string[]>();

  for (const rel of arquivos) {
    const codigo = semComentarios(readFileSync(join(RAIZ, rel), 'utf8'));
    for (const termo of Object.keys(proibidos)) {
      if (codigo.toLowerCase().includes(termo.toLowerCase())) proibidos[termo].push(rel);
    }
    const rotas = rotasDeGateway(codigo);
    if (rotas.length) porArquivo.set(rel, rotas.sort());
  }

  for (const [termo, arqs] of Object.entries(proibidos)) {
    checar(`nenhum arquivo chama "${termo}"`, arqs, []);
  }

  // "abacate" é conferido também em COMENTÁRIO: só os arquivos do Pix do plano o
  // citam. Já houve um "recarga por Pix (AbacatePay)" em AppNavigator.tsx que
  // sobreviveu meses à troca de provedor e mandava o leitor ao lugar errado.
  const citamAbacate = arquivos.filter((rel) =>
    readFileSync(join(RAIZ, rel), 'utf8').toLowerCase().includes('abacate'),
  ).sort();
  checar('só os arquivos do Pix do plano citam a AbacatePay', citamAbacate, [...alvo.citamAbacate].sort());

  const todas = [...new Set([...porArquivo.values()].flat())].sort();
  checar('inventário FECHADO de rotas de gateway', todas, [...alvo.esperadas].sort());

  const comPix = [...porArquivo.entries()].filter(([, r]) => r.some((x) => x.startsWith('/mp/'))).map(([f]) => f);
  checar('Pix (/mp/*) só no arquivo dono', comPix, alvo.donoDoPix ? [alvo.donoDoPix] : []);

  const comPixPlano = [...porArquivo.entries()].filter(([, r]) => r.some((x) => x.startsWith('/abacate/'))).map(([f]) => f);
  checar('Pix do plano (/abacate/*) só no arquivo dono', comPixPlano, alvo.donoDoPixPlano ? [alvo.donoDoPixPlano] : []);

  const comStripe = [...porArquivo.entries()].filter(([, r]) => r.some((x) => x.startsWith('/stripe/'))).map(([f]) => f).sort();
  checar('cartão (/stripe/*) só nos arquivos donos', comStripe, [...alvo.donosDoCartao].sort());
}

console.log('\n── Contrato de tipo do painel ──');
{
  const src = readFileSync(join(RAIZ, 'webapp/src/pages/olli/planos/checkout.ts'), 'utf8');
  checar(
    'PlanoCheckout só aceita os 4 ids de assinatura da Stripe',
    src.includes('export type PlanoCheckout = "pro" | "pro_anual" | "empresa" | "empresa_anual";'),
    true,
  );
  checar('o checkout do painel aponta para /stripe/checkout', src.includes('${PAGAMENTOS_URL}/stripe/checkout'), true);
}

console.log('\n── Copy: a forma de pagamento anunciada é a verdadeira ──');
{
  // Conferido na Stripe live (conta acct_1Sei4m4zjAI9pGd7): as sessões criadas por
  // este caminho saem com payment_method_types ["card"], nos dois modos.
  const painel = readFileSync(join(RAIZ, 'webapp/src/pages/olli/planos/index.tsx'), 'utf8');
  checar('painel diz que o plano é pago no cartão', painel.includes('<strong>no cartão</strong>'), true);
  checar('painel nomeia a Stripe como o ambiente do pagamento', painel.includes('no ambiente seguro da Stripe'), true);

  const app = readFileSync(join(RAIZ, 'src/screens/PlanosScreen.tsx'), 'utf8');
  checar('app diz que o plano é pago no cartão, na Stripe', app.includes('Plano se paga no cartão, no ambiente seguro da Stripe.'), true);

  const creditos = readFileSync(join(RAIZ, 'src/screens/CreditosScreen.tsx'), 'utf8');
  checar('a tela de créditos é a que fala de Pix', creditos.includes('Recarregar por Pix'), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const home = ler('../web/src/pages/index.astro');
const vertical = ler('../web/src/pages/para/[oficio].astro');
const esteira = ler('../web/src/components/EsteiraTelas.astro');
const comparador = ler('../src/components/web/ComparadorLanding.tsx');
const llms = ler('../web/src/pages/llms.txt.ts');
const config = ler('../web/astro.config.mjs');
const robots = ler('../web/public/robots.txt');

// D-2876 (v10): o serviço genérico ("Outro prestador de serviço") é listado no hub /para/ e no menu de serviços, vindos de data/site.ts.
const dadosSite = ler('../web/src/data/site.ts');
const hubPara = ler('../web/src/pages/para/index.astro');
assert.match(dadosSite, /slug: "prestador-de-servico"/, 'o serviço genérico precisa ter página própria na lista de serviços');
assert.match(hubPara, /SERVICOS_FORA_DO_MENU/, 'o hub /para/ precisa listar o serviço genérico');
assert.match(vertical, /\[\.\.\.VERTICAIS, VERTICAL_GERAL\]/, 'a rota dinâmica precisa incluir qualquer serviço');
assert.match(vertical, /id === "geral" \? OFICIO_GERAL/, 'a página genérica precisa usar conteúdo seguro e não um undefined');
assert.match(llms, /OFICIO_GERAL/, 'agentes precisam descobrir a página para qualquer serviço');
assert.match(esteira, /capturas reais da sua operação/, 'as imagens devem ser apresentadas como produto real');
assert.match(esteira, /tela pública do cliente nasce no link de aprovação/, 'não confundir tela interna com tela do cliente');
assert.doesNotMatch(esteira, /É esta a tela que o seu cliente vai ver/, 'não prometer que toda captura é a tela do cliente');
assert.match(comparador, /Orçamento no campo, mesmo sem sinal/, 'comparador deve destacar o offline que existe');
assert.match(comparador, /Cliente aprova e assina pelo link/, 'comparador deve explicar a aprovação real');
assert.match(comparador, /IA ajuda a montar o orçamento por voz/, 'comparador deve descrever a IA sem prometer diagnóstico');
assert.doesNotMatch(comparador, /PMOC pronto pra fiscalização|IA que diagnostica o defeito|Equipe no mapa em tempo real/, 'comparador não pode prometer PMOC, diagnóstico ou mapa em tempo real');
assert.match(config, /\['\/admin\/', '\/404\/', '\/excluir-conta\/'(, '\/servicos\/')?\]/, 'rotas utilitárias não devem entrar no sitemap');
assert.match(robots, /Disallow: \/admin\//, 'robots deve evitar rastreio da área administrativa');
// D-2876 (v10): o app Android é PÚBLICO na Google Play (CTO, 20/11): a landing usa o link público da loja.
assert.match(dadosSite, /URL_PLAY = "https:\/\/play\.google\.com\/store\/apps\/details\?id=online\.olliorcamentos\.app"/, 'CTA Android usa o link público da Play');
assert.match(home, /target="_blank"[\s\S]*?rel="noopener"/, 'link externo da Play abre com isolamento da aba');
const faqSite = ler('../web/src/data/faq-site.ts');
assert.match(faqSite, /No iPhone e no computador, você usa pelo navegador/, 'landing deixa claro que no iPhone se usa o navegador');
assert.match(faqSite, /app da App Store chega em breve/, 'landing não anuncia app de iPhone como disponível');

console.log('OK — landing multi-vertical, rota genérica e descoberta por agentes validadas.');

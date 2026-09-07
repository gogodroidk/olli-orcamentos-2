import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const home = ler('../web/src/pages/index.astro');
const vertical = ler('../web/src/pages/para/[oficio].astro');
const esteira = ler('../web/src/components/EsteiraTelas.astro');
const llms = ler('../web/src/pages/llms.txt.ts');
const config = ler('../web/astro.config.mjs');
const robots = ler('../web/public/robots.txt');

assert.match(home, /para\/\$\{SLUG_POR_OFICIO\[OFICIO_GERAL\.id\]\}\//, 'home precisa levar o serviço genérico a uma página própria');
assert.match(vertical, /\[\.\.\.VERTICAIS, VERTICAL_GERAL\]/, 'a rota dinâmica precisa incluir qualquer serviço');
assert.match(vertical, /id === "geral" \? OFICIO_GERAL/, 'a página genérica precisa usar conteúdo seguro e não um undefined');
assert.match(llms, /OFICIO_GERAL/, 'agentes precisam descobrir a página para qualquer serviço');
assert.match(esteira, /capturas reais da sua operação/, 'as imagens devem ser apresentadas como produto real');
assert.match(esteira, /tela pública do cliente nasce no link de aprovação/, 'não confundir tela interna com tela do cliente');
assert.doesNotMatch(esteira, /É esta a tela que o seu cliente vai ver/, 'não prometer que toda captura é a tela do cliente');
assert.match(config, /\['\/admin\/', '\/404\/', '\/excluir-conta\/'\]/, 'rotas utilitárias não devem entrar no sitemap');
assert.match(robots, /Disallow: \/admin\//, 'robots deve evitar rastreio da área administrativa');

console.log('OK — landing multi-vertical, rota genérica e descoberta por agentes validadas.');

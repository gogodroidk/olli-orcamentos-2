/**
 * iPHONE SEM VENDA PELA APPLE (CPO Marina, 19/11/2026) — nenhum preço, nenhum botão de compra, nenhum "assine no site"
 * no build iOS. Guideline 3.1.1 (IAP) e 3.1.1(a) (sem botão, link ou chamada para compra por outro meio).
 *
 *     node scripts/teste-ios-sem-venda.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. Regra pura: no iOS o cadeado diz "Recurso do plano Pro"; não existe "Ver planos"; o plano não é oferecido.
 *  2. Peças do cadeado (cartão, chip, RecursoTrancado, GatePro, tela do cadeado): sem preço e sem botão no iPhone.
 *  3. VARREDURA de fonte: (a) quem importa precosPlanos é uma lista fechada (arquivo novo = revisão obrigatória);
 *     (b) todo arquivo com botão "Ver planos/Ver o plano" tem a trava do iPhone; (c) nenhum "Disponível no" escrito
 *     à mão fora da regra única.
 *  4. Telas Planos, Conta, Assinatura e a cota da IA: sem preço, sem botão, sem "assine" no iPhone.
 *  5. O texto que o iPhone enxerga (Ajuda) e a ficha da App Store (STORE_LISTING, bloco da Apple) não citam preço,
 *     assinatura, "assine", site de compra nem Pix de plano.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { iphoneSoInforma, podeOferecerPlanoPara, podeVerPlanosPara, rotuloDisponibilidade } from '../src/services/cadeadoRecurso.ts';
import { mapearErroIA } from '../src/services/erroIA.ts';
import { ARTIGOS_AJUDA, corpoVisivel } from '../src/content/ajuda/index.ts';
import { PRECO_EMPRESA, PRECO_PRO, reais } from '../src/services/precosPlanos.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const raiz = new URL('../', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codigo = (p: string) => semComentarios(ler(p));

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${nome}`;
    if (statSync(join(raiz, rel)).isDirectory()) arquivos(rel, acc);
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(rel);
  }
  return acc;
}
// O que roda no celular: fora o painel web, o desktop, as páginas legais e os arquivos .web.
const doApp = arquivos('src').filter((f) => !/\/web\/|\/desktop\/|\.web\.tsx?$|content\/legal\/|\/Landing/.test(f));

// ── 1. Regra pura ──────────────────────────────────────────────────────────────
ok('iOS: rótulo do cadeado é "Recurso do plano Pro"', rotuloDisponibilidade('ios', 'Pro') === 'Recurso do plano Pro');
ok('Android e web mantêm "Disponível no Pro"', rotuloDisponibilidade('android', 'Pro') === 'Disponível no Pro' && rotuloDisponibilidade('web', 'Pro') === 'Disponível no Pro');
ok('só o iOS "só informa"', iphoneSoInforma('ios') && !iphoneSoInforma('android') && !iphoneSoInforma('web'));
ok('iOS não tem botão "Ver planos"; Android e web têm', !podeVerPlanosPara('ios') && podeVerPlanosPara('android') && podeVerPlanosPara('web'));
ok('iOS nunca oferece plano, mesmo com venda confirmada', !podeOferecerPlanoPara('ios', true) && !podeOferecerPlanoPara('ios', false));

// ── 2. Peças do cadeado ────────────────────────────────────────────────────────
const cartao = codigo('src/components/RecursoPlano.tsx');
ok('cartão: selo vem da regra única (iOS = "Recurso do plano")', /rotuloDisponibilidade\(Platform\.OS, nome\)\.toUpperCase\(\)/.test(cartao));
ok('cartão: o preço só renderiza fora do iPhone', /iphoneSoInforma\(Platform\.OS\) \? null : \(\s*<Text style=\{styles\.preco\}>/.test(cartao));
ok('cartão: o botão "Ver o plano" só com podeOferecerPlano() (iOS nunca)', /podeOferecerPlano\(\) \? \(\s*<OlliPressable onPress=\{irParaPlanos\}/.test(cartao));
ok('chip: texto vem da regra única', /rotuloDisponibilidade\(Platform\.OS, NOME_PLANO\[planoMinimo\]\)/.test(cartao));
const trancado = codigo('src/components/dinheiro/RecursoTrancado.tsx');
ok('RecursoTrancado: selo e acessibilidade pela regra única, sem botão de compra', /rotuloDisponibilidade\(Platform\.OS/.test(trancado) && !/Ver (o )?plano/.test(trancado) && !/PRECO_/.test(trancado));
const gatePro = codigo('src/components/GatePro.tsx');
ok('GatePro: rótulo pela regra única e botão "Ver planos" só fora do iPhone', /rotuloDisponibilidade\(Platform\.OS, NOME_PLANO\.pro\)/.test(gatePro) && /podeVerPlanosPara\(Platform\.OS\) \? \(\s*<OlliPressable onPress=\{irParaPlanos\}/.test(gatePro));
const telaCadeado = codigo('src/screens/RecursoTrancadoScreen.tsx');
ok('tela do cadeado: título pela regra única', /rotuloDisponibilidade\(Platform\.OS, NOME_PLANO\[planoMinimoDoRecurso\(recurso\)\]\)/.test(telaCadeado));
const feedback = codigo('src/services/feedbackCadeado.ts');
ok('popup "o que faltou para assinar" não abre no iPhone', /if \(iphoneSoInforma\(Platform\.OS\)\) return;/.test(feedback));

// ── 3. Varredura de fonte ──────────────────────────────────────────────────────
// (a) quem importa a tabela de preços é uma lista fechada
const IMPORTA_PRECO_PERMITIDO = new Set([
  'src/components/RecursoPlano.tsx', // preço só fora do iPhone (item 2)
  'src/screens/ContaScreen.tsx', // pílula de preço: COMPRA_NO_APP
  'src/screens/AssinaturaScreen.tsx', // fatura/renovação de quem JÁ assina; upsell guardado por COMPRA_NO_APP
  'src/screens/PlanosScreen.tsx', // exibido=null no iPhone
  'src/hooks/useLembreteAssinatura.ts', // texto da loja sai sem preço (lembreteAssinaturaLoja)
  'src/services/byoIa.ts', // regra pura, sem tela
  'src/services/planosBase.ts', // tabela única
  'src/services/playBillingRegras.ts', // só Android
  'src/services/precosPlanos.ts', // a fonte
  'src/content/ajuda/index.ts', // blocos com preço são soNaWeb
]);
const importadores = doApp.filter((f) => /precosPlanos/.test(ler(f)));
const intrusos = importadores.filter((f) => !IMPORTA_PRECO_PERMITIDO.has(f));
ok(`só a lista fechada importa precosPlanos (intrusos: ${intrusos.join(', ') || 'nenhum'})`, intrusos.length === 0);
// (b) botão "Ver planos" só com a trava do iPhone
const BOTAO_PLANOS = /label=(?:"|\{?['"`])Ver (?:os )?planos|label=\{[^}]*Ver planos e assinar|Ver o plano \$\{|Ver o plano \{/;
const TRAVA = /podeVerPlanosPara|podeOferecerPlano|COMPRA_NO_APP|iphoneSoInforma|Platform\.OS === 'ios'/;
const semTrava = doApp.filter((f) => BOTAO_PLANOS.test(codigo(f)) && !TRAVA.test(codigo(f)));
ok(`todo arquivo com botão "Ver planos" tem a trava do iPhone (sem trava: ${semTrava.join(', ') || 'nenhum'})`, semTrava.length === 0);
// (c) "Disponível no" só nasce na regra única
const aMao = doApp.filter((f) => f !== 'src/services/cadeadoRecurso.ts' && /Dispon[ií]vel no|DISPON[ÍI]VEL NO/.test(codigo(f)));
ok(`nenhum "Disponível no" escrito à mão fora da regra única (achados: ${aMao.join(', ') || 'nenhum'})`, aMao.length === 0);

// ── 4. Telas ───────────────────────────────────────────────────────────────────
const planos = codigo('src/screens/PlanosScreen.tsx');
ok('Planos: nenhum preço no iPhone (exibido nulo)', /const semPrecoNoAndroid = !COMPRA_NO_APP \|\|/.test(planos));
ok('Planos: comparativo sem preço no iPhone', /precosDaFonte=\{COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA\}/.test(planos));
ok('Planos: o card do iPhone diz "Recurso do plano", não "assinatura em breve"', /rotuloDisponibilidade\(Platform\.OS, plano\.nome\)/.test(planos) && !/ainda não (está )?disponível no iPhone/.test(planos));
const conta = codigo('src/screens/ContaScreen.tsx');
ok('Conta: sem pílula de preço no iPhone', /BUILD_PLAY_SEM_COMPRA_EXTERNA \|\| !COMPRA_NO_APP \? null/.test(conta));
ok('Conta: sem botão "Ver os planos" no iPhone e sem promessa de assinatura', /podeVerPlanosPara\(Platform\.OS\) \? \(\s*<OlliPressable\s+style=\{styles\.proBtn\}/.test(conta) && !/ainda não está disponível no iPhone/.test(conta));
const assinatura = codigo('src/screens/AssinaturaScreen.tsx');
ok('Assinatura: o upsell do Grátis não tem botão no iPhone', /!podeVerPlanosPara\(Platform\.OS\) \? null : \(\s*<OlliButton/.test(assinatura));
for (const f of ['src/screens/OlliVozScreen.tsx', 'src/screens/OlliChatScreen.tsx']) {
  ok(`${f}: "Ver planos" some no iPhone`, /podeVerPlanosPara\(Platform\.OS\)/.test(codigo(f)));
}
const home = codigo('src/screens/HomeScreen.tsx');
ok('Home: o teaser do radar não leva a plano e diz "Recurso do plano" no iPhone', /if \(podeVerPlanosPara\(Platform\.OS\)\) irParaPlanos\('radar_card'\)/.test(home) && /rotuloDisponibilidade\(Platform\.OS, NOME_PLANO\.pro\)/.test(home));
const cota = mapearErroIA('cota', 'ios');
ok('cota da IA no iPhone: sem "assine" e sem "Ver planos"', !/assine|plano|pre[cç]o|R\$/i.test(cota.mensagem + cota.acao));
ok('cota da IA fora do iPhone segue igual (Android/web)', /assine o Pro/.test(mapearErroIA('cota').mensagem) && mapearErroIA('cota', 'android').acao === 'Ver planos');
ok('DiagnosticoIA: a ação da cota não navega para Planos no iPhone', /avisoCota\s*\?\s*\(Platform\.OS === 'ios' \? undefined/.test(codigo('src/screens/DiagnosticoIAScreen.tsx')));

// ── 5. O texto que o iPhone enxerga ────────────────────────────────────────────
const PROIBIDO_PRECO = [reais(PRECO_PRO.mensalCentavos), reais(PRECO_EMPRESA.mensalCentavos), reais(PRECO_PRO.anualCentavos), reais(PRECO_EMPRESA.anualCentavos)];
const RE_VENDA = /\bassine\b|assinar (?:o|um|plano)|pelo site|no site|na web para assinar|painel web|Stripe|Mercado Pago|Pix (?:de|do|para) (?:plano|assinatura)|Pix Autom[aá]tico|Google Play|planos e pre[cç]os|Ver (?:os )?planos|R\$\s?\d/i;
const ajudaIos = ARTIGOS_AJUDA.flatMap((a) => [a.titulo, ...corpoVisivel(a, 'ios').flatMap((b) => (Array.isArray(b.conteudo) ? b.conteudo : [b.conteudo]))]).map(String);
const achouAjuda = ajudaIos.filter((t) => RE_VENDA.test(t) || PROIBIDO_PRECO.some((p) => t.includes(p)));
ok(`Ajuda no iPhone: nenhum preço, "assine", site de compra ou Pix de plano (${achouAjuda.length} achados)`, achouAjuda.length === 0);
const listing = ler('docs/STORE_LISTING.md');
const bloco = /<!-- IOS-INICIO -->([\s\S]*?)<!-- IOS-FIM -->/.exec(listing)?.[1] ?? '';
ok('ficha da Apple existe no STORE_LISTING (bloco IOS-INICIO/FIM)', bloco.length > 400);
ok('ficha da Apple: sem preço, "assine", site de compra, Pix de plano, nem Google Play', !RE_VENDA.test(bloco) && !/\bplanos?\b.*\bpre[cç]os?\b|\bpre[cç]os?\b/i.test(bloco) && !/\bcompr(a|ar|e)\b/i.test(bloco));
ok('ficha da Apple: diz que o app é gratuito e que o Pro é reconhecido', /O app é gratuito/.test(bloco) && /quem já tem o Pro/.test(bloco));

console.log(falhas === 0 ? '\nTudo certo: nenhum preço nem botão de compra no iPhone.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

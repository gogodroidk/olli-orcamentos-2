/**
 * Grátis ILIMITADO com selo + paywall reposicionado (decisão do dono, 01/10/2026).
 *
 *     node scripts/teste-gratis-selo-paywall.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Tranca o contrato comercial novo nas quatro pontas que já mentiram neste projeto:
 *  1. TABELA ÚNICA (`planosBase.ts`): o Grátis diz "ilimitados" e diz o selo; o Pro
 *     vende sem selo + follow-up + link com pagamento + inteligência; o Empresa vende
 *     equipe, mapa e PMOC/contratos — e cada bullet bate com `entitlements.ts`.
 *  2. TRÊS ESTADOS (`estadoAcessoRecurso` / `acessoDeServico`): "não sei" nunca vira
 *     "liberado" (de graça) nem "bloqueado" (rebaixar quem paga); membro de equipe
 *     vale pelo plano da empresa nos recursos de campo.
 *  3. O SELO "Feito com OLLI": link para a landing com UTM por origem; no PDF do
 *     orçamento, no recibo e no link público, sempre atrás do `removerMarca`.
 *  4. A FIAÇÃO: as peças pagas (clima, hora de sair, ETA, PMOC/contratos) passam pelo
 *     gate; nenhuma tela/landing/e-mail sobrou com a cota de 5.
 */
import { readFileSync } from 'node:fs';
import {
  RECURSOS_DO_TENANT,
  RECURSOS_EM_BREVE,
  RECURSOS_EM_ORDEM,
  RECURSOS_POR_PLANO,
  acessoDeServico,
  estadoAcessoRecurso,
  planoConfirmado,
  planoMinimoDoRecurso,
  planoParaRecurso,
  type Recurso,
} from '../src/services/entitlements.ts';
import {
  FRASE_GRATIS,
  NOTA_SELO_GRATIS,
  PLANOS_BASE,
  RECURSOS_GRATIS,
  ROTULO_RECURSO,
  beneficioRecurso,
  frasePro,
  planoBase,
} from '../src/services/planosBase.ts';
import {
  TEXTO_SELO_OLLI,
  URL_LANDING_OLLI,
  footerSeloOlliHtml,
  seloOlliHtml,
  urlSeloOlli,
} from '../src/utils/marcaOlli.ts';
import { criarPlanoCache, interpretarPlanoCache } from '../src/services/planoCachePolicy.ts';

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
const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n1) tabela única de planos (planosBase.ts)');
{
  const gratis = planoBase('gratis');
  checar('Grátis começa por "Orçamentos ilimitados"', gratis.beneficios[0].startsWith('Orçamentos ilimitados'), true);
  checar('Grátis diz o selo às claras', gratis.beneficios.includes(NOTA_SELO_GRATIS), true);
  checar('a nota cita o texto do selo da fonte', NOTA_SELO_GRATIS.includes(TEXTO_SELO_OLLI), true);
  checar('nenhum plano fala em "até N orçamentos"', PLANOS_BASE.some((p) => p.beneficios.some((b) => /até \d+ orçamentos|\d+ orçamentos (enviados|por mês)/i.test(b))), false);
  checar('FRASE_GRATIS = ilimitados + selo', /ilimitados/.test(FRASE_GRATIS) && FRASE_GRATIS.includes(TEXTO_SELO_OLLI), true);
  checar('alma do Grátis não tem item pago', RECURSOS_GRATIS.some((t) => /selo|follow-up|PMOC|equipe/i.test(t)), false);

  const pro = planoBase('pro');
  checar('Pro: 1º item de venda é tirar o selo', pro.bullets[1].recursos, ['remove_olli_brand']);
  checar('Pro: follow-up automático', pro.bullets.some((b) => b.recursos.includes('followup_automatico')), true);
  checar('Pro: link com pagamento', pro.bullets.some((b) => b.recursos.includes('link_pagamento')), true);
  checar('Pro: inteligência (clima + hora de sair)', pro.bullets.some((b) => b.recursos.includes('clima_visita') && b.recursos.includes('hora_de_sair')), true);
  checar('Pro: termômetro já entregue (frente I2), sem "em breve"', pro.bullets.find((b) => b.recursos.includes('termometro_orcamento'))?.emBreve, false);
  checar('Pro está em destaque', pro.destaque, true);

  const empresa = planoBase('empresa');
  for (const r of ['equipe', 'mapa_equipe', 'pmoc_contratos'] as const) {
    checar(`Empresa vende ${r}`, empresa.bullets.some((b) => b.recursos.includes(r)), true);
  }
  checar('PMOC/contratos é só do Empresa', [RECURSOS_POR_PLANO.pro.has('pmoc_contratos'), RECURSOS_POR_PLANO.empresa.has('pmoc_contratos')], [false, true]);
  checar('Grátis não libera nada pago', RECURSOS_POR_PLANO.gratis.size, 0);
  checar('todo recurso tem rótulo', RECURSOS_EM_ORDEM.every((r) => ROTULO_RECURSO[r]?.titulo.length > 0), true);
  checar('RECURSOS_EM_ORDEM cobre tudo que o Empresa libera', [...RECURSOS_POR_PLANO.empresa].every((r) => RECURSOS_EM_ORDEM.includes(r)), true);
  checar('benefício de "em breve" diz em breve', [...RECURSOS_EM_BREVE].every((r) => beneficioRecurso(r).endsWith('(em breve).')), true);
  checar('frasePro = os 3 primeiros do Pro, prontos', frasePro(), 'sem o selo "Feito com OLLI", follow-up automático e link com pagamento na hora');
  checar('frasePro não cita Pix (aparece nas lojas)', /pix/i.test(frasePro()), false);
  checar('plano mínimo: selo → Pro; PMOC → Empresa', [planoMinimoDoRecurso('remove_olli_brand'), planoMinimoDoRecurso('pmoc_contratos')], ['pro', 'empresa']);
}

console.log('\n2) três estados (entitlements.ts)');
{
  const L = (plano: 'gratis' | 'pro' | 'empresa', carregando: boolean, confirmado: boolean, planoTenant?: 'gratis' | 'pro' | 'empresa') =>
    ({ plano, carregando, confirmado, planoTenant });
  checar('Pro confirmado → liberado', estadoAcessoRecurso(L('pro', false, true), 'followup_automatico'), 'liberado');
  checar('Grátis confirmado → bloqueado ("Disponível no Pro")', estadoAcessoRecurso(L('gratis', false, true), 'followup_automatico'), 'bloqueado');
  checar('Grátis sem confirmação → indeterminado (nunca bloqueado)', estadoAcessoRecurso(L('gratis', false, false), 'followup_automatico'), 'indeterminado');
  checar('primeira leitura → carregando', estadoAcessoRecurso(L('gratis', true, false), 'followup_automatico'), 'carregando');
  checar('cache Pro no cold start → liberado (sem piscar o muro)', estadoAcessoRecurso(L('pro', true, false), 'hora_de_sair'), 'liberado');
  checar('Pro e termômetro → liberado (frente I2)', estadoAcessoRecurso(L('pro', false, true), 'termometro_orcamento'), 'liberado');
  checar('Pro e mapa da equipe → bloqueado (é do Empresa)', estadoAcessoRecurso(L('pro', false, true), 'mapa_equipe'), 'bloqueado');
  checar('Empresa e mapa da equipe → em breve', estadoAcessoRecurso(L('empresa', false, true), 'mapa_equipe'), 'em_breve');
  checar('Pro e PMOC → bloqueado (é do Empresa)', estadoAcessoRecurso(L('pro', false, true), 'pmoc_contratos'), 'bloqueado');
  checar('membro (conta grátis) de empresa Empresa → PMOC liberado', estadoAcessoRecurso(L('gratis', false, true, 'empresa'), 'pmoc_contratos'), 'liberado');
  checar('membro de empresa Pro → hora de sair liberada', estadoAcessoRecurso(L('gratis', false, true, 'pro'), 'hora_de_sair'), 'liberado');
  checar('tenant NÃO vale para o selo do PDF (segue a conta)', estadoAcessoRecurso(L('gratis', false, true, 'empresa'), 'remove_olli_brand'), 'bloqueado');
  checar('tenant menor que a conta não rebaixa', planoParaRecurso('empresa', 'gratis', 'pmoc_contratos'), 'empresa');
  checar('recursos de campo valem pelo tenant', [...RECURSOS_DO_TENANT].sort(), ['clima_visita', 'followup_automatico', 'hora_de_sair', 'pmoc_contratos', 'termometro_orcamento']);

  checar('serviço: Pro → liberado', acessoDeServico('pro', 'servidor', 'followup_automatico'), 'liberado');
  checar('serviço: Grátis do servidor → bloqueado', acessoDeServico('gratis', 'servidor', 'followup_automatico'), 'bloqueado');
  checar('serviço: Grátis do cache da mesma conta → bloqueado', acessoDeServico('gratis', 'cache_mesmo_usuario', 'hora_de_sair'), 'bloqueado');
  checar('serviço: leitura indisponível → indeterminado (não mexe)', acessoDeServico('gratis', 'indisponivel', 'hora_de_sair'), 'indeterminado');
  checar('serviço: membro com tenant Empresa → liberado', acessoDeServico('gratis', 'servidor', 'followup_automatico', 'empresa'), 'liberado');
  checar('deslogado é Grátis de verdade', planoConfirmado('sessao_ausente'), true);
}

console.log('\n3) cache do plano guarda o plano do tenant (offline do técnico)');
{
  const dono = '11111111-1111-4111-8111-111111111111';
  const cache = criarPlanoCache(dono, { plano: 'gratis', origem: 'gratis', planoTenant: 'empresa' }, 1000);
  const lido = interpretarPlanoCache(JSON.stringify(cache));
  checar('planoTenant sobrevive ao cache', lido?.planoTenant, 'empresa');
  checar('cache antigo sem o campo continua válido', interpretarPlanoCache(JSON.stringify({ ...cache, planoTenant: undefined }))?.plano, 'gratis');
  checar('planoTenant inválido invalida o cache', interpretarPlanoCache(JSON.stringify({ ...cache, planoTenant: 'trial' })), null);
}

console.log('\n4) selo "Feito com OLLI" (marcaOlli.ts)');
{
  checar('texto do selo', TEXTO_SELO_OLLI, 'Feito com OLLI');
  checar('URL do PDF com UTM', urlSeloOlli('pdf_orcamento'), `${URL_LANDING_OLLI}/?utm_source=pdf_orcamento&utm_medium=selo&utm_campaign=feito_com_olli`);
  checar('recibo tem a própria origem', footerSeloOlliHtml('recibo').includes('utm_source=recibo&'), true);
  checar('documento (contrato/termos/certificados) é o padrão', footerSeloOlliHtml().includes('utm_source=documento&'), true);
  const html = seloOlliHtml('link_orcamento');
  checar('selo é link que abre fora', /<a href="https:\/\/olliorcamentos\.online\/\?utm_source=link_orcamento[^"]*" target="_blank" rel="noopener"/.test(html), true);
  checar('selo é discreto (cinza claro, 10px)', /color:#9AA3B2/.test(html) && /font-size:10px/.test(html), true);
  checar('selo diz "Feito com OLLI"', /Feito com <span[^>]*>OLLI<\/span>/.test(html), true);

  const pdf = semComentarios(ler('../src/utils/pdfGenerator.ts'));
  checar('PDF do orçamento: selo atrás do removerMarca', /removerMarca \? '' : `<div class="brand-olli">\$\{seloOlliHtml\('pdf_orcamento'\)\}<\/div>`/.test(pdf), true);
  const recibo = semComentarios(ler('../src/utils/reciboPdf.ts'));
  checar('recibo: selo atrás do removerMarca', recibo.includes("opts?.removerMarca === true ? '' : `<div class=\"footer-seal\">${footerSeloOlliHtml('recibo')}</div>`"), true);
  const link = semComentarios(ler('../worker/src/link.js'));
  checar('link público usa o selo da fonte', link.includes("seloOlliHtml('link_orcamento')"), true);
  checar('link público decide pelo plano do dono', link.includes('rpc/plano_comercial_para_usuario') && link.includes('regrasDaPagina'), true);
}

console.log('\n5) fiação do paywall');
{
  const chip = (arq: string, recurso: Recurso) =>
    new RegExp(`<RecursoPlanoChip recurso="${recurso}">`).test(semComentarios(ler(arq)));
  checar('EtaChip passa pelo gate de hora de sair', chip('../src/components/EtaChip.tsx', 'hora_de_sair'), true);
  checar('AvisoSaidaCard passa pelo gate de hora de sair', chip('../src/components/AvisoSaidaCard.tsx', 'hora_de_sair'), true);
  checar('ClimaVisitaChip passa pelo gate de clima', chip('../src/components/clima/ClimaVisitaChip.tsx', 'clima_visita'), true);
  for (const tela of [
    '../src/screens/ContratosScreen.tsx',
    '../src/screens/ContratoScreen.tsx',
    '../src/screens/PmocPlanosScreen.tsx',
    '../src/screens/PmocPlanoScreen.tsx',
    '../src/screens/desktop/PmocDesktopScreen.tsx',
  ]) {
    checar(`${tela.split('/').pop()} é do Empresa`, /<TelaRecursoPlano recurso="pmoc_contratos"/.test(semComentarios(ler(tela))), true);
  }
  checar('painel: contratos é do Empresa', /useRecursoPlanoPainel\("pmoc_contratos"\)/.test(ler('../webapp/src/pages/olli/contratos/index.tsx')), true);
  const ritual = semComentarios(ler('../src/services/ritualDiario.ts'));
  checar('hora de sair: sem o recurso, nem calcula (chamada paga)', /acessoRecursoAgora\('hora_de_sair'\)\)\s*!==\s*'liberado'\) return;/.test(ritual), true);
  const eta = semComentarios(ler('../src/services/eta.ts'));
  checar('ETA: sem o recurso, nem chama a Routes API', /acessoRecursoAgora\('hora_de_sair'\)\)\s*!==\s*'liberado'\) return \{ estado: 'indisponivel' \}/.test(eta), true);

  const comp = semComentarios(ler('../src/components/RecursoPlano.tsx'));
  checar('gate trata os 3 estados', ["'carregando'", "'indeterminado'", "'em_breve'", "'liberado'"].every((e) => comp.includes(e)), true);
  checar('lojas: só vende na web ou pela Play', /Platform\.OS === 'web'[\s\S]*ESTADO_PLAY_BILLING === 'ligado'/.test(comp), true);
  const gate = semComentarios(ler('../src/components/GatePro.tsx'));
  checar('GatePro: leitura que falhou não vira muro', /estado === 'indeterminado'[\s\S]*CartaoRecursoPlano/.test(gate), true);
  checar('GatePro: selo "Disponível no Pro"', gate.includes('DISPONÍVEL NO ${NOME_PLANO.pro.toUpperCase()}'), true);
}

console.log('\n6) nenhuma ponta sobrou com a cota de 5');
{
  const arquivos = [
    '../src/screens/PlanosScreen.tsx',
    '../src/components/web/LandingSecoes.tsx',
    '../src/content/ajuda/index.ts',
    '../src/services/lembreteAssinatura.ts',
    '../src/services/limitesComerciais.ts',
    '../webapp/src/pages/olli/planos/index.tsx',
    '../webapp/src/pages/olli/planos/planos-base.ts',
    '../webapp/src/pages/olli/orcamentos/index.tsx',
    '../web/src/components/PlanosPrecos.astro',
    '../web/src/data/recursos.ts',
    '../web/src/pages/index.astro',
    '../web/src/pages/planos.astro',
    '../web/src/pages/llms.txt.ts',
    '../web/src/pages/para/[oficio].astro',
    '../worker/src/emailLembretesTemplate.js',
    '../worker/src/emailLembretesPolicy.js',
  ];
  const COTA = /ORCAMENTOS_ENVIADOS_GRATIS_MES|até \$\{[^}]+\} orçamentos|orçamentos enviados ou PDFs por mês|Falta 1 orçamento grátis|Faltam \$\{|usou os \$\{|cota_esgotada'\s*\?/;
  for (const a of arquivos) {
    checar(`${a.replace('../', '')} sem cota de orçamentos`, COTA.test(semComentarios(ler(a))), false);
  }
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

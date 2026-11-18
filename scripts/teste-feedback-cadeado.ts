/**
 * Popup de feedback do cadeado (spec do CPO, seção A) — D-2267.
 *
 *     node scripts/teste-feedback-cadeado.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. Regra de frequência/consentimento (pura): 1 por semana, "agora não" 14 dias, "não perguntar mais" nunca volta,
 *     nunca antes do 1º envio, nunca criando/enviando/pagando, nunca com dado não lido.
 *  2. Copy da fonte: nome do plano de NOME_PLANO; sem recompensa por avaliação em loja; sem promessa de crédito sem concessão.
 *  3. Ligação no app: o popup só nasce de "fechou o cadeado sem assinar", 1 host no App, nenhuma tela de criar/enviar/pagar o importa.
 *  4. 3 estados (enviando | erro com tentar de novo | enviado), alvos >= 44 px, envio pelo canal existente (sem migration).
 */
import { readFileSync } from 'node:fs';
import {
  DIAS_AGORA_NAO, DIAS_ENTRE_POPUPS, ROTAS_SENSIVEIS, aposAgoraNao, aposMostrar, aposNaoPerguntarMais, aposResposta, decidirPopup,
  lerEstadoFeedbackCadeado, type ContextoPopup, type EstadoFeedbackCadeado,
} from '../src/services/feedbackCadeadoRegra.ts';
import { COPY_FEEDBACK_CADEADO, OPCOES_MOTIVO, TEXTO_LIVRE_MAX } from '../src/services/feedbackCadeadoCopy.ts';
import { NOME_PLANO } from '../src/services/planosBase.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DIA = 24 * 60 * 60 * 1000;
const t0 = Date.parse('2026-11-20T12:00:00Z');
const base: ContextoPopup = { agora: t0, jaEnviouOrcamento: true, rotaAtual: 'Orcamentos', planoConfirmadoGratis: true };
const vazio: EstadoFeedbackCadeado = {};

// 1. Regra
ok('caso feliz: já enviou, plano Grátis confirmado, tela comum, nunca perguntado → mostra', decidirPopup(vazio, base).mostrar === true);
ok('antes do 1º envio nunca', JSON.stringify(decidirPopup(vazio, { ...base, jaEnviouOrcamento: false })) === '{"mostrar":false,"motivo":"primeiro_envio_pendente"}');
ok('dado do envio não lido (null) nunca mostra no escuro', JSON.stringify(decidirPopup(vazio, { ...base, jaEnviouOrcamento: null })) === '{"mostrar":false,"motivo":"envio_desconhecido"}');
ok('plano não confirmado como Grátis nunca mostra (não pergunta "o que faltou" a quem talvez já paga)', decidirPopup(vazio, { ...base, planoConfirmadoGratis: false }).mostrar === false);
for (const rota of ['NovoOrcamento', 'EditarOrcamento', 'EmitirRecibo', 'Planos', 'Assinatura', 'Creditos']) {
  ok(`nunca durante criar/enviar/pagar: ${rota}`, decidirPopup(vazio, { ...base, rotaAtual: rota }).mostrar === false);
}
ok('as rotas sensíveis existem no navegador (nome certo, senão a trava é decoração)',
  ROTAS_SENSIVEIS.every((r) => new RegExp(`${r}[:?]`).test(ler('src/navigation/AppNavigator.tsx'))));
const mostrado = aposMostrar(vazio, t0);
ok('no máximo 1 por semana: 6 dias não, 8 dias sim', !decidirPopup(mostrado, { ...base, agora: t0 + 6 * DIA }).mostrar && decidirPopup(mostrado, { ...base, agora: t0 + (DIAS_ENTRE_POPUPS + 1) * DIA }).mostrar);
const agoraNao = aposAgoraNao(mostrado, t0);
ok('"agora não": não volta por 14 dias (13 não, 15 sim)', !decidirPopup(agoraNao, { ...base, agora: t0 + 13 * DIA }).mostrar && decidirPopup(agoraNao, { ...base, agora: t0 + (DIAS_AGORA_NAO + 1) * DIA }).mostrar);
const nunca = aposNaoPerguntarMais(agoraNao);
ok('"não perguntar mais": nunca volta, nem em 1 ano', !decidirPopup(nunca, { ...base, agora: t0 + 365 * DIA }).mostrar);
ok('resposta enviada só carimba (a semana segue valendo)', !decidirPopup(aposResposta(mostrado, t0), { ...base, agora: t0 + 2 * DIA }).mostrar);
ok('estado gravado ilegível vira vazio (nunca lança)', JSON.stringify(lerEstadoFeedbackCadeado('{{lixo')) === '{}' && JSON.stringify(lerEstadoFeedbackCadeado(null)) === '{}' && lerEstadoFeedbackCadeado('{"naoPerguntarMais":true}').naoPerguntarMais === true);

// 2. Copy
const c = COPY_FEEDBACK_CADEADO;
const tudo = JSON.stringify([c, OPCOES_MOTIVO]);
ok('pergunta usa o nome do plano da fonte', c.pergunta === `O que faltou para você assinar o ${NOME_PLANO.pro}?`);
ok('4 opções + campo livre curto', OPCOES_MOTIVO.length === 4 && TEXTO_LIVRE_MAX <= 280);
ok('sem recompensa por avaliação em loja nem promessa de crédito que o servidor não concede', !/avali|estrela|play store|app store|nota na loja|cr[eé]dito|gr[aá]tis por/i.test(tudo));
ok('aviso de 1 linha do porquê perguntamos e de quem vê', /melhorar/.test(c.aviso) && /s[oó] a nossa equipe vê/.test(c.aviso) && c.aviso.split('\n').length === 1);
ok('erro nunca vira "obrigado": mensagens distintas, dizem que falhou e que a resposta continua', c.erro !== c.enviado && /N[ãa]o consegui enviar agora, tente de novo/.test(c.erro) && /continua aqui/.test(c.erro));

// 3. Ligação no app
const host = semComentarios(ler('src/components/FeedbackCadeadoHost.tsx'));
const modal = semComentarios(ler('src/components/FeedbackCadeadoModal.tsx'));
const servico = semComentarios(ler('src/services/feedbackCadeado.ts'));
const app = ler('App.tsx');
ok('1 host montado no App', (app.match(/<FeedbackCadeadoHost \/>/g) ?? []).length === 1);
ok('o host consulta a regra pura e a rota atual antes de mostrar', /decidirPopup\(/.test(host) && /navigationRef\.getCurrentRoute\(\)/.test(host) && /statusFoiEnviado/.test(host) && /p\.confirmado && p\.plano === 'gratis'/.test(host));
ok('grava "mostrado" ao mostrar (quem sempre dispensa não vê toda hora)', /aposMostrar\(estado, Date\.now\(\)\)/.test(host) && host.indexOf('aposMostrar') < host.indexOf('setVisivel(true)'));
ok('gatilho: tela do cadeado e TelaRecursoPlano chamam fechouCadeadoSemAssinar só se o recurso segue bloqueado',
  /fechouCadeadoSemAssinar\(recurso, estadoRef\.current\)/.test(semComentarios(ler('src/screens/RecursoTrancadoScreen.tsx')))
  && /fechouCadeadoSemAssinar\(recurso, estadoRef\.current\)/.test(semComentarios(ler('src/components/RecursoPlano.tsx')))
  && /if \(estado !== 'bloqueado'\) return;/.test(servico));
const proibidos = ['src/screens/NovoOrcamentoScreen.tsx', 'src/screens/VisualizarOrcamentoScreen.tsx', 'src/screens/EmitirReciboScreen.tsx', 'src/screens/PlanosScreen.tsx', 'src/screens/AssinaturaScreen.tsx', 'src/steps/Step1Cliente.tsx'];
ok('nenhuma tela de criar/enviar/pagar importa o popup', proibidos.every((f) => !/FeedbackCadeado/.test(ler(f))));
ok('só o App importa o host', !/FeedbackCadeadoHost/.test(ler('src/navigation/AppNavigator.tsx')));

// 4. 3 estados, alvos, canal
ok('3 estados no modal: enviando, erro com "tentar de novo" e enviado', /'enviando'/.test(modal) && /'erro'/.test(modal) && /'enviado'/.test(modal) && /c\.tentarDeNovo/.test(modal) && /accessibilityRole="alert"/.test(modal));
ok('erro mantém a resposta (texto e opção ficam no estado do modal, o host só troca o estado de envio)', /setEnvio\('erro'\)/.test(host) && !/setOpcao\(null\)|setTexto\(''\)/.test(modal));
ok('P0 erro nunca vira vazio: falha OU exceção no envio mostram o erro (try/catch), e o "enviado" só vem de r === \'ok\'', /try \{\s*r = await enviarMotivoCadeado/.test(host) && /\} catch \{\s*r = 'erro';/.test(host) && /if \(r === 'ok'\) \{[\s\S]*setEnvio\('enviado'\)[\s\S]*\} else \{\s*setEnvio\('erro'\)/.test(host));
ok('com erro na tela, o botão de voltar do Android não joga a resposta fora (só "Agora não" explícito fecha)', /estado === 'ocioso' \? onAgoraNao : \(\) => \{\}/.test(modal));
ok('contexto estável para o admin: origem, tela, recurso, opcao, plano; tipo no banco = feedback (CHECK) e origem = motivo_cadeado', /\{ tela: 'cadeado', recurso: p\.recurso, opcao: p\.opcao, plano: p\.plano \}/.test(servico) && /motivo_cadeado: 'feedback'/.test(ler('src/services/feedback.ts')) && /origem: tipo/.test(ler('src/services/feedback.ts')));
ok('alvos >= 44 px: opção 48, links 44, botões lg', /minHeight: 48/.test(modal) && /minHeight: 44/.test(modal) && /size="lg"/.test(modal));
ok('teclado e leitor de tela: rádio com estado, rótulo no campo, modal acessível', /accessibilityRole="radio"/.test(modal) && /accessibilityViewIsModal/.test(modal) && /accessibilityLabel=\{c\.campoLivre\}/.test(modal));
ok('sem animação decorativa (Modal animationType none)', /animationType="none"/.test(modal) && !/Animated|withTiming|withSpring/.test(modal));
ok('envio pelo canal existente (public.feedback), tipo motivo_cadeado mapeado para um valor aceito pelo CHECK, sem migration',
  /enviarFeedback\('motivo_cadeado'/.test(servico) && /motivo_cadeado: 'feedback'/.test(ler('src/services/feedback.ts')));
ok('chave de armazenamento é dado de conta (não vaza para o próximo usuário do aparelho)', /FEEDBACK_CADEADO_KEY,\n  FORMAS_PAGAMENTO_PADRAO_KEY/.test(ler('src/services/storageKeys.ts')));
ok('sem API de avaliação de loja nem link de loja nos arquivos do popup', !/StoreReview|requestReview|market:\/\/|itms-apps|play\.google\.com/i.test(host + modal + servico));

console.log(falhas ? `\nFALHOU: ${falhas}` : '\nPASSOU');
process.exit(falhas ? 1 : 0);

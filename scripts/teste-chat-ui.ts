/**
 * UI do chat (D1438-G08): markdown seguro, revelação da resposta e histórico
 * local. Não chama provedor e não lê segredo.
 *
 *   node scripts/teste-chat-ui.ts
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  apagarConversa,
  atualizarConversa,
  interpretarMarkdown,
  lerEstadoChat,
  planoDeRevelacao,
} from '../src/utils/chatUi.ts';

let n = 0;
function ok(nome: string, condicao: boolean) {
  assert.equal(condicao, true, nome);
  n += 1;
  console.log(`  ok   ${nome}`);
}

const blocos = interpretarMarkdown('## Preço\n\nUma **recarga** custa `R$ 250`.\n\n- testar\n- medir\n\n```txt\npasso 1\n```\n\nVeja [manual](https://exemplo.com/a) e [ruim](javascript:alert(1)).');
ok('título', blocos.some((b) => b.tipo === 'titulo' && b.nivel === 2));
ok('negrito e código inline', blocos.some((b) => b.tipo === 'paragrafo' && b.partes.some((p) => p.tipo === 'negrito' && p.texto === 'recarga') && b.partes.some((p) => p.tipo === 'codigo' && p.texto === 'R$ 250')));
ok('lista', blocos.some((b) => b.tipo === 'lista' && !b.ordenada && b.itens.length === 2));
ok('cerca de código', blocos.some((b) => b.tipo === 'codigo' && b.texto === 'passo 1'));
const links = blocos.flatMap((b) => ('partes' in b ? b.partes : []));
ok('link https entra', links.some((p) => p.tipo === 'link' && p.href === 'https://exemplo.com/a'));
ok('javascript não vira link', !links.some((p) => p.tipo === 'link' && p.href.startsWith('javascript:')));
ok('html não vira tag', interpretarMarkdown('<script>alert(1)</script>')[0]?.tipo === 'paragrafo');

const curto = planoDeRevelacao('oi', false);
ok('texto curto aparece inteiro', curto.cortes.length === 1 && curto.cortes[0] === 2);
const longo = 'a'.repeat(200);
const plano = planoDeRevelacao(longo, false);
ok('revelação termina no texto todo', plano.cortes.at(-1) === longo.length && plano.cortes.length > 1);
ok('revelação cresce', plano.cortes.every((corte, i) => i === 0 || corte > plano.cortes[i - 1]));
const parado = planoDeRevelacao(longo, true);
ok('reduzir movimento mostra tudo de uma vez', parado.cortes.length === 1 && parado.intervaloMs === 0);

const legado = JSON.stringify([
  { id: '1', role: 'user', texto: 'Quanto custa a limpeza?' },
  { id: '2', role: 'assistant', texto: 'Depende do aparelho.' },
  { id: 'x', role: 'system', texto: 'ignora' },
]);
const estado = lerEstadoChat(legado, 10);
ok('array antigo vira uma conversa', estado.conversas.length === 1 && estado.ativaId === 'legado');
ok('papel estranho sai fora', estado.conversas[0].mensagens.length === 2);
ok('título vem da pergunta', estado.conversas[0].titulo.startsWith('Quanto custa'));

const vazio = atualizarConversa(estado, { id: 'nova', titulo: '', atualizadoEm: 11, mensagens: [{ id: 'h', role: 'assistant', texto: 'Oi' }] });
ok('saudação sozinha não entra na lista', vazio.conversas.length === 1 && vazio.conversas[0].id === 'legado');
const comPergunta = atualizarConversa(estado, {
  id: 'nova',
  titulo: '',
  atualizadoEm: 12,
  mensagens: [{ id: 'u', role: 'user', texto: 'Erro E5' }, { id: 'a', role: 'assistant', texto: 'Confere o sensor.' }],
});
ok('conversa nova fica no topo', comPergunta.conversas[0].id === 'nova' && comPergunta.conversas[0].titulo === 'Erro E5');
const semEssa = apagarConversa(comPergunta, 'nova');
ok('apagar tira só a escolhida', semEssa.conversas.length === 1 && semEssa.conversas[0].id === 'legado' && semEssa.ativaId === '');
ok('json inválido não quebra', lerEstadoChat('{').conversas.length === 0);

const tela = readFileSync(new URL('../src/screens/OlliChatScreen.tsx', import.meta.url), 'utf8');
const web = readFileSync(new URL('../webapp/src/layouts/components/assistente-global.tsx', import.meta.url), 'utf8');
ok('app desenha markdown e histórico', tela.includes('MarkdownChat') && tela.includes('Histórico de conversas') && tela.includes('planoDeRevelacao'));
ok('app mantém o gate de crédito', tela.includes('if (res.semCreditos)') && tela.includes('Nada é cobrado sem seu toque'));
ok('painel desenha markdown, histórico e parar', web.includes('MarkdownMensagem') && web.includes('Histórico de conversas') && web.includes('Parar resposta'));
ok('painel repete o cancelamento com a mesma referência', web.includes('setReenvio') && web.includes('alvo.ref'));
ok('app espera o histórico carregar antes de enviar', tela.includes('digitando || !carregado'));
ok('app ignora resposta atrasada ao trocar de conversa', tela.includes('geracaoChatRef'));
ok('painel mantém a voz sob demanda', web.includes('SpeechRecognition') && web.includes('Falar com a OLLI') && web.includes('Parar voz ao vivo') && web.includes('continuous = false'));

console.log(`\nPASSOU: teste-chat-ui (${n} verificações)`);

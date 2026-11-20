// Fluxo de UMA mensagem de cliente: trava → contexto → Claude → trava de texto → nota privada (sombra) ou resposta (só se liberado).
import { CFG, hojeSP, pedidoDeParar, gravarParar, lerParar, tipoPorTexto, motivosDeBarrar, registrarGasto, custoReais, tetoAtingido, gastoDoDia, reservarGasto, estimarEntrada } from './nucleo.mjs';
import * as cw from './chatwoot.mjs';
import { pedirAoClaude, lerJson } from './claude.mjs';
import { montarSistema, montarMensagens, extrairFicha } from './contexto.mjs';

const E = CFG.etiquetas;
const brl = (v) => `R$ ${v.toFixed(4).replace('.', ',')}`;

/** Chave estável do contato para a lista de "parar". */
export const chaveContato = (ev) => String(ev.sender?.id ?? ev.conversation?.meta?.sender?.id ?? ev.sender?.phone_number ?? ev.conversation?.id);

export function podeResponderSozinho({ cfg = CFG, caixa, tipoModelo, tipoTexto, humano, motivos, resposta }) {
  const a = cfg.autonomo;
  return Boolean(a.ligado && a.caixas.includes(Number(caixa)) && a.tipos.includes(tipoModelo) && tipoModelo === tipoTexto
    && cfg.tipos_de_pergunta.includes(tipoModelo) && !humano && motivos.length === 0 && resposta);
}

/** @returns {Promise<{resultado:string, [k:string]:any}>} */
export async function processar(ev, { cfg = CFG } = {}) {
  const id = ev.conversation.id;
  const caixa = ev.conversation.inbox_id;
  const texto = String(ev.content || '');
  const chave = chaveContato(ev);

  if (lerParar().has(chave)) return { resultado: 'ignorado', motivo: 'contato pediu para parar antes', conversa: id };

  if (pedidoDeParar(texto)) {
    gravarParar(chave); // local e antes da rede: o pedido fica gravado mesmo se o Chatwoot falhar
    await cw.conversa(id); // confere a caixa na fonte antes de escrever (P3-1)
    await cw.etiquetar(id, [E.parar, E.humano]);
    await cw.nota(id, '[claude] O cliente pediu para parar. Não envio mais nada a este contato; marcado com "parar-contato". Um humano confirma.');
    return { resultado: 'parar', conversa: id };
  }

  const conv = await cw.conversa(id); // barra caixa proibida de novo, direto na fonte
  const etiquetas = conv.labels || [];
  if (etiquetas.includes(E.parar)) return { resultado: 'ignorado', motivo: 'conversa marcada parar-contato', conversa: id }; // P2-1
  if (etiquetas.includes(cfg.preco_combinado_etiqueta)) {
    await cw.etiquetar(id, [E.humano]);
    await cw.nota(id, '[claude] Esta conversa ouviu preço de antes de 20/11 ("preco-combinado"). Não sugiro preço; resposta fica com humano.');
    return { resultado: 'humano', motivo: 'preco-combinado', conversa: id };
  }
  if (tetoAtingido(cfg)) {
    await cw.etiquetar(id, [E.teto]);
    return { resultado: 'teto', conversa: id, gasto_hoje: gastoDoDia() };
  }

  const msgs = await cw.mensagens(id);
  if (!cw.clienteJaFalou(msgs)) return { resultado: 'ignorado', motivo: 'sem mensagem do cliente (contato frio)', conversa: id };
  const ultimaCliente = [...msgs].reverse().find((m) => m.message_type === 0 && !m.private);
  if (ev.id && ultimaCliente && ultimaCliente.id !== ev.id) return { resultado: 'ignorado', motivo: 'chegou mensagem mais nova; ela decide', conversa: id };

  const sistema = montarSistema({ ficha: extrairFicha(msgs) });
  const historico = montarMensagens(msgs, cfg.historico_mensagens);
  if (!historico.length) return { resultado: 'ignorado', motivo: 'sem histórico utilizável', conversa: id };

  // P1-1: reserva o custo máximo ANTES de pagar; sem reserva gravada, não chama.
  const res = reservarGasto({ conversa: id, caixa, entradaEstimada: estimarEntrada(sistema, historico) }, cfg);
  if (!res.ok) {
    await cw.etiquetar(id, [E.teto]);
    return { resultado: 'teto', motivo: res.motivo, erro: res.erro, conversa: id };
  }
  const dia = hojeSP();
  let r;
  try { r = await pedirAoClaude({ sistema, mensagens: historico, cfg }); }
  catch (e) {
    try { registrarGasto({ ts: new Date().toISOString(), dia, conversa: id, caixa, reais: -res.reserva, ajuste: true, motivo: 'erro-api' }); } catch { /* reserva fica: conta a mais, nunca a menos */ }
    await cw.etiquetar(id, [E.humano]);
    await cw.nota(id, `[claude] Não consegui gerar sugestão (${e.message}). Fica com humano.`);
    return { resultado: 'erro-api', erro: e.message, conversa: id };
  }
  const reais = custoReais(r.uso, cfg);
  try { registrarGasto({ ts: new Date().toISOString(), dia, conversa: id, caixa, modelo: cfg.modelo, entrada: r.uso.input_tokens, saida: r.uso.output_tokens, reais: reais - res.reserva, real: reais, ajuste: true }); }
  catch { /* falhou o ajuste: a reserva (maior que o real) segue contando, o teto continua valendo */ }

  const j = r.parada === 'refusal' ? null : lerJson(r.texto);
  if (!j) {
    await cw.etiquetar(id, [E.humano]);
    await cw.nota(id, `[claude] Sem sugestão utilizável (${r.parada === 'refusal' ? 'recusa do modelo' : 'resposta fora do formato'}). Fica com humano. Custo ${brl(reais)}.`);
    return { resultado: 'sem-sugestao', conversa: id, reais };
  }

  if (j.humano && /parar/i.test(j.motivo)) { // P2-2: parar que a regex não pegou
    gravarParar(chave);
    await cw.etiquetar(id, [E.parar, E.humano]);
    await cw.nota(id, `[claude] O modelo entendeu pedido para parar. Não envio mais nada a este contato; marcado com "parar-contato". Um humano confirma. Custo ${brl(reais)}.`);
    return { resultado: 'parar', origem: 'modelo', conversa: id, reais };
  }

  const tipoTexto = tipoPorTexto(texto);
  const motivos = j.humano || !j.resposta ? [] : motivosDeBarrar(j.resposta);
  const sozinho = podeResponderSozinho({ cfg, caixa, tipoModelo: j.tipo, tipoTexto, humano: j.humano, motivos, resposta: j.resposta }) && !tetoAtingido(cfg);

  if (sozinho) {
    await cw.enviar(id, j.resposta);
    await cw.etiquetar(id, [E.respondeu]);
    await cw.nota(id, `[claude] Respondi sozinho (tipo ${j.tipo}, modo autônomo). Custo ${brl(reais)}.`);
    return { resultado: 'respondeu', conversa: id, tipo: j.tipo, reais };
  }

  const linhas = [`[claude sugestão — MODO SOMBRA, nada foi enviado ao cliente]`, j.resposta || '(sem sugestão de texto)', `— tipo: ${j.tipo}${j.humano ? ` | pede humano: ${j.motivo || 'sem motivo'}` : ''} | custo ${brl(reais)}`];
  if (motivos.length) linhas.push(`— BARRADA pelas travas: ${motivos.join('; ')}`);
  await cw.nota(id, linhas.join('\n'));
  await cw.etiquetar(id, j.humano || motivos.length ? [E.sugestao, E.humano] : [E.sugestao]);
  return { resultado: 'sombra', conversa: id, tipo: j.tipo, barrada: motivos, humano: j.humano, reais };
}

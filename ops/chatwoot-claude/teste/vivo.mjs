// Teste VIVO: Claude real (Haiku 5.5) + Chatwoot FALSO + conversas de mentira. Gasta frações de centavo. Não toca em produção.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
process.env.CWC_DADOS = mkdtempSync(`${tmpdir()}/cwc-vivo-`);
process.env.CHATWOOT_TOKEN_CLAUDE = 'tok-falso';
const { carregarVariaveis } = await import('../nucleo.mjs');
carregarVariaveis(['ANTHROPIC_API_KEY_RESERVA']);
if (!process.env.ANTHROPIC_API_KEY_RESERVA) { console.error('sem chave'); process.exit(2); }
const { chatwootFalso, conv, evento } = await import('./falsos.mjs');
const estado = { conversas: {}, log: [] };
const { srv, url } = await chatwootFalso(estado); process.env.CHATWOOT_URL = url;
const { processar } = await import('../processar.mjs');
const { gastoPorConversa, gastoDoDia } = await import('../nucleo.mjs');
const casos = [
  [1, 'oi'], [2, 'quanto custa o plano Pro?'], [3, 'vcs são robô?'], [4, 'quanto custa o site e em quantos dias fica pronto?'],
  [5, 'sou refrigerista, trabalho só eu e meu ajudante, o orçamento sempre fica esquecido'], [6, 'quero cancelar e pedir reembolso, fui cobrado errado'],
];
for (const [id, t] of casos) {
  estado.conversas[id] = conv(id, 4, t);
  const r = await processar(evento(estado.conversas[id], t));
  console.log(`--- #${id} cliente: ${t}\n=> ${r.resultado} ${r.tipo || ''} ${r.barrada?.length ? `BARRADA:${r.barrada}` : ''}`);
  console.log(estado.conversas[id].messages.filter((m) => m.private).map((m) => m.content).join('\n'));
  console.log('enviado ao cliente?', estado.conversas[id].messages.some((m) => !m.private && m.message_type === 1));
}
console.log('gasto por conversa (R$):', JSON.stringify(gastoPorConversa()), 'total', gastoDoDia().toFixed(4));
srv.close();

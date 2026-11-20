// Chatwoot falso + Anthropic falso (servidores locais) para testar sem tocar em produção nem gastar.
import http from 'node:http';

export function chatwootFalso(estado) {
  // estado: { conversas: {id:{id,inbox_id,labels,meta,messages:[]}}, log:[] }
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const corpo = b ? JSON.parse(b) : null;
      const u = new URL(req.url, 'http://x');
      const p = u.pathname.replace('/api/v1/accounts/2', '');
      estado.log.push(`${req.method} ${p}${corpo ? ` ${JSON.stringify(corpo)}` : ''}`);
      const j = (o, c = 200) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const m1 = p.match(/^\/conversations\/(\d+)\/messages$/);
      if (m1) {
        const c = estado.conversas[m1[1]]; if (!c) return j({}, 404);
        if (req.method === 'POST') { c.messages.push({ id: 900 + c.messages.length, content: corpo.content, private: corpo.private, message_type: 1, created_at: 1 }); return j({ id: 1 }); }
        return j({ payload: c.messages });
      }
      const m2 = p.match(/^\/conversations\/(\d+)\/labels$/);
      if (m2) {
        const c = estado.conversas[m2[1]]; if (!c) return j({}, 404);
        if (req.method === 'POST') { c.labels = corpo.labels; return j({ payload: c.labels }); }
        return j({ payload: c.labels });
      }
      const m3 = p.match(/^\/conversations\/(\d+)\/assignments$/);
      if (m3) { estado.conversas[m3[1]].dono = corpo.assignee_id; return j({}); }
      const m4 = p.match(/^\/conversations\/(\d+)$/);
      if (m4) { const c = estado.conversas[m4[1]]; return c ? j(c) : j({}, 404); }
      if (p === '/conversations') {
        const caixa = Number(u.searchParams.get('inbox_id'));
        const pay = Object.values(estado.conversas).filter((c) => c.inbox_id === caixa).map((c) => ({ ...c, last_non_activity_message: c.messages.filter((x) => !x.private).at(-1) }));
        return j({ data: { payload: pay } });
      }
      if (p === '/agents') return j([{ id: 7, email: 'iris@agentes.olli.local' }]);
      j({ erro: 'rota' }, 404);
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}

export function anthropicFalso(respostas, chamadas) {
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const corpo = JSON.parse(b); chamadas.push({ chave: req.headers['x-api-key'], corpo });
      const r = respostas.shift() ?? { texto: '{"tipo":"outro","resposta":"","humano":true,"motivo":"sem roteiro"}' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: r.texto }], usage: r.uso || { input_tokens: 5000, output_tokens: 80 }, stop_reason: r.parada || 'end_turn' }));
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}/v1/messages` })));
}

export const conv = (id, inbox, textoCliente, extra = {}) => ({
  id, inbox_id: inbox, labels: [], meta: { sender: { id: 100 + id, name: 'Cliente de Mentira', phone_number: '+5511900000000' } },
  messages: [{ id: 10 * id, content: textoCliente, private: false, message_type: 0, created_at: 1 }], ...extra,
});
export const evento = (c, texto, inbox = c.inbox_id) => ({
  event: 'message_created', id: c.messages.at(-1).id, content: texto, message_type: 'incoming', private: false,
  sender_type: 'contact', sender: { id: c.meta.sender.id, phone_number: '+5511900000000' }, conversation: { id: c.id, inbox_id: inbox, meta: c.meta },
});

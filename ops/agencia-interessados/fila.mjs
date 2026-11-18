// Fila local dos interessados. O Rafa acrescenta; o painel e o resumo só leem.

export function lerRegistros(texto) {
  return String(texto || '')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

export function selecionarRegistros(linhas) {
  const parados = new Set();
  const por = new Map();
  for (const r of linhas || []) {
    if (!r || r.conversa == null) continue;
    const id = Number(r.conversa);
    if (!Number.isInteger(id)) continue;
    if (r.parado) {
      parados.add(id);
      por.delete(id);
      continue;
    }
    if (parados.has(id)) continue;
    const anterior = por.get(id);
    if (!anterior) por.set(id, { ...r, conversa: id });
    else por.set(id, { ...anterior, ...r, conversa: id, desde: anterior.desde || r.desde });
  }
  return [...por.values()].sort((a, b) => Number(a.desde) - Number(b.desde));
}

export function textoEspera(segundos) {
  const s = Math.max(0, Math.floor(Number(segundos) || 0));
  if (s < 90) return 'há instantes';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export function cruzar(itens, central) {
  if (!Array.isArray(central)) return itens;
  const porId = new Map(central.map((c) => [Number(c.id), c]));
  return itens.filter((i) => {
    const c = porId.get(Number(i.conversa));
    if (!c) return true;
    if (c.status === 'resolved') return false;
    const labels = c.labels || [];
    if (labels.includes('parar-contato')) return false;
    return true;
  });
}

export function montarInteressados({ conversas = [], estado = {}, registros = [], agora }) {
  const agoraSeg = Number(agora) || 0;
  const ativos = selecionarRegistros(registros);
  const parados = new Set(
    (registros || []).filter((r) => r?.parado && r.conversa != null).map((r) => Number(r.conversa)),
  );
  const porConv = new Map(ativos.map((r) => [Number(r.conversa), r]));
  const vistos = new Set();
  const itens = [];

  const empurrar = (id, empresa, quer, pedido, nicho, desde) => {
    itens.push({
      id,
      empresa: String(empresa || 'Empresa').slice(0, 80),
      quer: String(quer || 'Interesse marcado').slice(0, 120),
      pedido: String(pedido || '').slice(0, 160),
      nicho: String(nicho || '').slice(0, 40),
      desde: Number(desde) || agoraSeg,
    });
    vistos.add(id);
  };

  for (const c of conversas) {
    const id = Number(c.id);
    if (!Number.isInteger(id)) continue;
    const reg = porConv.get(id);
    const s = estado[id] || estado[String(id)] || {};
    const marcado = (c.labels || []).includes('interessado') || Boolean(reg) || Boolean(s.interesse);
    if (!marcado) continue;
    if (c.parar || parados.has(id) || c.status === 'resolved') continue;
    empurrar(
      id,
      reg?.empresa || c.nome,
      s.quer || reg?.quer,
      reg?.pedido || '',
      s.nicho || reg?.nicho || '',
      s.interesseDesde || reg?.desde || c.espera || c.atividade || agoraSeg,
    );
  }

  for (const [id, reg] of porConv) {
    if (vistos.has(id) || parados.has(id)) continue;
    const c = conversas.find((x) => Number(x.id) === id);
    if (c && (c.parar || c.status === 'resolved')) continue;
    empurrar(id, reg.empresa, reg.quer, reg.pedido, reg.nicho, reg.desde || agoraSeg);
  }

  itens.sort((a, b) => a.desde - b.desde);
  return itens;
}

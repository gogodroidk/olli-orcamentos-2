// robots.txt no recorte que a coleta usa. 404 = sem regra. 5xx ou timeout = não entra.

export function parseRobots(texto) {
  const grupos = [];
  let atual = null;
  for (const bruta of String(texto ?? '').split(/\r?\n/)) {
    const linha = bruta.replace(/#.*$/, '').trim();
    if (!linha) continue;
    const m = linha.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const chave = m[1].toLowerCase();
    const valor = m[2].trim();
    if (chave === 'user-agent') {
      if (!atual || atual.regras.length) {
        atual = { uas: [], regras: [], atraso: 0 };
        grupos.push(atual);
      }
      atual.uas.push(valor.toLowerCase());
    } else if ((chave === 'allow' || chave === 'disallow' || chave === 'crawl-delay') && atual) {
      if (chave === 'crawl-delay') atual.atraso = Number(valor) || 0;
      else atual.regras.push({ tipo: chave, path: valor });
    }
  }
  return grupos;
}

function casa(pathname, regra) {
  if (!regra) return false;
  let corpo = regra;
  const fim = corpo.endsWith('$');
  if (fim) corpo = corpo.slice(0, -1);
  const partes = corpo.split('*');
  let de = 0;
  for (let i = 0; i < partes.length; i += 1) {
    const pedaco = partes[i];
    if (!pedaco) continue;
    const em = pathname.indexOf(pedaco, de);
    if (em < 0) return false;
    if (i === 0 && em !== 0) return false;
    de = em + pedaco.length;
  }
  if (fim && de !== pathname.length) return false;
  return true;
}

export function permitido(grupos, pathname, ua) {
  const nome = String(ua || '').toLowerCase();
  const especifico = grupos.filter((g) => g.uas.some((u) => u !== '*' && nome.includes(u)));
  const estrela = grupos.filter((g) => g.uas.includes('*'));
  const escolhidos = especifico.length ? especifico : estrela;
  const regras = escolhidos.flatMap((g) => g.regras);
  const atraso = escolhidos.reduce((m, g) => Math.max(m, g.atraso || 0), 0);
  let melhor = null;
  for (const regra of regras) {
    if (!regra.path) continue;
    if (!casa(pathname || '/', regra.path)) continue;
    const empate = melhor && regra.path.length === melhor.path.length && regra.tipo === 'allow';
    if (!melhor || regra.path.length > melhor.path.length || empate) melhor = regra;
  }
  return {
    ok: melhor ? melhor.tipo === 'allow' : true,
    atrasoSeg: atraso,
  };
}

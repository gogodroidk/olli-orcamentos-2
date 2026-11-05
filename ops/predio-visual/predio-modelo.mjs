// Modelo do prédio visual. Só transforma JSON local. Não chama rede nem modelo.

export const POLL_MS = 10000;
export const AVIAO_MS = 3000;
export const BALAO_CHARS = 40;

const STATUS_CONHECIDO = new Set(['trabalhando', 'parado', 'bloqueado', 'conversando']);
const ROSTO_ARQUIVO = /^[a-z0-9.-]+\.webp$/i;
const ROSTO_CAMINHO = /^rostos\/[a-z0-9.-]+\.webp$/i;

export function ceuDaHora(hora) {
  if (hora >= 6 && hora < 16) return 'dia';
  if (hora >= 16 && hora < 19) return 'tarde';
  return 'noite';
}

export function empresasDeCimaParaBaixo(mapa) {
  const empresas = mapa?.empresas && typeof mapa.empresas === 'object' ? mapa.empresas : {};
  return Object.entries(empresas)
    .map(([id, empresa]) => ({ id, ...empresa }))
    .sort((a, b) => Number(b.ordem) - Number(a.ordem));
}

export function empresaDaArea(area, mapa) {
  const empresas = mapa?.empresas && typeof mapa.empresas === 'object' ? mapa.empresas : {};
  for (const [id, empresa] of Object.entries(empresas)) {
    if (Array.isArray(empresa.areas) && empresa.areas.includes(area)) return id;
  }
  return null;
}

export function agrupar(agentes, mapa) {
  const andares = empresasDeCimaParaBaixo(mapa).map((empresa) => ({
    id: empresa.id,
    ordem: empresa.ordem,
    rotulo: empresa.rotulo,
    nome: empresa.nome,
    faixa: empresa.faixa,
    pessoas: [],
  }));
  const porId = new Map(andares.map((andar) => [andar.id, andar]));
  const semMapa = [];
  for (const agente of agentes || []) {
    const empresa = empresaDaArea(agente.andar, mapa);
    const andar = empresa ? porId.get(empresa) : null;
    if (!andar) semMapa.push(agente);
    else andar.pessoas.push(agente);
  }
  return { andares, semMapa };
}

export function mesmaFila(antes, depois) {
  if (!Array.isArray(antes) || !Array.isArray(depois) || antes.length !== depois.length) return false;
  for (let i = 0; i < antes.length; i += 1) {
    if (antes[i]?.id !== depois[i]?.id) return false;
  }
  return true;
}

export function cortar(texto, limite = BALAO_CHARS) {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  if (limpo.length <= limite) return limpo;
  return `${limpo.slice(0, limite - 1)}…`;
}

export function rotuloStatus(status) {
  if (STATUS_CONHECIDO.has(status)) return status;
  return 'sem estado';
}

export function textoMonitor(status) {
  if (status === 'trabalhando' || status === 'conversando') return 'ativo';
  if (status === 'bloqueado') return 'bloqueado';
  return 'apagado';
}

export function ariaMesa(agente) {
  const nome = String(agente?.nome || 'Sem nome');
  const papel = String(agente?.papel || 'sem papel');
  const tarefa = String(agente?.tarefa || '').replace(/\s+/g, ' ').trim();
  const base = `${nome}, ${papel}: ${rotuloStatus(agente?.status)}.`;
  return tarefa ? `${base} ${tarefa}` : base;
}

export function resumo(agentes) {
  const contagem = { trabalhando: 0, parado: 0, bloqueado: 0, outro: 0 };
  for (const agente of agentes || []) {
    if (agente?.status === 'trabalhando' || agente?.status === 'parado' || agente?.status === 'bloqueado') {
      contagem[agente.status] += 1;
    } else {
      contagem.outro += 1;
    }
  }
  return contagem;
}

export function iniciais(nome) {
  const limpo = String(nome || '').replace(/^Dr\.\s*/i, '').trim();
  const partes = limpo.split(/\s+/).filter(Boolean);
  const letras = `${partes[0]?.[0] || ''}${partes[1]?.[0] || ''}`;
  return letras.toUpperCase() || '?';
}

export function arquivoRosto(agente, mapaRostos) {
  const declarado = typeof agente?.rosto === 'string' ? agente.rosto : '';
  if (ROSTO_CAMINHO.test(declarado) && !declarado.includes('..')) return declarado;
  const arquivo = mapaRostos?.[agente?.id];
  if (typeof arquivo === 'string' && ROSTO_ARQUIVO.test(arquivo) && !arquivo.includes('..')) {
    return `rostos/${arquivo}`;
  }
  return null;
}

export function fichaMesa(agente, mapaRostos) {
  const status = rotuloStatus(agente?.status);
  const tarefa = String(agente?.tarefa || '').replace(/\s+/g, ' ').trim();
  const curto = cortar(tarefa);
  return {
    id: agente.id,
    nome: agente.nome,
    papel: agente.papel || '',
    status,
    monitor: textoMonitor(agente?.status),
    balao: status === 'bloqueado' ? `! ${curto || 'bloqueado'}` : curto || '—',
    aria: ariaMesa(agente),
    rosto: arquivoRosto(agente, mapaRostos),
    iniciais: iniciais(agente.nome),
    memorias: Number(agente.total_memorias) || 0,
  };
}

export function idConversa(conversa, indice = 0) {
  if (conversa?.id) return String(conversa.id);
  return `${conversa?.de || ''}>${conversa?.para || ''}|${conversa?.ts || ''}|${indice}`;
}

export function conversasNovas(idsVistos, conversas) {
  const vistos = idsVistos instanceof Set ? idsVistos : new Set(idsVistos || []);
  const novas = [];
  for (const [indice, conversa] of (conversas || []).entries()) {
    const id = idConversa(conversa, indice);
    if (vistos.has(id)) continue;
    novas.push({ ...conversa, id });
  }
  return novas;
}

export function textoSinal({ ok, agoraMs, ultimoOkMs }) {
  if (ok) return 'atualizado agora';
  if (!ultimoOkMs) return 'sem sinal';
  const segundos = Math.max(0, Math.round((agoraMs - ultimoOkMs) / 1000));
  return `sem sinal há ${segundos} s`;
}

export function validarEstado(bruto) {
  if (!bruto || typeof bruto !== 'object' || !Array.isArray(bruto.agentes)) return null;
  const agentes = bruto.agentes.filter((agente) => agente && typeof agente.id === 'string' && typeof agente.nome === 'string');
  return {
    atualizado: typeof bruto.atualizado === 'string' ? bruto.atualizado : '',
    agentes,
    conversas: Array.isArray(bruto.conversas) ? bruto.conversas : [],
  };
}

export function textoResumo(contagem) {
  const parado = contagem.parado === 1 ? 'parado' : 'parados';
  const bloqueado = contagem.bloqueado === 1 ? 'bloqueado' : 'bloqueados';
  return `${contagem.trabalhando} trabalhando · ${contagem.parado} ${parado} · ${contagem.bloqueado} ${bloqueado}`;
}

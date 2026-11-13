// Freio da ativação, compartilhado pelo robô (quando pedem para parar) e pelo envio.
// Dois pedidos de parar no mesmo dia (horário de Brasília) travam a fila.
import fs from 'node:fs';
import path from 'node:path';

export function diaSP(agora = new Date()) {
  const br = new Date(agora.getTime() - 3 * 3600 * 1000);
  const y = br.getUTCFullYear();
  const m = String(br.getUTCMonth() + 1).padStart(2, '0');
  const d = String(br.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function paradasNoDia(linhas, agora = new Date()) {
  const dia = diaSP(agora);
  const ids = new Set();
  for (const linha of linhas) {
    if (!linha || typeof linha !== 'object') continue;
    const em = linha.em ? new Date(linha.em) : null;
    if (!em || Number.isNaN(em.getTime())) continue;
    if (diaSP(em) !== dia) continue;
    ids.add(String(linha.conversa ?? linha.contato ?? ''));
  }
  ids.delete('');
  return ids.size;
}

export function lerParadas(arquivo) {
  try {
    return fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export function criarRegistroParada({
  dir,
  aoFrear = () => {},
  agora = () => new Date(),
  arquivoParadas = 'ativacao-parou.jsonl',
  arquivoFreio = 'ativacao-freio.json',
}) {
  const arquivo = path.join(dir, arquivoParadas);
  const freioArq = path.join(dir, arquivoFreio);
  return async function registrarParada({ conversa }) {
    const em = agora().toISOString();
    fs.appendFileSync(arquivo, `${JSON.stringify({ conversa, em })}\n`);
    const n = paradasNoDia(lerParadas(arquivo), agora());
    if (n >= 2) {
      const freio = { motivo: '2_paradas', em, n };
      fs.writeFileSync(freioArq, JSON.stringify(freio));
      await aoFrear(freio);
    }
    return n;
  };
}

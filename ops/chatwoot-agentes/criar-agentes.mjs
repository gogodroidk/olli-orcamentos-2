// Cria (ou confere) os atendentes-agente no Chatwoot, com avatar, caixas e times, e guarda o token de cada um
// como CHATWOOT_TOKEN_<NOME> no arquivo de credenciais locais (chmod 600). Idempotente. Nunca imprime token.
//   node criar-agentes.mjs            aplica
//   node criar-agentes.mjs --conferir só mostra o estado
import { readFileSync, writeFileSync, renameSync, chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CFG, DIR, BASE, CRED, api, carregarCredenciais, tokenAdmin } from './lib.mjs';

carregarCredenciais();
const conferir = process.argv.includes('--conferir');
const RAILS = process.env.CW_RAILS_CONTAINER || 'chatwoot-demo-rails-1';

function gravarTokens(tokens) {
  const txt = readFileSync(CRED, 'utf8');
  const bak = `${CRED}.bak-cq-chatwoot-100`;
  if (!existsSync(bak)) { copyFileSync(CRED, bak); chmodSync(bak, 0o600); }
  const linhas = txt.split('\n');
  for (const [chave, tok] of Object.entries(tokens)) {
    const nome = `CHATWOOT_TOKEN_${chave}`;
    const i = linhas.findIndex((l) => l.startsWith(`${nome}=`));
    if (i >= 0) linhas[i] = `${nome}=${tok}`;
    else {
      if (!linhas.some((l) => l.startsWith('# Chatwoot — atendentes-agente'))) {
        while (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
        linhas.push('', '# Chatwoot — atendentes-agente (CQ-CHATWOOT-100, 18/11/2026): um token por agente');
      }
      linhas.push(`${nome}=${tok}`);
    }
  }
  const novo = linhas.join('\n').replace(/\n*$/, '\n');
  const tmp = `${CRED}.tmp-${process.pid}`;
  writeFileSync(tmp, novo, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, CRED);
}

function avatarPng(ag) {
  const pasta = `${DIR}avatares`;
  mkdirSync(pasta, { recursive: true });
  const arq = `${pasta}/${ag.chave.toLowerCase()}.png`;
  if (!existsSync(arq)) {
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw, ImageFont
cor, letra, saida = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.ellipse((0, 0, 255, 255), fill=cor)
f = None
for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
    try:
        f = ImageFont.truetype(p, 130); break
    except Exception:
        pass
f = f or ImageFont.load_default()
b = d.textbbox((0, 0), letra, font=f)
d.text(((256 - (b[2] - b[0])) / 2 - b[0], (256 - (b[3] - b[1])) / 2 - b[1]), letra, font=f, fill='white')
im.save(saida)
`, ag.cor, ag.inicial, arq]);
  }
  return arq;
}

async function subirAvatar(token, ag) {
  const fd = new FormData();
  fd.append('profile[avatar]', new Blob([readFileSync(avatarPng(ag))], { type: 'image/png' }), `${ag.chave.toLowerCase()}.png`);
  fd.append('profile[display_name]', ag.display);
  const r = await fetch(`${BASE}/api/v1/profile`, { method: 'PUT', headers: { api_access_token: token }, body: fd });
  if (!r.ok) throw new Error(`avatar ${ag.chave}: ${r.status}`);
  // fica "online" para aparecer como disponível na lista de atendentes
  await fetch(`${BASE}/api/v1/profile/availability`, {
    method: 'POST', headers: { api_access_token: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: { availability: 'online', account_id: CFG.conta } }),
  });
}

const admin = await tokenAdmin();
let ids = {};
if (!conferir) {
  const specs = CFG.agentes.map(({ chave, nome, display, email }) => ({ chave, nome, display, email }));
  execFileSync('docker', ['cp', `${DIR}criar-usuarios.rb`, `${RAILS}:/tmp/criar-usuarios.rb`]);
  const out = execFileSync('docker', ['exec', '-e', `SPECS=${JSON.stringify(specs)}`, '-e', `CONTA=${CFG.conta}`, RAILS,
    'bundle', 'exec', 'rails', 'runner', '/tmp/criar-usuarios.rb'], { encoding: 'utf8', maxBuffer: 16 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  const linha = out.split('\n').find((l) => l.startsWith('JSON>'));
  if (!linha) throw new Error('rails runner não devolveu JSON');
  const res = JSON.parse(linha.slice(5));
  // ADMIN = token de API do Admin Demo, usado só pelo sincronizador (notas de importação saem como "Admin Demo", não como agente)
  gravarTokens({ ...Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.token])), ADMIN: admin });
  for (const [k, v] of Object.entries(res)) process.env[`CHATWOOT_TOKEN_${k}`] = v.token;
  ids = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.id]));
  for (const ag of CFG.agentes) await subirAvatar(res[ag.chave].token, ag);
  console.log('usuários e tokens ok (tokens gravados em CHATWOOT_TOKEN_<NOME>, chmod 600)');
} else {
  const agentes = await api(admin, '/agents');
  for (const ag of CFG.agentes) { const u = agentes.find((x) => x.email === ag.email); if (u) ids[ag.chave] = u.id; }
}

// Caixas: membros = agentes daquela caixa + quem já estava (Igor/Admin). Nunca toca nas caixas fora do item (GR Tech, Pessoal).
for (const [nomeCaixa, inboxId] of Object.entries(CFG.caixas)) {
  const atuais = (await api(admin, `/inbox_members/${inboxId}`)).payload.map((u) => u.id);
  const querer = CFG.agentes.filter((a) => a.caixas.includes(nomeCaixa)).map((a) => ids[a.chave]).filter(Boolean);
  const faltam = querer.filter((id) => !atuais.includes(id));
  if (!conferir && faltam.length) await api(admin, '/inbox_members', 'PATCH', { inbox_id: inboxId, user_ids: [...new Set([...atuais, ...querer])] });
  console.log(`caixa ${inboxId} (${nomeCaixa}): ${conferir ? 'faltam' : 'adicionados'} ${faltam.length}; total ${new Set([...atuais, ...querer]).size}`);
}
for (const inboxId of CFG.caixasForaDoItem) {
  const membros = (await api(admin, `/inbox_members/${inboxId}`)).payload.map((u) => u.id);
  const agentesLa = Object.values(ids).filter((id) => membros.includes(id));
  console.log(`caixa ${inboxId} (fora do item): agentes-IA nela = ${agentesLa.length}`);
}
// Times (sem auto-atribuição, para não calar o robô à toa)
for (const [nomeTime, teamId] of Object.entries(CFG.times)) {
  const atuais = (await api(admin, `/teams/${teamId}/team_members`)).map((u) => u.id);
  const querer = CFG.agentes.filter((a) => a.times.includes(nomeTime)).map((a) => ids[a.chave]).filter(Boolean);
  const faltam = querer.filter((id) => !atuais.includes(id));
  if (!conferir && faltam.length) await api(admin, `/teams/${teamId}/team_members`, 'POST', { user_ids: faltam });
  console.log(`time ${teamId} (${nomeTime}): ${conferir ? 'faltam' : 'adicionados'} ${faltam.length}`);
}
const lista = await api(admin, '/agents');
for (const ag of CFG.agentes) {
  const u = lista.find((x) => x.email === ag.email);
  const temTok = Boolean(process.env[`CHATWOOT_TOKEN_${ag.chave}`]);
  console.log(`${ag.chave.padEnd(9)} ${u ? `id ${u.id} ${u.name} | ${u.role} | ${u.availability_status} | avatar ${u.thumbnail ? 'sim' : 'não'}` : 'NÃO EXISTE'} | token na variável: ${temTok ? 'sim' : 'não'}`);
}

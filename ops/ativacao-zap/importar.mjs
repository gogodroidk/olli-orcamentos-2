// Cria ou atualiza contatos da caixa OLLI Orçamentos. Não manda mensagem.
// Uso:
//   node importar.mjs --preparar          etiqueta e atributos, sem contato
//   node importar.mjs --seco              mostra o que gravaria
//   node importar.mjs                     grava os alvos que estão em base.json
import fs from 'node:fs';
import { cw as cwPadrao } from './cw.mjs';
import { e164, mascara, variantes } from './telefones.mjs';
import { montarFila } from './fila.mjs';
import { carregarHashes, syncFresca, idadeSyncHoras } from './supressao.mjs';
import { id8 } from './mensagens.mjs';

const BASE = new URL('./base.json', import.meta.url);
const INBOX_NOME = 'OLLI Orçamentos';
const ETIQUETA = 'ativacao';

const ATRIBUTOS = [
  ['etapa', 'Etapa no app'],
  ['especialidade', 'Especialidade'],
  ['cidade', 'Cidade'],
  ['cadastro', 'Data de cadastro'],
  ['plano', 'Plano'],
  ['orcamentos', 'Orçamentos'],
  ['conta_id', 'Conta no app'],
];

function listaDe(resposta) {
  if (Array.isArray(resposta)) return resposta;
  if (Array.isArray(resposta?.payload)) return resposta.payload;
  return [];
}

export async function preparar(api) {
  const labels = listaDe(await api('GET', '/labels')).map((l) => l.title || l.name);
  if (!labels.includes(ETIQUETA)) {
    await api('POST', '/labels', {
      title: ETIQUETA,
      description: 'Cadastrou no app e ainda não fez orçamento, ou prioridade de pagamento. A Lívia ajuda a montar o primeiro.',
      color: '#16A34A',
      show_on_sidebar: true,
    });
  }
  const defs = listaDe(await api('GET', '/custom_attribute_definitions'));
  const chaves = new Set(defs.map((d) => d.attribute_key));
  for (const [key, nome] of ATRIBUTOS) {
    if (chaves.has(key)) continue;
    await api('POST', '/custom_attribute_definitions', {
      attribute_display_name: nome,
      attribute_display_type: 'text',
      attribute_description: 'Ativação do app OLLI Orçamentos',
      attribute_key: key,
      attribute_model: 'contact_attribute',
    });
  }
  const inboxes = listaDe(await api('GET', '/inboxes'));
  const inbox = inboxes.find((i) => i.name === INBOX_NOME);
  if (!inbox?.id) throw new Error('caixa_olli_nao_encontrada');
  return { inboxId: inbox.id, etiquetaNova: !labels.includes(ETIQUETA) };
}

function casa(contato, pessoa) {
  if (!contato) return false;
  if (contato.identifier && contato.identifier === pessoa.conta_id) return true;
  if (contato.custom_attributes?.conta_id === pessoa.conta_id) return true;
  const nossos = new Set(variantes(pessoa.telefone_e164));
  return variantes(contato.phone_number).some((v) => nossos.has(v));
}

export async function acharContato(api, pessoa) {
  const termos = [pessoa.conta_id, e164(pessoa.telefone_e164).replace('+', '')].filter(Boolean);
  const vistos = new Set();
  for (const termo of termos) {
    const achados = listaDe(await api('GET', `/contacts/search?q=${encodeURIComponent(termo)}`));
    for (const c of achados) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      if (casa(c, pessoa)) return c;
    }
  }
  return null;
}

function atributos(pessoa) {
  return {
    etapa: String(pessoa.etapa ?? ''),
    especialidade: String(pessoa.especialidade ?? ''),
    cidade: String(pessoa.cidade ?? ''),
    cadastro: String(pessoa.cadastro ?? ''),
    plano: String(pessoa.plano ?? ''),
    orcamentos: String(pessoa.orcamentos ?? ''),
    conta_id: String(pessoa.conta_id),
  };
}

async function porEtiqueta(api, contatoId) {
  const atual = await api('GET', `/contacts/${contatoId}/labels`);
  const nomes = listaDe(atual).map((x) => (typeof x === 'string' ? x : x.title)).filter(Boolean);
  if (nomes.includes(ETIQUETA)) return nomes;
  const labels = [...nomes, ETIQUETA];
  await api('POST', `/contacts/${contatoId}/labels`, { labels });
  return labels;
}

export async function gravarContato(api, pessoa, inboxId) {
  const fone = e164(pessoa.telefone_e164);
  const existente = await acharContato(api, pessoa);
  const custom = { ...(existente?.custom_attributes || {}), ...atributos(pessoa) };
  let contato = existente;
  if (!existente) {
    contato = await api('POST', '/contacts', {
      inbox_id: inboxId,
      name: String(pessoa.nome || 'Contato OLLI').slice(0, 80),
      phone_number: fone,
      identifier: pessoa.conta_id,
      custom_attributes: custom,
    });
    contato = contato?.payload?.contact || contato?.payload || contato;
  } else {
    const atualizado = await api('PUT', `/contacts/${existente.id}`, {
      name: existente.name || String(pessoa.nome || 'Contato OLLI').slice(0, 80),
      identifier: existente.identifier || pessoa.conta_id,
      custom_attributes: custom,
    });
    contato = atualizado?.payload || atualizado || existente;
  }
  const id = contato?.id || existente?.id;
  if (!id) throw new Error('contato_sem_id');
  await porEtiqueta(api, id);
  return { id, novo: !existente };
}

function lerBase() {
  const bruto = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  if (!Array.isArray(bruto)) throw new Error('base_nao_e_lista');
  return bruto;
}

function contexto() {
  return { hashesCsv: carregarHashes(), syncFresca: syncFresca() };
}

async function main() {
  const seco = process.argv.includes('--seco');
  const soPreparar = process.argv.includes('--preparar');
  const prep = await preparar(cwPadrao);
  console.log(`caixa ${INBOX_NOME} id ${prep.inboxId}; etiqueta ${ETIQUETA} pronta`);
  if (soPreparar) return;
  if (!fs.existsSync(BASE)) {
    console.log('base.json ainda não existe. O Salomão roda mapa.sql e salva o array aqui. Nada importado.');
    process.exitCode = 2;
    return;
  }
  const ctx = contexto();
  const idade = idadeSyncHoras();
  const { fila, fora } = montarFila(lerBase(), ctx);
  console.log(`alvos ${fila.length}; de fora ${fora.length}; supressão ${ctx.syncFresca ? 'fresca' : `velha (${idade == null ? 'sem sync' : idade.toFixed(0) + 'h'})`}`);
  if (!ctx.syncFresca) {
    console.log('Não importei ninguém: a sync da supressão passou de 24 h. Rode sincronizar_supressao.py e tente de novo.');
    process.exitCode = 2;
    return;
  }
  for (const p of fila) {
    const linha = `${id8(p.conta_id)} ${mascara(p.telefone_e164)} ${p.etapa} ${p.especialidade || '-'}`;
    if (seco) {
      console.log(`seco gravaria ${linha}`);
      continue;
    }
    const r = await gravarContato(cwPadrao, p, prep.inboxId);
    console.log(`${r.novo ? 'novo' : 'ja_existia'} ${linha} contato ${r.id}`);
  }
}

const direto = process.argv[1] && process.argv[1].endsWith('importar.mjs');
if (direto) main().catch((e) => { console.error(String(e.message || e).slice(0, 200)); process.exitCode = 1; });

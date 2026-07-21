/**
 * palavras.js — cobertura de termos na ficha da Play.
 *
 * A Play indexa o TEXTO da ficha (não há campo de keywords). Então "temos essa
 * palavra-chave?" é uma pergunta que se responde lendo o texto — e que apodrece
 * na primeira edição se a resposta ficar escrita à mão num documento.
 *
 *     node assets/loja/palavras.js
 *
 * Lê os blocos oficiais do FICHA.md (título, descrição breve, descrição
 * completa) e diz, por termo, em quais campos ele aparece.
 *
 * Comparação sem acento e sem caixa de propósito: quem busca na Play digita
 * "orcamento" e "refrigeracao" tanto quanto as formas acentuadas, e o objetivo
 * aqui é conferir COBERTURA do conceito, não ortografia.
 *
 * Não falha o processo: cobertura é julgamento editorial, não regra de loja.
 * Termo faltando pode ser decisão consciente (ex.: não prometer o que o app não
 * faz). Quem falha o processo é o `medir.js`, que trata de limite de caractere.
 */
const fs = require('fs');
const path = require('path');

const FICHA = path.join(__dirname, 'FICHA.md');

const CAMADAS = {
  'cabeça': ['orçamento', 'orçamento de serviço', 'ordem de serviço', 'OS', 'recibo'],
  'ofício': [
    'eletricista', 'refrigeração', 'ar-condicionado', 'climatização', 'hidráulica',
    'pintura', 'dedetização', 'jardinagem', 'técnico', 'manutenção', 'elétrica',
  ],
  'identidade/intenção': [
    'autônomo', 'prestador', 'PDF', 'WhatsApp', 'offline', 'assinatura', 'PMOC',
    'QR', 'ANVISA', 'campo', 'equipe', 'agenda', 'cliente',
  ],
};

/** Sem acento, sem caixa — é assim que a busca real chega. */
const dobrar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function blocos(md) {
  return [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));
}

const textos = blocos(fs.readFileSync(FICHA, 'utf8'));
if (textos.length < 3) {
  console.error('FICHA.md não tem os 3 primeiros blocos esperados (título, breve, completa).');
  process.exit(1);
}

const CAMPOS = [
  { rotulo: 'TÍT', texto: dobrar(textos[0]) },
  { rotulo: 'BRE', texto: dobrar(textos[1]) },
  { rotulo: 'COM', texto: dobrar(textos[2]) },
];

/**
 * `OS` precisa de fronteira de palavra, senão casa dentro de "nossos", "custos"
 * e o relatório mente dizendo que o termo está coberto.
 */
function aparece(termo, texto) {
  const alvo = dobrar(termo);
  if (alvo.length <= 3) return new RegExp(`(^|[^a-z0-9])${alvo}([^a-z0-9]|$)`).test(texto);
  return texto.includes(alvo);
}

let ausentes = 0;
for (const [camada, termos] of Object.entries(CAMADAS)) {
  console.log(`\n── ${camada} ──`);
  for (const termo of termos) {
    const onde = CAMPOS.filter((c) => aparece(termo, c.texto)).map((c) => c.rotulo);
    if (!onde.length) ausentes += 1;
    console.log(`  ${termo.padEnd(22)} ${onde.length ? onde.join(' ') : '— AUSENTE'}`);
  }
}
console.log(`\nTÍT=título · BRE=descrição breve · COM=descrição completa`);
console.log(`Termos ausentes: ${ausentes}`);

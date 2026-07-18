/**
 * medir.js — confere os limites de caractere da ficha da Play LENDO O FICHA.md.
 *
 * Existe porque contagem de caractere escrita à mão apodrece: alguém ajusta uma
 * frase, esquece de refazer a conta, e o "74/80" do documento vira ficção. Aqui
 * o número é sempre recalculado a partir do texto que está de fato no arquivo.
 *
 *     node assets/loja/medir.js
 *
 * Conta com `[...s].length` (code points) e não `s.length` (code units): "ç" e
 * "ã" são 1 caractere para a Play, e emoji seria 1 e não 2. Sai com código 1 se
 * algum campo estourar — dá para pendurar num pre-commit se um dia interessar.
 *
 * Limites conferidos na fonte oficial (Play Console Help, jul/2026):
 *   título 30 · descrição breve 80 · descrição completa 4000 · novidades 500
 */
const fs = require('fs');
const path = require('path');

const FICHA = path.join(__dirname, 'FICHA.md');

/** Blocos ``` na ordem em que aparecem no FICHA.md. */
function blocos(md) {
  return [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));
}

/**
 * O 1º bloco de cada seção é o texto oficial daquele campo. A ordem é a do
 * documento: título, descrição breve, descrição completa, novidades.
 */
const CAMPOS = [
  { nome: 'Título do app', limite: 30 },
  { nome: 'Descrição breve', limite: 80 },
  { nome: 'Descrição completa', limite: 4000 },
  { nome: 'Novidades desta versão', limite: 500 },
];

const md = fs.readFileSync(FICHA, 'utf8');
const textos = blocos(md);

if (textos.length < CAMPOS.length) {
  console.error(
    `FICHA.md tem ${textos.length} blocos de código; esperava ao menos ${CAMPOS.length}. ` +
    'Alguém removeu um campo ou mudou a ordem — conferir antes de confiar na medição.',
  );
  process.exit(1);
}

let estourou = false;
console.log('campo                      usado / limite   folga');
console.log('-'.repeat(56));
CAMPOS.forEach((campo, i) => {
  const usado = [...textos[i]].length;
  const ok = usado <= campo.limite;
  if (!ok) estourou = true;
  console.log(
    campo.nome.padEnd(26) +
    `${String(usado).padStart(5)} / ${String(campo.limite).padEnd(6)}` +
    `${String(campo.limite - usado).padStart(6)}  ${ok ? 'OK' : '*** ESTOUROU ***'}`,
  );
});

process.exit(estourou ? 1 : 0);

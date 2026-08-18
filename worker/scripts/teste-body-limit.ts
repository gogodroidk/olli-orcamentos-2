// @ts-nocheck
import { lerCorpoLimitado } from '../src/bodyLimit.js';

let ok = 0;
let falhas = 0;
function checar(nome, real, esperado) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok += 1;
  else {
    falhas += 1;
    console.error(`FALHOU: ${nome}`, { real, esperado });
  }
}

function requestEmPartes(partes, estado = {}) {
  const fila = partes.map((p) => new TextEncoder().encode(p));
  return {
    body: new ReadableStream({
      pull(controller) {
        estado.puxados = (estado.puxados || 0) + 1;
        const parte = fila.shift();
        if (parte) controller.enqueue(parte);
        else controller.close();
      },
      cancel() {
        estado.cancelado = true;
      },
    }),
  };
}

checar(
  'corpo válido é reconstruído uma única vez',
  await lerCorpoLimitado(requestEmPartes(['{"ol', 'li":', 'true}']), 32),
  { grande: false, raw: '{"olli":true}' },
);

const estado = {};
checar(
  'chunked acima do teto é recusado sem devolver conteúdo parcial',
  await lerCorpoLimitado(requestEmPartes(['1234', '5678', 'conteudo-que-nao-deve-ser-lido'], estado), 6),
  { grande: true, raw: '' },
);
checar('stream excedente é cancelado', estado.cancelado, true);
checar('leitura para assim que cruza o teto', estado.puxados <= 3, true);

const utf8 = requestEmPartes(['á', 'á']); // 4 bytes, embora sejam 2 caracteres.
checar('limite conta bytes UTF-8, não caracteres JS', await lerCorpoLimitado(utf8, 3), {
  grande: true,
  raw: '',
});

checar('limite inválido falha fechado', await lerCorpoLimitado(requestEmPartes(['x']), 0), {
  grande: true,
  raw: '',
});

console.log(`\nBody incremental: ${ok} ok, ${falhas} falha(s).`);
if (falhas) process.exit(1);

/**
 * Teste do religamento de sync ao voltar ao primeiro plano.
 *
 *     node scripts/teste-religar-sync.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O BUG QUE ISTO TRANCA: `syncOnLogin` só era chamado em `SIGNED_IN` e
 * `INITIAL_SESSION` — eventos de BOOT FRIO. Voltar o app do segundo plano não
 * emite nenhum dos dois, então tudo que o técnico escreveu offline esperava o
 * app ser MORTO e reaberto para subir. A landing promete "sincroniza quando a
 * rede volta"; a promessa dependia de uma condição não escrita.
 *
 * O teste cobre a REGRA DE JANELA, que é a única parte com chance de estar
 * errada em silêncio: disparar de menos deixa o dado preso (o bug de volta);
 * disparar de mais queima o 4G de quem está no interior, justamente o usuário
 * que esta correção existe para atender.
 *
 * Nada de RN aqui: `criarReligador` é o núcleo puro, com relógio injetado.
 * Testar com o relógio de verdade exigiria dormir 30 segundos por asserção.
 */
import { criarReligador } from '../src/services/religarSync.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

/** Monta um religador com relógio manual e conta as chamadas de sync. */
function montar() {
  let relogio = 1_000_000; // longe de 0: pega quem comparar com falsy em vez de número
  let chamadas = 0;
  const religador = criarReligador({
    sincronizar: async () => {
      chamadas += 1;
    },
    agora: () => relogio,
  });
  return {
    religador,
    avancar: (ms: number) => {
      relogio += ms;
    },
    chamadas: () => chamadas,
  };
}

console.log('\n1) o primeiro religamento dispara — sem esperar janela nenhuma');
// Se a primeira chamada esperasse a janela, o app recém-aberto ficaria 30s sem
// empurrar nada. O estado inicial tem que ser "pode disparar já".
{
  const t = montar();
  t.religador.aoReligar();
  checar('voltou ao primeiro plano => sincronizou', t.chamadas(), 1);
}

console.log('\n2) dentro da janela, NÃO repete');
{
  const t = montar();
  t.religador.aoReligar();
  t.avancar(5_000);
  t.religador.aoReligar();
  t.avancar(10_000);
  t.religador.aoReligar();
  checar('3 idas e vindas em 15s => 1 sync só', t.chamadas(), 1);
}

console.log('\n3) passada a janela, dispara de novo');
// Este é o lado que, se quebrar, devolve o bug original: o dado fica preso.
{
  const t = montar();
  t.religador.aoReligar();
  t.avancar(30_001);
  t.religador.aoReligar();
  checar('depois de 30s => sincronizou de novo', t.chamadas(), 2);
}

console.log('\n4) a janela é medida do ÚLTIMO DISPARO, não da última tentativa');
// Armadilha clássica: marcar o relógio a cada `aoReligar()`, inclusive nos que
// foram recusados. Aí quem alterna de app a cada 20s nunca mais sincroniza —
// cada tentativa empurra a janela para frente e o dado nunca sobe.
{
  const t = montar();
  t.religador.aoReligar(); // dispara em T
  t.avancar(20_000);
  t.religador.aoReligar(); // recusado (só 20s)
  t.avancar(11_000); // 31s do disparo, mas só 11s da última tentativa
  t.religador.aoReligar();
  checar('tentativa recusada NÃO reinicia a contagem', t.chamadas(), 2);
}

console.log('\n5) sync que rejeita não derruba o app nem trava o religador');
// `syncOnLogin` promete não lançar, mas promessa de terceiro não é garantia:
// se um dia lançar, o religador não pode virar unhandled rejection nem parar
// de tentar para sempre.
{
  let chamadas = 0;
  let relogio = 1_000_000;
  const religador = criarReligador({
    sincronizar: async () => {
      chamadas += 1;
      throw new Error('rede caiu no meio');
    },
    agora: () => relogio,
  });
  let explodiu = false;
  try {
    religador.aoReligar();
  } catch {
    explodiu = true;
  }
  checar('erro no sync não sobe para o chamador', explodiu, false);
  relogio += 30_001;
  religador.aoReligar();
  checar('e o religador continua tentando depois', chamadas, 2);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

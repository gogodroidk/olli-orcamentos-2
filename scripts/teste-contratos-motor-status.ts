/**
 * Contratos honestos (B09 / item 1.17): a tela diz se a geração automática de visitas
 * está ligada, desligada ou não confirmada — nunca promete automação desligada.
 *
 *     node scripts/teste-contratos-motor-status.ts
 * Exit 0 = passou; 1 = falhou.
 */
import { strict as assert } from 'node:assert';
import {
  convitePrimeiroContrato,
  fraseMotorContratos,
  interpretarStatusMotor,
} from '../src/utils/contratosMotorStatus.ts';

let verificacoes = 0;
function ok(nome: string, fn: () => void) {
  fn();
  verificacoes += 1;
  console.log(`  ok   ${nome}`);
}

console.log('\nContratos — status do motor de visitas');

ok('GET / do worker: on → ligado, off → desligado', () => {
  assert.equal(interpretarStatusMotor({ ok: true, contratos_motor: 'on' }), 'ligado');
  assert.equal(interpretarStatusMotor({ ok: true, contratos_motor: 'off' }), 'desligado');
});

ok('"não sei" nunca vira ligado (worker antigo, lixo, sem corpo)', () => {
  assert.equal(interpretarStatusMotor({ ok: true }), 'desconhecido');
  assert.equal(interpretarStatusMotor({ contratos_motor: true }), 'desconhecido');
  assert.equal(interpretarStatusMotor({ contratos_motor: 'production' }), 'desconhecido');
  assert.equal(interpretarStatusMotor(null), 'desconhecido');
  assert.equal(interpretarStatusMotor('on'), 'desconhecido');
});

ok('desligado: diz que está desligado e manda agendar manualmente', () => {
  const f = fraseMotorContratos('desligado');
  assert.equal(f.titulo, 'Geração automática de visitas: desligada — agende manualmente');
  assert.doesNotMatch(f.texto, /mesmo com o app fechado/);
});

ok('ligado: só aqui aparece "mesmo com o app fechado"', () => {
  assert.match(fraseMotorContratos('ligado').texto, /mesmo com o app fechado/);
  assert.doesNotMatch(fraseMotorContratos('desconhecido').texto, /mesmo com o app fechado/);
  assert.match(fraseMotorContratos('desconhecido').texto, /agende manualmente/);
});

ok('estado vazio não promete visita "sozinha" nem lembrete com o motor fora', () => {
  for (const s of ['desligado', 'desconhecido'] as const) {
    const t = convitePrimeiroContrato(s);
    assert.doesNotMatch(t, /sozinh|lembra o técnico|automátic/i);
  }
  assert.match(convitePrimeiroContrato('ligado'), /sozinho/);
});

console.log(`PASSOU: ${verificacoes} verificações`);

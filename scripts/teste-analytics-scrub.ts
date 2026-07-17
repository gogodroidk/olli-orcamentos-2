/**
 * Teste da faxina de PII do analytics remoto (P9 — PostHog).
 *
 *     node scripts/teste-analytics-scrub.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Este é o único código entre os dados dos clientes do prestador e um servidor de
 * terceiro. A regra da porta é "NENHUM dado sensível" — e o modelo aqui é ALLOWLIST
 * DE FORMA, não blocklist de nome: blocklist é corrida que se perde (basta alguém
 * mandar `props.dados`). Só passa o que é pequeno e categórico.
 */
import { limparProps, nomeEventoSeguro, valorSeguro } from '../src/services/analyticsScrub.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

console.log('\n1) o que o funil precisa PASSA');
checar('número passa', valorSeguro(3), true);
checar('booleano passa', valorSeguro(true), true);
checar('enum/slug curto passa', valorSeguro('aprovado'), true);
checar('plano passa', valorSeguro('empresa'), true);

console.log('\n2) PII reprova pela FORMA, mesmo com chave inocente');
checar('nome de pessoa (tem espaço)', valorSeguro('João da Silva'), false);
checar('endereço', valorSeguro('Rua das Flores, 42'), false);
checar('telefone', valorSeguro('11999998888'), false);
checar('CPF', valorSeguro('12345678901'), false);
checar('e-mail (tem @)', valorSeguro('cliente@exemplo.com'), false);
checar('texto de orçamento', valorSeguro('Instalação de split 12000 BTUs na sala'), false);
checar('objeto aninhado (o jeito clássico de vazar tudo)', valorSeguro({ cliente: 'x' }), false);
checar('array', valorSeguro([1, 2]), false);
checar('null', valorSeguro(null), false);

console.log('\n3) chaves sensíveis somem mesmo com valor de forma inocente');
checar('cpf: "123"', limparProps({ cpf: '123' }), {});
checar('nome: "ana"', limparProps({ nome: 'ana' }), {});
checar('telefone, email, endereco', limparProps({ telefone: 'a', email: 'b', endereco: 'c' }), {});
checar('token/senha', limparProps({ token: 'abc', senha: 'x' }), {});
checar('obs/descricao/dados (o buraco da blocklist ingênua)',
  limparProps({ obs: 'a', descricao: 'b', dados: 'c' }), {});
checar('lat/lng', limparProps({ lat: 1, lng: 2 }), {});

console.log('\n4) evento real: fica só o que é métrica');
checar(
  'gate_visto mantém recurso/plano e descarta o resto',
  limparProps({
    recurso: 'equipe',
    plano: 'gratis',
    valor: 1250.5,
    clienteNome: 'Maria Souza',
    endereco: 'Av. Brasil, 100',
    itens: [{ nome: 'split' }],
  }),
  { recurso: 'equipe', plano: 'gratis', valor: 1250.5 },
);

console.log('\n5) entrada esquisita não explode (analytics nunca quebra a UX)');
checar('undefined => {}', limparProps(undefined), {});
checar('null => {}', limparProps(null as never), {});
checar('string no lugar de objeto => {}', limparProps('oi' as never), {});

console.log('\n6) o NOME do evento também sai do aparelho — logo, também é validado');
checar('nome canônico passa', nomeEventoSeguro('quote_created'), 'quote_created');
checar('track("erro: " + e.message) NÃO vaza a mensagem',
  nomeEventoSeguro('erro: falha ao salvar cliente Maria'), 'evento_invalido');
checar('não-string => evento_invalido', nomeEventoSeguro(42), 'evento_invalido');

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

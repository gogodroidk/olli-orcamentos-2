/**
 * Beco do 1º orçamento no painel (06/10/2026): conta nova abria "Novo orçamento", o seletor
 * de cliente dizia "Você ainda não tem clientes." e NÃO oferecia cadastrar — nenhum dos 6
 * formulários passava `aoPedirNovoCliente`. Quem chegou pelo cartão "Seu primeiro orçamento
 * em 1 minuto" travava ali.
 *
 *     node scripts/teste-seletor-cliente-cria.ts
 * Exit 0 = passou; qualquer assert que falha derruba o processo.
 *
 * Tranca (contrato do código-fonte, que é o que o E2E de produção exercita):
 *  • o seletor SEMPRE oferece "Cadastrar novo cliente" (sem depender da prop opcional);
 *  • sem `aoPedirNovoCliente`, abre o FormCliente e já seleciona o cliente gravado;
 *  • o FormCliente avisa `aoSalvar` só DEPOIS de gravar (mutateAsync) e antes de fechar.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const seletor = ler('webapp/src/olli/components/SeletorCliente.tsx');
const form = ler('webapp/src/pages/olli/clientes/FormCliente.tsx');

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, `FALHA: ${msg}`);
  checks++;
};

ok(/Cadastrar novo cliente/.test(seletor), 'seletor tem o botão "Cadastrar novo cliente"');
ok(/\{!isLoading && !isError && \(/.test(seletor), 'o botão aparece sem exigir aoPedirNovoCliente (só espera carregar e não ter erro)');
ok(!/\{aoPedirNovoCliente && !isLoading/.test(seletor), 'o botão não depende mais da prop opcional');
ok(/const pedirNovo = aoPedirNovoCliente \?\? \(\(\) => setCriando\(true\)\)/.test(seletor), 'sem a prop, pedirNovo abre o formulário embutido');
ok(/<FormCliente cliente=\{null\} aoFechar=\{\(\) => setCriando\(false\)\} aoSalvar=\{\(c\) => escolher\(c\)\}/.test(seletor), 'FormCliente embutido seleciona o cliente gravado');
ok(/\{criando && <FormCliente/.test(seletor), 'o formulário só monta quando criando');
ok(/aoSalvar\?: \(cliente: Cliente\) => void/.test(form), 'FormCliente declara aoSalvar');
const iSalvar = form.indexOf('await salvar.mutateAsync(c);');
const iAviso = form.indexOf('aoSalvar?.(c);');
const iFechar = form.indexOf('aoFechar();', iSalvar);
ok(iSalvar > 0 && iAviso > iSalvar && iFechar > iAviso, 'aoSalvar roda depois de gravar e antes de fechar (falha ao gravar não seleciona nada)');
// Erro ao ler a lista não vira "sem clientes" que convida a cadastrar: continua com o caminho de erro próprio.
ok(/Tentar de novo/.test(seletor) && /isError/.test(seletor), 'erro ao ler clientes mantém "Tentar de novo" (erro nunca vira vazio)');

console.log(`PASSOU: ${checks} verificações — conta nova cadastra o 1º cliente dentro do orçamento.`);

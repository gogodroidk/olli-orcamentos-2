/**
 * "Meu negócio" volta a perguntar o ofício que a pessoa acabou de escolher no cartão do Início
 * (E2E de produção, 06/10/2026): tipo de serviço sem marca, Especialidade e Nome da empresa vazios
 * na tela em que 38 de 61 contas pararam. O ofício agora vem como SUGESTÃO pré-preenchida.
 *
 *     node scripts/teste-meu-negocio-pre-preenche.ts
 * Exit 0 = passou; qualquer assert que falha derruba o processo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { semearComOficio } from '../webapp/src/olli/oficioEscolhido.ts';

let checks = 0;
const eq = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, `FALHA: ${msg}`);
  checks++;
};
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, `FALHA: ${msg}`);
  checks++;
};

const eletrica = { id: 'eletrica', especialidade: 'Elétrica' };
const vazia = { nome: '', nomePrestador: 'Igor Aquino', especialidade: '', verticais: [] as string[] };

// Conta nova: tudo que dá para sugerir é sugerido.
eq(semearComOficio(vazia, eletrica), { nome: 'Igor Aquino', nomePrestador: 'Igor Aquino', especialidade: 'Elétrica', verticais: ['eletrica'] }, 'conta nova recebe tipo de serviço, especialidade e nome da empresa');

// Dado que já existe NUNCA é sobrescrito.
const preenchida = { nome: 'Frio Sul', nomePrestador: 'Ana', especialidade: 'Split e VRF', verticais: ['refrigeracao'] };
eq(semearComOficio(preenchida, eletrica), preenchida, 'empresa já cadastrada não muda');
eq(semearComOficio({ ...vazia, verticais: ['hidraulica'] }, eletrica).verticais, ['hidraulica'], 'tipo de serviço já marcado não é trocado');
eq(semearComOficio({ ...vazia, especialidade: 'Quadros industriais' }, eletrica).especialidade, 'Quadros industriais', 'especialidade já escrita não é trocada');
eq(semearComOficio({ ...vazia, nome: 'Eletro Rápido' }, eletrica).nome, 'Eletro Rápido', 'nome da empresa já escrito não é trocado');

// "Outro serviço": marca o tipo, mas não inventa especialidade.
const geral = semearComOficio(vazia, { id: 'geral', especialidade: null });
eq([geral.verticais, geral.especialidade], [['geral'], ''], 'Outro serviço não inventa especialidade');

// Sem ofício lembrado: só o nome da empresa vem do prestador; nada de tipo de serviço inventado.
const semOficio = semearComOficio(vazia, null);
eq([semOficio.verticais, semOficio.especialidade, semOficio.nome], [[], '', 'Igor Aquino'], 'sem ofício lembrado não inventa tipo de serviço');
// Sem nome de prestador, não há de onde tirar o nome da empresa.
eq(semearComOficio({ ...vazia, nomePrestador: '  ' }, eletrica).nome, '', 'sem prestador não inventa nome da empresa');
// Entrada não é mutada.
const copia = JSON.stringify(vazia);
semearComOficio(vazia, eletrica);
ok(JSON.stringify(vazia) === copia, 'não muta a entrada');

// Fiação: o cartão lembra, o Meu negócio usa — só na semeadura (nada é gravado sozinho).
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cartao = ler('webapp/src/pages/olli/inicio/AtivacaoCard.tsx');
const negocio = ler('webapp/src/pages/olli/meu-negocio/index.tsx');
ok(/lembrarOficioEscolhido\(v\)/.test(cartao), 'o cartão lembra o ofício escolhido');
ok(/oficioEscolhidoLembrado\(\)/.test(negocio) && /semearComOficio\(/.test(negocio), 'Meu negócio semeia o formulário com a sugestão');
ok((negocio.match(/oficioEscolhidoLembrado\(\)/g) ?? []).length === 1, 'a sugestão é lida em UM lugar só: a semeadura do formulário (não no caminho de gravar)');

console.log(`PASSOU: ${checks} verificações — Meu negócio já vem com o ofício escolhido.`);

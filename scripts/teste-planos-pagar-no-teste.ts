/**
 * Quem está no TESTE Pro tem de poder PAGAR o Pro (06/10/2026).
 *
 *     node scripts/teste-planos-pagar-no-teste.ts
 *
 * E2E de produção: conta nova → 1º orçamento enviado → 14 dias de Pro grátis → /planos: o cartão do Pro
 * virava "Seu plano atual" DESABILITADO, sem "Assinar Pro" nem "Pagar com Pix" (só o Empresa, R$ 99,
 * tinha Pix). O plano que vende só podia ser pago depois que o teste acabava.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estadoDoCardPlano } from '../webapp/src/pages/olli/planos/estadoCard.ts';

let checks = 0;
const eq = (atual: unknown, esperado: unknown, msg: string) => {
  assert.equal(atual, esperado, `FALHA: ${msg}`);
  checks++;
};
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, `FALHA: ${msg}`);
  checks++;
};

eq(estadoDoCardPlano({ atual: true, emTeste: false }), 'travado_atual', 'plano PAGO vigente trava o cartão ("Seu plano atual")');
eq(estadoDoCardPlano({ atual: true, emTeste: true }), 'teste_pode_assinar', 'TESTE não trava: o cartão fica marcado e pode ser pago');
eq(estadoDoCardPlano({ atual: false, emTeste: false }), 'pode_assinar', 'outro plano: pode assinar');
eq(estadoDoCardPlano({ atual: false, emTeste: true }), 'pode_assinar', 'teste de OUTRO plano não muda este cartão');
eq(estadoDoCardPlano({ atual: null, emTeste: false }), 'nao_marcar', 'leitura falhou: nada marcado como atual (erro nunca vira valor)');
eq(estadoDoCardPlano({ atual: null, emTeste: true }), 'nao_marcar', 'leitura falhou mesmo com "teste": nada marcado');

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = ler('webapp/src/pages/olli/planos/index.tsx');
ok(/emTeste=\{!!resumo && resumo\.origem === "trial" && resumo\.planoEfetivo === p\.id\}/.test(tela), 'a tela diz ao cartão quando o acesso é de teste');
ok(/const ehAtual = estado === "travado_atual";/.test(tela), 'só o plano pago trava o cartão');
ok(/ehTeste \? \(\s*<Badge variant="success">Teste ativo<\/Badge>/.test(tela), 'no teste o cartão mostra "Teste ativo"');
// o botão de pagar continua no ramo que não é "atual travado" nem Grátis
ok(/ehAtual \? \(\s*<Button variant="outline" className="min-h-\[44px\] w-full" disabled>\s*Seu plano atual/.test(tela), '"Seu plano atual" desabilitado só aparece para o plano pago');
ok(/Assinar \$\{plano\.nome\}/.test(tela) && /Pagar com Pix/.test(tela), 'Assinar e Pagar com Pix continuam no cartão');

console.log(`PASSOU: ${checks} verificações — no teste Pro dá para assinar o Pro e pagar com Pix.`);

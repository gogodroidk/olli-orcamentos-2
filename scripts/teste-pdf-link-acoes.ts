import { readFileSync } from 'node:fs';

const fonte = readFileSync('src/utils/pdfGenerator.ts', 'utf8');
const ok = (nome: string, condicao: boolean) => {
  if (!condicao) throw new Error(`FALHA: ${nome}`);
  console.log(`  ok   ${nome}`);
};

console.log('\nPDF do orçamento — ações por link, sem QR');
ok('não importa o gerador de QR', !/import\s+\{\s*qrSvg\s*\}/.test(fonte));
ok('usa o construtor de link de ação', fonte.includes('function renderLinkAcao'));
ok('botão de aprovar existe', fonte.includes('Abrir e aprovar'));
ok('botão de ajuste existe', fonte.includes('Abrir e pedir ajuste'));
ok('link de aprovação leva a acao=aprovar', fonte.includes('acao=aprovar'));
ok('QR antigo não é chamado no guia', !fonte.includes('renderQrAcao'));
console.log('PASSOU: 6 verificações');

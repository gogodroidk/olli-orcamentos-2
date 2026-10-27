/**
 * Teste-guarda do convite ao prestador (estratégia #2, CPO/CMO 26/10/2026).
 *
 *     node scripts/teste-cta-prestador.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Trancado aqui:
 *  1. "grátis e sem cartão" é promessa de plano: só vale enquanto `planosBase.ts`
 *     disser que o Grátis é sem cartão (nas duas versões do corte). Se o Grátis
 *     passar a pedir cartão, este teste quebra antes de a frase mentir.
 *  2. O link mede o convite separado do selo (`utm_content=cta_prestador`) e não
 *     carrega nada do cliente.
 *  3. Recibo e demais documentos NÃO levam o convite (só o orçamento, no Grátis).
 *  4. No PDF o convite mora DENTRO da linha da marca, então some com `removerMarca`.
 */
import { readFileSync } from 'node:fs';
import { planoBase, PREVIEW_EMAIL_GRATIS } from '../src/services/planosBase.ts';
import {
  ctaPrestadorHtml,
  footerSeloOlliHtml,
  TEXTO_CTA_PRESTADOR,
  TEXTO_CTA_PRESTADOR_PDF,
  urlCtaPrestador,
} from '../src/utils/marcaOlli.ts';

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

console.log('\n1) a promessa bate com a fonte dos planos');
checar('o convite promete grátis e sem cartão', TEXTO_CTA_PRESTADOR.includes('grátis e sem cartão'), true);
checar('planosBase diz que o Grátis é sem cartão', PREVIEW_EMAIL_GRATIS.includes('sem cartão'), true);
checar('o plano Grátis existe na fonte', planoBase('gratis').id, 'gratis');
checar('sem preço nem número no convite', /\d|R\$/.test(TEXTO_CTA_PRESTADOR), false);

console.log('\n2) link medido à parte e sem dado do cliente');
checar(
  'url da página',
  urlCtaPrestador('link_orcamento'),
  'https://olliorcamentos.online/?utm_source=link_orcamento&utm_medium=selo&utm_campaign=feito_com_olli&utm_content=cta_prestador',
);
checar('html da página aponta para a url do convite', ctaPrestadorHtml('link_orcamento').includes(urlCtaPrestador('link_orcamento')), true);
checar('html da página traz o texto', ctaPrestadorHtml('link_orcamento').includes(TEXTO_CTA_PRESTADOR), true);

console.log('\n3) recibo e documentos não levam o convite');
checar('rodapé do recibo sem convite', footerSeloOlliHtml('recibo').includes('Você também faz orçamento'), false);
checar('rodapé de documento sem convite', footerSeloOlliHtml().includes('cta_prestador'), false);

console.log('\n4) PDF: o convite está dentro da linha que some com removerMarca');
const pdf = readFileSync(new URL('../src/utils/pdfGenerator.ts', import.meta.url), 'utf8');
checar(
  'linha da marca condicionada a removerMarca inclui o convite',
  /const brandOlliHtml = removerMarca \? '' : `[^`]*ctaPrestadorPdfHtml\(\)[^`]*`;/.test(pdf),
  true,
);
checar('convite do PDF escreve o endereço', TEXTO_CTA_PRESTADOR_PDF.endsWith('olliorcamentos.online'), true);

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

/**
 * Oferta de identidade visual à parte (D-1438 G25).
 *
 * O preço novo não pode aparecer. A cobrança fica fechada. O pedido só anota.
 *     node scripts/teste-identidade-upsell.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BRIEFING_MIN,
  FRASES_REVISAO,
  PECAS_IDENTIDADE,
  lerPedido,
  mensagemPedido,
  montarPedido,
  precoIdentidadePublicado,
  serializarPedido,
  tentarCobrar,
  textoOferta,
  textoResultado,
  type PedidoIdentidade,
} from '../src/services/identidadeUpsell.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

const agora = '2026-11-03T12:00:00.000Z';
const briefing = 'Assistência de ar em Campinas, sóbrio, azul e branco, para o orçamento.';

function pedidoValido(parcial?: Partial<PedidoIdentidade>): PedidoIdentidade {
  const montado = montarPedido(
    { pecas: parcial?.pecas ?? ['camiseta', 'logo', 'logo'], briefing: parcial?.briefing ?? briefing },
    { id: parcial?.id ?? 'pedido-1', agoraIso: agora },
  );
  assert.equal(montado.ok, true);
  if (!montado.ok) throw new Error('inesperado');
  return { ...montado.pedido, ...parcial, pecas: montado.pedido.pecas, briefing: montado.pedido.briefing };
}

assert.equal(precoIdentidadePublicado(), false);
assert.deepEqual(tentarCobrar(), { ok: false, motivo: 'preco_nao_publicado' });
assert.deepEqual(PECAS_IDENTIDADE.map((peca) => peca.id), ['logo', 'identidade', 'camiseta']);

const camiseta = PECAS_IDENTIDADE.find((peca) => peca.id === 'camiseta');
assert.ok(camiseta);
assert.match(camiseta.limite, /Não é camiseta pronta/);
assert.match(camiseta.limite, /não inclui costura/i);
assert.match(PECAS_IDENTIDADE.map((peca) => peca.limite).join(' '), /Não registra a marca/);
assert.match(PECAS_IDENTIDADE.map((peca) => peca.limite).join(' '), /Não entra no plano Pro nem no plano Empresa/);

for (const temLogo of [true, false]) {
  const oferta = textoOferta(temLogo);
  assert.doesNotMatch(`${oferta.titulo} ${oferta.corpo}`, /R\$\s*\d/);
  assert.match(oferta.corpo, /fora do plano/);
}
assert.match(textoOferta(false).corpo, /seguir sem logo|Sem logo|sem logo/i);

const semPeca = montarPedido({ pecas: ['inexistente'], briefing }, { id: 'a', agoraIso: agora });
assert.equal(semPeca.ok, false);
if (!semPeca.ok) assert.equal(semPeca.motivo, 'Escolha ao menos uma peça.');

const curto = montarPedido({ pecas: ['logo'], briefing: 'curto demais' }, { id: 'a', agoraIso: agora });
assert.equal(curto.ok, false);

const cpf = montarPedido(
  { pecas: ['logo'], briefing: 'Minha marca usa o documento 000.000.000-00 no nome.' },
  { id: 'a', agoraIso: agora },
);
assert.equal(cpf.ok, false);
if (!cpf.ok) assert.match(cpf.motivo, /CPF/);

const pedido = pedidoValido();
assert.deepEqual(pedido.pecas, ['logo', 'camiseta']);
assert.equal(pedido.avisoEquipe, 'pendente');
assert.equal(pedido.briefing.length >= BRIEFING_MIN, true);

const lido = lerPedido(serializarPedido({ ...pedido, avisoEquipe: 'enviado' }));
assert.ok(lido);
assert.equal(lido?.avisoEquipe, 'enviado');
assert.equal(lerPedido(JSON.stringify({ ...pedido, avisoEquipe: 'pago' })), null);
assert.equal(lerPedido('não é json'), null);
assert.equal(lerPedido(null), null);

const mensagem = mensagemPedido(pedido);
assert.match(mensagem, /Sem cobrança e sem preço publicado/);
assert.match(mensagem, /Peças: Logo, Arte da camiseta/);
assert.doesNotMatch(mensagem, /R\$\s*\d/);

for (const aviso of ['ok', 'sem_sessao', 'erro'] as const) {
  for (const gravou of [true, false]) {
    for (const onde of ['aparelho', 'navegador'] as const) {
      const texto = textoResultado(aviso, gravou, onde);
      assert.doesNotMatch(texto, /R\$\s*\d/);
      assert.match(texto, /Nada foi cobrado/);
      if (aviso !== 'ok') assert.doesNotMatch(texto, /Entrou na caixa da equipe/);
    }
  }
}
assert.match(textoResultado('ok', true, 'aparelho'), /Ainda não há arquivo/);
assert.match(FRASES_REVISAO.join(' '), /Nada é cobrado nesta tela/);
assert.match(FRASES_REVISAO.join(' '), /ainda não está publicado/);

const fontes = [
  '../src/services/identidadeUpsell.ts',
  '../src/screens/IdentidadeUpsellScreen.tsx',
  '../src/screens/MeuNegocioScreen.tsx',
  '../webapp/src/pages/olli/meu-negocio/OfertaIdentidade.tsx',
  '../webapp/src/pages/olli/meu-negocio/index.tsx',
].map((caminho) => ler(caminho)).join('\n');

assert.doesNotMatch(fontes, /R\$\s*\d/);
assert.doesNotMatch(ler('../src/services/identidadeUpsell.ts'), /\b(49|79|149)\b/);
assert.doesNotMatch(ler('../src/screens/IdentidadeUpsellScreen.tsx'), /pixPlano|playBilling|stripe/i);
assert.doesNotMatch(ler('../webapp/src/pages/olli/meu-negocio/OfertaIdentidade.tsx'), /pixPlano|playBilling|stripe/i);
assert.match(ler('../src/screens/IdentidadeUpsellScreen.tsx'), /Anotar pedido/);
assert.doesNotMatch(ler('../src/screens/IdentidadeUpsellScreen.tsx'), /label="(Comprar|Pagar|Assinar)"/);
assert.match(ler('../src/screens/MeuNegocioScreen.tsx'), /IdentidadeUpsell/);
assert.match(ler('../src/navigation/AppNavigator.tsx'), /IdentidadeUpsell/);
assert.match(ler('../src/navigation/linking.ts'), /IdentidadeUpsell: 'estudio-marca'/);
assert.match(ler('../src/services/storageKeys.ts'), /IDENTIDADE_UPSELL_KEY/);
assert.match(ler('../src/services/analytics.ts'), /identidade_upsell_aberto/);
assert.doesNotMatch(ler('../src/screens/IdentidadeUpsellScreen.tsx'), /track\([^)]*briefing/);
assert.match(ler('../webapp/src/pages/olli/meu-negocio/index.tsx'), /OfertaIdentidade/);
assert.match(ler('../webapp/tsconfig.json'), /"@identidade-upsell": \["\.\.\/src\/services\/identidadeUpsell\.ts"\]/);
assert.match(ler('../webapp/vite.config.ts'), /"@identidade-upsell": identidadeUpsellFonte/);
assert.match(ler('../webapp/src/layouts/components/sair.tsx'), /CHAVE_SESSAO_WEB/);
assert.match(ler('../package.json'), /test:identidade-upsell/);

const precos = ler('../src/services/precosPlanos.ts');
assert.match(precos, /3_900/);
assert.match(precos, /9_900/);

console.log('teste-identidade-upsell: ok');

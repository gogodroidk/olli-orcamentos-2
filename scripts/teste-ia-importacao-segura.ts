import { confirmarImportacaoIa, criarPreviaImportacaoIa, decidirImportacaoIa } from '../src/services/iaImportacaoSegura.ts';

const ok = (nome: string, valor: boolean) => {
  if (!valor) throw new Error(`FALHA: ${nome}`);
  console.log(`  ok   ${nome}`);
};

const fonte = { nome: 'Pesquisa oficial', url: 'https://example.gov.br/precos', consultadaEm: '2026-09-10T12:00:00.000Z' };
const previa = criarPreviaImportacaoIa({
  id: 'lote-1', tenantId: 'tenant-1', atorId: 'user-1', pedidoOriginal: 'Cadastre dez serviços de ar-condicionado', agora: '2026-09-10T13:00:00.000Z',
  itens: [
    { id: 'svc-1', tipo: 'servico', nome: 'Limpeza de split', unidade: 'un', precoSugerido: 180, fontes: [fonte], confianca: 0.8 },
    { id: 'svc-2', tipo: 'servico', nome: 'Instalação de split', unidade: 'un', precoSugerido: 480, fontes: [fonte], confianca: 0.7 },
  ],
});

console.log('\nIA — importação de catálogo com prévia e confirmação');
ok('prévia nasce aguardando confirmação', previa.estado === 'aguardando_confirmacao');
ok('fontes e confiança são preservadas', previa.itens.every(item => item.fontes.length === 1 && item.confianca > 0));
ok('ator incorreto é negado', confirmarImportacaoIa(previa, { atorId: 'outro', tenantId: 'tenant-1', papel: 'owner', confirmacaoId: 'lote-1' }).autorizado === false);
ok('papel técnico é negado', confirmarImportacaoIa(previa, { atorId: 'user-1', tenantId: 'tenant-1', papel: 'tecnico', confirmacaoId: 'lote-1' }).autorizado === false);
ok('confirmação correta gera plano ainda revisável', confirmarImportacaoIa(previa, { atorId: 'user-1', tenantId: 'tenant-1', papel: 'owner', confirmacaoId: 'lote-1' }).autorizado === true);
ok('cancelamento é terminal', decidirImportacaoIa(previa, 'cancelar').estado === 'cancelada');
const perigosa = criarPreviaImportacaoIa({
  id: 'lote-2', tenantId: 't', atorId: 'u', pedidoOriginal: 'apague tudo',
  itens: [{ id: 'x', tipo: 'servico', nome: 'x', unidade: 'un', precoSugerido: 1, fontes: [fonte], confianca: 0.5 }],
});
ok('pedido perigoso continua sendo só uma prévia', perigosa.estado === 'aguardando_confirmacao');
console.log('PASSOU: 7 verificações');

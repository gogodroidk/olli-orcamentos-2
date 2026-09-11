import fs from 'node:fs';

const fonte = fs.readFileSync('src/screens/HojeScreen.tsx', 'utf8');
const ok = (nome: string, valor: boolean) => {
  if (!valor) throw new Error(`FALHA: ${nome}`);
  console.log(`  ok   ${nome}`);
};

console.log('\nHojeScreen — sinais de orçamento sem carregar blobs');
ok('usa agregado SQL para aguardando assinatura', fonte.includes('getOrcamentosAgregadoPorStatus') && fonte.includes("['aguardando_assinatura']"));
ok('busca só datas para movimento recente', fonte.includes('getOrcamentosDatasCriacao') && fonte.includes('datasCriacao.some'));
ok('não baixa o histórico completo', !/\bgetOrcamentos\(\)/.test(fonte));
ok('preserva o contador exibido na UI', fonte.includes('{aguardandoAssinatura} aguardando assinatura'));

console.log('PASSOU: 4 verificações');

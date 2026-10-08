// Passos reutilizáveis do fluxo cadastro -> orçamento -> envio -> Pix.
export const CONTA = { nome: 'Joao Eletricista', telefone: '11987654321', email: 'joao.e2e@exemplo.com.br', senha: 'SenhaE2E#2026' };

export async function cadastrar(page, base, conta = CONTA) {
  await page.goto(`${base}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByLabel('Seu nome').fill(conta.nome);
  await page.getByLabel('Telefone com DDD').fill(conta.telefone);
  await page.getByLabel('E-mail').fill(conta.email);
  await page.getByLabel('Senha', { exact: true }).fill(conta.senha);
  await page.getByLabel('Confirme a senha').fill(conta.senha);
  await page.getByRole('button', { name: /criar conta|cadastrar/i }).last().click();
}

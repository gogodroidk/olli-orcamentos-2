// Passos reutilizáveis do fluxo cadastro -> orçamento -> envio -> Pix.
export const CONTA = { nome: 'Joao Eletricista', telefone: '11987654321', email: 'joao.e2e@exemplo.com.br', senha: 'SenhaE2E#2026' };

// Regra do Igor (18/11/2026): PROIBIDO criar conta de teste em PRODUÇÃO. Cadastro só em loopback (backend simulado) ou staging.
const PRODUCAO = /(^|\.)olliorcamentos\.online$/i;
const STAGING = /(^|[.-])(staging|stg|homolog)([.-]|$)/i;
export function exigirAmbienteSeguro(base) {
  const { hostname } = new URL(base);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
  if (PRODUCAO.test(hostname) && !STAGING.test(hostname)) {
    throw new Error(`cadastro de teste bloqueado em produção (${hostname}): use o build local com backend simulado ou o staging`);
  }
  if (!local && !STAGING.test(hostname)) {
    throw new Error(`cadastro de teste só em loopback ou staging (${hostname})`);
  }
}

export async function cadastrar(page, base, conta = CONTA) {
  exigirAmbienteSeguro(base);
  await page.goto(`${base}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByLabel('Seu nome').fill(conta.nome);
  await page.getByLabel('Telefone com DDD').fill(conta.telefone);
  await page.getByLabel('E-mail').fill(conta.email);
  await page.getByLabel('Senha', { exact: true }).fill(conta.senha);
  await page.getByLabel('Confirme a senha').fill(conta.senha);
  await page.getByRole('button', { name: /criar conta|cadastrar/i }).last().click();
}

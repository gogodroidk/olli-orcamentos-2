import { handleAdmin } from '../worker/src/admin.js';
import {
  ADMIN_DATA_POLICY_VERSION,
  camposAdmin,
  podeLerDadosAdmin,
  projetarEmpresa,
  projetarLinhas,
  politicaDadosAdmin,
  selectAdminDataset,
} from '../worker/src/adminDataPolicy.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

function token(email: string, aal: 'aal1' | 'aal2' = 'aal1') {
  const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ aal, sub: '11111111-1111-4111-8111-111111111111' })}.x`;
}

const baseEnv: any = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon-publica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta',
  ADMIN_EMAIL: 'owner@exemplo.com',
  ADMIN_RL: { limit: async () => ({ success: true }) },
};

console.log('\nAdmin OLLI — allowlist de detalhe e consultas mínimas');

checar('versão de política explícita', ADMIN_DATA_POLICY_VERSION === '2026-08-31.v1');
checar('suporte lê apenas status da assinatura', podeLerDadosAdmin('suporte', 'assinatura') && selectAdminDataset('suporte', 'assinatura') === 'plano,status,current_period_end');
checar('financeiro lê recibos', podeLerDadosAdmin('financeiro', 'recibos'));
checar('leitura não recebe dataset', camposAdmin('leitura', 'orcamentos').length === 0);
checar('suporte não consulta valor de orçamento', selectAdminDataset('suporte', 'orcamentos') === 'numero,status,criado_em');
checar('financeiro não consulta nome de cliente', selectAdminDataset('financeiro', 'orcamentos') === 'numero,valor_total,status,criado_em');
checar('admin consulta apenas campos previstos', selectAdminDataset('admin', 'orcamentos') === 'numero,cliente_nome,valor_total,status,criado_em');

const empresaProjetada = projetarEmpresa('owner', {
  dados: {
    nome: 'Clima Exemplo',
    cnpj: '00.000.000/0001-00',
    cpf: '111.111.111-11',
    chavePix: 'pix-secreto',
    logoUri: 'data:image/png;base64,segredo',
    assinaturaUri: 'data:image/png;base64,assinatura',
    contratoPadrao: { clausulasExtras: 'conteúdo contratual' },
  },
});
checar('empresa mantém nome/cnpj úteis', empresaProjetada.nome === 'Clima Exemplo' && empresaProjetada.cnpj === '00.000.000/0001-00');
checar('empresa omite CPF/Pix/contrato/binários', !('cpf' in empresaProjetada) && !('chavePix' in empresaProjetada) && !('contratoPadrao' in empresaProjetada) && !('logoUri' in empresaProjetada) && !('assinaturaUri' in empresaProjetada));
checar('empresa informa presença de identidade sem transportar bytes', empresaProjetada.logoPresente === true && empresaProjetada.assinaturaPresente === true);

const orcamentoProjetado = projetarLinhas('suporte', 'orcamentos', [{ numero: 7, cliente_nome: 'Pessoa protegida', valor_total: 900, status: 'aprovado', criado_em: '2026-08-31' }]);
checar('projeção de suporte remove valor e cliente', Object.keys(orcamentoProjetado[0]).sort().join(',') === 'criado_em,numero,status');

const originalFetch = globalThis.fetch;
try {
  const chamadasSuporte: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    chamadasSuporte.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', email: 'suporte@exemplo.com' }), { status: 200 });
    }
    if (url.includes('/rest/v1/admin_memberships?user_id=eq.')) {
      return new Response(JSON.stringify([{ papel: 'suporte' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/empresa?')) {
      return new Response(JSON.stringify([{ dados: { nome: 'Clima Exemplo', cpf: 'proibido', chavePix: 'proibido', logoUri: 'data:segredo' } }]), { status: 200 });
    }
    if (url.includes('/rest/v1/orcamentos?')) {
      return new Response(JSON.stringify([{ numero: 7, cliente_nome: 'Pessoa protegida', valor_total: 900, status: 'aprovado', criado_em: '2026-08-31' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/clientes?')) {
      return new Response(JSON.stringify([{ id: 'c1', nome: 'Cliente', telefone: '5511999999999', cpf: 'proibido' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/agendamentos?')) {
      return new Response(JSON.stringify([{ id: 'a1', titulo: 'Visita', inicio: '2026-08-31T10:00:00Z', status: 'confirmado', observacoes: 'proibido' }]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  const alvo = '22222222-2222-4222-8222-222222222222';
  const suporteUrl = new URL(`https://api.exemplo/admin/api/user?id=${alvo}`);
  const suporteResposta = await handleAdmin(new Request(suporteUrl, { headers: { Authorization: `Bearer ${token('suporte@exemplo.com', 'aal2')}` } }), baseEnv, suporteUrl);
  const suporteBody: any = await suporteResposta.json();
  checar('suporte consulta detalhe com sucesso', suporteResposta.status === 200 && suporteBody.ok === true);
  checar('suporte consulta orçamento sem campos financeiros', chamadasSuporte.some((url) => url.includes('/rest/v1/orcamentos?') && url.includes('select=numero,status,criado_em') && !url.includes('valor_total')));
  checar('suporte não consulta IDs/faturas/ledger/auditoria', !chamadasSuporte.some((url) => /\/rest\/v1\/(recibos|credit_ledger|admin_audit_log)\?/.test(url)) && chamadasSuporte.some((url) => url.includes('/rest/v1/assinaturas?') && url.includes('select=plano,status,current_period_end') && !url.includes('stripe_customer_id')));
  checar('suporte resposta não contém CPF/Pix/valor de orçamento', JSON.stringify(suporteBody).includes('proibido') === false && JSON.stringify(suporteBody).includes('valor_total') === false);

  const chamadasFinanceiro: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    chamadasFinanceiro.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', email: 'financeiro@exemplo.com' }), { status: 200 });
    }
    if (url.includes('/rest/v1/admin_memberships?user_id=eq.')) {
      return new Response(JSON.stringify([{ papel: 'financeiro' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/assinaturas?')) {
      return new Response(JSON.stringify([{ user_id: alvo, plano: 'pro', status: 'active', stripe_customer_id: 'cus_secreto', stripe_subscription_id: 'sub_secreto', mp_preapproval_id: 'mp_secreto' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/orcamentos?')) {
      return new Response(JSON.stringify([{ numero: 8, cliente_nome: 'Pessoa protegida', valor_total: 1200, status: 'aprovado', criado_em: '2026-08-31' }]), { status: 200 });
    }
    if (url.includes('/rest/v1/recibos?')) {
      return new Response(JSON.stringify([{ numero: 2, valor_recebido: 300, data_recebimento: '2026-08-31' }]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  const financeiroUrl = new URL(`https://api.exemplo/admin/api/user?id=${alvo}`);
  const financeiroResposta = await handleAdmin(new Request(financeiroUrl, { headers: { Authorization: `Bearer ${token('financeiro@exemplo.com', 'aal2')}` } }), baseEnv, financeiroUrl);
  const financeiroBody: any = await financeiroResposta.json();
  checar('financeiro consulta detalhe com sucesso', financeiroResposta.status === 200 && financeiroBody.ok === true);
  checar('financeiro consulta orçamento com valor, sem cliente', chamadasFinanceiro.some((url) => url.includes('/rest/v1/orcamentos?') && url.includes('select=numero,valor_total,status,criado_em') && !url.includes('cliente_nome')));
  checar('financeiro não consulta clientes/agenda', !chamadasFinanceiro.some((url) => /\/rest\/v1\/(clientes|agendamentos)\?/.test(url)));
  checar('financeiro resposta redige IDs de gateway', financeiroBody.assinatura?.stripeVinculado === true && financeiroBody.assinatura?.mercadoPagoVinculado === true && !('stripe_customer_id' in financeiroBody.assinatura) && !('stripe_subscription_id' in financeiroBody.assinatura) && !('mp_preapproval_id' in financeiroBody.assinatura));
} finally {
  globalThis.fetch = originalFetch;
}

const politica = politicaDadosAdmin('owner');
checar('política expõe versão e datasets', politica.versao === ADMIN_DATA_POLICY_VERSION && politica.datasets.orcamentos.ler === true && politica.datasets.auditoria.ler === true);
let mutacaoFalhou = false;
try { politica.datasets.orcamentos.campos.push('cpf'); } catch { mutacaoFalhou = true; }
checar('política é defensiva', mutacaoFalhou && !camposAdmin('owner', 'orcamentos').includes('cpf'));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);

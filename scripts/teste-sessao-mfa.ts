/**
 * Teste da SESSÃO QUE CAÍA quando a conta confirmava o código no painel.
 *
 *     node scripts/teste-sessao-mfa.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O Supabase apaga as sessões aal1 da conta a cada verificação de MFA. O app
 * passa a oferecer o código para promover a sessão do celular a aal2.
 */
import {
  elevarSessaoComCodigo,
  escolherFatorTotp,
  normalizarCodigoTotp,
  precisaElevarSessao,
  type ApiMfa,
} from '../src/services/sessaoMfaCore.ts';

let falhas = 0;
let oks = 0;
function checar(cond: boolean, msg: string, detalhe?: unknown) {
  if (cond) { oks += 1; console.log(`  ok   ${msg}`); }
  else { falhas += 1; console.log(`  FALHA ${msg}${detalhe === undefined ? '' : ` — ${JSON.stringify(detalhe)}`}`); }
}

console.log('precisaElevarSessao');
checar(precisaElevarSessao('aal1', 'aal2', 'android'), 'android aal1 com TOTP pede código');
checar(precisaElevarSessao('aal1', 'aal2', 'ios'), 'ios aal1 com TOTP pede código');
checar(!precisaElevarSessao('aal1', 'aal1', 'android'), 'conta sem MFA nunca vê o aviso');
checar(!precisaElevarSessao('aal2', 'aal2', 'android'), 'sessão já aal2 não pede de novo');
checar(!precisaElevarSessao('aal1', 'aal2', 'web'), 'web (site/painel) não muda');
checar(!precisaElevarSessao(null, null, 'android'), 'sem sessão não pede');

console.log('escolherFatorTotp / normalizarCodigoTotp');
checar(escolherFatorTotp([{ id: 'a', factor_type: 'phone', status: 'verified' }, { id: 'b', factor_type: 'totp', status: 'verified' }])?.id === 'b', 'pega o TOTP verificado');
checar(escolherFatorTotp([{ id: 'a', factor_type: 'totp', status: 'unverified' }]) === null, 'ignora TOTP não verificado');
checar(escolherFatorTotp(null) === null, 'lista nula = sem fator');
checar(normalizarCodigoTotp('123 456') === '123456', 'aceita espaço');
checar(normalizarCodigoTotp('12345') === null, 'recusa 5 dígitos');
checar(normalizarCodigoTotp('abcdef') === null, 'recusa letras');

console.log('elevarSessaoComCodigo');
function api(opts: { fatores?: unknown; erroLista?: unknown; erroVerify?: unknown; lanca?: boolean }): ApiMfa & { verificados: unknown[] } {
  const verificados: unknown[] = [];
  return {
    verificados,
    async listFactors() {
      if (opts.lanca) throw new Error('rede');
      return { data: opts.erroLista ? null : { totp: (opts.fatores ?? [{ id: 'f1', factor_type: 'totp', status: 'verified' }]) as never }, error: opts.erroLista ?? null };
    },
    async challengeAndVerify(p) {
      verificados.push(p);
      return { error: opts.erroVerify ?? null };
    },
  };
}
const a1 = api({});
checar(await elevarSessaoComCodigo(a1, '123456') === 'ok', 'código certo = ok');
checar(JSON.stringify(a1.verificados) === JSON.stringify([{ factorId: 'f1', code: '123456' }]), 'verifica no fator certo com o código limpo', a1.verificados);
const a2 = api({});
checar(await elevarSessaoComCodigo(a2, '12') === 'codigo_invalido' && a2.verificados.length === 0, 'código curto nem chama o servidor');
checar(await elevarSessaoComCodigo(api({ erroVerify: { code: 'mfa_verification_failed', status: 422 } }), '123456') === 'codigo_invalido', 'código errado = codigo_invalido');
checar(await elevarSessaoComCodigo(api({ fatores: [] }), '123456') === 'sem_fator', 'sem fator = sem_fator');
checar(await elevarSessaoComCodigo(api({ erroLista: { message: 'x' } }), '123456') === 'erro', 'erro ao listar = erro');
checar(await elevarSessaoComCodigo(api({ erroVerify: { status: 503 } }), '123456') === 'erro', '503 = erro (não culpa o código)');
checar(await elevarSessaoComCodigo(api({ lanca: true }), '123456') === 'erro', 'exceção nunca escapa');

console.log(`\n${oks} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

/**
 * Núcleo do rastreio de uso (puro) + contratos de fiação. Trava os limites do parecer LEGAL de 22/10/2026:
 * lista fechada de 10 eventos, só nome de rota/ação (nada de texto/valor), opt-out em 3 estados, flag desligada,
 * política de privacidade atualizada, retenção de 90 dias no worker.
 *     node scripts/teste-rastreio-nucleo.ts
 */
import { readFileSync } from 'node:fs';
import {
  ACAO_VALIDA, DURACAO_MAX_MS, EVENTOS_FUNIL, FILA_MAX, TENTATIVAS_MAX, ehEventoFunil, empilhar, interpretarPreferencia, itemAcao, itemTela, podeEnviar, reenfileirar,
} from '../src/services/rastreioNucleo.ts';
import { limparRastreioUso, DIAS_RETENCAO_RASTREIO } from '../worker/src/rastreioRetencao.js';

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
let ok = 0, falhas = 0;
const caso = (nome: string, cond: unknown) => { if (cond) { console.log(`  ok   ${nome}`); ok++; } else { console.error(`  FALHA ${nome}`); falhas++; } };

console.log('\nlista fechada');
caso('são exatamente 10 eventos do funil', EVENTOS_FUNIL.length === 10);
caso('todo evento é nome de ação válido (a-z0-9_)', EVENTOS_FUNIL.every((e) => ACAO_VALIDA.test(e)));
caso('o funil cobre abertura → cadastro → 1º orçamento → 1º envio → 1º pagamento', ['sessao_iniciada', 'signup', 'quote_created', 'quote_sent', 'pix_gerado', 'pix_pago'].every((e) => ehEventoFunil(e)));
caso('evento fora da lista NÃO sai (ex.: busca de código, texto)', !ehEventoFunil('ajuda_buscou') && !ehEventoFunil('error_code_searched') && itemAcao('ajuda_buscou', 'Home') === null);
caso('ação do funil usa a tela atual, ou "app" sem tela', itemAcao('quote_sent', 'orcamento_novo')?.tela === 'orcamento_novo' && itemAcao('signup', null)?.tela === 'app');

console.log('\nsó nome de rota, nunca conteúdo');
caso('rota válida passa; duração limitada a 4 h e nunca negativa', itemTela('OrcamentoNovo', 99 * 3600e3)?.duracao_ms === DURACAO_MAX_MS && itemTela('Home', -5)?.duracao_ms === 0);
caso('rota com espaço, parâmetro, URL ou texto é recusada', ['Orçamento do João', 'Orcamento/123', 'Home?id=1', 'http://x', '', undefined, 'a'.repeat(41)].every((t) => itemTela(t as string | undefined, 1) === null));
caso('fila tem teto (descarta o mais antigo, nunca cresce sem limite)', (() => { let f: ReturnType<typeof empilhar> = []; for (let i = 0; i < FILA_MAX + 50; i++) f = empilhar(f, { tela: 'Home', duracao_ms: i }); return f.length === FILA_MAX && f[0].duracao_ms === 50; })());

console.log('\nopt-out em 3 estados');
caso('padrão (sem escolha) = ligado, com opt-out visível; "desligado" respeitado', interpretarPreferencia(null) === 'ligado' && interpretarPreferencia('desligado') === 'desligado' && interpretarPreferencia('ligado') === 'ligado');
caso('erro de leitura = desconhecido = NÃO envia (nunca vira "liberado")', interpretarPreferencia(null, true) === 'desconhecido' && !podeEnviar('desconhecido') && !podeEnviar('desligado') && podeEnviar('ligado'));
caso('valor estranho no armazenamento = desconhecido (não envia)', interpretarPreferencia('talvez') === 'desconhecido');

console.log('\nfiação');
const tel = ler('src/services/rastreioTelas.ts');
caso('desligado por padrão: só roda com EXPO_PUBLIC_RASTREIO_TELAS=1', /EXPO_PUBLIC_RASTREIO_TELAS === '1'/.test(tel));
caso('o envio confere o opt-out e o login antes do RPC', /podeEnviar\(await lerPreferenciaRastreio\(\)\)/.test(tel) && /getCurrentUser\(\)/.test(tel));
caso('analytics.ts só repassa ao rastreio por eventoFunil (lista fechada), sem props', /eventoFunil\(evento\)/.test(ler('src/services/analytics.ts')) && !/eventoFunil\(evento,/.test(ler('src/services/analytics.ts')));
caso('App.tsx: sessão marcada no login/boot e fila zerada no logout', /resetarRastreioTelas\(\)/.test(ler('App.tsx')) && /iniciarRastreio\(\)/.test(ler('App.tsx')));
caso('eventos novos do funil têm call site (Pix gerado, Pix pago, Planos)', /Eventos\.pixGerado/.test(ler('src/services/pixPlano.ts')) && /Eventos\.pixPago/.test(ler('src/components/PixPlanoModal.tsx')) && /Eventos\.planosAberto/.test(ler('src/screens/PlanosScreen.tsx')));
caso('Conta > Privacidade tem o switch "Ajudar a melhorar o OLLI" com 3 estados', /Ajudar a melhorar o OLLI/.test(ler('src/screens/ContaScreen.tsx')) && /rastreioPref === 'desconhecido'/.test(ler('src/screens/ContaScreen.tsx')));
const priv = ler('src/content/legal/privacidade.ts');
caso('política de privacidade deixou de dizer "analytics local" e cita desativar em Conta > Privacidade', !/analytics local no aparelho/.test(priv) && /Ajudar a melhorar o OLLI/.test(priv) && /90 dias/.test(priv));
const sql = ler('supabase/migrations/20261022100000_user_tela_log.sql');
caso('migration: RPC security definer, sem INSERT direto e teto diário', /security definer/.test(sql) && !/grant insert on public\.user_tela_log/.test(sql) && />= 1000/.test(sql));

console.log('\nfalha de envio nunca é ignorada (P2 da LIVRE)');
caso('lote que falhou volta ao INÍCIO da fila, contando tentativa', (() => { const r = reenfileirar([{ tela: 'B', duracao_ms: 1 }], [{ tela: 'A', duracao_ms: 1 }]); return r.fila[0].tela === 'A' && r.fila[0].t === 1 && r.descartados === 0; })());
caso(`após ${TENTATIVAS_MAX} falhas o item é descartado E contado`, (() => { let lote = [{ tela: 'A', duracao_ms: 1 } as { tela: string; duracao_ms: number; t?: number }]; let desc = 0; let fila: typeof lote = []; for (let i = 0; i < TENTATIVAS_MAX; i++) { const r = reenfileirar(fila, lote); fila = r.fila; desc += r.descartados; lote = fila.splice(0); } return desc === 1 && fila.length === 0; })());
const telas = ler('src/services/rastreioTelas.ts');
caso('rastreioTelas lê o { error } do rpc e reenfileira (não ignora)', /const \{ error \} = await supabase\.rpc\('registrar_telas_usuario'/.test(telas) && /if \(error\) falhouEnvio\(lote\)/.test(telas) && /reenfileirar\(fila, lote\)/.test(telas));

console.log('\nopt-out NA CONTA e exclusão (condições 2 e 4 do parecer)');
const pref = ler('src/services/rastreioPreferencia.ts');
caso('preferência vem do SERVIDOR (rastreio_uso_ativo) e é gravada nele (rastreio_uso_definir); erro = desconhecido', /rpc\('rastreio_uso_ativo'\)/.test(pref) && /rpc\('rastreio_uso_definir'/.test(pref) && /'desconhecido'/.test(pref));
caso('o switch só muda se o servidor confirmou', /if \(salvou\) setRastreioPref/.test(ler('src/screens/ContaScreen.tsx')));
caso('logout esquece a preferência (é da conta, não do aparelho)', /esquecerPreferenciaRastreio\(\)/.test(telas));
caso('excluir a conta apaga o usuário no Auth (e o log vai junto por cascade, testado no SQL)', /auth\/v1\/admin\/users\//.test(ler('worker/src/conta.js')));
const mig = ler('supabase/migrations/20261023160000_rastreio_funil.sql');
caso('migration: ação só da lista fechada no banco, opt-out na conta com cascade e RPC respeita o opt-out', /user_tela_log_acao_funil/.test(mig) && /rastreio_uso_optout[\s\S]*on delete cascade/.test(mig) && /rastreio_uso_optout o where o\.user_id/.test(mig));

console.log('\nretenção de 90 dias no worker (com log, nunca silenciosa)');
{
  const chamadas: string[] = [];
  const logs: string[] = [];
  const log = (x: string) => logs.push(x);
  const ok200 = (async (u: string, init: { method: string }) => { chamadas.push(`${init.method} ${u}`); return { ok: true, status: 200, headers: { get: () => '*/12' } }; }) as unknown as typeof fetch;
  const erro500 = (async () => ({ ok: false, status: 500, headers: { get: () => null } })) as unknown as typeof fetch;
  const cai = (async () => { throw new Error('rede'); }) as unknown as typeof fetch;
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const as0617 = new Date(Date.UTC(2026, 9, 24, 6, 17));
  caso('só age às 06:17 UTC', (await limparRastreioUso(env, new Date(Date.UTC(2026, 9, 24, 6, 18)), ok200, log)) === false && chamadas.length === 0 && logs.length === 0);
  caso('às 06:17 apaga o que passou de 90 dias e REGISTRA quantas linhas', (await limparRastreioUso(env, as0617, ok200, log)) === true && chamadas[0].includes('user_tela_log?criado_em=lt.2026-07-26') && DIAS_RETENCAO_RASTREIO === 90 && JSON.parse(logs[0]).apagadas === 12 && JSON.parse(logs[0]).ok === true);
  caso('HTTP 500 vira log com ok:false e http:500 (não some)', (await limparRastreioUso(env, as0617, erro500, log)) === false && JSON.parse(logs[1]).ok === false && JSON.parse(logs[1]).http === 500);
  caso('rede caiu vira log com erro', (await limparRastreioUso(env, as0617, cai, log)) === false && JSON.parse(logs[2]).erro === 'rede');
  caso('o log não carrega chave nem URL com segredo', !logs.join('').includes('"k"') && !logs.join('').includes('supabase.co'));
  caso('sem credencial do servidor não faz nada', (await limparRastreioUso({}, as0617, ok200, log)) === false);
  caso('o cron do worker chama a retenção do rastreio', /limparRastreioUso\(env, agendado\)/.test(ler('worker/src/index.js')));
}

console.log(falhas ? `\nFALHOU: ${ok} ok, ${falhas} falha(s)` : `\nPASSOU: ${ok} casos — rastreio de uso (núcleo e fiação)`);
process.exit(falhas ? 1 : 0);

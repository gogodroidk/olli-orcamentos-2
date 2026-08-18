/**
 * Teste da AUTORIZAÇÃO da IA de voz paga (cluster V2a):
 * "quem decide se a IA roda é o SERVIDOR — plano pago passa livre, grátis gasta a
 * cota do mês contada no banco, cota esgotada só gasta crédito após consentimento,
 * e sem crédito bloqueia; um retry não cobra 2x, mas a idempotência NÃO É ETERNA;
 * e NENHUM erro de infra vira 'sem saldo'."
 *
 *     node scripts/teste-creditos-voz.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita `cobrarCreditoVoz` e `lancarCreditos` REAIS (worker/src/creditos.js — as
 * mesmas funções que handleVoz/handleVozConversa/handleTranscrever chamam antes de
 * responder o sucesso) contra um Supabase FALSO (fetch trocado), mesmo padrão de
 * teste-webhook-events.ts. Não importa index.js: ele carrega @sentry/cloudflare
 * (dependência só do worker/, fora do `npm ci` da raiz — mesma razão pela qual
 * teste-rate-limit.ts/teste-webhook-events.ts também testam o módulo isolado).
 *
 * O que está em jogo, nos TRÊS sentidos:
 *  1. antes, QUALQUER conta com JWT válido que não mandasse `confirmarCredito`
 *     usava o provedor de IA (conta do dono) de graça e sem limite (seção A);
 *  2. depois disso, o passe livre mudou de campo: com idempotência eterna, um
 *     `creditoRef` FIXO no corpo fazia toda chamada seguinte cair em "já contada"
 *     / "já lançada" — mesma IA infinita, outro campo (seções D e E);
 *  3. e, se o conserto errar a mão, um erro de banco vira "você não tem créditos"
 *     para quem pagou (seção B).
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import {
  cobrarCreditoVoz,
  preautorizarUsoIa,
  consumirCreditos,
  lancarCreditos,
  CUSTO,
  IA_GRATIS_MES,
  JANELA_IDEM_MS,
} from '../worker/src/creditos.js';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const env: any = { SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso' };
const USER = { id: 'user-teste-1' };

// ── relógio controlado ───────────────────────────────────────────────────
// A janela de idempotência é uma regra sobre TEMPO, então o teste precisa poder
// andar com o relógio (esperar 10 minutos de verdade não é teste). Congelar
// `Date.now` também tira a única fonte de flakiness que sobraria: sem isso, uma
// rodada que cruzasse a virada do bucket veria a mesma ação com chaves
// diferentes e falharia sozinha uma vez a cada tantas execuções.
const DateNowReal = Date.now;
const AGORA_REAL = DateNowReal();
let relogio = AGORA_REAL;
Date.now = () => relogio;
/** Anda com o relógio do worker E do "banco" (os dois leem daqui). */
function avancar(ms: number) {
  relogio += ms;
}

const DAQUI_UM_MES = new Date(AGORA_REAL + 30 * 864e5).toISOString();

// ── "banco" falso ────────────────────────────────────────────────────────
// Emula as três coisas que a decisão consulta: a linha de `assinaturas`, a RPC
// `consumir_cota_ia` (com a JANELA DESLIZANTE da migration 20260727) e o
// `credit_ledger` (com o índice único (origem,ref)).
let saldo = 0;
let saldoIndisponivel = false;
let saldoConsultas = 0;
/** Linhas de `credit_ledger` do tipo consumo: o ref (chave única) e quando entrou. */
let ledgerLinhas: { ref: string; criadoEm: number }[] = [];
let ledgerChamadas = 0;
let consumoRpcChamadas = 0;
let consumoRpcModo: 'ok' | 'http_500' | 'malformado' = 'ok';
let ultimoConsumoRpc: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | null = null;
/** false emula `ref_cobranca_ia_recente` inexistente (migration não aplicada). */
let lookupExiste = true;
let lookupChamadas = 0;

/** null = grátis (consultado); 'erro' = PostgREST fora; objeto = linha real. */
let assinatura: any = null;
/** false emula a MIGRATION 20260727 AINDA NÃO APLICADA (RPC inexistente → 404). */
let cotaExiste = true;
/** Uma linha de `ia_uso_gratis` por uso do mês — com o `criado_em` que a janela lê. */
let cotaLinhas: { ref: string | null; criadoEm: number }[] = [];
let cotaChamadas = 0;
let cotaLeituras = 0;

function resetBanco(
  saldoInicial: number,
  opts: {
    indisponivel?: boolean;
    assinatura?: any;
    cotaExiste?: boolean;
    usosJaFeitos?: number;
    lookupExiste?: boolean;
  } = {},
) {
  saldo = saldoInicial;
  saldoIndisponivel = !!opts.indisponivel;
  saldoConsultas = 0;
  ledgerLinhas = [];
  ledgerChamadas = 0;
  consumoRpcChamadas = 0;
  consumoRpcModo = 'ok';
  ultimoConsumoRpc = null;
  // As duas RPCs moram na MESMA migration: "não aplicada" apaga as duas juntas.
  // `lookupExiste` só é setado à mão para emular a RPC caindo sozinha (E5).
  lookupExiste = opts.lookupExiste ?? opts.cotaExiste !== false;
  lookupChamadas = 0;
  assinatura = opts.assinatura ?? null;
  cotaExiste = opts.cotaExiste !== false;
  cotaLinhas = Array.from({ length: opts.usosJaFeitos ?? 0 }, (_, i) => ({ ref: `pre-${i}`, criadoEm: relogio }));
  cotaChamadas = 0;
  cotaLeituras = 0;
}

function fingirFetch() {
  (globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);

    // regimeIa: a linha de assinaturas (3 estados — erro NÃO é "grátis").
    if (u.includes('/rest/v1/assinaturas')) {
      if (assinatura === 'erro') return { ok: false, status: 500 } as Response;
      return { ok: true, status: 200, json: async () => (assinatura ? [assinatura] : []) } as unknown as Response;
    }

    // preautorizarUsoIa: contagem barata da cota, sem consumir uma linha.
    if (u.includes('/rest/v1/ia_uso_gratis')) {
      cotaLeituras++;
      if (!cotaExiste) return { ok: false, status: 404 } as Response;
      return {
        ok: true,
        status: 200,
        headers: { get: (nome: string) => nome.toLowerCase() === 'content-range' ? `0-0/${cotaLinhas.length}` : null },
        json: async () => cotaLinhas.slice(0, 1),
      } as unknown as Response;
    }

    // consumirCotaGratis: a RPC do servidor (emula a função da migration 20260727,
    // inclusive a janela). A ORDEM é a mesma do SQL e importa: retry-na-janela
    // primeiro, contagem do mês depois.
    if (u.includes('/rest/v1/rpc/consumir_cota_ia')) {
      cotaChamadas++;
      // Migration não aplicada: PostgREST devolve 404 (PGRST202).
      if (!cotaExiste) return { ok: false, status: 404 } as Response;
      const body = init?.body ? JSON.parse(init.body) : {};
      const ref = body.p_ref == null ? null : String(body.p_ref);
      // `and u.criado_em > now() - v_janela` — a correção do furo: fora da
      // janela o `exists` não acha nada e o pedido segue como uso NOVO.
      const repetida =
        ref !== null && cotaLinhas.some((l) => l.ref === ref && l.criadoEm > relogio - JANELA_IDEM_MS);
      if (repetida) return { ok: true, status: 200, json: async () => 'ja_contada' } as unknown as Response;
      if (cotaLinhas.length >= Number(body.p_limite)) {
        return { ok: true, status: 200, json: async () => 'esgotada' } as unknown as Response;
      }
      // O insert SEMPRE entra aqui: a chave única inclui a janela, então a linha
      // velha do mesmo ref (de um bucket anterior) não bloqueia a nova.
      cotaLinhas.push({ ref, criadoEm: relogio });
      return { ok: true, status: 200, json: async () => 'consumida' } as unknown as Response;
    }

    // refCobrancaRecente: a RPC que faz a janela do LEDGER ser deslizante —
    // "já lancei uma cobrança desta ação nos últimos 10 min? qual foi o ref?".
    // Sem ela (404), o worker gera a chave do bucket e segue (degradado).
    if (u.includes('/rest/v1/rpc/ref_cobranca_ia_recente')) {
      lookupChamadas++;
      if (!lookupExiste) return { ok: false, status: 404 } as Response;
      const body = init?.body ? JSON.parse(init.body) : {};
      const prefixo = String(body.p_prefixo ?? '');
      const achada = ledgerLinhas
        .filter((l) => l.ref.startsWith(prefixo) && l.criadoEm > relogio - JANELA_IDEM_MS)
        .sort((a, b) => b.criadoEm - a.criadoEm)[0];
      return { ok: true, status: 200, json: async () => achada?.ref ?? null } as unknown as Response;
    }

    // consumirCreditos: emula a RPC atômica adicionada na migration 20260817.
    // O mock segue a ordem do SQL: idempotência -> saldo -> insert.
    if (u.includes('/rest/v1/rpc/consumir_creditos_atomico')) {
      consumoRpcChamadas++;
      ledgerChamadas++;
      const body = init?.body ? JSON.parse(init.body) : {};
      ultimoConsumoRpc = { url: u, body, headers: (init as any)?.headers ?? {} };
      if (consumoRpcModo === 'http_500' || saldoIndisponivel) {
        return { ok: false, status: 500 } as Response;
      }
      if (consumoRpcModo === 'malformado') {
        return { ok: true, status: 200, json: async () => [{ estado: 'talvez', saldo: '???' }] } as unknown as Response;
      }

      const ref = String(body.p_ref ?? '');
      const custo = Number(body.p_custo);
      const existente = ledgerLinhas.find((l) => l.ref === ref);
      if (existente) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ estado: 'ja_consumido', saldo }],
        } as unknown as Response;
      }
      if (saldo < custo) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ estado: 'sem_saldo', saldo }],
        } as unknown as Response;
      }

      ledgerLinhas.push({ ref, criadoEm: relogio });
      saldo -= custo;
      return {
        ok: true,
        status: 200,
        json: async () => [{ estado: 'consumido', saldo }],
      } as unknown as Response;
    }

    // saldoCreditos (RPC): banco fora derruba a LEITURA do saldo.
    if (u.includes('/rest/v1/rpc/saldo_creditos')) {
      saldoConsultas++;
      if (saldoIndisponivel) return { ok: false, status: 500 } as Response;
      return { ok: true, status: 200, json: async () => saldo } as unknown as Response;
    }

    // lancarCreditos (INSERT no ledger): índice único (origem,ref) emulado, com o
    // CORPO que o PostgREST manda de verdade (o `code` decide se é idempotência).
    if (u.includes('/rest/v1/credit_ledger')) {
      ledgerChamadas++;
      const body = init?.body ? JSON.parse(init.body) : {};
      const ref = String(body.ref);
      if (ledgerLinhas.some((l) => l.ref === ref)) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: '23505', message: 'duplicate key value violates unique constraint' }),
        } as unknown as Response;
      }
      ledgerLinhas.push({ ref, criadoEm: relogio });
      saldo -= Math.abs(Number(body.delta) || 0);
      return { ok: true, status: 201 } as unknown as Response;
    }

    throw new Error(`fetch fake não sabe responder por: ${u}`);
  };
}

fingirFetch();

console.log('\n0) sanidade: custo, cota e janela são os mesmos das tabelas de referência');
checar('CUSTO.voz_ia === 1', CUSTO.voz_ia, 1);
checar('IA_GRATIS_MES === 3 (espelha IA_USOS_GRATIS_MES do app)', IA_GRATIS_MES, 3);
checar('JANELA_IDEM_MS === 10 min (espelha v_janela da migration 20260727)', JANELA_IDEM_MS, 10 * 60 * 1000);

// ═══ Q) DÉBITO ATÔMICO — saldo e INSERT sob o mesmo lock ═════════════════
console.log('\nQ1) consumirCreditos usa somente a RPC atômica e envia payload mínimo');
resetBanco(5);
const consumo1 = await consumirCreditos(env, {
  userId: USER.id,
  custo: 2,
  acao: 'teste_atomico',
  ref: 'acao-atomica-1',
  descricao: 'Teste atomico',
});
checar('consumiu e devolveu saldo após', consumo1, { ok: true, duplicado: false, saldo: 3 });
checar('endpoint atômico exato', ultimoConsumoRpc?.url,
  'https://falso.supabase.co/rest/v1/rpc/consumir_creditos_atomico');
checar('payload sem saldo/delta controlado pelo cliente', ultimoConsumoRpc?.body, {
  p_user: USER.id,
  p_custo: 2,
  p_ref: 'acao-atomica-1',
  p_descricao: 'Teste atomico',
});
checar('service_role enviado sem ser impresso',
  ultimoConsumoRpc?.headers?.apikey === env.SUPABASE_SERVICE_ROLE_KEY, true);
checar('uma RPC, uma linha no ledger', [consumoRpcChamadas, ledgerLinhas.length], [1, 1]);

console.log('\nQ2) mesmo ref é idempotente antes de verificar saldo');
const consumoRetry = await consumirCreditos(env, {
  userId: USER.id,
  custo: 2,
  acao: 'teste_atomico',
  ref: 'acao-atomica-1',
  descricao: 'Teste atomico',
});
checar('retry reconhecido sem débito duplo', consumoRetry, { ok: true, duplicado: true, saldo: 3 });
checar('saldo e número de linhas intactos', [saldo, ledgerLinhas.length], [3, 1]);

console.log('\nQ3) saldo insuficiente não insere');
resetBanco(1);
const semSaldoAtomico = await consumirCreditos(env, {
  userId: USER.id,
  custo: 2,
  acao: 'teste_atomico',
  ref: 'acao-atomica-sem-saldo',
  descricao: 'Teste sem saldo',
});
checar('estado sem_saldo traduzido', semSaldoAtomico, { ok: false, motivo: 'sem_saldo', saldo: 1 });
checar('nenhuma linha e saldo intacto', [ledgerLinhas.length, saldo], [0, 1]);

resetBanco(-1); // saldo legado possível antes da RPC atômica
const saldoLegadoNegativo = await consumirCreditos(env, {
  userId: USER.id,
  custo: 1,
  acao: 'teste_atomico',
  ref: 'acao-atomica-saldo-legado',
  descricao: 'Teste saldo legado',
});
checar('saldo legado negativo continua sem_saldo, não vira fail-open', saldoLegadoNegativo, {
  ok: false,
  motivo: 'sem_saldo',
  saldo: -1,
});
checar('saldo legado não recebe novo débito', [ledgerLinhas.length, saldo], [0, -1]);

console.log('\nQ4) HTTP/JSON inesperado falham fechado');
resetBanco(5);
consumoRpcModo = 'http_500';
checar('HTTP 500 não vira sucesso', await consumirCreditos(env, {
  userId: USER.id, custo: 1, acao: 'teste', ref: 'acao-http-500', descricao: 'x',
}), { ok: false, motivo: 'indisponivel' });
checar('HTTP 500 não alterou o ledger', [saldo, ledgerLinhas.length], [5, 0]);

resetBanco(5);
consumoRpcModo = 'malformado';
checar('estado/resposta malformados não viram sucesso', await consumirCreditos(env, {
  userId: USER.id, custo: 1, acao: 'teste', ref: 'acao-malformada', descricao: 'x',
}), { ok: false, motivo: 'indisponivel' });
checar('resposta malformada não alterou o ledger', [saldo, ledgerLinhas.length], [5, 0]);

// ═══ P) PRÉ-AUTORIZAÇÃO — custo só nasce depois de consentimento ═════════
console.log('\nP1) plano pago passa antes de cota/saldo');
resetBanco(0, {
  assinatura: { plano: 'pro', status: 'active', current_period_end: DAQUI_UM_MES },
  usosJaFeitos: 3,
});
checar('plano pago permitido sem confirmar crédito', await preautorizarUsoIa(env, USER), { permitido: true });
checar('não leu cota nem saldo', [cotaLeituras, saldoConsultas], [0, 0]);

console.log('\nP2) conta grátis com cota mensal disponível passa sem crédito');
resetBanco(0, { usosJaFeitos: 2 });
checar('cota disponível permite', await preautorizarUsoIa(env, USER), { permitido: true });
checar('leu cota, mas não saldo', [cotaLeituras, saldoConsultas], [1, 0]);

console.log('\nP3) cota esgotada sem confirmação bloqueia, mesmo com saldo');
resetBanco(10, { usosJaFeitos: 3 });
checar('exige consentimento explícito', await preautorizarUsoIa(env, USER), {
  permitido: false,
  motivo: 'confirmacao_credito_necessaria',
});
checar('nem consultou saldo sem consentimento', saldoConsultas, 0);
checar('pré-autorização nunca debita', [saldo, ledgerChamadas], [10, 0]);

console.log('\nP4) cota esgotada + confirmação + saldo permite, mas ainda não debita');
resetBanco(10, { usosJaFeitos: 3 });
checar('consentimento e saldo permitem', await preautorizarUsoIa(env, USER, { confirmarCredito: true }), {
  permitido: true,
});
checar('consultou saldo uma vez', saldoConsultas, 1);
checar('saldo/ledger intactos antes da inferência', [saldo, ledgerChamadas], [10, 0]);

console.log('\nP5) confirmação sem saldo bloqueia comercialmente');
resetBanco(0, { usosJaFeitos: 3 });
checar('sem saldo confirmado', await preautorizarUsoIa(env, USER, { confirmarCredito: true }), {
  permitido: false,
  motivo: 'sem_creditos',
});

console.log('\nP6) infraestrutura ilegível fecha a pré-autorização');
resetBanco(10, { assinatura: 'erro', usosJaFeitos: 3 });
checar('assinatura indisponível', await preautorizarUsoIa(env, USER, { confirmarCredito: true }), {
  permitido: false,
  motivo: 'indisponivel',
});
resetBanco(10, { cotaExiste: false });
checar('cota indisponível', await preautorizarUsoIa(env, USER), {
  permitido: false,
  motivo: 'indisponivel',
});
resetBanco(10, { indisponivel: true, usosJaFeitos: 3 });
checar('saldo indisponível', await preautorizarUsoIa(env, USER, { confirmarCredito: true }), {
  permitido: false,
  motivo: 'indisponivel',
});

console.log('\nP7) retry exato já pago passa com saldo zero; conteúdo diferente não pega carona');
resetBanco(1, { usosJaFeitos: 3 });
await cobrarCreditoVoz(env, USER, {
  confirmarCredito: true,
  creditoRef: 'pedido-pago-1',
  conteudo: '{"acao":"diagnostico","texto":"mesmo trabalho"}',
});
checar('a primeira execução consumiu o último crédito', [saldo, ledgerLinhas.length], [0, 1]);
checar('o retry exato é reconhecido antes de consultar saldo', await preautorizarUsoIa(env, USER, {
  confirmarCredito: true,
  creditoRef: 'pedido-pago-1',
  conteudo: '{"acao":"diagnostico","texto":"mesmo trabalho"}',
}), { permitido: true, retryPago: true });
checar('mesma ref com outro corpo continua bloqueada sem saldo', await preautorizarUsoIa(env, USER, {
  confirmarCredito: true,
  creditoRef: 'pedido-pago-1',
  conteudo: '{"acao":"diagnostico","texto":"trabalho diferente"}',
}), { permitido: false, motivo: 'sem_creditos' });

// ═══ A) CONSENTIMENTO — servidor decide, cliente confirma o gasto ═════════
console.log('\nA1) sem confirmarCredito: usa cota, mas jamais debita saldo em silêncio');
resetBanco(10);
{
  const r1 = await cobrarCreditoVoz(env, USER, { conteudo: 'fala 1' });
  checar('1º uso do mês: libera', r1.bloqueado, false);
  checar('e a cota do SERVIDOR foi consultada', cotaChamadas, 1);
  checar('gastou 1 uso grátis', cotaLinhas.length, 1);
  checar('não tocou no ledger (uso grátis não custa crédito)', ledgerChamadas, 0);

  await cobrarCreditoVoz(env, USER, { conteudo: 'fala 2' });
  await cobrarCreditoVoz(env, USER, { conteudo: 'fala 3' });
  checar('3 usos grátis no mês', cotaLinhas.length, 3);
  checar('ainda sem cobrar crédito', ledgerChamadas, 0);

  // 4ª chamada: cota esgotada. Saldo positivo não é autorização para cobrar.
  const r4 = await cobrarCreditoVoz(env, USER, { conteudo: 'fala 4' });
  checar('4ª chamada bloqueia pedindo confirmação', r4, {
    bloqueado: true,
    motivo: 'confirmacao_credito_necessaria',
  });
  checar('saldo fica intacto', saldo, 10);
  checar('ledger também fica intacto', ledgerChamadas, 0);

  const confirmada = await cobrarCreditoVoz(env, USER, {
    confirmarCredito: true,
    conteudo: 'fala 4',
  });
  checar('a mesma chamada confirmada passa', confirmada.bloqueado, false);
  checar('e só então debita 1 crédito', saldo, 9);
}

console.log('\nA2) cota esgotada E sem crédito: BLOQUEIA de verdade');
resetBanco(0, { usosJaFeitos: 3 });
{
  const r = await cobrarCreditoVoz(env, USER, { conteudo: 'fala paga' });
  checar('bloqueia antes de consultar saldo', r, {
    bloqueado: true,
    motivo: 'confirmacao_credito_necessaria',
  });
  checar('nem tentou lançar no ledger (consentimento barra antes)', ledgerChamadas, 0);
}

console.log('\nA3) idempotência da COTA: retry da mesma ação não queima 2 usos grátis');
resetBanco(10);
{
  await cobrarCreditoVoz(env, USER, { conteudo: 'mesma fala' });
  const r = await cobrarCreditoVoz(env, USER, { conteudo: 'mesma fala' });
  checar('retry não bloqueia', r.bloqueado, false);
  checar('consultou a cota 2x', cotaChamadas, 2);
  checar('mas gastou 1 uso só (ref igual = ação igual)', cotaLinhas.length, 1);
}

console.log('\nA4) plano PAGO e vigente: IA livre — não gasta cota nem crédito');
resetBanco(10, {
  assinatura: { plano: 'pro', status: 'active', current_period_end: DAQUI_UM_MES },
  usosJaFeitos: 3,
});
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'fala do assinante' });
  checar('não bloqueia', r.bloqueado, false);
  checar('nem consultou a cota (quem paga tem ia_ilimitada)', cotaChamadas, 0);
  checar('e o saldo de créditos ficou intacto', saldo, 10);
}

console.log('\nA5) plano pago VENCIDO não vale como pago (cai na cota)');
resetBanco(10, {
  assinatura: { plano: 'pro', status: 'active', current_period_end: new Date(AGORA_REAL - 864e5).toISOString() },
});
{
  await cobrarCreditoVoz(env, USER, { conteudo: 'fala de plano vencido' });
  checar('consumiu cota grátis, não passou livre', cotaLinhas.length, 1);
}

// ═══ B) FAIL-OPEN — erro de infra NUNCA vira "sem saldo" ═══════════════════
console.log('\nB1) migration da cota NÃO aplicada (RPC 404): FAIL-OPEN — libera como hoje');
resetBanco(10, { cotaExiste: false });
{
  const r = await cobrarCreditoVoz(env, USER, { conteudo: 'fala sem migration' });
  checar('não bloqueia (este commit pode ir para produção antes da migration)', r.bloqueado, false);
  checar('tentou a RPC', cotaChamadas, 1);
  checar('e NÃO cobrou crédito de quem não pediu', saldo, 10);
  checar('nem tocou no ledger', ledgerChamadas, 0);
}

console.log('\nB2) sem migration + confirmarCredito:true: cobra (comportamento de hoje, preservado)');
resetBanco(10, { cotaExiste: false });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A' });
  checar('não bloqueia', r.bloqueado, false);
  checar('debitou 1 do saldo', saldo, 9);
  checar('lançou 1x no ledger', ledgerChamadas, 1);

  // Retry de rede com o MESMO ref explícito.
  const r2 = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A' });
  checar('retry não bloqueia', r2.bloqueado, false);
  checar('tentou lançar de novo', ledgerChamadas, 2);
  checar('mas o índice único (23505) absorveu: saldo não mudou', saldo, 9);

  // ref DIFERENTE é ação diferente.
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A2' });
  checar('ref diferente debita de novo', saldo, 8);
}

console.log('\nB3) sem migration + saldo 0 + confirmarCredito: bloqueia (o cliente PEDIU e não há saldo)');
resetBanco(0, { cotaExiste: false });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-B' });
  checar('bloqueia', r.bloqueado, true);
  checar('RPC atômica confirmou sem_saldo', consumoRpcChamadas, 1);
  checar('não inseriu linha de consumo', ledgerLinhas.length, 0);
}

console.log('\nB4) assinatura ILEGÍVEL (PostgREST fora): FAIL-OPEN — não cobra de quem talvez pague');
resetBanco(10, { assinatura: 'erro', usosJaFeitos: 3 });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'fala com banco meio fora' });
  checar('não bloqueia', r.bloqueado, false);
  checar('não seguiu para a cota (não sabe se é grátis)', cotaChamadas, 0);
  checar('saldo intacto', saldo, 10);
}

console.log('\nB5) saldo ilegível na hora de debitar: FAIL-OPEN (a IA já entregou o resultado)');
resetBanco(10, { indisponivel: true, usosJaFeitos: 3 });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'fala com saldo ilegível' });
  checar('não bloqueia mesmo com o banco fora (não pune por bug de billing)', r.bloqueado, false);
  checar('a RPC atômica falhou fechada', consumoRpcChamadas, 1);
  checar('não abriu linha nem alterou saldo', [ledgerLinhas.length, saldo], [0, 10]);
}

console.log('\nB6) RPC atômica falhando: também FAIL-OPEN após a IA pronta');
resetBanco(10, { usosJaFeitos: 3 });
{
  const fetchOriginal = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (String(url).includes('/rest/v1/rpc/consumir_creditos_atomico')) {
      consumoRpcChamadas++;
      ledgerChamadas++;
      return { ok: false, status: 500 } as Response;
    }
    return fetchOriginal(url, init);
  };
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'fala com ledger fora' });
  (globalThis as any).fetch = fetchOriginal;
  checar('não bloqueia', r.bloqueado, false);
  checar('tentou a transação 1x e falhou', consumoRpcChamadas, 1);
  checar('saldo e ledger não mudaram', [saldo, ledgerLinhas.length], [10, 0]);
}

// ═══ C) 409 do PostgREST: só 23505 é idempotência ═════════════════════════
console.log('\nC1) 409 com code 23505 (unique_violation): absorve como "já lançado"');
{
  (globalThis as any).fetch = async () =>
    ({ ok: false, status: 409, json: async () => ({ code: '23505', message: 'duplicate key' }) }) as unknown as Response;
  const r = await lancarCreditos(env, { userId: USER.id, delta: 50, origem: 'pix', ref: 'mp:1', descricao: 'x' });
  checar('ok + duplicado (o gateway não precisa reenviar)', r, { ok: true, duplicado: true });
}

console.log('\nC2) 409 com code 23503 (foreign key): o crédito PAGO não entrou — propaga a falha');
{
  (globalThis as any).fetch = async () =>
    ({ ok: false, status: 409, json: async () => ({ code: '23503', message: 'violates foreign key constraint' }) }) as unknown as Response;
  const r = await lancarCreditos(env, { userId: 'fantasma', delta: 50, origem: 'pix', ref: 'mp:2', descricao: 'x' });
  checar('NÃO é ok (o webhook devolve 5xx e o MP reenvia)', r, { ok: false, duplicado: false });
}

console.log('\nC3) 409 sem corpo legível: na dúvida, NÃO é idempotência');
{
  (globalThis as any).fetch = async () =>
    ({ ok: false, status: 409, json: async () => { throw new Error('sem corpo'); } }) as unknown as Response;
  const r = await lancarCreditos(env, { userId: USER.id, delta: 50, origem: 'pix', ref: 'mp:3', descricao: 'x' });
  checar('falha (crédito comprado não some em silêncio)', r, { ok: false, duplicado: false });
}

fingirFetch(); // C1..C3 trocaram o fetch por versões cegas; volta o banco falso.

// ═══ D) A JANELA NA COTA — idempotência com prazo ══════════════════════════
// `creditoRef` é string ESCOLHIDA PELO CLIENTE. Se "já contada" valesse para
// sempre, fixar a string daria IA grátis infinita. Estes casos provam os dois
// lados: o retry honesto continua de graça, o replay não.
console.log('\nD1) mesma creditoRef DENTRO da janela: é retry — não queima 2º uso grátis');
resetBanco(10);
{
  await cobrarCreditoVoz(env, USER, { creditoRef: 'ref-fixa' });
  avancar(JANELA_IDEM_MS - 60_000); // 9 min depois: ainda é o mesmo pedido
  const r = await cobrarCreditoVoz(env, USER, { creditoRef: 'ref-fixa' });
  checar('não bloqueia', r.bloqueado, false);
  checar('consultou a cota 2x', cotaChamadas, 2);
  checar('mas gastou 1 uso só', cotaLinhas.length, 1);
  checar('e não cobrou crédito nenhum', saldo, 10);
}

console.log('\nD2) mesma creditoRef FORA da janela: NÃO é retry — é uso novo e conta');
resetBanco(10);
{
  await cobrarCreditoVoz(env, USER, { creditoRef: 'ref-fixa' });
  checar('1º uso', cotaLinhas.length, 1);
  avancar(JANELA_IDEM_MS + 60_000); // 11 min depois: trabalho novo
  const r = await cobrarCreditoVoz(env, USER, { creditoRef: 'ref-fixa' });
  checar('libera (ainda tem cota)', r.bloqueado, false);
  checar('gastou o 2º uso grátis — a chave repetida NÃO valeu de passe livre', cotaLinhas.length, 2);
}

console.log('\nD3) P0: creditoRef fixa repetida para sempre NÃO dá IA infinita — a cota do mês acaba');
resetBanco(0); // sem crédito nenhum: quando a cota acabar, tem que BLOQUEAR
{
  const resultados: boolean[] = [];
  // 5 janelas seguidas com a MESMA chave, e 2 chamadas em cada (a 2ª é o retry
  // legítimo dentro da janela, que continua sendo de graça).
  for (let janela = 0; janela < 5; janela++) {
    resultados.push((await cobrarCreditoVoz(env, USER, { creditoRef: 'passe-livre' })).bloqueado);
    resultados.push((await cobrarCreditoVoz(env, USER, { creditoRef: 'passe-livre' })).bloqueado);
    avancar(JANELA_IDEM_MS + 1000);
  }
  checar(
    'janelas 1-3 liberam (é a cota de verdade), 4 e 5 BLOQUEIAM',
    resultados,
    [false, false, false, false, false, false, true, true, true, true],
  );
  checar(`gastou exatamente a cota do mês (${IA_GRATIS_MES}), nem um uso a mais`, cotaLinhas.length, IA_GRATIS_MES);
  checar('e nunca conseguiu crédito de graça', saldo, 0);
}

// ═══ E) A JANELA NO LEDGER — 1 crédito não compra IA sem fim ═══════════════
console.log('\nE1) cota esgotada + mesma creditoRef DENTRO da janela: cobra 1 crédito só');
resetBanco(10, { usosJaFeitos: 3 });
{
  const r1 = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-1' });
  checar('não bloqueia', r1.bloqueado, false);
  checar('debitou 1', saldo, 9);
  avancar(JANELA_IDEM_MS - 60_000); // 9 min depois: retry do MESMO toque
  const r2 = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-1' });
  checar('retry não bloqueia', r2.bloqueado, false);
  checar('NÃO cobrou 2x', saldo, 9);
  // Reconheceu a cobrança pela consulta e nem tentou lançar de novo. (Se a RPC
  // não existir, ainda tenta e o 23505 absorve — é o caso E5.)
  checar('e nem foi ao ledger de novo (a consulta já sabia)', ledgerChamadas, 1);
}

console.log('\nE2) cota esgotada + mesma creditoRef FORA da janela: é ação nova e COBRA');
resetBanco(10, { usosJaFeitos: 3 });
{
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-1' });
  checar('debitou 1', saldo, 9);
  avancar(JANELA_IDEM_MS + 60_000); // 11 min depois
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-1' });
  checar('debitou de novo — chave velha não compra IA de graça', saldo, 8);
  checar('e são 2 lançamentos distintos no ledger', ledgerChamadas, 2);
}

console.log('\nE3) P0: 1 crédito NÃO compra IA infinita (cota esgotada + chave fixa para sempre)');
resetBanco(1, { usosJaFeitos: 3 }); // exatamente 1 crédito no bolso
{
  const r1 = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'passe-livre-pago' });
  checar('a 1ª passa, pagando o crédito', r1.bloqueado, false);
  checar('saldo zerou', saldo, 0);

  // A RPC atômica reconhece a mesma referência antes de conferir o saldo. A
  // consulta da janela ainda evita chamar a RPC e repetir todo o fluxo para um
  // trabalho recém-pago; fora da janela, uma nova cobrança exige saldo.
  const rRetry = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'passe-livre-pago' });
  checar('retry dentro da janela ainda passa (é o mesmo trabalho, já pago)', rRetry.bloqueado, false);
  checar('sem debitar de novo', saldo, 0);

  avancar(JANELA_IDEM_MS + 1000);
  const rDepois = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'passe-livre-pago' });
  checar('mas na janela seguinte a MESMA chave BLOQUEIA (acabou o crédito)', rDepois.bloqueado, true);

  avancar(JANELA_IDEM_MS + 1000);
  const rMuitoDepois = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'passe-livre-pago' });
  checar('e continua bloqueando (o passe livre não volta com o tempo)', rMuitoDepois.bloqueado, true);
}

console.log('\nE4) o hash do conteúdo segue a MESMA regra (quem não manda creditoRef não fica de fora)');
resetBanco(10, { usosJaFeitos: 3 });
{
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'o mesmo áudio de sempre' });
  checar('debitou 1', saldo, 9);
  avancar(JANELA_IDEM_MS - 60_000);
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'o mesmo áudio de sempre' });
  checar('reenvio dentro da janela = retry, não cobra 2x', saldo, 9);
  avancar(JANELA_IDEM_MS + 60_000);
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'o mesmo áudio de sempre' });
  checar('reenvio fora da janela = trabalho novo, cobra', saldo, 8);
}

console.log('\nE5) RPC da janela fora do ar (cota respondendo): degrada para o bucket, NÃO para "de graça"');
resetBanco(10, { usosJaFeitos: 3, lookupExiste: false });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-sem-rpc' });
  checar('não bloqueia', r.bloqueado, false);
  checar('perguntou (e levou 404)', lookupChamadas, 1);
  checar('cobrou assim mesmo — "não sei se já cobrei" nunca vira "já cobrei"', saldo, 9);

  // Mesmo degradado, o retry imediato ainda cai na mesma chave de bucket.
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-sem-rpc' });
  checar('retry imediato segue absorvido pelo índice único', saldo, 9);
}

// ═══ F) O TETO REAL, EM NÚMERO — quantas chamadas de IA por 1 crédito ═════
// As seções acima provam "não cobra 2x" e "não é de graça para sempre" em pontos
// escolhidos a dedo. Estas medem o TETO: com a chave sob controle do atacante e
// o relógio andando, quantas vezes o Gemini roda por unidade de dinheiro. Teto é
// número; "é seguro" não é resposta.

/** Põe o relógio num offset conhecido DENTRO de um bucket de janela. */
function posicionarRelogio(bucket: number, offsetSegundos: number) {
  relogio = bucket * JANELA_IDEM_MS + offsetSegundos * 1000;
}

console.log('\nF1) TETO: cota esgotada + creditoRef FIXO + conteúdo NOVO a cada chamada = 1 chamada por crédito');
{
  // É o ataque que o `else if` permitia: fixa a string do cliente e manda áudio
  // novo toda vez. Com a chave COMPOSTA (ref + hash do conteúdo), cada conteúdo
  // distinto é uma ação distinta e paga a sua.
  posicionarRelogio(5_000_000, 0);
  resetBanco(1, { usosJaFeitos: 3 }); // exatamente 1 crédito no bolso
  let liberadas = 0;
  for (let i = 0; i < 200; i++) {
    if (!(await cobrarCreditoVoz(env, USER, {
      confirmarCredito: true,
      creditoRef: 'X',
      conteudo: `audio-${i}`,
    })).bloqueado) liberadas++;
    avancar(1000);
  }
  checar('200 tentativas com conteúdo sempre novo: só 1 passa', liberadas, 1);
  checar('e o ledger tem 1 lançamento só', ledgerLinhas.length, 1);
  checar('saldo zerado — o crédito comprou 1 chamada, não 200', saldo, 0);
}

console.log('\nF2) TETO no caminho GRÁTIS: a cota do mês é o teto, e conteúdo novo não a burla');
{
  posicionarRelogio(5_100_000, 0);
  resetBanco(0); // sem crédito nenhum: depois da cota, tem que BLOQUEAR
  let liberadas = 0;
  for (let i = 0; i < 200; i++) {
    if (!(await cobrarCreditoVoz(env, USER, { creditoRef: 'X', conteudo: `audio-${i}` })).bloqueado) liberadas++;
    avancar(1000);
  }
  checar(`200 tentativas: exatamente ${IA_GRATIS_MES} passam (a cota do mês)`, liberadas, IA_GRATIS_MES);
  checar('nenhum crédito foi arrancado de graça', saldo, 0);
}

console.log('\nF3) /voz/conversa usa convId + corpo: retry exato é idempotente, conteúdo novo não pega carona');
{
  // Produção sempre envia o bodyText para compor a identidade. Repetir o mesmo
  // corpo representa o mesmo trabalho; alterar qualquer conteúdo é uma ação
  // nova e precisa de nova autorização/cota.
  posicionarRelogio(8_000_000, 0);
  resetBanco(1, { usosJaFeitos: 3 });
  let liberadas = 0;
  for (let i = 0; i < 100; i++) {
    if (!(await cobrarCreditoVoz(env, USER, {
      confirmarCredito: true,
      creditoRef: 'conv-1',
      conteudo: '{"conversationId":"conv-1","conversa":[{"texto":"mesmo fechamento"}]}',
    })).bloqueado) liberadas++;
    avancar(1000);
  }
  checar('100 retries exatos do mesmo fechamento continuam liberados', liberadas, 100);
  checar('e debitam um único crédito', ledgerLinhas.length, 1);

  posicionarRelogio(9_000_000, 0);
  resetBanco(1, { usosJaFeitos: 3 });
  let lib = 0;
  for (let i = 0; i < 100; i++) {
    if (!(await cobrarCreditoVoz(env, USER, {
      confirmarCredito: true,
      creditoRef: 'conv-1',
      conteudo: `{"conversationId":"conv-1","conversa":[{"texto":"fechamento-${i}"}]}`,
    })).bloqueado) lib++;
    avancar(1000);
  }
  checar('100 corpos diferentes com o mesmo convId: só o primeiro passa', lib, 1);
  checar('e o crédito compra uma única execução nova', ledgerLinhas.length, 1);
}

// ═══ G) VARREDURA DE OFFSET — um ponto não prova uma janela ════════════════
// Um teste que fixa o relógio num instante só passa por sorte: a chave de bucket
// muda de valor no corte, e um retry que atravesse o corte é outro caso. Estas
// varrem os 60 offsets de 10s dentro de uma janela e exigem 0 falhas em TODOS.

/** Roda um retry legítimo (mesmo corpo, mesma chave) em cada offset da janela e
 *  devolve quantos offsets cobraram DUAS vezes. */
async function varrerRetry(opts: {
  bucket: number;
  esperaMs: number;
  migration: boolean;
  lookupNa1a?: boolean;
  lookupNoRetry?: boolean;
}): Promise<number> {
  let dobraram = 0;
  for (let offset = 0; offset < 600; offset += 10) {
    posicionarRelogio(opts.bucket, offset);
    resetBanco(10, {
      usosJaFeitos: opts.migration ? 3 : 0,
      cotaExiste: opts.migration,
      lookupExiste: opts.lookupNa1a ?? opts.migration,
    });
    await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-A', conteudo: 'audio-1' });
    const saldoApos1 = saldo;
    if (opts.lookupNoRetry !== undefined) lookupExiste = opts.lookupNoRetry;
    avancar(opts.esperaMs);
    await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-A', conteudo: 'audio-1' });
    if (saldo < saldoApos1) dobraram++;
  }
  return dobraram;
}

console.log('\nG1) retry de 60s (o timeout do app), migration APLICADA: 0 de 60 offsets cobram 2x');
checar('nenhum offset cobra o retry duas vezes', await varrerRetry({ bucket: 1_000_000, esperaMs: 60_000, migration: true }), 0);

console.log('\nG2) o MESMO retry com a migration NÃO aplicada (o estado de HOJE): também 0 de 60');
checar('nenhum offset cobra o retry duas vezes', await varrerRetry({ bucket: 1_100_000, esperaMs: 60_000, migration: false }), 0);

console.log('\nG3) retry de 9 min (o pior retry honesto: timeout + app no bolso), nos dois estados');
checar('migration aplicada: 0 de 60', await varrerRetry({ bucket: 1_200_000, esperaMs: 9 * 60_000, migration: true }), 0);
checar('migration não aplicada: 0 de 60', await varrerRetry({ bucket: 1_300_000, esperaMs: 9 * 60_000, migration: false }), 0);

console.log('\nG4) P0: a consulta PISCA entre a chamada e o retry — a dupla que cobrava 2x em 60 de 60');
{
  // Este é o caso que a chave estável de `chaveCobrancaVoz` quebrava: gravada
  // como `refAcao` cru, a cobrança do estado degradado NÃO começava com o
  // prefixo `refAcao:j` que a consulta procura. Quando a RPC voltava (um 500
  // isolado do PostgREST, ou o instante em que o dono APLICA a migration
  // 20260727), o retry não achava nada, gerava a chave de bucket e cobrava o
  // MESMO trabalho de novo — em 60 dos 60 offsets, não numa borda rara.
  // Hoje a chave degradada mora DENTRO do prefixo (`${prefixo}estavel`).
  const piscaEVolta = await varrerRetry({
    bucket: 1_400_000, esperaMs: 60_000, migration: true, lookupNa1a: false, lookupNoRetry: true,
  });
  checar('1ª chamada sem consulta + retry com consulta: 0 de 60 cobram 2x', piscaEVolta, 0);

  // A direção inversa (consulta OK na 1ª, fora no retry) NÃO tem conserto por
  // este caminho: a chamada degradada não tem como descobrir qual chave a
  // saudável usou. Fica REGISTRADA com o número real em vez de escondida — se
  // um dia alguém a consertar, este assert falha e obriga a atualizar o teto.
  const okDepoisPisca = await varrerRetry({
    bucket: 1_500_000, esperaMs: 60_000, migration: true, lookupNa1a: true, lookupNoRetry: false,
  });
  checar('LIMITE CONHECIDO — consulta OK na 1ª e fora no retry ainda cobra 2x em 60 de 60', okDepoisPisca, 60);
}

console.log('\nG5) o dono APLICA a migration no meio de um retry em voo: não cobra 2x');
{
  posicionarRelogio(2_000_000, 0);
  resetBanco(10, { cotaExiste: false }); // estado de hoje: nenhuma das duas RPCs
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-T', conteudo: 'audio-T' });
  checar('cobrou 1', saldo, 9);
  // ── o dono roda a migration aqui ──
  cotaExiste = true;
  lookupExiste = true;
  cotaLinhas = Array.from({ length: 3 }, (_, i) => ({ ref: `pre-${i}`, criadoEm: relogio })); // cota do mês já gasta
  avancar(60_000);
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'toque-T', conteudo: 'audio-T' });
  checar('o retry depois da migration NÃO cobra de novo', saldo, 9);
  checar('e não abriu um 2º lançamento', ledgerLinhas.length, 1);
}

// ═══ H) ISOLAMENTO DE CHAVES E CAMADAS ═════════════════════════════════════

console.log('\nH1) referência do cliente é hasheada e não pode imitar prefixo já pago');
{
  posicionarRelogio(3_000_000, 0);
  resetBanco(1, { usosJaFeitos: 3 });
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'x', conteudo: 'audio-A' });
  checar('a chamada honesta pagou 1 crédito', saldo, 0);
  const refPago = ledgerLinhas[0].ref;
  let carona = 0;
  for (let i = 0; i < 50; i++) {
    if (!(await cobrarCreditoVoz(env, USER, {
      confirmarCredito: true,
      creditoRef: refPago,
      conteudo: `tentativa-forjada-${i}`,
    })).bloqueado) carona++;
    avancar(1000);
  }
  checar('50 referências forjadas não reutilizam a cobrança', carona, 0);
  checar('nenhum lançamento adicional foi criado', ledgerLinhas.length, 1);
  checar('a chave persistida não contém a referência crua do cliente', refPago.includes(':cli:x'), false);
}

console.log('\nH2) a MESMA ação pode consumir cota grátis E crédito — em janelas diferentes, e é por desenho');
{
  // Duas camadas cobram a mesma string de ação em momentos distintos. Não é
  // cobrança dupla do mesmo trabalho: fora da janela, reenviar é trabalho novo
  // (a IA roda de novo, e roda por conta do dono). O assert existe para que
  // ninguém "conserte" isso achando que é bug — e para que fique explícito que
  // DENTRO da janela isso não acontece.
  posicionarRelogio(4_000_000, 0);
  resetBanco(5);
  await cobrarCreditoVoz(env, USER, { creditoRef: 'r1', conteudo: 'c1' });
  await cobrarCreditoVoz(env, USER, { creditoRef: 'r2', conteudo: 'c2' });
  await cobrarCreditoVoz(env, USER, { creditoRef: 'r3', conteudo: 'c3' });
  checar('3 usos grátis gastos, nenhum crédito', [cotaLinhas.length, saldo], [3, 5]);
  avancar(JANELA_IDEM_MS + 1000); // fora da janela: 'r1/c1' volta a ser ação nova
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'r1', conteudo: 'c1' });
  checar('a MESMA ação, fora da janela, agora custa 1 crédito (a cota do mês acabou)', saldo, 4);
  checar('e o ledger tem 1 lançamento (não dois pela mesma chamada)', ledgerLinhas.length, 1);
}

// ═══ I) CONTRATO SQL — prova estática da ordem e dos privilégios ═══════════
console.log('\nI1) migration contém lock -> saldo -> insert e RPC service_role-only');
const fs = await import('node:fs/promises');
const migrationSql = await fs.readFile(
  new URL('../supabase/migrations/20260817_openrouter_quota_diaria.sql', import.meta.url),
  'utf8',
);
const inicioAtomico = migrationSql.lastIndexOf('-- P0: CONSUMO ATOMICO DE CREDITOS');
const secaoAtomica = inicioAtomico >= 0 ? migrationSql.slice(inicioAtomico) : '';
const posLock = secaoAtomica.indexOf('pg_advisory_xact_lock');
const posSaldo = secaoAtomica.indexOf('pg_catalog.sum(l.delta)');
const posInsert = secaoAtomica.indexOf('insert into public.credit_ledger');
checar('seção atômica existe', inicioAtomico >= 0, true);
checar('ordem lock -> saldo -> insert',
  posLock >= 0 && posSaldo > posLock && posInsert > posSaldo, true);
checar('SECURITY DEFINER com search_path fechado',
  /security definer\s+set search_path = ''/i.test(secaoAtomica), true);
checar('EXECUTE revogado de papéis públicos',
  /revoke all on function public\.consumir_creditos_atomico[\s\S]*?from public, anon, authenticated, service_role;/i
    .test(secaoAtomica), true);
checar('somente service_role recebe EXECUTE',
  /grant execute on function public\.consumir_creditos_atomico[\s\S]*?to service_role;/i
    .test(secaoAtomica), true);
for (const estado of ['consumido', 'ja_consumido', 'sem_saldo']) {
  checar(`RPC declara estado ${estado}`, secaoAtomica.includes(`'${estado}'`), true);
}

Date.now = DateNowReal; // devolve o relógio de verdade ao processo
console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`): deixa o event loop drenar sozinho
// em vez de forçar o encerramento — em Windows, matar o processo com fetch
// (undici) ainda fechando handles no meio já produziu um crash de libuv
// (`UV_HANDLE_CLOSING`) flaky aqui; isto evita a corrida sem mudar o contrato
// (mesmo exit code 0/1 pro `npm test`).
process.exitCode = falhas === 0 ? 0 : 1;

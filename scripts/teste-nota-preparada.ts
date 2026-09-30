/**
 * "OLLI prepara a nota" — a regra pura (src/utils/notaServico.ts) e a migration
 * 20260930130700_nota_preparada.sql rodando de verdade num Postgres em memória
 * (PGlite), com RLS e o papel `authenticated`.
 *
 *     node scripts/teste-nota-preparada.ts
 *
 * Trava:
 *  1. ofício → código de tributação nacional sugerido, com fonte e explicação, e os
 *     códigos batendo com a tabela oficial (formato, subitem, incidência, retenção);
 *  2. CPF/CNPJ do tomador: máscara, dígitos, repetidos, CNPJ alfanumérico, vazio ≠ inválido;
 *  3. descrição: serviços, materiais, referência, teto de 2.000 caracteres sem cortar palavra;
 *  4. dados/campos/checklist: município de incidência, retenção, pagamento parcial, nada
 *     que diga que o OLLI emitiu;
 *  5. RLS: tenant isolado, membro lê mas não grava, coerência de status/número, dados de
 *     nota emitida imutáveis, sem DELETE, interesse na nota automática uma vez por conta.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  AVISO_NAO_EMITE,
  CODIGOS_NACIONAIS,
  FONTE_CODIGOS_NACIONAIS,
  LIMITE_DESCRICAO,
  OBRIGATORIEDADE_NFSE,
  TEXTO_INTERESSE_NOTA_AUTOMATICA,
  camposParaCopiar,
  checklistNota,
  erroRecursoDesligado,
  formatarCodigoNacional,
  incidenciaDaNota,
  interpretarNotaSalva,
  montarDescricaoServico,
  normalizarCodigoNacional,
  prepararDadosNota,
  sugerirCodigoServico,
  validarDocumentoTomador,
  validarNumeroNota,
  valorParaEmissor,
} from '../src/utils/notaServico.ts';
import { VERTICAIS } from '../src/services/verticais.ts';
import type { Cliente, Empresa, ItemOrcamento, Recibo } from '../src/types/index.ts';

let passos = 0;
async function caso(nome: string, fn: () => void | Promise<void>) {
  await fn();
  passos++;
  console.log(`  ok  ${nome}`);
}

// ─── 1. Ofício → código ──────────────────────────────────────────────────────
console.log('\nCódigo de serviço sugerido');

await caso('catálogo: 6 dígitos, subitem derivado do código, título não vazio', () => {
  for (const [chave, c] of Object.entries(CODIGOS_NACIONAIS)) {
    assert.equal(chave, c.codigo);
    assert.match(c.codigo, /^\d{6}$/);
    assert.equal(c.itemLc116, `${Number(c.codigo.slice(0, 2))}.${c.codigo.slice(2, 4)}`);
    assert.ok(c.titulo.length > 5);
  }
});

await caso('incidência segue a LC 116 art. 3º (7.02/7.05/7.10/7.11 no local; 7.13 e 14.xx no prestador)', () => {
  for (const c of ['070201', '070202', '070501', '071002', '071101', '071102']) assert.equal(CODIGOS_NACIONAIS[c].incidencia, 'execucao', c);
  for (const c of ['071301', '140101', '140201', '140601']) assert.equal(CODIGOS_NACIONAIS[c].incidencia, 'prestador', c);
});

await caso('retenção pelo tomador PJ segue a LC 116 art. 6º §2º II (7.02, 7.05, 7.10 sim; 7.11, 7.13, 14.xx não)', () => {
  for (const c of ['070201', '070202', '070501', '071002']) assert.equal(CODIGOS_NACIONAIS[c].retencaoPorPessoaJuridica, true, c);
  for (const c of ['071101', '071102', '071301', '140101', '140201', '140601']) assert.equal(CODIGOS_NACIONAIS[c].retencaoPorPessoaJuridica, false, c);
});

await caso('cada ofício com regra sugere o código esperado, com explicação e fonte oficial', () => {
  const esperado: Record<string, string> = {
    refrigeracao: '140101',
    eletrica: '070202',
    hidraulica: '070202',
    pintura: '070501',
    dedetizacao: '071301',
    caixa_dagua: '071002',
    piscina: '071002',
    extintores: '140101',
    jardinagem: '071102',
  };
  for (const [oficio, cod] of Object.entries(esperado)) {
    const s = sugerirCodigoServico([oficio as never]);
    assert.ok(s, oficio);
    assert.equal(s.principal.codigo, cod, oficio);
    assert.equal(s.fonte, FONTE_CODIGOS_NACIONAIS);
    assert.ok(s.explicacao.includes(s.principal.itemLc116), `${oficio}: a explicação cita o subitem ${s.principal.itemLc116}`);
    assert.ok(!s.alternativas.some((a) => a.codigo === s.principal.codigo), 'alternativa não repete a principal');
    for (const a of s.alternativas) assert.ok(CODIGOS_NACIONAIS[a.codigo], 'alternativa existe no catálogo');
  }
  // Todo ofício especializado do catálogo tem regra (ofício novo sem regra quebra aqui de propósito).
  for (const v of VERTICAIS) assert.ok(esperado[v.id], `ofício ${v.id} sem código sugerido`);
});

await caso('sem ofício ou "Serviços em Geral": nenhuma sugestão (a tela pede para escolher)', () => {
  assert.equal(sugerirCodigoServico(undefined), null);
  assert.equal(sugerirCodigoServico([]), null);
  assert.equal(sugerirCodigoServico(['geral']), null);
});

await caso('vários ofícios: o principal manda; o dos outros vira alternativa sem repetir', () => {
  const s = sugerirCodigoServico(['geral', 'refrigeracao', 'eletrica', 'hidraulica']);
  assert.ok(s);
  assert.equal(s.oficio, 'refrigeracao');
  assert.equal(s.principal.codigo, '140101');
  const alt = s.alternativas.map((a) => a.codigo);
  assert.deepEqual(alt, [...new Set(alt)]);
  assert.ok(alt.includes('070202'));
});

await caso('formato do código: 140101 ↔ 14.01.01', () => {
  assert.equal(formatarCodigoNacional('140101'), '14.01.01');
  assert.equal(normalizarCodigoNacional('14.01.01'), '140101');
  assert.equal(normalizarCodigoNacional('7.02'), null);
  assert.equal(normalizarCodigoNacional(''), null);
});

// ─── 2. CPF / CNPJ ───────────────────────────────────────────────────────────
console.log('\nCPF/CNPJ do tomador');

await caso('CPF válido com e sem máscara', () => {
  const r = validarDocumentoTomador('529.982.247-25');
  assert.equal(r.tipo, 'valido');
  if (r.tipo === 'valido') {
    assert.equal(r.documento, 'cpf');
    assert.equal(r.normalizado, '52998224725');
    assert.equal(r.formatado, '529.982.247-25');
  }
  assert.equal(validarDocumentoTomador('52998224725').tipo, 'valido');
});

await caso('CPF com dígito errado ou repetido é inválido', () => {
  assert.equal(validarDocumentoTomador('529.982.247-24').tipo, 'invalido');
  assert.equal(validarDocumentoTomador('111.111.111-11').tipo, 'invalido');
});

await caso('CNPJ numérico válido e inválido', () => {
  const r = validarDocumentoTomador('11.222.333/0001-81');
  assert.equal(r.tipo, 'valido');
  if (r.tipo === 'valido') assert.equal(r.documento, 'cnpj');
  assert.equal(validarDocumentoTomador('11.222.333/0001-80').tipo, 'invalido');
  assert.equal(validarDocumentoTomador('00000000000000').tipo, 'invalido');
});

await caso('CNPJ alfanumérico (exemplo da Receita 12.ABC.345/01DE-35) é válido; letra trocada não', () => {
  const r = validarDocumentoTomador('12.abc.345/01de-35');
  assert.equal(r.tipo, 'valido');
  if (r.tipo === 'valido') {
    assert.equal(r.normalizado, '12ABC34501DE35');
    assert.equal(r.formatado, '12.ABC.345/01DE-35');
  }
  assert.equal(validarDocumentoTomador('12ABC34501DF35').tipo, 'invalido');
  // DV com letra não existe.
  assert.equal(validarDocumentoTomador('12ABC34501DE3A').tipo, 'invalido');
});

await caso('vazio ≠ inválido (três respostas)', () => {
  assert.equal(validarDocumentoTomador('').tipo, 'vazio');
  assert.equal(validarDocumentoTomador(null).tipo, 'vazio');
  assert.equal(validarDocumentoTomador(' . - / ').tipo, 'vazio');
  assert.equal(validarDocumentoTomador('123').tipo, 'invalido');
});

// ─── 3. Descrição ────────────────────────────────────────────────────────────
console.log('\nDescrição do serviço');

function item(p: Partial<ItemOrcamento> & { nome: string }): ItemOrcamento {
  return { id: p.nome, tipo: 'servico', catalogoId: '', preco: 100, quantidade: 1, unidade: 'un', subtotal: 100, ...p };
}

await caso('serviços, materiais e referência, com quantidade quando importa', () => {
  const { texto, cortada } = montarDescricaoServico({
    itens: [
      item({ nome: 'Limpeza de split  12.000 BTUs', quantidade: 2, subtotal: 300 }),
      item({ nome: 'Carga de gás', quantidade: 1 }),
      item({ nome: 'Pintura', quantidade: 25.5, unidade: 'm²' }),
      item({ nome: 'Capacitor 35uF', tipo: 'produto', quantidade: 1 }),
      item({ nome: '   ' }),
    ],
    reciboNumero: 'REC-0003',
    orcamentoNumero: '2026-0012',
  });
  assert.equal(cortada, false);
  assert.equal(
    texto,
    [
      'Serviços prestados:',
      '- Limpeza de split 12.000 BTUs (2 un)',
      '- Carga de gás',
      '- Pintura (25,5 m²)',
      'Peças e materiais empregados:',
      '- Capacitor 35uF',
      'Referente ao orçamento nº 2026-0012 e ao recibo nº REC-0003.',
    ].join('\n'),
  );
});

await caso('recibo avulso sem itens ainda tem descrição', () => {
  const { texto } = montarDescricaoServico({ itens: [], reciboNumero: 'REC-9' });
  assert.equal(texto, 'Prestação de serviço.\nReferente ao recibo nº REC-9.');
});

await caso('passou de 2.000 caracteres: corta itens inteiros e diz quantos', () => {
  const itens = Array.from({ length: 80 }, (_, i) => item({ nome: `Serviço número ${i + 1} com um nome bem comprido para ocupar espaço` }));
  const { texto, cortada } = montarDescricaoServico({ itens, reciboNumero: 'REC-1' });
  assert.equal(cortada, true);
  assert.ok(texto.length <= LIMITE_DESCRICAO, `tamanho ${texto.length}`);
  assert.match(texto, /- e mais \d+ itens, conforme o recibo\./);
  assert.ok(texto.endsWith('Referente ao recibo nº REC-1.'));
  for (const linha of texto.split('\n').filter((l) => l.startsWith('- Serviço'))) {
    assert.ok(linha.endsWith('espaço'), 'nenhum item cortado no meio');
  }
});

await caso('um único item gigante: corte seco dentro do teto', () => {
  const { texto, cortada } = montarDescricaoServico({ itens: [item({ nome: 'x'.repeat(3000) })], reciboNumero: 'R' });
  assert.equal(cortada, true);
  assert.equal(texto.length, LIMITE_DESCRICAO);
});

// ─── 4. Dados, campos e checklist ────────────────────────────────────────────
console.log('\nDados da nota');

const EMPRESA = {
  id: 'e', nome: 'Frio Bom Refrigeração', especialidade: '', slogan: '', cnpj: '11.222.333/0001-81', cpf: '', endereco: '',
  cidade: 'Campinas', estado: 'sp', telefone: '', whatsapp: '', site: '', email: '', chavePix: '', normas: '', nomePrestador: '',
  verticais: ['refrigeracao'],
} as Empresa;

const CLIENTE: Cliente = {
  id: 'c1', nome: 'Condomínio Alfa', telefone: '(19) 98888-7777', cnpj: '12.ABC.345/01DE-35', endereco: 'Rua A, 10', complemento: 'Bloco B',
  cidade: 'Valinhos', estado: 'SP', cep: '13270-000', criadoEm: '2026-09-01',
};

const RECIBO = {
  id: 'r1', numero: 'REC-0003', orcamentoId: 'o1', orcamentoNumero: '2026-0012', clienteId: 'c1', clienteNome: 'Condomínio Alfa',
  clienteTelefone: '', itens: [item({ nome: 'Limpeza de split', quantidade: 2, subtotal: 400 }), item({ nome: 'Filtro', tipo: 'produto', subtotal: 50 })],
  valorRecebido: 450, formaPagamento: 'PIX', dataRecebimento: '28/09/2026', exibirAssinatura: false, criadoEm: '2026-09-28',
} as Recibo;

await caso('prepara tomador, código sugerido, competência e valores', () => {
  const d = prepararDadosNota({ recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA });
  assert.equal(d.tomador.documento, '12ABC34501DE35');
  assert.equal(d.tomador.tipoDocumento, 'cnpj');
  assert.equal(d.tomador.endereco, 'Rua A, 10, Bloco B');
  assert.equal(d.tomador.cep, '13270000');
  assert.equal(d.servico.codigo, '140101');
  assert.equal(d.servico.competencia, '28/09/2026');
  assert.equal(d.prestador.local.uf, 'SP');
  assert.deepEqual(d.valores, { servico: 450, materiais: 50, itens: 450 });
  assert.equal(d.orcamentoNumero, '2026-0012');
});

await caso('escolhas do prestador vencem a sugestão; competência vem da data de prestação', () => {
  const d = prepararDadosNota(
    { recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA, orcamento: { dataPrestacaoServico: '20/09/2026' } as never },
    { codigo: '14.06.01', descricao: '  Instalação de split  ' },
  );
  assert.equal(d.servico.codigo, '140601');
  assert.equal(d.servico.descricao, 'Instalação de split');
  assert.equal(d.servico.competencia, '20/09/2026');
});

await caso('incidência: 14.01 no município do prestador; 7.02 no do serviço; sem cidade = pendência', () => {
  const d = prepararDadosNota({ recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA });
  assert.deepEqual(incidenciaDaNota(d).local, { cidade: 'Campinas', uf: 'SP' });
  const obra = prepararDadosNota({ recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA }, { codigo: '070202' });
  assert.deepEqual(incidenciaDaNota(obra).local, { cidade: 'Valinhos', uf: 'SP' });
  const semCidade = prepararDadosNota({ recibo: RECIBO, cliente: { ...CLIENTE, cidade: '' }, empresa: EMPRESA }, { codigo: '070202' });
  assert.equal(incidenciaDaNota(semCidade).local, null);
  assert.ok(checklistNota(semCidade).some((i) => i.id === 'municipio' && i.alerta));
});

await caso('campos para copiar: ordem do emissor, valor com vírgula, documento só com caracteres', () => {
  const campos = camposParaCopiar(prepararDadosNota({ recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA }));
  assert.deepEqual([...new Set(campos.map((c) => c.etapa))], ['Pessoas', 'Serviço', 'Valores']);
  const porId = Object.fromEntries(campos.map((c) => [c.id, c]));
  assert.equal(porId.tomador_documento.valor, '12ABC34501DE35');
  assert.equal(porId.tomador_documento.exibicao, '12.ABC.345/01DE-35');
  assert.equal(porId.codigo_tributacao.valor, '14.01.01');
  assert.equal(porId.valor_servico.valor, '450,00');
  assert.equal(porId.local_prestacao.valor, 'Campinas/SP');
  assert.equal(valorParaEmissor(1234.5), '1234,50');
});

await caso('checklist: alertas primeiro; documento inválido, sem código e valor zero viram alerta', () => {
  const d = prepararDadosNota({
    recibo: { ...RECIBO, valorRecebido: 0 },
    cliente: { ...CLIENTE, cnpj: '', cpf: '529.982.247-24' },
    empresa: { ...EMPRESA, verticais: ['geral'] },
  });
  const lista = checklistNota(d);
  const alertas = lista.filter((i) => i.alerta).map((i) => i.id);
  assert.deepEqual(alertas.sort(), ['codigo', 'tomador_documento', 'valor']);
  const primeiroNaoAlerta = lista.findIndex((i) => !i.alerta);
  assert.ok(lista.slice(primeiroNaoAlerta).every((i) => !i.alerta), 'alertas vêm antes');
  assert.ok(lista.find((i) => i.id === 'tomador_documento')?.texto.includes('529.982.247-24'));
});

await caso('checklist: retenção só com cliente CNPJ em 7.02/7.05/7.10, citando o MEI; materiais e pagamento parcial', () => {
  const obra = checklistNota(prepararDadosNota({ recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA }, { codigo: '070501' }));
  const ret = obra.find((i) => i.id === 'retencao');
  assert.ok(ret?.texto.includes('7.05') && ret.texto.includes('MEI'));
  const pf = checklistNota(prepararDadosNota({ recibo: RECIBO, cliente: { ...CLIENTE, cnpj: '', cpf: '52998224725' }, empresa: EMPRESA }, { codigo: '070501' }));
  assert.ok(pf.find((i) => i.id === 'retencao')?.texto.startsWith('Em regra, sem retenção'));
  assert.ok(obra.some((i) => i.id === 'materiais'));
  const parcial = checklistNota(prepararDadosNota({ recibo: { ...RECIBO, valorRecebido: 200 }, cliente: CLIENTE, empresa: EMPRESA }));
  assert.ok(parcial.some((i) => i.id === 'valor_parcial'));
});

await caso('copy honesta: nada diz que o OLLI emite; obrigatoriedade com as DUAS datas; sem preço', () => {
  const textos = [
    AVISO_NAO_EMITE,
    OBRIGATORIEDADE_NFSE,
    TEXTO_INTERESSE_NOTA_AUTOMATICA,
    ...checklistNota(prepararDadosNota({ recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA })).map((i) => i.texto),
  ].join('\n');
  assert.doesNotMatch(textos, /OLLI emit(e|iu) a nota|nota emitida pelo OLLI/i);
  assert.match(AVISO_NAO_EMITE, /não emite/);
  assert.match(OBRIGATORIEDADE_NFSE, /01\/09\/2023/);
  assert.match(OBRIGATORIEDADE_NFSE, /01\/11\/2026/);
  assert.match(OBRIGATORIEDADE_NFSE, /191\/2026/);
  assert.doesNotMatch(TEXTO_INTERESSE_NOTA_AUTOMATICA, /R\$|\d+,\d{2}/);
});

await caso('número da NFS-e: até 13 dígitos ou chave de 50', () => {
  assert.equal(validarNumeroNota(' 123 '), '123');
  assert.equal(validarNumeroNota('1'.repeat(13)), '1'.repeat(13));
  assert.equal(validarNumeroNota('1'.repeat(14)), null);
  assert.equal(validarNumeroNota('9'.repeat(50)), '9'.repeat(50));
  assert.equal(validarNumeroNota(''), null);
});

await caso('linha salva: formato inesperado vira null (erro), não "não guardada"', () => {
  const dados = prepararDadosNota({ recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA });
  assert.ok(interpretarNotaSalva({ id: 'x', status: 'preparada', numero_nota: null, dados }));
  assert.equal(interpretarNotaSalva({ id: 'x', status: 'emitida', numero_nota: null, dados }), null);
  assert.equal(interpretarNotaSalva({ id: 'x', status: 'outro', dados }), null);
  assert.equal(interpretarNotaSalva({ id: 'x', status: 'preparada', dados: { versao: 99 } }), null);
  assert.equal(interpretarNotaSalva(null), null);
});

await caso('tabela ausente (migration não aplicada) = recurso desligado', () => {
  assert.equal(erroRecursoDesligado({ code: '42P01' }), true);
  assert.equal(erroRecursoDesligado({ code: 'PGRST205', message: "Could not find the table 'public.notas_preparadas'" }), true);
  assert.equal(erroRecursoDesligado({ code: '42501', message: 'permission denied' }), false);
  assert.equal(erroRecursoDesligado(null), false);
});

// ─── 5. Migration + RLS no PGlite ────────────────────────────────────────────
console.log('\nMigration e RLS (PGlite)');

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const sqlHelpers = ler('../supabase/migrations/20260906120000_rls_helpers_private_schema.sql');
const sqlNova = ler('../supabase/migrations/20260930130700_nota_preparada.sql');
assert.doesNotMatch(sqlNova, /delete\s+from|drop\s+table\s+(?!if exists public\.(nota_automatica_interesse|notas_preparadas);)/i);

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  grant usage on schema auth to authenticated, anon;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  grant execute on function auth.uid() to authenticated, anon;
  grant usage on schema public to authenticated, anon;
  create table public.organizacoes (id uuid primary key, owner_user_id uuid not null references auth.users(id));
  create table public.organizacao_membros (org_id uuid not null, user_id uuid not null, papel text not null, ativo boolean not null default true);
  create table public.recibos (id text primary key, user_id uuid not null references auth.users(id));
  grant select on public.recibos to authenticated;
`);
await db.exec(sqlHelpers);
await db.exec(sqlNova);

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO_A = u(1);
const TECNICO_A = u(2);
const DONO_B = u(3);
const ORG_A = u(100);
await db.exec(`
  insert into auth.users values ('${DONO_A}'), ('${TECNICO_A}'), ('${DONO_B}');
  insert into public.organizacoes values ('${ORG_A}', '${DONO_A}');
  insert into public.organizacao_membros values ('${ORG_A}', '${DONO_A}', 'owner', true), ('${ORG_A}', '${TECNICO_A}', 'tecnico', true);
  insert into public.recibos values ('r1', '${DONO_A}'), ('r2', '${DONO_A}'), ('r3', '${DONO_A}'), ('rb', '${DONO_B}');
`);

const DADOS = JSON.stringify(prepararDadosNota({ recibo: RECIBO, cliente: CLIENTE, empresa: EMPRESA }));

/** Roda `sql` como o usuário `uid` com o papel `authenticated` (RLS valendo). */
async function como<T>(uid: string | null, sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
  await db.exec('reset role');
  await db.query(`select set_config('teste.uid', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function falha(uid: string | null, sql: string, params: unknown[] = [], padrao?: RegExp): Promise<void> {
  let erro: unknown = null;
  try {
    await como(uid, sql, params);
  } catch (e) {
    erro = e;
  }
  assert.ok(erro, `deveria falhar: ${sql}`);
  if (padrao) assert.match(String((erro as Error).message), padrao);
}

await caso('dono grava a nota do próprio recibo; user_id vem do auth.uid() (default)', async () => {
  const r = await como<{ user_id: string; status: string }>(
    DONO_A,
    `insert into public.notas_preparadas (recibo_id, dados) values ('r1', $1::jsonb) returning user_id, status`,
    [DADOS],
  );
  assert.equal(r.rows[0].user_id, DONO_A);
  assert.equal(r.rows[0].status, 'preparada');
});

await caso('upsert do mesmo recibo atualiza (uma nota por recibo), não duplica', async () => {
  await como(
    DONO_A,
    `insert into public.notas_preparadas (recibo_id, dados) values ('r1', $1::jsonb)
     on conflict (user_id, recibo_id) do update set dados = excluded.dados`,
    [DADOS],
  );
  const r = await como<{ n: number }>(DONO_A, `select count(*)::int as n from public.notas_preparadas`);
  assert.equal(r.rows[0].n, 1);
});

await caso('dono não grava em nome de outro tenant', async () => {
  await falha(DONO_A, `insert into public.notas_preparadas (user_id, recibo_id, dados) values ($1, 'rx', $2::jsonb)`, [DONO_B, DADOS], /row-level security/);
});

await caso('outro tenant não vê nem altera a nota', async () => {
  const r = await como<{ n: number }>(DONO_B, `select count(*)::int as n from public.notas_preparadas`);
  assert.equal(r.rows[0].n, 0);
  const up = await como<{ id: string }>(DONO_B, `update public.notas_preparadas set dados = '{}'::jsonb returning id`);
  assert.equal(up.rows.length, 0);
});

await caso('anônimo não lê nada', async () => {
  await falha(null, `select * from public.notas_preparadas`, [], /permission denied/);
});

await caso('técnico da equipe LÊ a nota do dono, mas não grava nem altera', async () => {
  const r = await como<{ n: number }>(TECNICO_A, `select count(*)::int as n from public.notas_preparadas`);
  assert.equal(r.rows[0].n, 1);
  await falha(TECNICO_A, `insert into public.notas_preparadas (user_id, recibo_id, dados) values ($1, 'r2', $2::jsonb)`, [DONO_A, DADOS], /row-level security/);
  const up = await como<{ id: string }>(TECNICO_A, `update public.notas_preparadas set status = 'emitida', numero_nota = '1', emitida_em = now() returning id`);
  assert.equal(up.rows.length, 0);
});

await caso('técnico não copia a nota do recibo do dono para o PRÓPRIO tenant (caminho real do upsert)', async () => {
  // O app/painel faz upsert SEM user_id: o default seria o auth.uid() do técnico.
  await falha(TECNICO_A, `insert into public.notas_preparadas (recibo_id, dados) values ('r2', $1::jsonb)`, [DADOS], /row-level security/);
  const r = await como<{ n: number }>(DONO_A, `select count(*)::int as n from public.notas_preparadas where recibo_id = 'r2'`);
  assert.equal(r.rows[0].n, 0);
});

await caso('nota só de recibo que existe e é do próprio dono', async () => {
  await falha(DONO_A, `insert into public.notas_preparadas (recibo_id, dados) values ('nao-existe', $1::jsonb)`, [DADOS], /row-level security/);
  await falha(DONO_A, `insert into public.notas_preparadas (recibo_id, dados) values ('rb', $1::jsonb)`, [DADOS], /row-level security/);
});

await caso('ninguém apaga (sem DELETE para authenticated)', async () => {
  await falha(DONO_A, `delete from public.notas_preparadas`, [], /permission denied/);
});

await caso('emitida exige número válido e data; preparada não tem número', async () => {
  await falha(DONO_A, `update public.notas_preparadas set status = 'emitida' where recibo_id = 'r1'`, [], /status_coerente/);
  await falha(DONO_A, `update public.notas_preparadas set status = 'emitida', numero_nota = '12a', emitida_em = now() where recibo_id = 'r1'`, [], /numero_formato/);
  await falha(DONO_A, `update public.notas_preparadas set numero_nota = '12' where recibo_id = 'r1'`, [], /status_coerente/);
  const ok = await como<{ status: string }>(
    DONO_A,
    `update public.notas_preparadas set status = 'emitida', numero_nota = '202600000000123', emitida_em = now() where recibo_id = 'r1' returning status`,
  ).catch(() => null);
  assert.equal(ok, null, '15 dígitos não é número de NFS-e');
  const r = await como<{ status: string }>(
    DONO_A,
    `update public.notas_preparadas set status = 'emitida', numero_nota = '123', emitida_em = now() where recibo_id = 'r1' returning status`,
  );
  assert.equal(r.rows[0].status, 'emitida');
});

await caso('dados de nota emitida não mudam; voltar para preparada libera', async () => {
  await falha(DONO_A, `update public.notas_preparadas set dados = '{"versao":1}'::jsonb where recibo_id = 'r1'`, [], /nota_emitida_imutavel/);
  await como(DONO_A, `update public.notas_preparadas set status = 'preparada', numero_nota = null, emitida_em = null where recibo_id = 'r1'`);
  await como(DONO_A, `update public.notas_preparadas set dados = $1::jsonb where recibo_id = 'r1'`, [DADOS]);
});

await caso('origem (dono/recibo) é imutável e o relógio é do banco', async () => {
  await falha(DONO_A, `update public.notas_preparadas set recibo_id = 'r9' where recibo_id = 'r1'`, [], /origem_imutavel/);
  const r = await como<{ atualizado: boolean }>(
    DONO_A,
    `update public.notas_preparadas set dados = $1::jsonb, atualizado_em = '2000-01-01' where recibo_id = 'r1' returning atualizado_em > '2020-01-01' as atualizado`,
    [DADOS],
  );
  assert.equal(r.rows[0].atualizado, true);
});

await caso('dados precisam ser um objeto JSON', async () => {
  await falha(DONO_A, `insert into public.notas_preparadas (recibo_id, dados) values ('r3', '[]'::jsonb)`, [], /dados_objeto/);
});

await caso('interesse na nota automática: uma vez por conta, só a própria conta vê', async () => {
  await como(DONO_A, `insert into public.nota_automatica_interesse (origem) values ('app')`);
  await falha(DONO_A, `insert into public.nota_automatica_interesse (origem) values ('painel')`, [], /duplicate key|nota_automatica_interesse_pkey/);
  await falha(DONO_A, `insert into public.nota_automatica_interesse (user_id, origem) values ($1, 'app')`, [DONO_B], /row-level security/);
  await falha(DONO_A, `insert into public.nota_automatica_interesse (origem) values ('whatsapp')`, [], /nota_automatica_interesse_origem|check constraint|duplicate/);
  const meu = await como<{ n: number }>(DONO_A, `select count(*)::int as n from public.nota_automatica_interesse`);
  assert.equal(meu.rows[0].n, 1);
  const dele = await como<{ n: number }>(DONO_B, `select count(*)::int as n from public.nota_automatica_interesse`);
  assert.equal(dele.rows[0].n, 0);
  await falha(DONO_A, `delete from public.nota_automatica_interesse`, [], /permission denied/);
  await falha(null, `select * from public.nota_automatica_interesse`, [], /permission denied/);
});

console.log(`\nteste-nota-preparada: ${passos} casos ok\n`);

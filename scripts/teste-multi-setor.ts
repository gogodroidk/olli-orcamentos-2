/**
 * Multi-setor com recorrência: os ofícios recorrentes (dedetização, caixa d'água,
 * piscina, extintores), a dedução por CNAE conferida no IBGE, o exemplo de ativação,
 * o intervalo do pós-venda, os chips de segmento e os campos obrigatórios dos
 * documentos de ofício (RDC ANVISA 622/2022, art. 19; Lei SP 10.770/1989).
 * Também confere a data da NFS-e (01/11/2026 para ME/EPP) onde ela é citada.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FERRAMENTAS,
  VERTICAIS,
  VERTICAL_GERAL,
  deduzirVerticais,
  empresaMostraVertical,
  ferramentasSugeridas,
  verticalPorId,
  type VerticalId,
} from '../src/services/verticais.ts';
import { SEGMENTO_PARA_VERTICAL, VERTICAL_PARA_SEGMENTO } from '../src/services/verticalSegmento.ts';
import { SEGMENTOS } from '../src/types/index.ts';
import { EXEMPLOS_POR_VERTICAL, exemploOrcamentoPara, totalDoExemplo, verticalDoExemplo } from '../src/services/ativacao.ts';
import { listarClientesParaLembrar, retornoDoOficio } from '../src/utils/posVenda.ts';
import { modeloChecklistVertical } from '../src/services/checklistVertical.ts';
import { PACKS_OFICIO } from '../src/services/precificacao.ts';
import {
  AVISO_REVISAO_TECNICA,
  CAMPOS_CERTIFICADO_CAIXA_DAGUA,
  CAMPOS_COMPROVANTE_PRAGAS,
  DECLARACAO_CAIXA_DAGUA,
  MODELOS_DOCUMENTO_OFICIO,
  pendenciasCertificadoCaixaDagua,
  pendenciasComprovantePragas,
  porExtenso,
  pragasDoTexto,
  prazoPorExtenso,
  proximaLimpeza,
  somarDiasData,
  textoModeloDocumentoOficio,
  type DadosCertificadoCaixaDagua,
  type DadosComprovantePragas,
} from '../src/services/documentosOficio.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const RECORRENTES: VerticalId[] = ['dedetizacao', 'caixa_dagua', 'piscina', 'extintores'];

// ─── 1. Catálogo e CNAE (conferidos na API do IBGE em 30/09/2026) ─────────────
for (const id of RECORRENTES) {
  const v = verticalPorId(id);
  assert.equal(v.id, id, `${id} existe no catálogo (não cai no genérico)`);
  assert.ok(v.label.trim().length > 3 && v.emoji, `${id}: rótulo e emoji`);
}
// 8122-2/00 imunização e controle de pragas urbanas → dedetização.
assert.deepEqual(deduzirVerticais('8122-2/00'), ['dedetizacao']);
assert.deepEqual(deduzirVerticais('8122200'), ['dedetizacao']);
// 8129-0/00 cobre caixa d'água E piscina: os dois, na ordem do catálogo.
assert.deepEqual(deduzirVerticais('8129000'), ['caixa_dagua', 'piscina']);
// 3314-7/07 é refrigeração comercial/industrial (antes não mapeado).
assert.deepEqual(deduzirVerticais('3314707'), ['refrigeracao']);
// 3314-7/10 NÃO é refrigeração: "uso geral", inclui extintores.
assert.deepEqual(deduzirVerticais('3314710'), ['extintores']);
assert.ok(!verticalPorId('refrigeracao').cnaes.includes('3314710'), '3314710 saiu de refrigeração');
// 4322-3/03 prevenção contra incêndio → extintores; /02 continua climatização; /01 hidráulica.
assert.deepEqual(deduzirVerticais('4322303'), ['extintores']);
assert.deepEqual(deduzirVerticais('4322302'), ['refrigeracao']);
assert.deepEqual(deduzirVerticais('4322301'), ['hidraulica']);
// Principal primeiro, secundários depois, sem repetir.
assert.deepEqual(deduzirVerticais('8122200', ['8129000', '8122200']), ['dedetizacao', 'caixa_dagua', 'piscina']);
assert.deepEqual(deduzirVerticais('6201501'), ['geral'], 'CNAE sem ofício cai no genérico');
assert.deepEqual(deduzirVerticais(null), ['geral']);

// Ferramentas: documento de ofício disponível só onde existe tela para ele.
assert.equal(FERRAMENTAS.certificado_caixa_dagua.disponivel, true);
assert.ok(verticalPorId('caixa_dagua').ferramentas.includes('certificado_caixa_dagua'));
assert.ok(verticalPorId('dedetizacao').ferramentas.includes('certificado_anvisa'));
assert.match(FERRAMENTAS.certificado_anvisa.descricao, /RDC ANVISA 622\/2022/);
assert.doesNotMatch(FERRAMENTAS.certificado_anvisa.descricao, /RDC 52/, 'a RDC 52/2009 foi revogada');
assert.ok(!verticalPorId('extintores').ferramentas.includes('qr_equipamento'), 'QR ainda é tela de climatização');
assert.deepEqual(ferramentasSugeridas(['caixa_dagua', 'piscina']), ['certificado_caixa_dagua', 'contrato_recorrente']);

// ─── 2. Gate: sem ofício vê tudo; só esconde para outra vertical ─────────────
for (const id of RECORRENTES) {
  assert.equal(empresaMostraVertical(undefined, id), true, `sem ofício vê ${id}`);
  assert.equal(empresaMostraVertical([], id), true);
  assert.equal(empresaMostraVertical([id], id), true);
}
assert.equal(empresaMostraVertical(['refrigeracao'], 'caixa_dagua'), false);
assert.equal(empresaMostraVertical(['geral'], 'dedetizacao'), false, "'geral' não é coringa");
assert.equal(empresaMostraVertical(['caixa_dagua', 'piscina'], 'piscina'), true);

// ─── 3. Chips de segmento (app) e ida-e-volta com a vertical ─────────────────
for (const id of RECORRENTES) {
  const segmento = VERTICAL_PARA_SEGMENTO[id];
  assert.notEqual(segmento, 'outro', `${id} tem chip próprio (o "outro" escondia o documento)`);
  assert.ok(SEGMENTOS.some((s) => s.id === segmento), `chip ${segmento} aparece no cadastro`);
  assert.equal(SEGMENTO_PARA_VERTICAL[segmento], id, `${segmento} volta para ${id}`);
}
assert.equal(SEGMENTO_PARA_VERTICAL.outro, 'geral');
assert.equal(new Set(SEGMENTOS.map((s) => s.id)).size, SEGMENTOS.length, 'chips sem repetição');
assert.equal(SEGMENTOS[SEGMENTOS.length - 1].id, 'outro', '"Outro" continua por último');

// Painel: cópia do gate precisa conhecer os mesmos ids (o tipo é redeclarado lá).
const gatePainel = ler('../webapp/src/olli/verticais.ts');
for (const id of RECORRENTES) assert.match(gatePainel, new RegExp(`"${id}"`), `painel conhece ${id}`);
for (const s of SEGMENTOS) assert.match(gatePainel, new RegExp(`"?${s.id}"?:`), `painel mapeia o chip ${s.id}`);

// ─── 4. Exemplo de ativação por ofício ────────────────────────────────────────
for (const id of RECORRENTES) {
  const exemplo = exemploOrcamentoPara(id);
  assert.ok(exemplo, `${id}: exemplo de ativação`);
  assert.equal(exemplo.vertical, id);
  assert.ok(totalDoExemplo(exemplo) > 0);
}
assert.equal(totalDoExemplo(EXEMPLOS_POR_VERTICAL.caixa_dagua), 300);
assert.equal(totalDoExemplo(EXEMPLOS_POR_VERTICAL.piscina), 480);
assert.equal(totalDoExemplo(EXEMPLOS_POR_VERTICAL.extintores), 300);
assert.equal(verticalDoExemplo({ segmento: 'caixa-dagua' }), 'caixa_dagua', 'segmento novo acha o exemplo');
assert.equal(verticalDoExemplo({ segmento: 'extintores' }), 'extintores');

// ─── 5. Intervalo do pós-venda ("Clientes para lembrar") ─────────────────────
assert.equal(retornoDoOficio(['dedetizacao']).meses, 6);
assert.equal(retornoDoOficio(['caixa_dagua']).meses, 6, "caixa d'água: saneamento orienta 6 meses (SP exige até 360 dias)");
assert.equal(retornoDoOficio(['piscina']).meses, 1, 'piscina: visita semanal, 1 mês sem serviço já é atraso');
assert.equal(retornoDoOficio(['extintores']).meses, 12, 'extintores: inspeção anual (NBR 12962)');
assert.match(retornoDoOficio(['caixa_dagua']).servico, /caixa d'água/);
assert.match(retornoDoOficio(['extintores']).servico, /extintores/);
// Todo ofício com intervalo inteiro positivo e serviço nomeado.
for (const v of [...VERTICAIS, VERTICAL_GERAL]) {
  assert.ok(Number.isInteger(v.retorno.meses) && v.retorno.meses >= 1, `${v.id}: meses inteiro ≥ 1`);
  assert.ok(v.retorno.servico.trim().length > 5, `${v.id}: serviço nomeado`);
}
// A regra do radar respeita o intervalo do ofício: piscina lembra em 1 mês, extintor não.
{
  const agora = new Date('2026-09-30T12:00:00Z');
  const ha40dias = agora.getTime() - 40 * 86_400_000;
  const entrada = {
    clientes: [{ id: 'c1', nome: 'Condomínio Azul', telefone: '11999990000' }],
    servicos: [{ clienteId: 'c1', quando: ha40dias }],
    agora,
  };
  assert.equal(listarClientesParaLembrar({ ...entrada, mesesIntervalo: retornoDoOficio(['piscina']).meses }).length, 1);
  assert.equal(listarClientesParaLembrar({ ...entrada, mesesIntervalo: retornoDoOficio(['extintores']).meses }).length, 0);
}

// ─── 6. Checklist de OS e packs de preço ─────────────────────────────────────
for (const id of RECORRENTES) {
  assert.ok(modeloChecklistVertical(id).length >= 5, `${id}: checklist de OS`);
  assert.ok(PACKS_OFICIO.some((p) => p.vertical === id), `${id}: pack de preço`);
}

// ─── 7. Número por extenso (art. 19, V: prazo "escrito por extenso") ─────────
assert.equal(porExtenso(0), 'zero');
assert.equal(porExtenso(1), 'um');
assert.equal(porExtenso(15), 'quinze');
assert.equal(porExtenso(21), 'vinte e um');
assert.equal(porExtenso(90), 'noventa');
assert.equal(porExtenso(100), 'cem');
assert.equal(porExtenso(101), 'cento e um');
assert.equal(porExtenso(180), 'cento e oitenta');
assert.equal(porExtenso(365), 'trezentos e sessenta e cinco');
assert.equal(porExtenso(1000), 'mil');
assert.equal(porExtenso(1005), 'mil e cinco');
assert.equal(porExtenso(1100), 'mil e cem');
assert.equal(porExtenso(1250), 'mil duzentos e cinquenta');
assert.equal(porExtenso(2000), 'dois mil');
assert.equal(porExtenso(-1), null);
assert.equal(porExtenso(10000), null);
assert.equal(porExtenso(1.5), null);
assert.equal(prazoPorExtenso(90), '90 (noventa) dias');
assert.equal(prazoPorExtenso(1), '1 (um) dia');
assert.equal(prazoPorExtenso(0), null, 'prazo zero não vira documento');
assert.equal(somarDiasData('2026-09-30', 0), '30/09/2026');
assert.equal(somarDiasData('30/09/2026', 360), '25/09/2027');
assert.equal(somarDiasData('31/02/2026', 0), null, 'data impossível não vira data');
assert.equal(somarDiasData('', 10), null);

// ─── 8. Comprovante de controle de pragas: os onze incisos do art. 19 ────────
assert.equal(new Set(CAMPOS_COMPROVANTE_PRAGAS.map((c) => c.base)).size, 11, 'os incisos I a XI estão todos lá');
for (const inciso of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']) {
  assert.ok(CAMPOS_COMPROVANTE_PRAGAS.some((c) => c.base === `art. 19, ${inciso}`), `inciso ${inciso}`);
}
const completo: DadosComprovantePragas = {
  clienteNome: 'Restaurante Bom Prato',
  enderecoImovel: 'Rua A, 10 · São Paulo/SP',
  pragas: pragasDoTexto('Baratas, formigas; ratos', 90),
  dataExecucao: '30/09/2026',
  produtos: [{ nome: 'Produto X', concentracao: '2,5%', grupoQuimico: 'piretroide' }],
  orientacoes: 'Reentrada após 4 horas.',
  responsavelTecnico: 'Maria Souza',
  registroResponsavelTecnico: 'CRQ 04123456',
  telefoneCit: '0800 000 0000',
  empresaRazaoSocial: 'Imuniza Ltda',
  empresaEndereco: 'Rua B, 20 · São Paulo/SP',
  empresaTelefone: '11 3333-3333',
  licencaSanitaria: 'LS 123',
  licencaSanitariaValidade: '31/12/2026',
  licencaAmbiental: 'LA 456',
  licencaAmbientalValidade: '31/12/2026',
};
assert.deepEqual(pendenciasComprovantePragas(completo), [], 'comprovante completo não tem pendência');
assert.deepEqual(completo.pragas.map((p) => p.praga), ['Baratas', 'formigas', 'ratos']);
const ids = (d: DadosComprovantePragas) => pendenciasComprovantePragas(d).map((c) => c.id);
assert.deepEqual(ids({ ...completo, telefoneCit: '  ' }), ['telefoneCit'], 'CIT é obrigatório (X)');
assert.deepEqual(ids({ ...completo, licencaAmbientalValidade: '' }), ['licencas'], 'validade da licença (XI)');
assert.deepEqual(ids({ ...completo, registroResponsavelTecnico: '' }), ['responsavelTecnico'], 'registro do RT (IX)');
assert.deepEqual(ids({ ...completo, orientacoes: '' }), ['orientacoes'], 'orientações (VIII)');
assert.deepEqual(ids({ ...completo, pragas: pragasDoTexto('Baratas', 0) }), ['prazoAssistencia'], 'prazo por extenso (V)');
assert.deepEqual(ids({ ...completo, pragas: [] }), ['pragas', 'prazoAssistencia']);
assert.deepEqual(
  ids({ ...completo, produtos: [{ nome: 'Produto X', concentracao: '', grupoQuimico: 'piretroide' }] }),
  ['produtos'],
  'produto sem concentração (VII)',
);
assert.deepEqual(
  ids({ ...completo, produtos: [{ nome: 'Produto X', concentracao: '2%', grupoQuimico: '' }] }),
  ['gruposQuimicos'],
  'produto sem grupo químico (VI)',
);
assert.deepEqual(ids({ ...completo, produtos: [{ nome: '', concentracao: '', grupoQuimico: '' }] }), ['gruposQuimicos', 'produtos']);
assert.deepEqual(ids({ ...completo, dataExecucao: '99/99/2026' }), ['dataExecucao']);
assert.deepEqual(ids({ ...completo, empresaTelefone: '' }), ['empresa']);
// Vazio de ponta a ponta: todos os campos aparecem, na ordem da norma.
const vazio: DadosComprovantePragas = {
  clienteNome: '', enderecoImovel: '', pragas: [], dataExecucao: '', produtos: [], orientacoes: '',
  responsavelTecnico: '', registroResponsavelTecnico: '', telefoneCit: '', empresaRazaoSocial: '',
  empresaEndereco: '', empresaTelefone: '', licencaSanitaria: '', licencaSanitariaValidade: '',
  licencaAmbiental: '', licencaAmbientalValidade: '',
};
assert.deepEqual(pendenciasComprovantePragas(vazio).map((c) => c.id), CAMPOS_COMPROVANTE_PRAGAS.map((c) => c.id));

// ─── 9. Certificado de caixa d'água ──────────────────────────────────────────
const caixa: DadosCertificadoCaixaDagua = {
  clienteNome: 'Condomínio Azul',
  enderecoImovel: 'Rua C, 30 · São Paulo/SP',
  dataExecucao: '2026-09-30',
  reservatorios: [{ descricao: 'Caixa superior', capacidadeLitros: 10_000 }],
  produtoDesinfeccao: 'Hipoclorito de sódio',
  concentracaoDesinfeccao: 'conforme rótulo',
  numeroLacre: 'L-0001',
  validadeDias: 180,
  responsavel: 'João Lima',
  empresaRazaoSocial: 'Águas Limpas ME',
  empresaDocumento: '12.345.678/0001-90',
  empresaTelefone: '11 4444-4444',
};
assert.deepEqual(pendenciasCertificadoCaixaDagua(caixa), []);
const idsCaixa = (d: DadosCertificadoCaixaDagua) => pendenciasCertificadoCaixaDagua(d).map((c) => c.id);
assert.deepEqual(idsCaixa({ ...caixa, numeroLacre: '' }), ['numeroLacre'], 'lacre (Lei SP 10.770/1989)');
assert.deepEqual(idsCaixa({ ...caixa, validadeDias: 0 }), ['validade']);
assert.deepEqual(idsCaixa({ ...caixa, reservatorios: [{ descricao: 'Cisterna', capacidadeLitros: 0 }] }), ['reservatorios']);
assert.deepEqual(idsCaixa({ ...caixa, concentracaoDesinfeccao: '' }), ['desinfeccao']);
assert.deepEqual(idsCaixa({ ...caixa, empresaDocumento: '' }), ['empresa']);
assert.equal(proximaLimpeza(caixa), '29/03/2027');
assert.equal(proximaLimpeza({ ...caixa, validadeDias: -1 }), null);
assert.match(DECLARACAO_CAIXA_DAGUA, /condições higiênicas favoráveis para o recebimento de água potável/);
for (const c of CAMPOS_CERTIFICADO_CAIXA_DAGUA) {
  assert.ok(/Lei SP 10\.770\/1989|boa prática/.test(c.base), `${c.id}: a origem está dita (lei ou boa prática)`);
}

// ─── 10. Rascunho do painel e aviso de revisão técnica ───────────────────────
assert.match(AVISO_REVISAO_TECNICA, /responsável técnico/);
assert.match(AVISO_REVISAO_TECNICA, /não declara conformidade/);
for (const m of MODELOS_DOCUMENTO_OFICIO) {
  const { titulo, texto } = textoModeloDocumentoOficio(m.id, { nome: 'Empresa X', telefone: '11 1234-5678' }, 'Cliente Y');
  assert.ok(titulo.length > 5);
  assert.match(texto, /Empresa X/, `${m.id}: usa o cadastro da empresa`);
  assert.match(texto, /Cliente Y/);
  assert.match(texto, /________________/, `${m.id}: o que falta fica em branco, nada inventado`);
  assert.ok(texto.includes(AVISO_REVISAO_TECNICA), `${m.id}: leva o aviso de revisão`);
}
{
  const { texto } = textoModeloDocumentoOficio('comprovante_pragas', null, null);
  for (const inciso of ['(I)', '(II)', '(III)', '(IV)', '(V)', '(VI)', '(VII)', '(VIII)', '(IX)', '(X)', '(XI)']) {
    assert.ok(texto.includes(inciso), `rascunho do painel traz o inciso ${inciso}`);
  }
}
{
  // Inciso XI pede número E validade: licença sem validade no cadastro não pode sair
  // como linha completa no rascunho; e o que o app já salvou (validade, CIT) é reusado.
  const soNumero = textoModeloDocumentoOficio('comprovante_pragas', { licencaSanitaria: 'LS-123', licencaAmbiental: 'LA-9' }, null).texto;
  assert.match(soNumero, /Licença sanitária — número e validade \(XI\): LS-123 · validade ________________/);
  assert.match(
    textoModeloDocumentoOficio('comprovante_pragas', { responsavelTecnico: 'Ana' }, null).texto,
    /\(IX\): Ana · registro ________________/,
    'RT sem registro não sai como linha completa (IX pede os dois)',
  );
  assert.match(soNumero, /Licença ambiental — número e validade \(XI\): LA-9 · validade ________________/);
  const completo = textoModeloDocumentoOficio(
    'comprovante_pragas',
    { licencaSanitaria: 'LS-123', licencaSanitariaValidade: '31/12/2026', licencaAmbiental: 'LA-9', licencaAmbientalValidade: '30/06/2027', telefoneCit: '0800 771 3733' },
    null,
  ).texto;
  assert.match(completo, /LS-123 · validade 31\/12\/2026/);
  assert.match(completo, /LA-9 · validade 30\/06\/2027/);
  assert.match(completo, /Toxicológica \(X\): 0800 771 3733/, 'CIT salvo pelo app entra no rascunho');
}
assert.deepEqual(MODELOS_DOCUMENTO_OFICIO.map((m) => m.vertical), ['dedetizacao', 'caixa_dagua']);

// ─── 11. Telas usam a regra única (app + painel) ─────────────────────────────
const telaPragas = ler('../src/screens/CertificadoAnvisaScreen.tsx');
assert.match(telaPragas, /pendenciasComprovantePragas\(dados\)/, 'app confere os campos antes de gerar');
assert.match(telaPragas, /AVISO_REVISAO_TECNICA/);
const telaCaixa = ler('../src/screens/CertificadoCaixaDaguaScreen.tsx');
assert.match(telaCaixa, /pendenciasCertificadoCaixaDagua\(dados\)/);
assert.match(telaCaixa, /AVISO_REVISAO_TECNICA/);
assert.match(ler('../src/navigation/AppNavigator.tsx'), /name="CertificadoCaixaDagua"/);
for (const menu of ['../src/screens/ContaScreen.tsx', '../src/screens/desktop/FerramentasDesktopScreen.tsx']) {
  const t = ler(menu);
  assert.match(t, /route: 'CertificadoCaixaDagua', vertical: 'caixa_dagua'/, `${menu}: atalho com gate`);
  assert.doesNotMatch(t, /RDC 52/, `${menu}: sem a norma revogada`);
}
assert.match(ler('../src/services/catalogoDocumentos.ts'), /destino: 'CertificadoCaixaDagua', vertical: 'caixa_dagua'/);
const pdfPragas = ler('../src/utils/certificadoAnvisaPdf.ts');
assert.doesNotMatch(pdfPragas, /RDC ANVISA nº 52/, 'o PDF não cita a RDC 52/2009 como base');
assert.match(pdfPragas, /BASE_LEGAL_COMPROVANTE_PRAGAS/);
const painel = ler('../webapp/src/pages/olli/documentos/index.tsx');
assert.match(painel, /from "@documentos-oficio"/, 'painel usa o mesmo módulo');
assert.match(painel, /mostraVertical\(m\.vertical\)/, 'painel só oferece o modelo do ofício');
assert.match(ler('../webapp/tsconfig.json'), /"@documentos-oficio": \["\.\.\/src\/services\/documentosOficio\.ts"\]/);
assert.match(ler('../webapp/vite.config.ts'), /"@documentos-oficio": documentosOficioFonte/, 'alias de VALOR no Vite também');
assert.match(ler('../worker/src/voz.js'), /case 'caixa_dagua'/, 'a IA de voz conhece o ofício');

// ─── 12. Data da NFS-e: ME/EPP em 01/11/2026 (Resolução CGSN 191/2026) ───────
const alerta = ler('../docs/ENXAME/ALERTA_NFSE_DATA.md');
assert.match(alerta, /01\/11\/2026/);
assert.match(alerta, /CGSN nº 191/);
assert.match(alerta, /gov\.br\/receitafederal\/pt-br\/assuntos\/noticias\/2026\/agosto/);
const ajuda = ler('../src/content/ajuda/index.ts');
assert.match(ajuda, /ME e EPP do Simples Nacional a partir de 01\/11\/2026/);
for (const arq of ['../worker/src/index.js', '../worker/src/util.js']) {
  assert.doesNotMatch(ler(arq), /1º de setembro de 2026/, `${arq}: data antiga saiu`);
}

console.log('OK — multi-setor: ofícios recorrentes, CNAE, exemplos, pós-venda, chips e documentos de ofício.');

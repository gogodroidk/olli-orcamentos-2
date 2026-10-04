import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  camposPendentesPerfil,
  completarPerfilDeduzido,
  decidirEnvioComCadastro,
  empresaSemCadastro,
  estadoCadastroDaLeitura,
  juntarPendentes,
  perfilOperacionalCompleto,
} from '../src/services/perfilOperacional.ts';
import type { Empresa } from '../src/types/index.ts';

function empresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id: 'empresa_1',
    tipoNegocio: 'autonomo',
    nome: 'Elétrica Lima',
    nomePrestador: 'Ana Lima',
    telefone: '(11) 98888-7777',
    whatsapp: '',
    especialidade: 'Instalações elétricas residenciais',
    segmento: 'eletrica',
    verticais: ['eletrica'],
    ferramentasAtivas: [],
    slogan: '',
    cnpj: '',
    cpf: '',
    endereco: '',
    cidade: 'São Paulo',
    estado: 'SP',
    site: '',
    email: '',
    chavePix: '',
    normas: '',
    ...overrides,
  };
}

assert.equal(perfilOperacionalCompleto(empresa()), true, 'autônomo completo não deve exigir CNPJ');
assert.equal(perfilOperacionalCompleto({ dados: empresa() }), true, 'linha web aninhada deve usar o mesmo contrato');

assert.deepEqual(
  camposPendentesPerfil(empresa({ tipoNegocio: 'empresa', cnpj: '' })),
  ['cnpj'],
  'empresa declarada deve exigir CNPJ',
);

assert.deepEqual(
  camposPendentesPerfil(empresa({ telefone: '', whatsapp: '+55 11 98888-7777' })),
  [],
  'WhatsApp válido pode cumprir o contato operacional de conta legada',
);

assert.deepEqual(
  camposPendentesPerfil(empresa({ telefone: '123', whatsapp: '', segmento: undefined, verticais: [], cidade: '', estado: 'S' })),
  ['telefone', 'verticais', 'cidade', 'estado'],
  'campos inválidos devem ser enumerados numa ordem estável para a UI',
);

// ─── Perfil deduzido (02/10/2026): 8 de 25 contas presas só por isso ───────────
// A conta de revisão da Play: segmento e especialidade, sem tipoNegocio/verticais.
assert.deepEqual(
  camposPendentesPerfil(empresa({ tipoNegocio: undefined, verticais: undefined, segmento: 'ar-condicionado' })),
  [],
  'tipo de serviço vem do segmento e "autônomo" é assumido sem CNPJ',
);
const deduzida = completarPerfilDeduzido(empresa({ tipoNegocio: undefined, verticais: undefined, segmento: 'ar-condicionado', especialidade: '' }));
assert.deepEqual(deduzida.verticais, ['refrigeracao'], 'ar-condicionado → refrigeracao (mesma ponte do gate de ferramentas)');
assert.equal(deduzida.tipoNegocio, 'autonomo', 'sem CNPJ = autônomo');
assert.equal(deduzida.especialidade, 'Ar-condicionado', 'especialidade vazia recebe o rótulo do segmento');
assert.equal(
  completarPerfilDeduzido(empresa({ tipoNegocio: undefined, cnpj: '11.222.333/0001-81' })).tipoNegocio,
  'empresa',
  'CNPJ com 14 dígitos = empresa',
);
assert.equal(
  completarPerfilDeduzido(empresa({ nome: '', nomePrestador: 'Ana Lima' })).nome,
  'Ana Lima',
  'autônomo sem nome do negócio usa o nome do responsável (igual ao Onboarding)',
);
assert.deepEqual(
  camposPendentesPerfil(empresa({ tipoNegocio: 'empresa', nome: '', cnpj: '11222333000181' })),
  ['nome'],
  'empresa com CNPJ continua exigindo o nome do negócio',
);
// A1 (revisão 02/10): o PDF imprime `empresa.nome` CRU. O nome deduzido só
// pré-preenche o formulário; para liberar o envio, nome vazio continua pendente.
assert.deepEqual(
  camposPendentesPerfil(empresa({ tipoNegocio: 'autonomo', nome: '', nomePrestador: 'Ana' })),
  ['nome'],
  'autônomo com nome do negócio VAZIO não libera o envio (o documento sairia sem nome)',
);
assert.equal(
  completarPerfilDeduzido(empresa({ tipoNegocio: 'autonomo', nome: '', nomePrestador: 'Ana' }), { comNome: false }).nome,
  '',
  'sem comNome, a dedução não inventa o nome do negócio',
);
const completa = empresa();
assert.equal(completarPerfilDeduzido(completa), completa, 'nada a deduzir devolve o mesmo objeto');
// O que só a pessoa sabe nunca é inventado (empresa real da conta de revisão em 02/10).
assert.deepEqual(
  camposPendentesPerfil({
    id: 'empresa_1', cpf: '', cnpj: '', nome: '', site: '', email: '', cidade: '', estado: '', normas: '', slogan: '',
    chavePix: '', endereco: '', segmento: 'ar-condicionado', telefone: '', whatsapp: '', especialidade: 'Ar-condicionado', nomePrestador: '',
  }),
  ['nome', 'nomePrestador', 'telefone', 'cidade', 'estado'],
  'empresa da conta de revisão: só sobra o que a pessoa precisa informar',
);

// ─── Linha "sem cadastro" (empresa vazia não conta como "tem") ─────────────────
assert.equal(
  empresaSemCadastro({ dados: { id: 'empresa_1', nome: '', nomePrestador: '', telefone: '', segmento: 'ar-condicionado', especialidade: 'Ar-condicionado' } }),
  true,
  'só segmento/especialidade = sem cadastro',
);
assert.equal(empresaSemCadastro(empresa()), false, 'empresa preenchida tem cadastro');
assert.equal(empresaSemCadastro(empresa({ nome: '', nomePrestador: '', telefone: '', estado: '', cidade: 'Recife' })), false, 'um dado real já é cadastro');
assert.equal(empresaSemCadastro(null), false, 'linha ilegível é "não sei", não "sem cadastro"');
// M2: logo/assinatura/site/slogan/cor foram postos pela pessoa — o Onboarding
// sobrescreveria o `dados` inteiro e perderia o logo.
for (const campo of ['logoUri', 'assinaturaUri', 'site', 'slogan', 'corMarca'] as const) {
  assert.equal(
    empresaSemCadastro({ dados: { id: 'empresa_1', nome: '', nomePrestador: '', telefone: '', segmento: 'ar-condicionado', [campo]: 'x' } }),
    false,
    `só ${campo} preenchido já é cadastro`,
  );
}

// ─── Banner × bloqueio: 3 estados, erro nunca libera nem manda preencher ───────
const incompleto = estadoCadastroDaLeitura({ ok: true, empresa: empresa({ cidade: '' }) });
assert.deepEqual(incompleto, { tipo: 'incompleto', pendentes: ['cidade'] }, 'leitura com falta = incompleto');
assert.deepEqual(estadoCadastroDaLeitura({ ok: true, empresa: empresa() }), { tipo: 'completo' }, 'leitura completa = completo');
assert.equal(estadoCadastroDaLeitura({ ok: true, empresa: null }).tipo, 'incompleto', 'sem empresa nenhuma = incompleto (nada sairia no documento)');
assert.deepEqual(estadoCadastroDaLeitura({ ok: false }), { tipo: 'erro' }, '1ª leitura que falha = erro (nem completo, nem incompleto)');
assert.deepEqual(
  estadoCadastroDaLeitura({ ok: false }, { tipo: 'completo' }),
  { tipo: 'completo' },
  'revalidação que falha mantém o último estado conhecido (o banner não pisca)',
);
assert.equal(estadoCadastroDaLeitura({ ok: false }, incompleto), incompleto, 'idem para incompleto');
assert.deepEqual(estadoCadastroDaLeitura({ ok: false }, { tipo: 'erro' }), { tipo: 'erro' }, 'erro seguido de erro continua erro');

assert.deepEqual(decidirEnvioComCadastro({ tipo: 'completo' }), { libera: true }, 'cadastro completo libera o envio');
assert.deepEqual(
  decidirEnvioComCadastro(incompleto),
  { libera: false, motivo: 'incompleto', pendentes: ['cidade'] },
  'incompleto segura o envio e diz o que falta',
);
assert.deepEqual(decidirEnvioComCadastro({ tipo: 'erro' }), { libera: false, motivo: 'nao_sei' }, 'erro de leitura NUNCA libera o envio');
assert.deepEqual(decidirEnvioComCadastro({ tipo: 'carregando' }), { libera: false, motivo: 'nao_sei' }, 'carregando também não libera');
assert.equal(juntarPendentes(['telefone', 'cidade', 'UF']), 'telefone, cidade e UF');
assert.equal(juntarPendentes(['UF']), 'UF');

// ─── As abas NÃO fecham mais; o envio é que exige o cadastro ───────────────────
const semComentarios = (texto: string) => texto.replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
const nav = semComentarios(readFileSync(new URL('../src/navigation/AppNavigator.tsx', import.meta.url), 'utf8'));
const guard = nav.slice(nav.indexOf('function TabsComPerfilGuard'), nav.indexOf('function comAvisoCadastro'));
assert.ok(guard.length > 50, 'TabsComPerfilGuard existe');
assert.match(guard, /return \(\s*<CadastroNegocioProvider value=\{contexto\}>\s*<TabNavigator \/>/, 'as abas SEMPRE renderizam (o guard só publica o estado)');
assert.doesNotMatch(nav, /Complete seu negócio para continuar/, 'a parede "para continuar" saiu');
assert.match(nav, /HomeComAvisoCadastro/, 'o Início (mobile) leva o banner');
assert.match(nav, /InicioDesktopComAvisoCadastro/, 'o Início (desktop) leva o banner');

const pontosDeEnvio: [string, RegExp][] = [
  ['../src/screens/VisualizarOrcamentoScreen.tsx', /exigirCadastroParaEnviar\('orcamento'\)/g],
  ['../src/screens/EmitirReciboScreen.tsx', /exigirCadastroParaEnviar\('recibo'\)/g],
  ['../src/screens/ClienteDetalheScreen.tsx', /exigirCadastroParaEnviar\('recibo'\)/g],
  ['../src/screens/desktop/RecibosDesktopScreen.tsx', /exigirCadastroParaEnviar\('recibo'\)/g],
  ['../src/components/encerramento/EncerrarAtendimentoModal.tsx', /conferirCadastroParaEnviar\(\)/g],
  // A2: todo gerador de documento com os dados do negócio passa pela porta.
  ['../src/components/documentos/GerarDocumentoModal.tsx', /exigirCadastroParaEnviar\('documento'\)/g],
  ['../src/screens/CertificadoAnvisaScreen.tsx', /exigirCadastroParaEnviar\('documento'\)/g],
  ['../src/screens/CertificadoCaixaDaguaScreen.tsx', /exigirCadastroParaEnviar\('documento'\)/g],
];
for (const [arquivo, padrao] of pontosDeEnvio) {
  const fonte = semComentarios(readFileSync(new URL(arquivo, import.meta.url), 'utf8'));
  assert.ok((fonte.match(padrao) ?? []).length >= 1, `${arquivo} passa pela porta única do envio`);
}
const visualizar = semComentarios(readFileSync(new URL('../src/screens/VisualizarOrcamentoScreen.tsx', import.meta.url), 'utf8'));
assert.equal((visualizar.match(/exigirCadastroParaEnviar\('orcamento'\)/g) ?? []).length, 4, 'PDF, WhatsApp, link do cliente e cobrança com link exigem o cadastro');
for (const fn of ['handleShare', 'handleWhatsApp', 'handleLinkCliente', 'handleCobrar']) {
  // M4: toque duplo — cada envio passa pela trava síncrona que cobre o handler inteiro.
  assert.match(visualizar, new RegExp(`const ${fn} = \\(\\) => comTravaDeEnvio\\(${fn}Agora\\);`), `${fn}: com a trava de toque duplo`);
  const inicio = visualizar.indexOf(`async function ${fn}Agora(`);
  const corpo = visualizar.slice(inicio, visualizar.indexOf('\n  }\n', inicio));
  const portaIdx = corpo.indexOf('exigirCadastroParaEnviar(');
  const envioIdx = Math.min(...['autorizarEntrega(', 'compartilharPdfOrcamento(', 'gerarLinkOrcamento('].map((chamada) => {
    const i = corpo.indexOf(chamada);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  }));
  assert.ok(portaIdx !== -1 && portaIdx < envioIdx, `${fn}: a porta vem ANTES de reservar/gerar o envio`);
}
const porta = semComentarios(readFileSync(new URL('../src/services/exigirCadastro.ts', import.meta.url), 'utf8'));
assert.match(porta, /decidirEnvioComCadastro\(estado\)/, 'a porta usa a regra pura testada acima');
assert.match(porta, /navigate\('MeuNegocio'\)/, 'o aviso leva ao Meu Negócio');
// M5: o técnico não abre o Meu Negócio (GuardaPapel 'ver_valores_agregados').
assert.match(porta, /podeComPapel\('ver_valores_agregados'/, 'a porta confere se quem usa pode completar o cadastro');
assert.match(porta, /Peça ao dono da empresa para completar os dados do negócio\./, 'técnico recebe "peça ao dono", sem "Completar agora"');
const meuNegocioGuarda = readFileSync(new URL('../src/screens/MeuNegocioScreen.tsx', import.meta.url), 'utf8');
assert.match(meuNegocioGuarda, /<GuardaPapel acao="ver_valores_agregados"/, 'a permissão conferida pela porta é a mesma da guarda do Meu Negócio');

// ─── Meu Negócio pré-preenche o deduzido ───────────────────────────────────────
const meuNegocio = semComentarios(readFileSync(new URL('../src/screens/MeuNegocioScreen.tsx', import.meta.url), 'utf8'));
assert.match(meuNegocio, /completarPerfilDeduzido\(emp \?\? empresaEmBranco\(\)\)/, 'ao abrir, o deduzido já aparece preenchido');
assert.match(meuNegocio, /saveEmpresa\(completarPerfilDeduzido\(empresa\)\)/, 'e é gravado junto');

const onboardingMobile = readFileSync(new URL('../src/screens/OnboardingScreen.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(onboardingMobile, /accessibilityLabel="Pular configuração"/, 'onboarding móvel não pode mais ser pulado');
assert.match(onboardingMobile, /perfilOperacionalCompleto\(empresaFinal\)/, 'conclusão móvel deve validar o perfil inteiro');

// Painel web (04/10/2026, paridade com o app 1.2.0): o cadastro incompleto NÃO
// fecha mais o painel — 38 de 61 contas pararam nessa trava antes de qualquer
// orçamento. A guarda só espera saber QUAL empresa é (3 estados); o cadastro é
// cobrado pela porta única na hora em que o documento SAI (PDF e contrato).
const guardWeb = semComentarios(readFileSync(new URL('../webapp/src/routes/components/onboarding-guard.tsx', import.meta.url), 'utf8'));
assert.doesNotMatch(guardWeb, /perfilOperacionalCompleto|<Navigate/, 'painel web não fecha as rotas por cadastro incompleto');
assert.match(guardWeb, /empresa\.isError/, 'mas a leitura da empresa que falha continua segurando o painel (erro nunca vira vazio)');

const portaWeb = semComentarios(readFileSync(new URL('../webapp/src/olli/exigirCadastro.ts', import.meta.url), 'utf8'));
assert.match(portaWeb, /decidirEnvioComCadastro\(estadoCadastroDaLeitura\(\{ ok: false \}\)\)/, 'porta web: leitura que falha vira "não sei"');
assert.match(portaWeb, /staleTime: 0/, 'porta web relê a empresa na hora, não confia no cache');

const orcamentosWeb = semComentarios(readFileSync(new URL('../webapp/src/pages/olli/orcamentos/index.tsx', import.meta.url), 'utf8'));
assert.match(orcamentosWeb, /await exigirCadastro\("orcamento"\)/, 'PDF do orçamento passa pela porta do cadastro');
assert.match(orcamentosWeb, /await exigirCadastro\("contrato"\)/, 'contrato passa pela porta do cadastro');

console.log('OK — contrato único de perfil obrigatório validado no app e no painel web.');

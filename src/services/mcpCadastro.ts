/**
 * MCP de cadastro da OLLI (D-1438 G21).
 *
 * A IA fala JSON-RPC e só enxerga as ferramentas desta lista. Ela propõe
 * cadastro ou edição. Quem grava é um humano: o token de confirmação não volta
 * na resposta da ferramenta. Documento que já saiu (pronto, enviado, assinado,
 * arquivado) não muda. Cláusula de multa não passa do teto do CDC.
 *
 * Este módulo não abre rede, não lê ambiente e não importa o Worker. O estado
 * fica na sessão em memória. A tabela de auditoria está escrita à parte e não
 * é aplicada aqui.
 *
 * Tetos do contrato: a fonte do PDF é `src/utils/contratoPdf.ts`. Este módulo
 * não importa o gerador. O teste lê os dois arquivos e falha se os números
 * divergirem. A multa é o art. 52, §1º, do CDC.
 */
const MULTA_ATRASO_MAX = 2;
const JUROS_MES_MAX = 10;
const AVISO_PREVIO_MAX = 90;

export const MCP_CADASTRO_VERSAO = '2026-11-03.v1';
export const MCP_PROTOCOLO = '2024-11-05';
export const MCP_NOME = 'olli-mcp-cadastro';

export const FERRAMENTAS_MCP = Object.freeze([
	'olli_listar_escopos',
	'olli_buscar',
	'olli_ler',
	'olli_propor_cadastro',
	'olli_propor_edicao',
	'olli_confirmar',
	'olli_cancelar',
	'olli_desfazer',
	'olli_auditoria',
] as const);

export type FerramentaMcp = (typeof FERRAMENTAS_MCP)[number];
export type PapelMcp = 'pessoal' | 'owner' | 'admin' | 'gestor' | 'tecnico';
export type EscopoMcp = 'cliente' | 'produto' | 'servico' | 'clausula_contrato' | 'documento';
export type StatusDocumentoMcp = 'rascunho' | 'pronto' | 'enviado' | 'assinado' | 'arquivado';
export type ValorCampo = string | number | null;

export interface RegistroInicialMcp {
	id: string;
	escopo: EscopoMcp;
	campos: Readonly<Record<string, ValorCampo>>;
	statusDocumento?: StatusDocumentoMcp;
	atualizadoEm?: string;
	excluidoEm?: string | null;
	versao?: number;
}

export interface OpcoesSessaoMcp {
	atorId: string;
	tenantId: string;
	papel: PapelMcp;
	registros?: readonly RegistroInicialMcp[];
	relogio?: () => string;
	novoId?: () => string;
	novoToken?: () => string;
}

export interface DiffCampoMcp {
	campo: string;
	antes: ValorCampo;
	depois: ValorCampo;
}

export interface SessaoMcp {
	atender(mensagem: unknown): Promise<RespostaJsonRpc | null>;
	tokenParaUsuario(rascunhoId: string): string | null;
	diffParaUsuario(rascunhoId: string): readonly DiffCampoMcp[] | null;
	confirmarPeloUsuario(rascunhoId: string): Promise<ResultadoMcp>;
	desfazerPeloUsuario(rascunhoId: string): Promise<ResultadoMcp>;
}

export interface RespostaJsonRpc {
	jsonrpc: '2.0';
	id: string | number | null;
	result?: unknown;
	error?: { code: number; message: string };
}

export type ResultadoMcp =
	| { ok: true; [chave: string]: unknown }
	| { ok: false; motivo: string };

const CONFIRMACAO_MS = 30 * 60 * 1000;
const DESFAZER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RASCUNHOS_ABERTOS = 20;
const MAX_MUDANCAS = 8;
const MAX_AUDITORIA = 50;
const MAX_BUSCA = 5;
const ID_OK = /^[A-Za-z0-9._:-]{1,80}$/;
const CHAVE_OK = /^[A-Za-z0-9._:-]{8,80}$/;
const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CAMPOS: Record<EscopoMcp, readonly string[]> = {
	cliente: ['nome', 'telefone', 'endereco', 'complemento', 'cidade', 'estado', 'cep'],
	produto: ['nome', 'descricao', 'preco', 'custo', 'unidade', 'marca', 'modelo'],
	servico: ['nome', 'descricao', 'preco', 'custo', 'unidade'],
	clausula_contrato: [
		'garantia',
		'multaAtrasoPercent',
		'jurosMesPercent',
		'avisoPrevioDias',
		'foro',
		'obrigacoesContratada',
		'obrigacoesContratante',
		'clausulasExtras',
	],
	documento: ['titulo', 'observacoes', 'clausulasExtras'],
};

const ESCOPOS_POR_PAPEL: Record<PapelMcp, ReadonlySet<EscopoMcp>> = {
	pessoal: new Set(['cliente', 'produto', 'servico', 'clausula_contrato', 'documento']),
	owner: new Set(['cliente', 'produto', 'servico', 'clausula_contrato', 'documento']),
	admin: new Set(['cliente', 'documento']),
	gestor: new Set(['cliente', 'documento']),
	tecnico: new Set(['cliente', 'documento']),
};

const STATUS_DOCUMENTO = new Set<StatusDocumentoMcp>(['rascunho', 'pronto', 'enviado', 'assinado', 'arquivado']);
const CAMPOS_DOCUMENTO_OPERACAO = new Set(['titulo', 'observacoes']);
const CHAVES_PROIBIDAS = new Set([
	'sql', 'comando', 'codigo', 'codigofonte', 'wrangler', 'servicerole', 'service_role',
	'senha', 'tokenservico', 'migration', 'shell', 'eval', 'tenantid', 'user_id', 'userid',
	'apikey', 'authorization', 'prompt', 'system', '__proto__', 'constructor', 'prototype',
	'accesstoken', 'refreshtoken', 'cpf', 'cnpj', 'chavepix',
]);

interface Registro {
	id: string;
	escopo: EscopoMcp;
	campos: Record<string, ValorCampo>;
	statusDocumento?: StatusDocumentoMcp;
	atualizadoEm: string;
	excluidoEm: string | null;
	versao: number;
}

interface Rascunho {
	id: string;
	escopo: EscopoMcp;
	registroId: string;
	operacao: 'criar' | 'editar';
	antes: Record<string, ValorCampo>;
	depois: Record<string, ValorCampo>;
	campos: string[];
	versaoEsperada: number | null;
	tokenHash: string;
	estado: 'aguardando_confirmacao' | 'aplicada' | 'cancelada' | 'revertida';
	criadoEm: string;
	aplicadoEm?: string;
	chaveIdempotencia?: string;
	assinatura: string;
	casca: boolean;
}

interface EventoAuditoria {
	id: string;
	revisao: number;
	em: string;
	ferramenta: string;
	resultado: 'ok' | 'negada' | 'conflito' | 'aplicada' | 'cancelada' | 'revertida';
	motivo: string;
	rascunhoId?: string;
	escopo?: EscopoMcp;
	registroId?: string;
	campos: string[];
	hashAntes?: string;
	hashDepois?: string;
}

function objetoPlano(valor: unknown): Record<string, unknown> | null {
	if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
	const proto = Object.getPrototypeOf(valor);
	if (proto !== Object.prototype && proto !== null) return null;
	return valor as Record<string, unknown>;
}

function chaveProibida(nome: string): boolean {
	const normal = nome.toLowerCase().replace(/[^a-z0-9_]/g, '');
	return CHAVES_PROIBIDAS.has(nome.toLowerCase()) || CHAVES_PROIBIDAS.has(normal);
}

function argumentoInseguro(valor: unknown, profundidade = 0): string | null {
	if (profundidade > 6) return 'pedido_profundo';
	if (Array.isArray(valor)) {
		if (valor.length > 20) return 'pedido_grande';
		for (const item of valor) {
			const erro = argumentoInseguro(item, profundidade + 1);
			if (erro) return erro;
		}
		return null;
	}
	const objeto = objetoPlano(valor);
	if (!objeto) return null;
	const chaves = Object.keys(objeto);
	if (chaves.length > 40) return 'pedido_grande';
	for (const chave of chaves) {
		if (chaveProibida(chave)) return 'argumento_proibido';
		const erro = argumentoInseguro(objeto[chave], profundidade + 1);
		if (erro) return erro;
	}
	return null;
}

async function sha256(valor: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function igualConstante(esquerda: string, direita: string): boolean {
	if (esquerda.length !== direita.length) return false;
	let diff = 0;
	for (let i = 0; i < esquerda.length; i += 1) diff |= esquerda.charCodeAt(i) ^ direita.charCodeAt(i);
	return diff === 0;
}

function canonico(valor: unknown): string {
	if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
	if (Array.isArray(valor)) return `[${valor.map((item) => canonico(item)).join(',')}]`;
	const objeto = valor as Record<string, unknown>;
	const chaves = Object.keys(objeto).sort();
	return `{${chaves.map((chave) => `${JSON.stringify(chave)}:${canonico(objeto[chave])}`).join(',')}}`;
}

function instante(iso: string): number | null {
	const ms = Date.parse(iso);
	return Number.isFinite(ms) ? ms : null;
}

function temControle(valor: string): boolean {
	for (let i = 0; i < valor.length; i += 1) {
		const codigo = valor.charCodeAt(i);
		if (codigo <= 8 || codigo === 11 || codigo === 12 || (codigo >= 14 && codigo <= 31) || codigo === 127) return true;
	}
	return false;
}

function textoLimpo(valor: string, limite: number, manterQuebra: boolean): string | null {
	if (temControle(valor)) return null;
	const normal = (manterQuebra ? valor.replace(/\r\n/g, '\n') : valor.replace(/[\r\n\t]+/g, ' '))
		.replace(/[ ]{2,}/g, ' ')
		.trim();
	if (!normal || normal.length > limite) return null;
	return normal;
}

function numeroLimitado(valor: unknown, maximo: number): number | null {
	if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > maximo) return null;
	const arredondado = Math.round(valor * 100) / 100;
	return arredondado > maximo ? null : arredondado;
}

function normalizarCampo(campo: string, valor: unknown): { ok: true; valor: ValorCampo } | { ok: false; motivo: string } {
	if (valor === null) {
		if (campo === 'nome' || campo === 'titulo' || campo === 'preco' || campo === 'unidade') {
			return { ok: false, motivo: 'valor_invalido' };
		}
		return { ok: true, valor: null };
	}
	if (campo === 'preco' || campo === 'custo') {
		const numero = numeroLimitado(valor, 100_000_000);
		if (numero === null || (campo === 'preco' && valor === null)) return { ok: false, motivo: 'valor_invalido' };
		return { ok: true, valor: numero };
	}
	if (campo === 'multaAtrasoPercent' || campo === 'jurosMesPercent' || campo === 'avisoPrevioDias') {
		if (typeof valor !== 'number' || !Number.isFinite(valor)) return { ok: false, motivo: 'valor_invalido' };
		const teto = campo === 'multaAtrasoPercent' ? MULTA_ATRASO_MAX : campo === 'jurosMesPercent' ? JUROS_MES_MAX : AVISO_PREVIO_MAX;
		const motivo = campo === 'multaAtrasoPercent' ? 'teto_cdc' : campo === 'jurosMesPercent' ? 'teto_juros' : 'teto_aviso';
		if (campo === 'avisoPrevioDias' && !Number.isInteger(valor)) return { ok: false, motivo: 'valor_invalido' };
		if (valor < 0 || valor > teto) return { ok: false, motivo };
		const arredondado = campo === 'avisoPrevioDias' ? valor : Math.round(valor * 100) / 100;
		if (arredondado > teto) return { ok: false, motivo };
		return { ok: true, valor: arredondado };
	}
	if (typeof valor !== 'string') return { ok: false, motivo: 'valor_invalido' };
	if (campo === 'telefone') {
		const digitos = valor.replace(/\D/g, '');
		if (!digitos) return { ok: true, valor: null };
		if (digitos.length < 10 || digitos.length > 13) return { ok: false, motivo: 'valor_invalido' };
		return { ok: true, valor: digitos };
	}
	if (campo === 'estado') {
		const texto = textoLimpo(valor, 2, false);
		if (!texto || !/^[A-Za-z]{2}$/.test(texto)) return { ok: false, motivo: 'valor_invalido' };
		return { ok: true, valor: texto.toUpperCase() };
	}
	if (campo === 'cep') {
		const digitos = valor.replace(/\D/g, '');
		if (!digitos) return { ok: true, valor: null };
		if (digitos.length !== 8) return { ok: false, motivo: 'valor_invalido' };
		return { ok: true, valor: `${digitos.slice(0, 5)}-${digitos.slice(5)}` };
	}
	const longo = new Set(['garantia', 'foro', 'obrigacoesContratada', 'obrigacoesContratante', 'clausulasExtras', 'observacoes']);
	const limite = campo === 'nome' || campo === 'titulo' ? 160
		: campo === 'descricao' ? 500
			: campo === 'unidade' ? 16
				: campo === 'marca' || campo === 'modelo' || campo === 'cidade' ? 80
					: campo === 'complemento' ? 120
						: longo.has(campo) ? 4000
							: 240;
	const texto = textoLimpo(valor, limite, longo.has(campo));
	if (!texto) return { ok: false, motivo: 'valor_invalido' };
	return { ok: true, valor: texto };
}

function camposDoPapel(papel: PapelMcp, escopo: EscopoMcp): ReadonlySet<string> {
	if (!ESCOPOS_POR_PAPEL[papel].has(escopo)) return new Set();
	if (escopo === 'documento' && (papel === 'gestor' || papel === 'tecnico')) return CAMPOS_DOCUMENTO_OPERACAO;
	return new Set(CAMPOS[escopo]);
}

function nomeBusca(valor: string): string {
	return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function conteudo(valor: ResultadoMcp): { content: { type: 'text'; text: string }[]; isError: boolean } {
	return { content: [{ type: 'text', text: JSON.stringify(valor) }], isError: valor.ok === false };
}

function schemas(): Record<FerramentaMcp, { descricao: string; schema: Record<string, unknown> }> {
	const escopo = { type: 'string', enum: Object.keys(CAMPOS) };
	const mudancas = {
		type: 'array',
		minItems: 1,
		maxItems: MAX_MUDANCAS,
		items: {
			type: 'object',
			additionalProperties: false,
			required: ['campo', 'proposto'],
			properties: { campo: { type: 'string' }, proposto: { type: ['string', 'number', 'null'] } },
		},
	};
	return {
		olli_listar_escopos: {
			descricao: 'Lista escopos e campos que este papel pode propor. Não devolve cadastro.',
			schema: { type: 'object', additionalProperties: false, properties: {} },
		},
		olli_buscar: {
			descricao: 'Busca por nome ou título e devolve no máximo 5 ids. Não devolve telefone, endereço nem CPF.',
			schema: {
				type: 'object', additionalProperties: false, required: ['escopo', 'consulta'],
				properties: { escopo, consulta: { type: 'string', minLength: 3, maxLength: 40 } },
			},
		},
		olli_ler: {
			descricao: 'Lê um registro pelo id, só com os campos permitidos ao papel.',
			schema: {
				type: 'object', additionalProperties: false, required: ['escopo', 'registroId'],
				properties: { escopo, registroId: { type: 'string' } },
			},
		},
		olli_propor_cadastro: {
			descricao: 'Propõe um cliente, produto ou serviço novo. Não grava. O token fica fora desta resposta.',
			schema: {
				type: 'object', additionalProperties: false, required: ['escopo', 'mudancas'],
				properties: { escopo, mudancas, chaveIdempotencia: { type: 'string' } },
			},
		},
		olli_propor_edicao: {
			descricao: 'Propõe edição de um id já existente. Documento que não está em rascunho é recusado.',
			schema: {
				type: 'object', additionalProperties: false, required: ['escopo', 'registroId', 'mudancas'],
				properties: { escopo, registroId: { type: 'string' }, mudancas, chaveIdempotencia: { type: 'string' } },
			},
		},
		olli_confirmar: {
			descricao: 'Grava um rascunho se o humano entregar o token. Sem o token, não grava.',
			schema: {
				type: 'object', additionalProperties: false, required: ['rascunhoId', 'confirmationToken'],
				properties: { rascunhoId: { type: 'string' }, confirmationToken: { type: 'string' } },
			},
		},
		olli_cancelar: {
			descricao: 'Desiste de um rascunho ainda não gravado. Não precisa do token.',
			schema: {
				type: 'object', additionalProperties: false, required: ['rascunhoId'],
				properties: { rascunhoId: { type: 'string' } },
			},
		},
		olli_desfazer: {
			descricao: 'Restaura o estado anterior de uma gravação confirmada, com o mesmo token, por 7 dias.',
			schema: {
				type: 'object', additionalProperties: false, required: ['rascunhoId', 'confirmationToken'],
				properties: { rascunhoId: { type: 'string' }, confirmationToken: { type: 'string' } },
			},
		},
		olli_auditoria: {
			descricao: 'Lista a trilha recente: ferramenta, resultado e nomes de campo. Sem valor de cadastro.',
			schema: { type: 'object', additionalProperties: false, properties: {} },
		},
	};
}

export function criarSessaoMcp(opcoes: OpcoesSessaoMcp): SessaoMcp {
	if (!opcoes.atorId.trim() || !opcoes.tenantId.trim() || !ESCOPOS_POR_PAPEL[opcoes.papel]) {
		throw new Error('sessao_invalida');
	}
	const relogio = opcoes.relogio ?? (() => new Date().toISOString());
	const novoId = opcoes.novoId ?? (() => crypto.randomUUID());
	const novoToken = opcoes.novoToken ?? (() => crypto.randomUUID());
	const registros = new Map<string, Registro>();
	const rascunhos = new Map<string, Rascunho>();
	const tokens = new Map<string, string>();
	const eventos: EventoAuditoria[] = [];
	let revisao = 0;
	let inicializada = false;
	let emCurso = false;
	let seq = 0;

	for (const bruto of opcoes.registros ?? []) {
		if (!ID_OK.test(bruto.id) || !CAMPOS[bruto.escopo]) throw new Error('registro_inicial_invalido');
		if (bruto.escopo === 'clausula_contrato' && bruto.id !== 'padrao') throw new Error('registro_inicial_invalido');
		if (bruto.escopo === 'documento' && (!bruto.statusDocumento || !STATUS_DOCUMENTO.has(bruto.statusDocumento))) {
			throw new Error('registro_inicial_invalido');
		}
		const campos: Record<string, ValorCampo> = {};
		for (const campo of CAMPOS[bruto.escopo]) {
			if (!Object.hasOwn(bruto.campos, campo)) continue;
			const normal = normalizarCampo(campo, bruto.campos[campo]);
			if (!normal.ok) throw new Error('registro_inicial_invalido');
			campos[campo] = normal.valor;
		}
		const agora = bruto.atualizadoEm ?? relogio();
		registros.set(`${bruto.escopo}:${bruto.id}`, {
			id: bruto.id,
			escopo: bruto.escopo,
			campos,
			statusDocumento: bruto.statusDocumento,
			atualizadoEm: agora,
			excluidoEm: bruto.excluidoEm ?? null,
			versao: bruto.versao ?? 1,
		});
	}

	function agoraIso(): string {
		const iso = relogio();
		if (instante(iso) === null) throw new Error('relogio_invalido');
		return iso;
	}

	async function auditar(parcial: Omit<EventoAuditoria, 'id' | 'revisao' | 'em'>): Promise<void> {
		revisao += 1;
		eventos.push({ ...parcial, id: `aud-${revisao}`, revisao, em: agoraIso() });
	}

	function chaveRegistro(escopo: EscopoMcp, id: string): string {
		return `${escopo}:${id}`;
	}

	function ativo(registro: Registro | undefined): registro is Registro {
		return Boolean(registro && !registro.excluidoEm);
	}

	function aberto(rascunho: Rascunho, agora: number): boolean {
		const criado = instante(rascunho.criadoEm);
		return rascunho.estado === 'aguardando_confirmacao' && criado !== null && agora <= criado + CONFIRMACAO_MS;
	}

	async function resumir(rascunho: Rascunho, motivo: string): Promise<ResultadoMcp> {
		const criado = instante(rascunho.criadoEm);
		await auditar({
			ferramenta: rascunho.operacao === 'criar' ? 'olli_propor_cadastro' : 'olli_propor_edicao',
			resultado: 'ok',
			motivo,
			rascunhoId: rascunho.id,
			escopo: rascunho.escopo,
			registroId: rascunho.registroId,
			campos: rascunho.campos,
			hashAntes: await sha256(canonico(rascunho.antes)),
			hashDepois: await sha256(canonico(rascunho.depois)),
		});
		return {
			ok: true,
			rascunhoId: rascunho.id,
			escopo: rascunho.escopo,
			registroId: rascunho.registroId,
			operacao: rascunho.operacao,
			campos: rascunho.campos,
			expiraEm: new Date((criado ?? 0) + CONFIRMACAO_MS).toISOString(),
			precisaConfirmacaoHumana: true,
		};
	}

	function lerMudancas(bruto: unknown, permitidos: ReadonlySet<string>): { ok: true; mudancas: { campo: string; valor: ValorCampo }[] } | { ok: false; motivo: string } {
		if (!Array.isArray(bruto) || bruto.length < 1 || bruto.length > MAX_MUDANCAS) return { ok: false, motivo: 'pedido_invalido' };
		const vistos = new Set<string>();
		const mudancas: { campo: string; valor: ValorCampo }[] = [];
		for (const item of bruto) {
			const linha = objetoPlano(item);
			const campo = typeof linha?.campo === 'string' ? linha.campo : '';
			if (!campo || vistos.has(campo)) return { ok: false, motivo: 'pedido_invalido' };
			if (!permitidos.has(campo)) return { ok: false, motivo: 'campo_nao_permitido' };
			const normal = normalizarCampo(campo, linha?.proposto);
			if (!normal.ok) return normal;
			vistos.add(campo);
			mudancas.push({ campo, valor: normal.valor });
		}
		return { ok: true, mudancas };
	}

	async function propor(operacao: 'criar' | 'editar', args: Record<string, unknown>): Promise<ResultadoMcp> {
		const escopo = args.escopo;
		if (typeof escopo !== 'string' || !CAMPOS[escopo as EscopoMcp]) return { ok: false, motivo: 'escopo_invalido' };
		const escopoOk = escopo as EscopoMcp;
		const permitidos = camposDoPapel(opcoes.papel, escopoOk);
		if (permitidos.size === 0) {
			await auditar({ ferramenta: operacao === 'criar' ? 'olli_propor_cadastro' : 'olli_propor_edicao', resultado: 'negada', motivo: 'papel_sem_permissao', escopo: escopoOk, campos: [] });
			return { ok: false, motivo: 'papel_sem_permissao' };
		}
		if (operacao === 'criar' && (escopoOk === 'documento' || escopoOk === 'clausula_contrato')) {
			return { ok: false, motivo: 'cadastro_nao_permitido' };
		}
		const registroInformado = operacao === 'editar' ? args.registroId : undefined;
		if (operacao === 'editar' && (typeof registroInformado !== 'string' || !ID_OK.test(registroInformado))) {
			return { ok: false, motivo: 'registro_invalido' };
		}
		if (escopoOk === 'clausula_contrato' && registroInformado !== 'padrao') return { ok: false, motivo: 'registro_invalido' };
		const mudancas = lerMudancas(args.mudancas, permitidos);
		if (!mudancas.ok) return mudancas;
		if (operacao === 'criar' && !mudancas.mudancas.some((item) => item.campo === 'nome' && typeof item.valor === 'string')) {
			return { ok: false, motivo: 'nome_obrigatorio' };
		}
		const registroEdicao = operacao === 'editar' && typeof registroInformado === 'string' ? registroInformado : '';
		const chave = args.chaveIdempotencia;
		if (chave !== undefined && (typeof chave !== 'string' || !CHAVE_OK.test(chave))) return { ok: false, motivo: 'chave_invalida' };
		const assinatura = canonico({
			operacao,
			escopo: escopoOk,
			registroId: registroEdicao,
			mudancas: mudancas.mudancas,
		});
		if (typeof chave === 'string') {
			const anterior = [...rascunhos.values()].find((item) => item.chaveIdempotencia === chave);
			if (anterior) {
				if (anterior.assinatura !== assinatura) return { ok: false, motivo: 'idempotencia_divergente' };
				return resumir(anterior, 'idempotente');
			}
		}
		const agora = agoraIso();
		const agoraMs = instante(agora) ?? 0;
		const abertos = [...rascunhos.values()].filter((item) => aberto(item, agoraMs)).length;
		if (abertos >= MAX_RASCUNHOS_ABERTOS) return { ok: false, motivo: 'limite_rascunhos' };
		const registroId = registroEdicao || novoId();
		if (!ID_OK.test(registroId)) return { ok: false, motivo: 'registro_invalido' };
		let versaoEsperada: number | null = null;
		let casca = false;
		const antes: Record<string, ValorCampo> = {};
		if (operacao === 'editar') {
			const registro = registros.get(chaveRegistro(escopoOk, registroId));
			if (!ativo(registro) && escopoOk === 'clausula_contrato') {
				casca = true;
				for (const item of mudancas.mudancas) antes[item.campo] = null;
			} else if (!ativo(registro)) {
				return { ok: false, motivo: 'nao_encontrado' };
			} else if (registro.escopo === 'documento' && registro.statusDocumento !== 'rascunho') {
				await auditar({ ferramenta: 'olli_propor_edicao', resultado: 'negada', motivo: 'documento_congelado', escopo: escopoOk, registroId, campos: mudancas.mudancas.map((item) => item.campo) });
				return { ok: false, motivo: 'documento_congelado' };
			} else {
				versaoEsperada = registro.versao;
				for (const item of mudancas.mudancas) antes[item.campo] = registro.campos[item.campo] ?? null;
			}
		}
		const depois: Record<string, ValorCampo> = {};
		for (const item of mudancas.mudancas) depois[item.campo] = item.valor;
		const token = novoToken();
		if (!UUID_OK.test(token)) throw new Error('token_invalido');
		seq += 1;
		const rascunho: Rascunho = {
			id: `mcp-${seq}`,
			escopo: escopoOk,
			registroId,
			operacao,
			antes,
			depois,
			campos: mudancas.mudancas.map((item) => item.campo),
			versaoEsperada,
			tokenHash: await sha256(token),
			estado: 'aguardando_confirmacao',
			criadoEm: agora,
			chaveIdempotencia: typeof chave === 'string' ? chave : undefined,
			assinatura,
			casca,
		};
		rascunhos.set(rascunho.id, rascunho);
		tokens.set(rascunho.id, token);
		return resumir(rascunho, 'rascunho_criado');
	}

	async function tokenConfere(rascunho: Rascunho | undefined, token: unknown): Promise<boolean> {
		if (typeof token !== 'string' || !UUID_OK.test(token)) return false;
		const hash = rascunho?.tokenHash ?? '0'.repeat(64);
		return igualConstante(hash, await sha256(token)) && Boolean(rascunho);
	}

	function mesmoMapa(atual: Record<string, ValorCampo>, esperado: Record<string, ValorCampo>, campos: readonly string[]): boolean {
		return campos.every((campo) => (atual[campo] ?? null) === (esperado[campo] ?? null));
	}

	async function aplicar(rascunho: Rascunho): Promise<ResultadoMcp> {
		const agora = agoraIso();
		const agoraMs = instante(agora) ?? 0;
		const criado = instante(rascunho.criadoEm) ?? 0;
		if (rascunho.estado !== 'aguardando_confirmacao') return { ok: false, motivo: 'estado_invalido' };
		if (agoraMs > criado + CONFIRMACAO_MS) return { ok: false, motivo: 'confirmacao_expirada' };
		const permitidos = camposDoPapel(opcoes.papel, rascunho.escopo);
		if (rascunho.campos.some((campo) => !permitidos.has(campo))) return { ok: false, motivo: 'papel_sem_permissao' };
		if (rascunho.operacao === 'criar' || rascunho.casca) {
			if (ativo(registros.get(chaveRegistro(rascunho.escopo, rascunho.registroId)))) return { ok: false, motivo: 'conflito' };
			registros.set(chaveRegistro(rascunho.escopo, rascunho.registroId), {
				id: rascunho.registroId,
				escopo: rascunho.escopo,
				campos: { ...rascunho.depois },
				atualizadoEm: agora,
				excluidoEm: null,
				versao: 1,
			});
		} else {
			const registro = registros.get(chaveRegistro(rascunho.escopo, rascunho.registroId));
			if (!ativo(registro) || registro.versao !== rascunho.versaoEsperada || !mesmoMapa(registro.campos, rascunho.antes, rascunho.campos)) {
				await auditar({ ferramenta: 'olli_confirmar', resultado: 'conflito', motivo: 'conflito', rascunhoId: rascunho.id, escopo: rascunho.escopo, registroId: rascunho.registroId, campos: rascunho.campos });
				return { ok: false, motivo: 'conflito' };
			}
			if (registro.escopo === 'documento' && registro.statusDocumento !== 'rascunho') return { ok: false, motivo: 'documento_congelado' };
			registro.campos = { ...registro.campos, ...rascunho.depois };
			registro.versao += 1;
			registro.atualizadoEm = agora;
		}
		rascunho.estado = 'aplicada';
		rascunho.aplicadoEm = agora;
		await auditar({ ferramenta: 'olli_confirmar', resultado: 'aplicada', motivo: 'confirmacao_aceita', rascunhoId: rascunho.id, escopo: rascunho.escopo, registroId: rascunho.registroId, campos: rascunho.campos, hashAntes: await sha256(canonico(rascunho.antes)), hashDepois: await sha256(canonico(rascunho.depois)) });
		return { ok: true, rascunhoId: rascunho.id, estado: 'aplicada', registroId: rascunho.registroId };
	}

	async function confirmar(rascunhoId: unknown, token: unknown): Promise<ResultadoMcp> {
		if (typeof rascunhoId !== 'string') return { ok: false, motivo: 'confirmacao_invalida' };
		const rascunho = rascunhos.get(rascunhoId);
		if (!(await tokenConfere(rascunho, token)) || !rascunho) {
			await auditar({ ferramenta: 'olli_confirmar', resultado: 'negada', motivo: 'confirmacao_invalida', campos: [] });
			return { ok: false, motivo: 'confirmacao_invalida' };
		}
		return aplicar(rascunho);
	}

	async function desfazer(rascunhoId: unknown, token: unknown): Promise<ResultadoMcp> {
		if (typeof rascunhoId !== 'string') return { ok: false, motivo: 'confirmacao_invalida' };
		const rascunho = rascunhos.get(rascunhoId);
		if (!(await tokenConfere(rascunho, token)) || !rascunho) {
			await auditar({ ferramenta: 'olli_desfazer', resultado: 'negada', motivo: 'confirmacao_invalida', campos: [] });
			return { ok: false, motivo: 'confirmacao_invalida' };
		}
		if (rascunho.estado !== 'aplicada' || !rascunho.aplicadoEm) return { ok: false, motivo: 'estado_invalido' };
		const agora = agoraIso();
		const aplicado = instante(rascunho.aplicadoEm) ?? 0;
		if ((instante(agora) ?? 0) > aplicado + DESFAZER_MS) return { ok: false, motivo: 'desfazer_expirado' };
		const registro = registros.get(chaveRegistro(rascunho.escopo, rascunho.registroId));
		if (!ativo(registro) || !mesmoMapa(registro.campos, rascunho.depois, rascunho.campos)) {
			await auditar({ ferramenta: 'olli_desfazer', resultado: 'conflito', motivo: 'conflito', rascunhoId: rascunho.id, escopo: rascunho.escopo, registroId: rascunho.registroId, campos: rascunho.campos });
			return { ok: false, motivo: 'conflito' };
		}
		if (rascunho.operacao === 'criar' || rascunho.casca) {
			if (registro.versao !== 1) return { ok: false, motivo: 'conflito' };
			registro.excluidoEm = agora;
			registro.versao = 2;
		} else {
			if (registro.versao !== (rascunho.versaoEsperada ?? 0) + 1) return { ok: false, motivo: 'conflito' };
			for (const campo of rascunho.campos) {
				const anterior = rascunho.antes[campo];
				if (anterior === null || anterior === undefined) delete registro.campos[campo];
				else registro.campos[campo] = anterior;
			}
			registro.versao += 1;
		}
		registro.atualizadoEm = agora;
		rascunho.estado = 'revertida';
		tokens.delete(rascunho.id);
		await auditar({ ferramenta: 'olli_desfazer', resultado: 'revertida', motivo: 'reversao_concluida', rascunhoId: rascunho.id, escopo: rascunho.escopo, registroId: rascunho.registroId, campos: rascunho.campos, hashAntes: await sha256(canonico(rascunho.depois)), hashDepois: await sha256(canonico(rascunho.antes)) });
		return { ok: true, rascunhoId: rascunho.id, estado: 'revertida' };
	}

	const argumentosPermitidos: Record<FerramentaMcp, readonly string[]> = {
		olli_listar_escopos: [],
		olli_buscar: ['escopo', 'consulta'],
		olli_ler: ['escopo', 'registroId'],
		olli_propor_cadastro: ['escopo', 'mudancas', 'chaveIdempotencia'],
		olli_propor_edicao: ['escopo', 'registroId', 'mudancas', 'chaveIdempotencia'],
		olli_confirmar: ['rascunhoId', 'confirmationToken'],
		olli_cancelar: ['rascunhoId'],
		olli_desfazer: ['rascunhoId', 'confirmationToken'],
		olli_auditoria: [],
	};

	async function executar(nome: string, argsBrutos: unknown): Promise<ResultadoMcp> {
		if (!FERRAMENTAS_MCP.includes(nome as FerramentaMcp)) {
			await auditar({ ferramenta: 'ferramenta_recusada', resultado: 'negada', motivo: 'ferramenta_recusada', campos: [] });
			return { ok: false, motivo: 'ferramenta_recusada' };
		}
		const ferramenta = nome as FerramentaMcp;
		const inseguro = argumentoInseguro(argsBrutos);
		if (inseguro) {
			await auditar({ ferramenta: nome, resultado: 'negada', motivo: inseguro, campos: [] });
			return { ok: false, motivo: inseguro };
		}
		const args = objetoPlano(argsBrutos) ?? {};
		if (Object.keys(args).some((chave) => !argumentosPermitidos[ferramenta].includes(chave))) {
			await auditar({ ferramenta, resultado: 'negada', motivo: 'argumento_proibido', campos: [] });
			return { ok: false, motivo: 'argumento_proibido' };
		}
		if (nome === 'olli_listar_escopos') {
			const escopos = [...ESCOPOS_POR_PAPEL[opcoes.papel]].map((escopo) => ({
				escopo,
				campos: [...camposDoPapel(opcoes.papel, escopo)],
			}));
			await auditar({ ferramenta: nome, resultado: 'ok', motivo: 'lista', campos: [] });
			return { ok: true, papel: opcoes.papel, escopos };
		}
		if (nome === 'olli_auditoria') {
			await auditar({ ferramenta: nome, resultado: 'ok', motivo: 'leitura', campos: [] });
			return { ok: true, eventos: eventos.slice(-MAX_AUDITORIA).map((evento) => ({ ...evento })) };
		}
		if (nome === 'olli_buscar') {
			const escopo = args.escopo;
			if (typeof escopo !== 'string' || !CAMPOS[escopo as EscopoMcp]) return { ok: false, motivo: 'escopo_invalido' };
			if (camposDoPapel(opcoes.papel, escopo as EscopoMcp).size === 0) return { ok: false, motivo: 'papel_sem_permissao' };
			if (typeof args.consulta !== 'string') return { ok: false, motivo: 'consulta_invalida' };
			const consulta = nomeBusca(args.consulta);
			if (consulta.replace(/\s/g, '').length >= 10 && /^\d+$/.test(consulta.replace(/\s/g, ''))) {
				return { ok: false, motivo: 'consulta_nao_e_nome' };
			}
			if (consulta.length < 3 || consulta.length > 40) return { ok: false, motivo: 'consulta_invalida' };
			const achados: { id: string; titulo: string; statusDocumento?: StatusDocumentoMcp }[] = [];
			for (const registro of registros.values()) {
				if (registro.escopo !== escopo || !ativo(registro)) continue;
				const titulo = String(registro.campos.nome ?? registro.campos.titulo ?? (registro.escopo === 'clausula_contrato' ? 'clausulas do contrato' : ''));
				if (!nomeBusca(titulo).includes(consulta) && !(registro.escopo === 'clausula_contrato' && (consulta === 'clausula' || consulta === 'contrato' || consulta === 'clausulas'))) continue;
				achados.push({ id: registro.id, titulo, statusDocumento: registro.statusDocumento });
			}
			await auditar({ ferramenta: nome, resultado: 'ok', motivo: 'busca', escopo: escopo as EscopoMcp, campos: [], hashDepois: await sha256(consulta) });
			return { ok: true, truncado: achados.length > MAX_BUSCA, itens: achados.slice(0, MAX_BUSCA).map((item) => ({ id: item.id, titulo: item.titulo, statusDocumento: item.statusDocumento })) };
		}
		if (nome === 'olli_ler') {
			const escopo = args.escopo;
			if (typeof escopo !== 'string' || !CAMPOS[escopo as EscopoMcp]) return { ok: false, motivo: 'escopo_invalido' };
			const permitidos = camposDoPapel(opcoes.papel, escopo as EscopoMcp);
			if (permitidos.size === 0) return { ok: false, motivo: 'papel_sem_permissao' };
			if (typeof args.registroId !== 'string' || !ID_OK.test(args.registroId)) return { ok: false, motivo: 'registro_invalido' };
			const registro = registros.get(chaveRegistro(escopo as EscopoMcp, args.registroId));
			if (!ativo(registro)) return { ok: false, motivo: 'nao_encontrado' };
			const campos: Record<string, ValorCampo> = {};
			for (const campo of permitidos) {
				if (Object.hasOwn(registro.campos, campo)) campos[campo] = registro.campos[campo];
			}
			await auditar({ ferramenta: nome, resultado: 'ok', motivo: 'leitura', escopo: escopo as EscopoMcp, registroId: registro.id, campos: Object.keys(campos), hashDepois: await sha256(canonico(campos)) });
			return { ok: true, registroId: registro.id, escopo, statusDocumento: registro.statusDocumento ?? null, campos };
		}
		if (nome === 'olli_propor_cadastro') return propor('criar', args);
		if (nome === 'olli_propor_edicao') return propor('editar', args);
		if (nome === 'olli_cancelar') {
			if (typeof args.rascunhoId !== 'string') return { ok: false, motivo: 'pedido_invalido' };
			const rascunho = rascunhos.get(args.rascunhoId);
			if (!rascunho || rascunho.estado !== 'aguardando_confirmacao') return { ok: false, motivo: 'estado_invalido' };
			rascunho.estado = 'cancelada';
			tokens.delete(rascunho.id);
			await auditar({ ferramenta: nome, resultado: 'cancelada', motivo: 'cancelada', rascunhoId: rascunho.id, escopo: rascunho.escopo, registroId: rascunho.registroId, campos: rascunho.campos });
			return { ok: true, rascunhoId: rascunho.id, estado: 'cancelada' };
		}
		if (nome === 'olli_confirmar') return confirmar(args.rascunhoId, args.confirmationToken);
		return desfazer(args.rascunhoId, args.confirmationToken);
	}

	async function atenderInterno(mensagem: unknown): Promise<RespostaJsonRpc | null> {
		const pedido = objetoPlano(mensagem);
		if (!pedido || pedido.jsonrpc !== '2.0' || typeof pedido.method !== 'string') {
			return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'pedido_invalido' } };
		}
		const id = pedido.id;
		const notificacao = !Object.hasOwn(pedido, 'id');
		if (notificacao && pedido.method === 'notifications/initialized') return null;
		if (typeof id !== 'string' && typeof id !== 'number') {
			return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'pedido_invalido' } };
		}
		if (pedido.method === 'initialize') {
			inicializada = true;
			return {
				jsonrpc: '2.0',
				id,
				result: {
					protocolVersion: MCP_PROTOCOLO,
					capabilities: { tools: { listChanged: false } },
					serverInfo: { name: MCP_NOME, version: MCP_CADASTRO_VERSAO },
					instructions: 'Só proponha cadastro ou cláusula de rascunho. Não há ferramenta de código, banco, deploy, envio ou cobrança. Confirmação humana fica fora desta resposta.',
				},
			};
		}
		if (!inicializada) return { jsonrpc: '2.0', id, error: { code: -32000, message: 'nao_inicializado' } };
		if (pedido.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
		if (pedido.method === 'tools/list') {
			const descricao = schemas();
			return {
				jsonrpc: '2.0',
				id,
				result: {
					tools: FERRAMENTAS_MCP.map((nome) => ({
						name: nome,
						description: descricao[nome].descricao,
						inputSchema: descricao[nome].schema,
					})),
				},
			};
		}
		if (pedido.method === 'tools/call') {
			const params = objetoPlano(pedido.params);
			const nome = typeof params?.name === 'string' ? params.name : '';
			const argumentos = params?.arguments === undefined ? {} : params.arguments;
			if (!nome || objetoPlano(argumentos) === null) {
				return { jsonrpc: '2.0', id, error: { code: -32602, message: 'parametro_invalido' } };
			}
			const resultado = await executar(nome, argumentos);
			return { jsonrpc: '2.0', id, result: conteudo(resultado) };
		}
		return { jsonrpc: '2.0', id, error: { code: -32601, message: 'metodo_desconhecido' } };
	}

	return {
		async atender(mensagem: unknown) {
			if (emCurso) return { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'sessao_ocupada' } };
			emCurso = true;
			try {
				return await atenderInterno(mensagem);
			} catch {
				return { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'erro_interno' } };
			} finally {
				emCurso = false;
			}
		},
		tokenParaUsuario(rascunhoId: string) {
			return tokens.get(rascunhoId) ?? null;
		},
		diffParaUsuario(rascunhoId: string) {
			const rascunho = rascunhos.get(rascunhoId);
			if (!rascunho) return null;
			return rascunho.campos.map((campo) => ({
				campo,
				antes: rascunho.antes[campo] ?? null,
				depois: rascunho.depois[campo] ?? null,
			}));
		},
		async confirmarPeloUsuario(rascunhoId: string) {
			if (emCurso) return { ok: false, motivo: 'sessao_ocupada' };
			emCurso = true;
			try {
				return await confirmar(rascunhoId, tokens.get(rascunhoId));
			} finally {
				emCurso = false;
			}
		},
		async desfazerPeloUsuario(rascunhoId: string) {
			if (emCurso) return { ok: false, motivo: 'sessao_ocupada' };
			emCurso = true;
			try {
				return await desfazer(rascunhoId, tokens.get(rascunhoId));
			} finally {
				emCurso = false;
			}
		},
	};
}

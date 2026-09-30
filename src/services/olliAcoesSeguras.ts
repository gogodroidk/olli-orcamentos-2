/** Guarda local antes de qualquer pedido à IA operacional. */
export type ModoPedidoIa = 'consulta' | 'rascunho_acao' | 'bloqueado';
export type EstadoRascunhoIa = 'aguardando_confirmacao' | 'confirmado' | 'cancelado';
export type PapelOperacionalIa = 'pessoal' | 'owner' | 'admin' | 'gestor' | 'tecnico';
export type EscopoAcaoIa = 'orcamento' | 'cliente' | 'produto' | 'servico' | 'agenda' | 'empresa' | 'equipe';

export interface MudancaIa {
	campo: string;
	atual: string | number | boolean | null;
	proposto: string | number | boolean | null;
}

export interface RascunhoAcaoIa {
	id: string;
	escopo: EscopoAcaoIa;
	registroId: string;
	pedidoOriginal: string;
	resumo: string;
	mudancas: MudancaIa[];
	estado: EstadoRascunhoIa;
	criadoEm: string;
}

export interface ContextoAutorizacaoIa {
	atorId: string;
	tenantId: string;
	papel: PapelOperacionalIa;
	confirmacaoId: string;
}

export interface PlanoRollbackIa {
	rascunhoId: string;
	escopo: EscopoAcaoIa;
	registroId: string;
	mudancas: MudancaIa[];
}

export interface EventoAuditoriaIa {
	id: string;
	revisao: number;
	rascunhoId: string;
	atorId: string;
	tenantId: string;
	escopo: EscopoAcaoIa;
	registroId: string;
	resultado: 'autorizado' | 'negado' | 'cancelado' | 'revertido';
	motivo: string;
	criadoEm: string;
}

export interface JournalAuditoriaIa {
	revisao: number;
	eventos: readonly EventoAuditoriaIa[];
}

export interface AvaliacaoPedidoIa {
	modo: ModoPedidoIa;
	motivo?: string;
}

const PEDIDOS_DESTRUTIVOS = [
	/apag(a|e|ar|ue).*(tudo|todos|dados|clientes|orçamentos|orcamentos)/i,
	/delet(e|ar).*(tudo|todos|dados|clientes|orçamentos|orcamentos)/i,
	/limp(e|ar).*(base|banco|dados)/i,
	/reset(e|ar).*(conta|base|banco)/i,
];

const PEDIDOS_DE_MUDANCA = [
	/(alter|edite|editar|mude|atualize|crie|cadastre|marque|agende|envie|cobre)/i,
	/(status|orçamento|orcamento|cliente|produto|serviço|servico|agenda|empresa|equipe|senha|email)/i,
];

const CAMPOS_PERMITIDOS: Record<EscopoAcaoIa, ReadonlySet<string>> = {
	orcamento: new Set(['status', 'validadeOrcamento', 'condicoesPagamento', 'garantia', 'informacoesAdicionais', 'laudoTecnico']),
	cliente: new Set(['nome', 'telefone', 'endereco', 'complemento', 'cidade', 'estado', 'cep']),
	produto: new Set(['nome', 'descricao', 'preco', 'custo', 'unidade', 'marca', 'modelo']),
	servico: new Set(['nome', 'descricao', 'preco', 'custo', 'unidade']),
	agenda: new Set(['titulo', 'inicio', 'fim', 'status', 'observacao', 'endereco']),
	empresa: new Set(['nome', 'telefone', 'whatsapp', 'email', 'endereco', 'cidade', 'estado', 'site', 'especialidade', 'slogan', 'corMarca']),
	equipe: new Set(['papel', 'ativo']),
};

const ESCOPO_POR_PAPEL: Record<PapelOperacionalIa, ReadonlySet<EscopoAcaoIa>> = {
	pessoal: new Set(['orcamento', 'cliente', 'produto', 'servico', 'agenda', 'empresa']),
	owner: new Set(['orcamento', 'cliente', 'produto', 'servico', 'agenda', 'empresa', 'equipe']),
	admin: new Set(['orcamento', 'cliente', 'agenda', 'equipe']),
	gestor: new Set(['orcamento', 'cliente', 'agenda']),
	tecnico: new Set(['orcamento', 'cliente', 'agenda']),
};

/** A IA pode explicar e preparar uma mudança, mas não executa operação destrutiva. */
export function avaliarPedidoIa(texto: string): AvaliacaoPedidoIa {
	const limpo = texto.trim();
	if (!limpo) return { modo: 'consulta' };
	if (PEDIDOS_DESTRUTIVOS.some((padrao) => padrao.test(limpo))) {
		return {
			modo: 'bloqueado',
			motivo: 'A OLLI não apaga dados em massa pelo chat. Use uma tela específica, revisão e confirmação explícita.',
		};
	}
	if (PEDIDOS_DE_MUDANCA.every((padrao) => padrao.test(limpo))) return { modo: 'rascunho_acao' };
	return { modo: 'consulta' };
}

/**
 * Monta apenas uma prévia auditável. Esta função não toca em banco, API ou
 * estado do tenant; uma camada de RBAC pode consumir o rascunho depois.
 */
export function criarRascunhoAcaoIa(
	texto: string,
	mudancas: MudancaIa[],
	opcoes: { escopo: EscopoAcaoIa; registroId: string; id: string; agora?: string; resumo?: string },
): RascunhoAcaoIa {
	const avaliacao = avaliarPedidoIa(texto);
	if (avaliacao.modo !== 'rascunho_acao') {
		throw new Error('pedido_nao_e_mudanca');
	}
	if (!mudancas.length) throw new Error('mudanca_sem_diff');
	if (!opcoes.id.trim()) throw new Error('rascunho_id_obrigatorio');
	if (!opcoes.registroId.trim()) throw new Error('registro_id_obrigatorio');
	if (mudancas.some((mudanca) => !CAMPOS_PERMITIDOS[opcoes.escopo].has(mudanca.campo))) {
		throw new Error('campo_nao_permitido');
	}
	return {
		id: opcoes.id.trim(),
		escopo: opcoes.escopo,
		registroId: opcoes.registroId.trim(),
		pedidoOriginal: texto.trim(),
		resumo: opcoes.resumo?.trim() || 'Prévia de alteração aguardando confirmação',
		mudancas: mudancas.map((mudanca) => ({ ...mudanca })),
		estado: 'aguardando_confirmacao',
		criadoEm: opcoes.agora ?? new Date().toISOString(),
	};
}

/** Confirma/cancela a prévia, sem executar mutação. A execução pertence ao adaptador RBAC. */
export function decidirRascunhoAcaoIa(
	rascunho: RascunhoAcaoIa,
	decisao: 'confirmar' | 'cancelar',
): RascunhoAcaoIa {
	if (rascunho.estado !== 'aguardando_confirmacao') throw new Error('rascunho_ja_decidido');
	return Object.freeze({ ...rascunho, estado: decisao === 'confirmar' ? 'confirmado' : 'cancelado' });
}

export function autorizarRascunhoAcaoIa(
	rascunho: RascunhoAcaoIa,
	contexto: ContextoAutorizacaoIa,
): { autorizado: true; rollback: PlanoRollbackIa } | { autorizado: false; motivo: string } {
	if (!contexto.atorId.trim() || !contexto.tenantId.trim()) return { autorizado: false, motivo: 'contexto_incompleto' };
	if (rascunho.estado !== 'confirmado') return { autorizado: false, motivo: 'confirmacao_obrigatoria' };
	if (contexto.confirmacaoId !== rascunho.id) return { autorizado: false, motivo: 'confirmacao_divergente' };
	if (!ESCOPO_POR_PAPEL[contexto.papel].has(rascunho.escopo)) return { autorizado: false, motivo: 'papel_sem_permissao' };
	if (rascunho.mudancas.some((mudanca) => !CAMPOS_PERMITIDOS[rascunho.escopo].has(mudanca.campo))) {
		return { autorizado: false, motivo: 'campo_nao_permitido' };
	}
	return {
		autorizado: true,
		rollback: Object.freeze({
			rascunhoId: rascunho.id,
			escopo: rascunho.escopo,
			registroId: rascunho.registroId,
			mudancas: rascunho.mudancas.map((mudanca) => ({
				campo: mudanca.campo,
				atual: mudanca.proposto,
				proposto: mudanca.atual,
			})),
		}),
	};
}

export function criarJournalAuditoriaIa(): JournalAuditoriaIa {
	return Object.freeze({ revisao: 0, eventos: Object.freeze([]) });
}

export function anexarEventoAuditoriaIa(
	journal: JournalAuditoriaIa,
	evento: Omit<EventoAuditoriaIa, 'revisao'>,
): JournalAuditoriaIa {
	const existente = journal.eventos.find((item) => item.id === evento.id);
	if (existente) {
		const mesmo = JSON.stringify({ ...existente, revisao: 0 }) === JSON.stringify({ ...evento, revisao: 0 });
		if (!mesmo) throw new Error('evento_auditoria_divergente');
		return journal;
	}
	const proximo = Object.freeze({ ...evento, revisao: journal.revisao + 1 });
	return Object.freeze({ revisao: journal.revisao + 1, eventos: Object.freeze([...journal.eventos, proximo]) });
}

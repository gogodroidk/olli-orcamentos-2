import type { TipoDocumentoWeb } from "./documentos";

export type CatalogoDocumento = {
	tipo: TipoDocumentoWeb;
	titulo: string;
	descricao: string;
	acao: string;
	status: "disponivel" | "em_breve";
};

/** Catálogo inicial do builder. Tipos em breve aparecem sem fingir que já geram artefato. */
export const CATALOGO_DOCUMENTOS: readonly CatalogoDocumento[] = [
	{ tipo: "orcamento", titulo: "Orçamento", descricao: "Itens, valores, condições e revisão ligada ao cliente.", acao: "Abrir orçamento", status: "disponivel" },
	{ tipo: "contrato", titulo: "Contrato de serviço", descricao: "Cláusulas editáveis, partes, prazo e assinatura.", acao: "Criar contrato", status: "disponivel" },
	{ tipo: "ordem_servico", titulo: "Ordem de serviço", descricao: "Checklist, técnico, fotos, execução e conclusão.", acao: "Criar OS", status: "disponivel" },
	{ tipo: "pmoc", titulo: "PMOC", descricao: "Plano de manutenção com equipamentos e periodicidades.", acao: "Criar PMOC", status: "disponivel" },
	{ tipo: "recibo", titulo: "Recibo", descricao: "Comprovante de recebimento ligado ao orçamento.", acao: "Criar recibo", status: "disponivel" },
	{ tipo: "garantia", titulo: "Garantia", descricao: "Cobertura, prazo, condições e vínculo com o serviço.", acao: "Criar garantia", status: "disponivel" },
	{ tipo: "conclusao", titulo: "Termo de conclusão", descricao: "Entrega, aceite, observações e assinatura.", acao: "Criar termo", status: "disponivel" },
	{ tipo: "laudo", titulo: "Laudo técnico", descricao: "Achados, evidências, recomendações e responsável.", acao: "Criar laudo", status: "disponivel" },
	{ tipo: "checklist", titulo: "Checklist", descricao: "Lista operacional editável para sua equipe.", acao: "Criar checklist", status: "disponivel" },
	{ tipo: "certificado", titulo: "Certificado", descricao: "Modelo de certificado para revisar antes de emitir.", acao: "Criar certificado", status: "disponivel" },
];

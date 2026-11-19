/**
 * EVENTOS DO FUNIL que o painel grava em `user_activity_log` (RPC `registrar_atividade_usuario`).
 *
 * Lista em VALOR (não só tipo) para o teste `scripts/teste-ativacao-lote1.ts` conferir, contra a
 * migration mais recente, que CADA evento daqui está na CHECK da tabela E na lista da função.
 * Lição de 19/11/2026: evento fora da CHECK some sem erro (o RPC falha, a telemetria engole).
 *
 * Sem dado pessoal: o evento é só um nome de lista fechada + plataforma + horário.
 * Módulo puro (sem alias `@/`), para o Node rodar o teste direto.
 */
export const ETAPAS_ATIVACAO = [
	"ativacao_card_visto",
	"ativacao_card_clicado",
	"oficio_escolhido",
	"orcamento_novo_aberto",
	"empresa_salva",
	"orcamento_enviado",
	"client_create",
	"quote_create",
	// Funil de RECEITA (migration 20261030070000): sem eles não se sabe se alguém chega a ver o preço.
	"planos_visto",
	"plano_pagar_clicado",
	// ENVIO BARRADO (CQ-ATIVACAO-LOTE1, achado 6): o degrau orçou→enviou perde metade das contas
	// e nada gravava ONDE ele trava. `orcamento_salvar_barrado` já está aceito (20261119080000);
	// os outros dois entram na CHECK pela migration 20261119120000.
	"orcamento_salvar_barrado",
	"envio_barrado_cadastro",
	"envio_barrado_sem_whatsapp",
] as const;

export type EtapaAtivacao = (typeof ETAPAS_ATIVACAO)[number];

/** Podem repetir (no máximo 1 vez por minuto por evento, ver `registrarEtapaAtivacao`). */
export const ETAPAS_REPETIVEIS: ReadonlySet<EtapaAtivacao> = new Set<EtapaAtivacao>([
	"client_create",
	"quote_create",
	"orcamento_enviado",
	"plano_pagar_clicado",
	"orcamento_salvar_barrado",
	"envio_barrado_cadastro",
	"envio_barrado_sem_whatsapp",
]);

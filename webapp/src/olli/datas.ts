/**
 * DATAS — o campo mais perigoso deste projeto.
 *
 * Dentro do MESMO blob `dados` convivem TRÊS formatos, e não é escolha nossa: é o
 * que o app do celular grava há meses. Gravar no formato errado faz o PDF do
 * cliente sair com data vazia ou trocada.
 *
 *   dataEmissao ............................. 'YYYY-MM-DD'      (2026-07-07)
 *   criadoEm / atualizadoEm ................. ISO completo      (2026-07-07T19:08:47.933Z)
 *   validadeOrcamento, dataVisitaTecnica,
 *   agendamentoServico, dataRecebimento ..... 'DD/MM/AAAA'      (22/07/2026)
 *
 * ⚠️ BUG VIVO NO APP (achado em 14/07/2026, confirmado no banco de produção):
 * `reciboToRow` do app joga a string 'DD/MM/AAAA' DIRETO na coluna timestamptz
 * `recibos.data_recebimento`. O Postgres do projeto está em DateStyle=ISO,MDY:
 *   • "10/07/2026" (10 de julho) vira 2026-10-07 → 7 de OUTUBRO. Dia e mês trocados.
 *   • Dia > 12 (ex.: "20/07/2026") o Postgres REJEITA — e como o sync do app engole
 *     o erro, o recibo simplesmente NUNCA sobe. Some.
 * Por isso, aqui: a coluna recebe ISO de verdade (via `brParaIso`), e o BLOB
 * continua em DD/MM/AAAA (que é o que o app sabe ler). A verdade é o blob.
 */

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** ISO completo — para criadoEm / atualizadoEm. */
export function agoraIso(): string {
	return new Date().toISOString();
}

/** 'YYYY-MM-DD' no fuso LOCAL — para dataEmissao. (toISOString() usaria UTC e no
 *  Brasil, à noite, jogaria a emissão para o dia seguinte.) */
export function hojeYmd(d: Date = new Date()): string {
	return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/** 'DD/MM/AAAA' — para validadeOrcamento, dataRecebimento e afins. */
export function paraBr(d: Date = new Date()): string {
	return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA'. */
export function ymdParaBr(ymd: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
	return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

/** 'DD/MM/AAAA' → 'YYYY-MM-DD'. Devolve null se não casar (não inventa data). */
export function brParaYmd(br: string): string | null {
	const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((br ?? "").trim());
	return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * 'DD/MM/AAAA' → ISO completo, para gravar em coluna `timestamptz` SEM ambiguidade.
 * É a função que impede o bug do REC-00826 (10/07 virando 7 de outubro).
 * Devolve null quando a data não é válida — melhor gravar null do que uma mentira.
 */
export function brParaIso(br: string | null | undefined): string | null {
	if (!br) return null;
	const ymd = brParaYmd(br);
	if (!ymd) return null;
	const d = new Date(`${ymd}T12:00:00Z`); // meio-dia UTC: imune a virada de fuso
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Data + hora local → ISO (para `agendamentos.inicio`, que é timestamptz de verdade). */
export function localParaIso(dataHoraLocal: string): string | null {
	if (!dataHoraLocal) return null;
	const d = new Date(dataHoraLocal); // 'YYYY-MM-DDTHH:mm' do <input type="datetime-local">
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Soma dias e devolve 'DD/MM/AAAA' — usado na validade padrão do orçamento (hoje + 15). */
export function emDiasBr(dias: number, base: Date = new Date()): string {
	const d = new Date(base);
	d.setDate(d.getDate() + dias);
	return paraBr(d);
}

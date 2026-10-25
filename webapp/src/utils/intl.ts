export const DEFAULT_LOCALE = 'pt-BR';
export const DEFAULT_CURRENCY = 'BRL';

export type CurrencyFormatOptions = Omit<Intl.NumberFormatOptions, 'style' | 'currency'> & {
	locale?: string;
	currency?: string;
};

export type NumberFormatOptions = Intl.NumberFormatOptions & { locale?: string };
export type DateFormatOptions = Intl.DateTimeFormatOptions & { locale?: string; includeYear?: boolean };
export type TimeFormatOptions = Intl.DateTimeFormatOptions & { locale?: string };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: Date | number | string | null | undefined): Date | null {
	if (value == null || value === '') return null;
	if (value instanceof Date) return new Date(value.getTime());
	if (typeof value === 'number') return new Date(value);

	const match = DATE_ONLY.exec(value);
	if (!match) return new Date(value);

	const [, ano, mes, dia] = match;
	const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
	if (
		data.getFullYear() !== Number(ano) ||
		data.getMonth() !== Number(mes) - 1 ||
		data.getDate() !== Number(dia)
	) {
		return null;
	}
	return data;
}

/** Formata moeda ISO 4217; usa pt-BR e BRL quando não houver opções. */
export function formatCurrency(value: number, options: CurrencyFormatOptions = {}): string {
	const { locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY, ...numberOptions } = options;
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency,
		...numberOptions,
	}).format(value);
}

/** Formata números com o locale indicado, sem aplicar símbolo de moeda. */
export function formatNumber(value: number, options: NumberFormatOptions = {}): string {
	const { locale = DEFAULT_LOCALE, ...numberOptions } = options;
	return new Intl.NumberFormat(locale, numberOptions).format(value);
}

/** Formata uma data; datas ISO sem horário são interpretadas como dia local. */
export function formatDate(
	value: Date | number | string | null | undefined,
	options: DateFormatOptions = {},
): string {
	const data = parseDate(value);
	if (!data || Number.isNaN(data.getTime())) return '';

	const { locale = DEFAULT_LOCALE, includeYear = true, ...dateOptions } = options;
	const formato: Intl.DateTimeFormatOptions =
		dateOptions.dateStyle || dateOptions.timeStyle
			? dateOptions
			: {
					day: '2-digit',
					month: '2-digit',
					...(includeYear ? { year: 'numeric' as const } : {}),
					...dateOptions,
				};
	return new Intl.DateTimeFormat(locale, formato).format(data);
}

/** Formata o horário sem data, preservando a hora local padrão do runtime. */
export function formatTime(
	value: Date | number | string | null | undefined,
	options: TimeFormatOptions = {},
): string {
	const data = parseDate(value);
	if (!data || Number.isNaN(data.getTime())) return '';

	const { locale = DEFAULT_LOCALE, ...dateOptions } = options;
	const formato: Intl.DateTimeFormatOptions =
		dateOptions.dateStyle || dateOptions.timeStyle
			? dateOptions
			: { hour: '2-digit' as const, minute: '2-digit' as const, ...dateOptions };
	return new Intl.DateTimeFormat(locale, formato).format(data);
}

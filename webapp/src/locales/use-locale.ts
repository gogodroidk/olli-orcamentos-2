import "dayjs/locale/pt-br";

import type { Locale as AntdLocal } from "antd/es/locale";
import pt_BR from "antd/locale/pt_BR";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { LocalEnum } from "#/enum";

/**
 * O painel é pt-BR fixo — o porquê está no comentário longo de `i18n.ts`
 * (resumo: o seletor de idioma do template não traduzia o produto, só o chrome).
 *
 * Este hook continua existindo porque 8 componentes do chrome (nav, migalha de
 * pão, busca) importam `useLocale()` só pra pegar o `t`.
 */

// Locale do dayjs, aplicado no import do módulo.
//
// ATENÇÃO: o nome do locale no dayjs é "pt-br", com hífen e minúsculo — NÃO é
// o "pt_BR" do LocalEnum. O código antigo chamava `dayjs.locale(locale)` com
// "pt_BR"; o dayjs não reconhece esse nome, ignora em silêncio e continua em
// inglês. Ou seja: as datas relativas do painel ("a day ago") nunca estiveram
// em português, mesmo com o painel em pt-BR. Fixar aqui resolve.
dayjs.locale("pt-br");

export type Locale = typeof LocalEnum.pt_BR;

type Language = {
	locale: Locale;
	icon: string;
	label: string;
	antdLocal: AntdLocal;
};

export const LANGUAGE_MAP: Record<Locale, Language> = {
	[LocalEnum.pt_BR]: {
		locale: LocalEnum.pt_BR,
		label: "Português",
		icon: "flag-br",
		antdLocal: pt_BR,
	},
};

export default function useLocale() {
	const { t } = useTranslation();

	const locale = LocalEnum.pt_BR;
	const language = LANGUAGE_MAP[locale];

	return {
		t,
		locale,
		language,
	};
}

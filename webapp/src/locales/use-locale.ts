import "dayjs/locale/pt-br";
import "dayjs/locale/zh-cn";

import type { Locale as AntdLocal } from "antd/es/locale";
import en_US from "antd/locale/en_US";
import pt_BR from "antd/locale/pt_BR";
import zh_CN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { LocalEnum } from "#/enum";

type Locale = keyof typeof LocalEnum;
type Language = {
	locale: keyof typeof LocalEnum;
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
	[LocalEnum.zh_CN]: {
		locale: LocalEnum.zh_CN,
		label: "Chinese",
		icon: "flag-cn",
		antdLocal: zh_CN,
	},
	[LocalEnum.en_US]: {
		locale: LocalEnum.en_US,
		label: "English",
		icon: "flag-us",
		antdLocal: en_US,
	},
};

export default function useLocale() {
	const { t, i18n } = useTranslation();

	const locale = (i18n.resolvedLanguage || LocalEnum.pt_BR) as Locale;
	const language = LANGUAGE_MAP[locale] ?? LANGUAGE_MAP[LocalEnum.pt_BR];

	/**
	 * localstorage -> i18nextLng change
	 */
	const setLocale = (locale: Locale) => {
		i18n.changeLanguage(locale);
		// set lang ant dayjs
		document.documentElement.lang = locale;
		dayjs.locale(locale);
	};

	return {
		t,
		locale,
		language,
		setLocale,
	};
}

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { StorageEnum, ThemeColorPresets, ThemeLayout, ThemeMode } from "#/enum";
import { FontFamilyPreset, typographyTokens } from "@/theme/tokens/typography";

export type SettingsType = {
	themeColorPresets: ThemeColorPresets;
	themeMode: ThemeMode;
	themeLayout: ThemeLayout;
	themeStretch: boolean;
	breadCrumb: boolean;
	accordion: boolean;
	multiTab: boolean;
	darkSidebar: boolean;
	fontFamily: string;
	fontSize: number;
	direction: "ltr" | "rtl";
};
type SettingStore = {
	settings: SettingsType;
	// 使用 actions 命名空间来存放所有的 action
	actions: {
		setSettings: (settings: SettingsType) => void;
		clearSettings: () => void;
	};
};

const useSettingStore = create<SettingStore>()(
	persist(
		(set) => ({
			settings: {
				themeColorPresets: ThemeColorPresets.Default,
				themeMode: ThemeMode.Light,
				themeLayout: ThemeLayout.Vertical,
				themeStretch: false,
				breadCrumb: true,
				accordion: false,
				multiTab: false,
				darkSidebar: false,
				fontFamily: FontFamilyPreset.openSans,
				fontSize: Number(typographyTokens.fontSize.sm),
				direction: "ltr",
			},
			actions: {
				setSettings: (settings) => {
					set({ settings });
				},
				clearSettings() {
					useSettingStore.persist.clearStorage();
				},
			},
		}),
		{
			name: StorageEnum.Settings, // name of the item in the storage (must be unique)
			storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
			partialize: (state) => ({ [StorageEnum.Settings]: state.settings }),
			version: 1,
			// `fontFamily` é PERSISTIDO em localStorage. Quando a fonte do painel
			// mudou (Plus Jakarta → Rubik), quem já tinha usado o painel continuava
			// com o NOME da fonte antiga gravado — uma família que o app não carrega
			// mais — e o navegador caía num fallback qualquer: o painel inteiro em
			// Times/Arial, só pra quem já era usuário. Trocar o default NÃO conserta
			// isso, porque o valor gravado vence o default.
			//
			// A reconciliação mora no `merge`, e não no `migrate`, de propósito: o
			// zustand só chama `migrate` quando o registro gravado tem `version`
			// numérico. Um registro sem esse campo (gravado por versão antiga da
			// lib, ou por qualquer escrita fora do padrão) pula o migrate inteiro e
			// manteria a fonte quebrada — testado, acontece mesmo. Já o `merge`
			// roda em TODA reidratação, com ou sem version.
			merge: (persisted, current) => {
				const p = persisted as { settings?: Partial<SettingsType> } | undefined;

				// Espalhar sobre o default (em vez de substituir) garante que um
				// campo NOVO de settings não chegue undefined pra quem já tem
				// storage antigo — o merge padrão do zustand é raso e trocaria o
				// objeto `settings` inteiro.
				const settings: SettingsType = { ...current.settings, ...(p?.settings ?? {}) };

				const familiasConhecidas: string[] = Object.values(FontFamilyPreset);
				if (!familiasConhecidas.includes(settings.fontFamily)) {
					settings.fontFamily = FontFamilyPreset.openSans;
				}

				return { ...current, settings };
			},
		},
	),
);

export const useSettings = () => useSettingStore((state) => state.settings);
export const useSettingActions = () => useSettingStore((state) => state.actions);

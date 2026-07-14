import { useTranslation } from "react-i18next";
import type { KeepAliveTab } from "../types";

export function useTabLabelRender() {
	const { t } = useTranslation();

	const renderTabLabel = (tab: KeepAliveTab) => {
		return t(tab.label);
	};

	return renderTabLabel;
}

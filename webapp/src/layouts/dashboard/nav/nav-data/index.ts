import { useMemo } from "react";
import type { NavItemDataProps } from "@/components/nav/types";
import { type VerticalId, useVerticaisPainel } from "@/olli/verticais";
import { useUserPermissions } from "@/store/userStore";
import { checkAny } from "@/utils";
import { frontendNavData } from "./nav-data-frontend";

const navData = frontendNavData;

/**
 * Itens do menu que só fazem sentido para UM ofício (gate por vertical, ver
 * `@/olli/verticais`) — hoje só o Diagnóstico IA, cuja base é 100% HVAC
 * (climatização/refrigeração): um eletricista/pintor não tem o que fazer nela.
 */
const ITENS_SOMENTE_VERTICAL: Record<string, VerticalId> = {
	"/diagnostico": "refrigeracao",
};

/**
 * 递归处理导航数据，过滤掉没有权限的项目
 * @param items 导航项目数组
 * @param permissions 权限列表
 * @param mostraVertical gate por ofício (3 estados: nunca esconde por "não sei")
 * @returns 过滤后的导航项目数组
 */
const filterItems = (
	items: NavItemDataProps[],
	permissions: string[],
	mostraVertical: (id: VerticalId) => boolean,
) => {
	return items.filter((item) => {
		// 检查当前项目是否有权限
		const hasPermission = item.auth ? checkAny(item.auth, permissions) : true;

		// Gate por ofício: item exige uma vertical específica?
		const verticalExigida = ITENS_SOMENTE_VERTICAL[item.path];
		const hasVertical = verticalExigida ? mostraVertical(verticalExigida) : true;

		// 如果有子项目，递归处理
		if (item.children?.length) {
			const filteredChildren = filterItems(item.children, permissions, mostraVertical);
			// 如果子项目都被过滤掉了，则过滤掉当前项目
			if (filteredChildren.length === 0) {
				return false;
			}
			// 更新子项目
			item.children = filteredChildren;
		}

		return hasPermission && hasVertical;
	});
};

/**
 *
 * 根据权限过滤导航数据
 * @param permissions 权限列表
 * @param mostraVertical gate por ofício
 * @returns 过滤后的导航数据
 */
const filterNavData = (permissions: string[], mostraVertical: (id: VerticalId) => boolean) => {
	return navData
		.map((group) => {
			// 过滤组内的项目
			const filteredItems = filterItems(group.items, permissions, mostraVertical);

			// 如果组内没有项目了，返回 null
			if (filteredItems.length === 0) {
				return null;
			}

			// 返回过滤后的组
			return {
				...group,
				items: filteredItems,
			};
		})
		.filter((group): group is NonNullable<typeof group> => group !== null); // 过滤掉空组
};

/**
 * Hook to get filtered navigation data based on user permissions
 * @returns Filtered navigation data
 */
export const useFilteredNavData = () => {
	const permissions = useUserPermissions();
	const permissionCodes = useMemo(() => permissions.map((p) => p.code), [permissions]);
	const { mostraVertical } = useVerticaisPainel();
	const filteredNavData = useMemo(
		() => filterNavData(permissionCodes, mostraVertical),
		[permissionCodes, mostraVertical],
	);
	return filteredNavData;
};

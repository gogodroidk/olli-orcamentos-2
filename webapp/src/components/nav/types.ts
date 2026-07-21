export type NavItemOptionsProps = {
	depth?: number;
	hasChild?: boolean;
};

export type NavItemStateProps = {
	open?: boolean;
	active?: boolean;
	disabled?: boolean;
	hidden?: boolean;
};

export type NavItemDataProps = {
	path: string;
	title: string;
	icon?: string | React.ReactNode;
	info?: React.ReactNode;
	caption?: string;
	auth?: string[];
	children?: NavItemDataProps[];
} & NavItemStateProps;

/**
 * Item
 */
export type NavItemProps = React.ComponentProps<"div"> & NavItemDataProps & NavItemOptionsProps;

/**
 * List
 */
export type NavListProps = Pick<NavItemProps, "depth"> & {
	data: NavItemDataProps;
	authenticate?: (auth?: NavItemProps["auth"]) => boolean;
};

/**
 * Group
 */
export type NavGroupProps = Omit<NavListProps, "data" | "depth"> & {
	name?: string;
	items: NavItemDataProps[];
};

/**
 * Main
 */
// `"div"`, não `"nav"`: NavVertical/NavMini/NavHorizontal renderizam <div> — o marco
// <nav> (com nome) mora nos layouts, uma vez só, para não aninhar dois marcos de
// navegação sem nome. Manter `"nav"` aqui deixava o `ref` tipado como HTMLElement e
// o tsc reclamava na hora de espalhar as props no <div>.
export type NavProps = React.ComponentProps<"div"> &
	Omit<NavListProps, "data" | "depth"> & {
		data: {
			name?: string;
			items: NavItemDataProps[];
		}[];
	};

import RecordListPage from "@/olli/components/RecordListPage";

/** Página de lista genérica do OLLI — a rota passa `table`/`title`/`subtitle`. */
export default function OlliListPage(props: { table: string; title: string; subtitle?: string }) {
	return <RecordListPage {...props} />;
}

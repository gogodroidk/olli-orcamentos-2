/**
 * SERVIÇOS — o que a empresa EXECUTA (tabela `servicos`).
 *
 * Mesma tela dos produtos, sem marca/modelo (ver `ServicoItem` em @dominio).
 */
import ListaCatalogo from "../ListaCatalogo";

export default function ServicosPage() {
	return <ListaCatalogo tipo="servico" />;
}

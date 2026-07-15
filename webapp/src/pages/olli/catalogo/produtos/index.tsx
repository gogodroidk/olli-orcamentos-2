/**
 * PRODUTOS — o que a empresa REVENDE (tabela `produtos`).
 *
 * A tela inteira vive em `ListaCatalogo`: produto e serviço são o mesmo cadastro,
 * e produto só acrescenta `marca` e `modelo` (ver `ProdutoItem` em @dominio).
 */
import ListaCatalogo from "../ListaCatalogo";

export default function ProdutosPage() {
	return <ListaCatalogo tipo="produto" />;
}

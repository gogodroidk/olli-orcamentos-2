/**
 * Primitivas puras da Central de dados.
 *
 * A fonte mora em `src/services/importacao.ts` (raiz do repo), compartilhada com a
 * tela "Trazer meus dados" do app: o mesmo CSV, o mesmo número em pt-BR, os
 * mesmos apelidos de coluna e modelos (OLLI, Google Contatos, Outlook). Assim
 * painel e celular nunca leem a mesma planilha de jeitos diferentes.
 *
 * Caminho RELATIVO (e não alias): `npm run test:importacao` roda este módulo no
 * Node puro, que não conhece os aliases do Vite/tsconfig.
 *
 * Não usamos CSV como "código". Tudo entra como texto, números são convertidos
 * explicitamente no locale pt-BR e fórmulas nunca são avaliadas no navegador.
 */
export {
	CAMPOS_IMPORTACAO,
	COLUNA_NOME_COMPOSTO,
	criarCsv,
	detectarModelo,
	LIMITE_ARQUIVO_BYTES,
	LIMITE_LINHAS,
	limitarLinhas,
	linhasParaObjetos,
	mapeamentoInicial,
	MODELOS_COLUNAS,
	modeloPorId,
	normalizarCabecalho,
	normalizarChave,
	numeroBr,
	parseCsv,
	prepararLinhas,
	protegerCsv,
	type CampoImportacao,
	type LinhaBruta,
	type ModeloColunas,
} from "../../../../src/services/importacao.ts";

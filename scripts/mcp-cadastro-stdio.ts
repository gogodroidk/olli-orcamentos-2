/**
 * Entrada local do MCP de cadastro. Não lê ambiente, não abre rede e não
 * grava em banco: o processo termina e a memória some. Não está no .mcp.json.
 */
import { criarSessaoMcp } from '../src/services/mcpCadastro.ts';

async function main(): Promise<void> {
	const sessao = criarSessaoMcp({
		atorId: 'sessao-local',
		tenantId: 'sessao-local',
		papel: 'pessoal',
	});
	const pedacos: Buffer[] = [];
	for await (const pedaco of process.stdin) pedacos.push(pedaco as Buffer);
	const texto = Buffer.concat(pedacos).toString('utf8').trim();
	if (!texto) {
		process.stderr.write('mcp_cadastro: sem pedido\n');
		process.exit(2);
	}
	for (const linha of texto.split('\n')) {
		if (!linha.trim()) continue;
		let pedido: unknown;
		try {
			pedido = JSON.parse(linha);
		} catch {
			process.stderr.write('mcp_cadastro: pedido_invalido\n');
			process.exit(1);
		}
		const resposta = await sessao.atender(pedido);
		if (resposta) process.stdout.write(`${JSON.stringify(resposta)}\n`);
	}
}

main().catch(() => {
	process.stderr.write('mcp_cadastro: pedido_invalido\n');
	process.exit(1);
});

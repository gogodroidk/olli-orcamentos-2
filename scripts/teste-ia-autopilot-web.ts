import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const service = await readFile(new URL("../webapp/src/olli/iaAutopilot.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../webapp/src/olli/components/AutopilotPanel.tsx", import.meta.url), "utf8");
const dados = await readFile(new URL("../webapp/src/pages/olli/dados/index.tsx", import.meta.url), "utf8");
const prefill = await readFile(new URL("../webapp/src/olli/components/prefillItemOrcamento.ts", import.meta.url), "utf8");
const assistente = await readFile(new URL("../webapp/src/layouts/components/assistente-global.tsx", import.meta.url), "utf8");

let falhas = 0;
let passes = 0;
function ok(nome: string, valor: unknown): void {
	try { assert.equal(valor, true); passes++; console.log(`  ok   ${nome}`); }
	catch { falhas++; console.error(`  FALHA ${nome}`); }
}

console.log("\nAutopilot web — contrato de anexo, prévia e confirmação");
ok("endpoint de prévia é explícito", service.includes("/ia/autopilot/preview"));
ok("usa sessão Bearer", service.includes("supabase.auth.getSession") && service.includes("Authorization: `Bearer ${token}`"));
ok("teto de 4 MiB está no cliente", service.includes("IA_AUTOPILOT_MAX_BYTES = 4 * 1024 * 1024"));
ok("tipos aceitos não incluem executável/ZIP", service.includes("application/pdf") && service.includes("image/webp") && !service.includes("application/zip"));
ok("arquivo é enviado como bytes codificados, não URL arbitrária", service.includes("conteudoBase64") && !/sourceUrl|fetch\(.*http/i.test(service));
ok("cliente falha fechado se a prévia não exigir revisão", service.includes('raw.requiresReview !== true') && service.includes('raw.persistida !== false'));
ok("UI oferece anexo e texto colado", panel.includes('type="file"') && panel.includes("Conversa ou contexto"));
ok("UI limita formatos no input", panel.includes(".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json"));
ok("UI exibe confiança/evidência", panel.includes("porcentagem(item.confianca)") && panel.includes("sem evidência"));
ok("UI não salva sem botão explícito", panel.includes("Nada desta prévia é salvo sem um botão explícito") && panel.includes("Confirmar cadastro"));
ok("Central de Dados conecta confirmação à camada de escrita", dados.includes("confirmarAutopilotCatalogo") && dados.includes("salvarProduto.mutateAsync") && dados.includes("salvarServico.mutateAsync"));
ok("Central de Dados oferece orçamento rascunho", dados.includes("levarAutopilotAoOrcamento") && dados.includes("prefillItems"));
ok("candidatos duplicados e preço zero são preservados", dados.includes("candidato.precoSugerido <= 0") && dados.includes("duplicado"));
ok("falha de inclusão tenta compensar em ordem reversa", dados.includes("[...criados].reverse()") && dados.includes("excluirCliente.mutateAsync"));
ok("pré-carga aceita vários itens e mantém preço como sugestão", prefill.includes("orcamentoComItensPrefill") && prefill.includes("precoSugerido") && prefill.includes("quantidade"));
ok("assistente web oferece voz push-to-talk", assistente.includes("SpeechRecognition") && assistente.includes("Falar com a OLLI") && assistente.includes("Parar voz ao vivo"));
ok("voz não inicia sozinha nem fica contínua", assistente.includes("continuous = false") && assistente.includes("reconhecimento.start()") && assistente.includes("onend"));

console.log(`\n${falhas === 0 ? "PASSOU" : "FALHOU"}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

const service = await readFile(new URL("../src/services/iaAutopilot.ts", import.meta.url), "utf8");
const screen = await readFile(new URL("../src/screens/AutopilotScreen.tsx", import.meta.url), "utf8");
const nav = await readFile(new URL("../src/navigation/AppNavigator.tsx", import.meta.url), "utf8");
const conta = await readFile(new URL("../src/screens/ContaScreen.tsx", import.meta.url), "utf8");
const chat = await readFile(new URL("../src/screens/OlliChatScreen.tsx", import.meta.url), "utf8");

let falhas = 0;
let passes = 0;
function ok(nome: string, condicao: boolean): void {
	try { assert.equal(condicao, true); passes++; console.log(`  ok   ${nome}`); }
	catch { falhas++; console.error(`  FALHA ${nome}`); }
}

console.log("\nAutopilot mobile — anexo, prévia e navegação segura");
ok("usa DocumentPicker e ImagePicker", screen.includes("expo-document-picker") && screen.includes("expo-image-picker"));
ok("limita arquivo no serviço", service.includes("IA_AUTOPILOT_MAX_BYTES = 4 * 1024 * 1024") && service.includes("arquivo_grande_demais"));
ok("envia JWT ao Worker", service.includes("supabase.auth.getSession") && service.includes("Authorization: `Bearer ${token}`"));
ok("UI oferece PDF/arquivo e foto", screen.includes("Anexar PDF/arquivo") && screen.includes("Escolher foto"));
ok("UI mostra prévia e confiança", screen.includes("Prévia aguardando confirmação") && screen.includes("confianca"));
ok("resultado abre orçamento sem salvar automaticamente", screen.includes("Abrir orçamento rascunho") && screen.includes("nav.navigate('NovoOrcamento'") && !screen.includes("saveOrcamento"));
ok("orçamento recebe todos os itens válidos da prévia", screen.includes("prefillItems") && screen.includes("itens.map"));
ok("rota Autopilot registrada no stack", nav.includes("AutopilotScreen") && nav.includes("Autopilot: undefined") && nav.includes('name="Autopilot"'));
ok("Autopilot aparece nas ferramentas da Conta", conta.includes("label: 'Autopilot IA'") && conta.includes("route: 'Autopilot'"));
ok("Chat possui atalho para anexar", chat.includes("Abrir Autopilot para anexar arquivo") && chat.includes("nav.navigate('Autopilot')"));

console.log(`\n${falhas === 0 ? "PASSOU" : "FALHOU"}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

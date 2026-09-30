import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = readFileSync(new URL("../web/src/pages/agent-manifest.json.ts", import.meta.url), "utf8");
const llms = readFileSync(new URL("../web/src/pages/llms.txt.ts", import.meta.url), "utf8");
const help = readFileSync(new URL("../webapp/src/pages/olli/ajuda/index.tsx", import.meta.url), "utf8");
const floating = readFileSync(new URL("../webapp/src/layouts/components/assistente-flutuante.tsx", import.meta.url), "utf8");
const welcome = readFileSync(new URL("../webapp/src/pages/olli/inicio/WelcomeHeader.tsx", import.meta.url), "utf8");

assert.match(manifest, /defaultMode: "read_only"/);
assert.match(manifest, /preview_and_explicit_confirmation/);
assert.match(manifest, /authenticated_tenant_only/);
assert.doesNotMatch(manifest, /service_role|OPENROUTER_API_KEY|stripe_customer_id/);
assert.match(llms, /agent-manifest\.json/);
assert.match(help, /data-ai-readable/);
assert.match(floating, /Abrir robô assistente OLLI/);
assert.match(floating, /Central de Ajuda pública/);
assert.match(welcome, /https:\/\/olliorcamentos\.online\/ajuda\//);

console.log("OK — manifesto de agentes, ajuda legível por IA e atalhos de ajuda/robô validados.");

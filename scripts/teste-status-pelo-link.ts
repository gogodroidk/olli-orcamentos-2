import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261022150000_status_orcamento_pelo_link.sql', import.meta.url), 'utf8');

// A verdade é o blob: o trigger grava coluna + dados.status + dados.atualizadoEm.
assert.match(sql, /set status = alvo,/);
assert.match(sql, /'\{status\}', to_jsonb\(alvo\)/);
assert.match(sql, /'\{atualizadoEm\}', to_jsonb\(carimbo\)/);
// Nunca rebaixa nem toca status fora da escada (degrau 9) nem soft-deletado.
assert.match(sql, /else 9 end/);
assert.match(sql, /o\.excluido_em is null/);
assert.match(sql, /new\.revogado_em is not null/);
// Backfill: marco com data real e estimado=true ANTES do update (CAPI ignora estimado).
const iMarco = sql.indexOf("'retroativo', min(");
const iUpdate = sql.indexOf('update public.orcamentos_publicos set status = status');
assert.ok(iMarco > 0 && iUpdate > iMarco, 'marcos retroativos têm que vir antes do update do backfill');
assert.match(sql, /true\s*\n\s*from alvo/);
assert.match(sql, /on conflict \(user_id, marco\) do nothing/);

console.log('teste-status-pelo-link: todas as verificações passaram');

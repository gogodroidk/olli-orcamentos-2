import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const migration = ler('../supabase/migrations/20260911130000_payments_ledger.sql');
const grants = ler('../supabase/migrations/20260911131000_payments_ledger_grants.sql');
const linkMigration = ler('../supabase/migrations/20260911124652_payments_ledger_receipt_link.sql');
const service = ler('../src/services/pagamentos.ts');
const app = ler('../App.tsx');
const estorno = ler('../src/components/EstornarPagamentoModal.tsx');
const tipos = ler('../src/types/index.ts');
const modal = ler('../src/components/RegistrarPagamentoModal.tsx');
const web = ler('../webapp/src/pages/olli/recibos/FormRecibo.tsx');

assert.match(migration, /create table if not exists public\.pagamentos/i);
assert.match(migration, /unique \(user_id, idempotency_key\)/i);
assert.match(migration, /pagamentos_proteger_append_only/);
assert.match(migration, /pagamento_append_only/);
assert.match(migration, /TG_OP = 'INSERT'/);
assert.match(migration, /registrar_pagamento_financeiro/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /recebido \+ p_valor > total_orcamento/);
assert.match(migration, /estado IN \('registrado','estornado'\)/i);
assert.match(migration, /estorno_auditavel_obrigatorio/);
assert.match(ler('../supabase/migrations/20260911133000_payments_ledger_estorno_fix.sql'), /OLD\.estado = 'registrado' AND NEW\.estado = 'estornado'/);
assert.match(ler('../supabase/migrations/20260911134000_payments_ledger_insert_guard.sql'), /pagamento_nasce_registrado/);
assert.match(ler('../supabase/migrations/20260911134000_payments_ledger_insert_guard.sql'), /comprovante_chave_ck/);
assert.match(linkMigration, /vincular_pagamento_recibo/);
assert.match(linkMigration, /OLD\.recibo_id IS NULL AND NEW\.recibo_id IS NOT NULL/);
assert.match(linkMigration, /recibo_pagamento_ja_vinculado/);

// T-026: a exceção do vínculo (recibo_id NULL -> valor) tem de estar na função que VALE, ou seja,
// na ÚLTIMA migration que redefine o gatilho. Conferir só a migration original deixou passar um
// gatilho final que tratava recibo_id como imutável e fazia a RPC responder 500 em produção.
const pastaMigrations = new URL('../supabase/migrations/', import.meta.url);
const definemGatilho = readdirSync(pastaMigrations)
  .filter((n) => n.endsWith('.sql'))
  .filter((n) => /CREATE OR REPLACE FUNCTION public\.proteger_pagamento_append_only\(\)/i.test(ler(`../supabase/migrations/${n}`)))
  .sort();
const gatilhoFinal = ler(`../supabase/migrations/${definemGatilho[definemGatilho.length - 1]}`);
assert.match(gatilhoFinal, /vinculo_recibo := OLD\.recibo_id IS NULL AND NEW\.recibo_id IS NOT NULL/, 'a última definição do gatilho precisa permitir o vínculo NULL -> valor');
assert.match(gatilhoFinal, /ELSIF vinculo_recibo THEN/, 'ramo do vínculo presente na última definição do gatilho');
assert.match(gatilhoFinal, /recibo_pagamento_ja_vinculado/, 'um recibo só pode estar em um pagamento registrado');
assert.match(gatilhoFinal, /pagamento_nasce_registrado/, 'a última definição mantém o guarda de INSERT');
assert.match(gatilhoFinal, /estorno_auditavel_obrigatorio/, 'a última definição mantém o estorno auditável');
assert.match(grants, /revoke all on table public\.pagamentos from public, anon, authenticated/i);
assert.match(grants, /grant select, insert, update on table public\.pagamentos to authenticated/i);
assert.match(grants, /grant execute on function public\.registrar_pagamento_financeiro/i);
assert.match(service, /registrarPagamentoNoLedger/);
assert.match(service, /ledgerStatus/);
assert.match(service, /idempotencyKey/);
assert.match(service, /sincronizarPagamentosPendentes/);
assert.match(service, /vincularPagamentoAoRecibo/);
assert.match(app, /sincronizarPagamentosPendentes/);
assert.match(app, /sincronizarTudo/);
assert.match(tipos, /comprovanteChave/);
assert.match(tipos, /ledgerReciboVinculado/);
assert.match(modal, /enviarComprovanteLocal/);
assert.match(estorno, /Confirmar estorno/);
assert.match(service, /estornarPagamento/);
assert.match(web, /registrar_pagamento_financeiro/);
assert.match(web, /vincular_pagamento_recibo/);
assert.match(web, /comprovante-recibo/);

console.log('PASSOU: ledger financeiro, idempotência, estorno, comprovante e grants validados.');

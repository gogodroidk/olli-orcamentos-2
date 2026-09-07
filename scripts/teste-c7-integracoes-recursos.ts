import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const ferramentas = ler('../webapp/src/pages/olli/ferramentas/index.tsx');
const backlog = ler('../docs/INTEGRATION_BACKLOG.md');
const agenda = ler('../src/services/agenda.ts');
const notificacao = ler('../src/services/notificationPolicy.ts');
const supabase = ler('../src/services/cloudSync.ts');

assert.match(ferramentas, /Meu INSS/, 'central precisa apontar para recurso oficial do INSS');
assert.match(ferramentas, /NFS-e padrão nacional/, 'central precisa apontar para recurso fiscal oficial');
assert.match(ferramentas, /Cursos Sebrae/, 'central precisa apontar para capacitação oficial');
assert.match(ferramentas, /Confirme prazos e exigências/, 'links externos precisam de aviso de fonte/atualização');
assert.match(backlog, /UI → caso de uso → porta → adaptador → API externa/, 'integrações precisam respeitar portas e adaptadores');
assert.match(backlog, /Fallback atual/, 'cada integração precisa de alternativa manual');
assert.match(agenda, /temPermissaoNotificacao/, 'agenda deve checar permissão antes de notificar');
assert.match(notificacao, /emailTransactional/, 'notificações precisam de política de consentimento');
assert.match(supabase, /tenant/, 'sincronização precisa manter isolamento por tenant');

console.log('OK — recursos oficiais, fallback e limites de integração validados.');

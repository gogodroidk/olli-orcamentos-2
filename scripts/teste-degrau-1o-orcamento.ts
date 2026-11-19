// CQ-DEGRAU-1O-ORCAMENTO — exemplo da ativação salva sem nome do cliente, só com a chave ligada.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  AVISO_NOME_EXEMPLO,
  chaveDegrauLigada,
  NOME_CLIENTE_EXEMPLO,
  ehRascunhoDoExemplo,
  usarNomeDoExemplo,
} from '../webapp/src/olli/degrauExemplo.ts';

// Chave: desligada por padrão; só "1"/"true" liga.
for (const v of [undefined, null, '', '0', 'false', 'on', 'sim', 'yes']) assert.equal(chaveDegrauLigada(v), false, String(v));
for (const v of ['1', 'true', ' TRUE ']) assert.equal(chaveDegrauLigada(v), true, v);

// Regra: só exemplo + novo + nome vazio + chave ligada.
const ok = { ligada: true, exemplo: true, ehNovo: true, clienteNome: '' };
assert.equal(usarNomeDoExemplo(ok), true);
assert.equal(usarNomeDoExemplo({ ...ok, clienteNome: '   ' }), true);
assert.equal(usarNomeDoExemplo({ ...ok, ligada: false }), false, 'chave desligada = hoje');
assert.equal(usarNomeDoExemplo({ ...ok, exemplo: false }), false, 'orçamento comum continua exigindo nome');
assert.equal(usarNomeDoExemplo({ ...ok, ehNovo: false }), false, 'edição nunca troca o nome');
assert.equal(usarNomeDoExemplo({ ...ok, clienteNome: 'Maria' }), false, 'nome digitado é respeitado');

// Transparência: o aviso diz o nome que será usado e que dá para trocar.
assert.ok(AVISO_NOME_EXEMPLO.includes(NOME_CLIENTE_EXEMPLO));
assert.match(AVISO_NOME_EXEMPLO, /troca antes de enviar/);

// Amarras no editor do painel.
const form = readFileSync(new URL('../webapp/src/pages/olli/orcamentos/FormOrcamento.tsx', import.meta.url), 'utf8');
assert.match(form, /chaveDegrauLigada\(import\.meta\.env\.VITE_DEGRAU_1O_ORCAMENTO\)/);
assert.match(form, /if \(!orc\.clienteNome\.trim\(\) && !nomeDoExemplo\) return "Informe o cliente/);
assert.match(form, /\? \{ \.\.\.orc, clienteNome: NOME_CLIENTE_EXEMPLO \}\s*: orc;/);
assert.match(form, /\{DEGRAU_1O_ORCAMENTO && ` \$\{AVISO_NOME_EXEMPLO\}`\}/);
const env = readFileSync(new URL('../webapp/src/vite-env.d.ts', import.meta.url), 'utf8');
assert.match(env, /readonly VITE_DEGRAU_1O_ORCAMENTO\?: string;/);
// Envio pelo WhatsApp continua exigindo cliente cadastrado (o nome do exemplo não vira envio sem número).
const envio = readFileSync(new URL('../webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx', import.meta.url), 'utf8');
assert.match(envio, /blob\.clienteId\s*\?/);
// LIVRE P3: amarra a TRAVA (não só o texto): sem telefone válido não abre o WhatsApp nem reserva envio.
const iTrava = envio.indexOf('const semLinkWa = linkWhatsApp(blob.clienteTelefone');
const iReserva = envio.indexOf('reservarEnvioOrcamento(orcamentoId');
assert.ok(iTrava > 0 && iReserva > iTrava, 'checagem do telefone vem antes de reservar o envio');
assert.match(envio.slice(iTrava, iReserva), /if \(!semLinkWa\) \{[\s\S]*?return;/, 'sem telefone, retorna antes de enviar');

// CPO 19/11: rascunho do exemplo não conta como "orçou".
assert.equal(ehRascunhoDoExemplo(NOME_CLIENTE_EXEMPLO), true);
assert.equal(ehRascunhoDoExemplo(` ${NOME_CLIENTE_EXEMPLO} `), true);
assert.equal(ehRascunhoDoExemplo('Maria'), false, 'renomeou = orçamento real');
assert.equal(ehRascunhoDoExemplo(undefined), false);
assert.match(form, /if \(ehNovo && !ehRascunhoDoExemplo\(final\.clienteNome\)\) void registrarEtapaAtivacao\("quote_create"\);/, 'quote_create pula o exemplo');

console.log('teste-degrau-1o-orcamento: ok');

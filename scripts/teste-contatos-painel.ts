/**
 * IMPORTAR CLIENTES DOS CONTATOS — painel web (D-2245).
 *
 *     node scripts/teste-contatos-painel.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. Contact Picker (Chrome Android): formato do navegador → nosso; sem API = indisponível.
 *  2. Arquivo: .vcf (inclusive o que o WhatsApp compartilha) e .csv do Google Contatos.
 *  3. Prévia: novo / repetido (já cliente ou 2× na lista, "+55" = "(11)") / sem telefone.
 *  4. Fiação: botão na lista de clientes, "Puxar dos contatos" no diálogo do WhatsApp,
 *     share_target no manifest + service worker que NÃO intercepta mais nada.
 */
import { readFileSync } from 'node:fs';
import {
  doNavegador,
  lerArquivoDeContatos,
  montarPrevia,
  primeiroTelefone,
  seletorDeContatosDisponivel,
} from '../webapp/src/olli/contatos/contatos.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const bytes = (t: string) => new TextEncoder().encode(t);

// 1. Contact Picker
ok('sem navigator.contacts (Node/iPhone/desktop) = indisponível', seletorDeContatosDisponivel() === false);
const nav = doNavegador([{ name: ['', 'Maria Souza'], tel: ['+55 11 98765-4321', ''] }, { name: [], tel: [] }]);
ok('navegador → nosso formato (1º nome não vazio, telefones limpos)', nav[0].nome === 'Maria Souza' && nav[0].telefones.length === 1 && nav[1].nome === '' && nav[1].telefones.length === 0);

// 2. Arquivos
const vcfWhats = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Silva;João;;;\r\nFN:João Silva\r\nTEL;type=CELL;waid=5511912345678:+55 11 91234-5678\r\nEND:VCARD\r\n';
const r1 = lerArquivoDeContatos('João Silva.vcf', bytes(vcfWhats));
ok('vCard do WhatsApp (waid) é lido', r1.ok && r1.contatos.length === 1 && r1.contatos[0].nome === 'João Silva' && r1.contatos[0].telefones.length >= 1);
const r1b = lerArquivoDeContatos('contatos', bytes(vcfWhats));
ok('vCard reconhecido pelo conteúdo mesmo sem extensão', r1b.ok);
const csvGoogle = 'Given Name,Family Name,Phone 1 - Value\nAna,Lima,(21) 99876-5432\n';
const r2 = lerArquivoDeContatos('contacts.csv', bytes(csvGoogle));
ok('CSV do Google Contatos: nome composto + telefone', r2.ok && r2.contatos[0]?.nome === 'Ana Lima' && r2.contatos[0]?.telefones[0] === '(21) 99876-5432');
const r3 = lerArquivoDeContatos('foto.png', bytes('xyz'));
ok('formato desconhecido = motivo visível (nunca vazio)', !r3.ok && r3.motivo.length > 10);
const r4 = lerArquivoDeContatos('vazio.vcf', bytes(''));
ok('vcf sem contato = motivo visível', !r4.ok);

// 3. Prévia
const previa = montarPrevia(
  [
    { nome: 'Maria', telefones: ['+55 11 98765-4321'] },
    { nome: 'Maria de novo', telefones: ['11987654321'] },
    { nome: 'Cliente antigo', telefones: ['(21) 3333-4444'] },
    { nome: 'Sem número', telefones: [] },
    { nome: '', telefones: ['(31) 99999-0000'] },
  ],
  ['+55 (21) 3333-4444'],
);
ok('1º contato novo, telefone formatado', previa[0].tipo === 'novo' && previa[0].tipo === 'novo' && previa[0].contato.telefone === '(11) 98765-4321');
ok('mesmo número 2× na lista = repetido', previa[1].tipo === 'repetido');
ok('já é cliente (com +55 de um lado e sem do outro) = repetido', previa[2].tipo === 'repetido');
ok('sem telefone = não importa', previa[3].tipo === 'sem_telefone');
ok('sem nome usa o telefone como nome', previa[4].tipo === 'novo' && previa[4].contato.nome === '(31) 99999-0000');
ok('primeiroTelefone pega o 1º válido', primeiroTelefone([{ telefones: ['abc'] }, { telefones: ['11 91234-5678'] }]) === '(11) 91234-5678' && primeiroTelefone([]) === null);

// 4. Fiação
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lista = ler('webapp/src/pages/olli/clientes/index.tsx');
ok('lista de clientes tem "Importar dos contatos"', lista.includes('ImportarContatos'));
const dlg = ler('webapp/src/olli/contatos/ImportarContatos.tsx');
ok('importação mostra prévia e só grava no confirmar', dlg.includes('montarPrevia(') && /onClick=\{importar\}/.test(dlg));
ok('arquivo aceita .vcf e .csv', dlg.includes('accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv"'));
const wa = ler('webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx');
ok('diálogo "Qual o WhatsApp" tem "Puxar dos contatos" (só com a API)', wa.includes('Puxar dos contatos') && wa.includes('seletorDeContatosDisponivel()'));
const manifest = JSON.parse(ler('webapp/public/manifest.webmanifest'));
const st = manifest.share_target;
ok('manifest: share_target POST multipart com .vcf', st?.method === 'POST' && st?.enctype === 'multipart/form-data' && st.action === '/compartilhar-contato' && JSON.stringify(st.params?.files ?? []).includes('text/x-vcard'));
const sw = ler('webapp/public/sw-compartilhar.js');
ok('service worker só responde ao POST /compartilhar-contato', /request\.method !== 'POST'/.test(sw) && sw.includes("'/compartilhar-contato'") && !/caches\.match\(event\.request\)/.test(sw));
const html = ler('webapp/index.html');
ok('index.html liga o manifest', html.includes('rel="manifest" href="/manifest.webmanifest"'));

console.log(falhas ? `\n${falhas} falha(s)` : '\nPASSOU');
process.exit(falhas ? 1 : 0);

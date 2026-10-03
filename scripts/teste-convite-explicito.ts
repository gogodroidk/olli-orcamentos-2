/**
 * Teste do ACEITE EXPLÍCITO do convite de equipe (auditoria de segurança 02/10, S5).
 *
 *     node scripts/teste-convite-explicito.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Abrir `olliorcamentos://convite/<token>` NÃO pode entrar na equipe: o link pode ser
 * tocado por engano ou plantado por quem criou um convite aberto, e entrar leva os
 * dados da pessoa para a empresa de outro. A tela só chama `aceitarConvite` no toque
 * em "Aceitar convite"; "Recusar" sai sem gravar. Conferido pelo texto da tela
 * (importar o .tsx aqui puxaria o react-native).
 */
import { readFileSync } from 'node:fs';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const fonte = readFileSync(new URL('../src/screens/ConviteScreen.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (l.trimStart().startsWith('//') ? '' : l)).join('\n');

console.log('\n── Convite: nada é aceito sem o toque ──');
// `aceitarConvite(` aparece no import e UMA vez na chamada; a chamada tem de estar dentro de `aceitar()`.
const chamadas = [...codigo.matchAll(/aceitarConvite\(/g)].map((m) => m.index ?? 0);
checar('há exatamente uma chamada a aceitarConvite()', chamadas.length, 1);
const iAceitar = codigo.indexOf('async function aceitar(token: string)');
const fimAceitar = codigo.indexOf('\n  }\n', iAceitar);
checar('a função aceitar(token) existe', iAceitar >= 0, true);
checar('a chamada está DENTRO de aceitar(), não no useEffect', chamadas[0] > iAceitar && chamadas[0] < fimAceitar, true);

const iEffect = codigo.indexOf('useEffect(() => {');
const fimEffect = codigo.indexOf('}, [tokenParam]);', iEffect);
const corpoEffect = codigo.slice(iEffect, fimEffect);
checar('o useEffect não aceita nada', corpoEffect.includes('aceitarConvite'), false);
checar("o useEffect termina em 'confirmar' (só pergunta)", corpoEffect.includes("setEstado({ fase: 'confirmar', token })"), true);

console.log('\n── Convite: os dois botões ──');
checar('botão "Aceitar convite" chama aceitar()', /label="Aceitar convite"[\s\S]{0,200}aceitar\(estado\.token\)/.test(codigo), true);
checar('botão "Recusar" chama recusar()', /label="Recusar"[\s\S]{0,200}onPress=\{recusar\}/.test(codigo), true);
const iRecusar = codigo.indexOf('function recusar()');
const corpoRecusar = codigo.slice(iRecusar, codigo.indexOf('\n  }\n', iRecusar));
checar('recusar() não chama aceitarConvite', corpoRecusar.includes('aceitarConvite'), false);
checar('toque duplo travado por ref síncrono', codigo.includes('aceitandoRef.current'), true);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

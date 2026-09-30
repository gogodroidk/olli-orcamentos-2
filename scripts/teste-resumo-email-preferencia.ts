/**
 * Teste do botão "Receber resumo diário por e-mail" (`src/services/resumoEmailPreferencia.ts`),
 * o mesmo no app (mobile e desktop) e no painel.
 *
 *     node scripts/teste-resumo-email-preferencia.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Protege: resposta torta vira ERRO (null), nunca "desligado"; bounce/reclamação e
 * membro de equipe não podem ligar; descadastro de lembretes permite religar só o
 * resumo; o texto não promete número que mora no Worker.
 */
import {
  interpretarEstadoResumoEmail,
  linhaResumoEmail,
  ROTULO_RESUMO_EMAIL,
} from '../src/services/resumoEmailPreferencia.ts';

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

const base = { ativo: true, padrao: true, bloqueio: null, elegivel: true };

console.log('\nResumo por e-mail — leitura da resposta');
checar('resposta válida', interpretarEstadoResumoEmail(base), base);
checar('null / array / texto = erro', [interpretarEstadoResumoEmail(null), interpretarEstadoResumoEmail([]), interpretarEstadoResumoEmail('ok')], [null, null, null]);
checar('campo faltando = erro (nunca "desligado")', interpretarEstadoResumoEmail({ padrao: true, bloqueio: null, elegivel: true }), null);
checar('bloqueio desconhecido = erro', interpretarEstadoResumoEmail({ ...base, bloqueio: 'outro' }), null);

console.log('\nResumo por e-mail — o que a linha diz');
const ligado = linhaResumoEmail(base);
checar('rótulo pedido pelo dono', ligado.rotulo, 'Receber resumo diário por e-mail');
checar('ligado e alternável', [ligado.ligado, ligado.podeAlternar], [true, true]);
checar('texto: janela, só com algo a fazer, domingo mudo', /7h e 8h/.test(ligado.descricao) && /só nos dias/.test(ligado.descricao) && /domingos/.test(ligado.descricao), true);
checar('texto não promete teto semanal (é configuração do Worker)', /por semana|\d+ vezes/.test(ligado.descricao), false);
checar('desligado pela pessoa', [linhaResumoEmail({ ...base, ativo: false, padrao: false }).ligado, linhaResumoEmail({ ...base, ativo: false, padrao: false }).podeAlternar], [false, true]);
const descad = linhaResumoEmail({ ...base, ativo: false, bloqueio: 'descadastro' });
checar('descadastro de lembretes: desligado, mas dá para religar só o resumo', [descad.ligado, descad.podeAlternar, /Ligue aqui/.test(descad.descricao)], [false, true, true]);
for (const b of ['hard_bounce', 'complaint'] as const) {
  const l = linhaResumoEmail({ ...base, ativo: false, bloqueio: b });
  checar(`${b}: pausado e travado`, [l.ligado, l.podeAlternar, /suporte/.test(l.descricao)], [false, false, true]);
}
const membro = linhaResumoEmail({ ...base, ativo: false, elegivel: false });
checar('membro de equipe: não recebe e não alterna', [membro.ligado, membro.podeAlternar], [false, false]);
checar('rótulo exportado igual ao da linha', ROTULO_RESUMO_EMAIL, ligado.rotulo);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s) — preferência do resumo por e-mail`);
process.exit(falhas === 0 ? 0 : 1);

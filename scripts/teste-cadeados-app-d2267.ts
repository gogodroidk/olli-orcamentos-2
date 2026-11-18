/**
 * D-2267 (Igor, 18/11) NO APP: "no free só o básico; o resto pago e com cadeado".
 *
 *     node scripts/teste-cadeados-app-d2267.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. Regra do cadeado (pura): quem fica trancado, com a carência até 26/11; nota fiscal nunca no Grátis.
 *  2. Cada tela do recurso passa pelo portão (recibos, agenda, ordem de serviço, nota fiscal), e a tela
 *     "Disponível no Pro" existe como rota.
 *  3. O que o usuário já criou continua VISÍVEL: a lista de recibos emitidos, a lista de OS e o detalhe da
 *     visita/OS não somem; só deixam de criar e editar.
 *  4. "Puxar 1 telefone dos contatos" (D-2245) NÃO tranca.
 *  5. Texto e preço só da fonte única (nada digitado à mão nas telas novas); alvos de toque >= 44 px.
 */
import { readFileSync } from 'node:fs';
import { RECURSOS_CADEADO_D2267, recursoTrancado } from '../src/services/cadeadoRecurso.ts';
import { TRANCA_GRATIS_D2267, disponibilidadeRecurso, estadoAcessoRecurso, temAcessoRecurso } from '../src/services/entitlements.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// 1. Regra pura
ok('liberado e em_breve não tranca', !recursoTrancado('liberado') && !recursoTrancado('em_breve'));
ok('bloqueado tranca', recursoTrancado('bloqueado'));
ok('carregando e indeterminado também trancam (nunca liberam de graça)', recursoTrancado('carregando') && recursoTrancado('indeterminado'));
ok('os 5 recursos do D-2267', RECURSOS_CADEADO_D2267.join(',') === 'recibos,agenda,ordem_servico,importar_lote,nota_fiscal');
const antes = Date.parse(TRANCA_GRATIS_D2267) - 1000;
const depois = Date.parse(TRANCA_GRATIS_D2267) + 1000;
for (const r of ['recibos', 'agenda', 'ordem_servico', 'importar_lote'] as const) {
  ok(`${r}: Grátis na carência usa, depois do prazo tranca; Pro/Empresa sempre`,
    temAcessoRecurso('gratis', r, antes) && !temAcessoRecurso('gratis', r, depois)
    && temAcessoRecurso('pro', r, depois) && temAcessoRecurso('empresa', r, depois));
}
ok('nota fiscal: Grátis nunca (nem na carência); Pro/Empresa "em breve"',
  !temAcessoRecurso('gratis', 'nota_fiscal', antes) && !temAcessoRecurso('gratis', 'nota_fiscal', depois)
  && disponibilidadeRecurso('pro', 'nota_fiscal') === 'em_breve' && disponibilidadeRecurso('empresa', 'nota_fiscal') === 'em_breve');
ok('Grátis confirmado sem carência vira "bloqueado"; plano não confirmado nunca libera',
  estadoAcessoRecurso({ plano: 'gratis', carregando: false, confirmado: true } as never, 'nota_fiscal') === 'bloqueado'
  && estadoAcessoRecurso({ plano: 'gratis', carregando: false, confirmado: false } as never, 'nota_fiscal') === 'indeterminado');

// 2. Portões nas telas + rota
const recibo = semComentarios(ler('src/screens/EmitirReciboScreen.tsx'));
const agenda = semComentarios(ler('src/screens/AgendaScreen.tsx'));
const os = semComentarios(ler('src/screens/OrdemServicoScreen.tsx'));
const visualizar = semComentarios(ler('src/screens/VisualizarOrcamentoScreen.tsx'));
const nota = semComentarios(ler('src/screens/PrepararNotaScreen.tsx'));
const home = semComentarios(ler('src/screens/HomeScreen.tsx'));
const gate = semComentarios(ler('src/screens/RecursoTrancadoScreen.tsx'));
const nav = ler('src/navigation/AppNavigator.tsx');
ok('rota RecursoTrancado registrada e tipada', /RecursoTrancado: \{ recurso: Recurso \}/.test(nav) && /name="RecursoTrancado" component=\{RecursoTrancadoScreen\}/.test(nav));
ok('tela "Disponível no Pro" usa o cartão da fonte única', /<CartaoRecursoPlano recurso=\{recurso\} \/>/.test(gate) && /ROTULO_RECURSO\[recurso\]\.titulo/.test(gate));
ok('recibo: aba Novo vira cartão do plano quando trancada', /useCadeado\('recibos'\)/.test(recibo) && /aba === 'novo' && reciboTrancado/.test(recibo) && /<CartaoRecursoPlano recurso="recibos" \/>/.test(recibo));
ok('recibo: pagamento já registrado (PDF pendente) não é trancado', /cadeadoRecibo\.trancado && !reciboPendente/.test(recibo));
ok('agenda: agendar nova visita, salvar, excluir e arrastar passam pelo portão',
  /useCadeado\('agenda'\)/.test(agenda)
  && (agenda.match(/if \(cadeadoAgenda\.trancado\) \{ cadeadoAgenda\.abrirGate\(\); return/g) ?? []).length === 4);
ok('agenda: visita existente abre em somente leitura (Fechar, sem excluir, campos sem toque)',
  /somenteLeitura=\{cadeadoAgenda\.trancado\}/.test(agenda) && /pointerEvents=\{somenteLeitura \? 'none' : 'auto'\}/.test(agenda)
  && /onDelete && !somenteLeitura/.test(agenda) && /label="Fechar" variant="outline"/.test(agenda));
ok('OS: "Nova OS" passa pelo portão e o detalhe vira somente leitura com o cartão do plano',
  /useCadeado\('ordem_servico'\)/.test(os) && /cadeadoOS\.abrirGate\(\)/.test(os)
  && /osTrancada \? <CartaoRecursoPlano recurso="ordem_servico"/.test(os) && /pointerEvents=\{osTrancada \? 'none' : 'auto'\}/.test(os));
ok('orçamento: "Criar OS" passa pelo portão; botões de OS, recibo e nota mostram o cadeado',
  /cadeadoOS\.trancado\) \{ cadeadoOS\.abrirGate\(\); return; \}/.test(visualizar)
  && (visualizar.match(/lock-outline/g) ?? []).length >= 5);
ok('nota fiscal: a tela inteira passa por TelaRecursoPlano (cadeado no Grátis; Pro vê como antes)', /<TelaRecursoPlano recurso="nota_fiscal"/.test(nota));
ok('Home: atalhos Recibo e Agendar ficam, com cadeado', /trancado: cadeadoRecibo\.trancado/.test(home) && /trancado: cadeadoAgenda\.trancado/.test(home));

// 3. O que já existe segue visível: a lista de emitidos e a lista de OS não passam pelo cadeado
ok('recibos emitidos seguem numa aba sem portão', /<FlatList\s+data=\{emitidos\}/.test(recibo) && !/aba === 'emitidos' && reciboTrancado/.test(recibo));
ok('lista de OS e detalhe legível não são envolvidos por TelaRecursoPlano', !/TelaRecursoPlano/.test(os) && !/TelaRecursoPlano/.test(agenda) && !/TelaRecursoPlano/.test(recibo));

// 4. Puxar 1 telefone (D-2245) NÃO tranca
for (const f of ['src/services/puxarTelefoneDosContatos.ts', 'src/steps/Step1Cliente.tsx', 'src/utils/telefonePuxado.ts', 'src/services/telefoneDoCliente.ts']) {
  const c = semComentarios(ler(f));
  ok(`${f}: sem cadeado (puxar 1 telefone segue Grátis)`, !/useCadeado|TelaRecursoPlano|CartaoRecursoPlano|'recibos'|'agenda'|'ordem_servico'|'importar_lote'/.test(c));
}
ok('handleWhatsAppAgora (puxar no envio) não passa por cadeado', !/handleWhatsAppAgora[\s\S]{0,2500}useCadeado/.test(visualizar));

// 5. Fonte única de texto e alvos de toque
for (const [nome, c] of [['RecursoTrancadoScreen', gate], ['useCadeado', semComentarios(ler('src/hooks/useCadeado.ts'))], ['cadeadoRecurso', semComentarios(ler('src/services/cadeadoRecurso.ts'))]] as const) {
  ok(`${nome}: sem preço nem nome de plano digitado`, !/R\$\s?\d|\b39\b|'Pro'|"Pro"|Disponível no/.test(c));
}
ok('Home: o nome do plano do atalho vem de NOME_PLANO', /NOME_PLANO\.pro/.test(home) && !/Disponível no Pro/.test(home));
ok('alvos >= 44 px: aba Novo/Emitidos, "Preparar nota" e "Nova OS"',
  /minHeight: 44, paddingVertical: 9/.test(ler('src/screens/EmitirReciboScreen.tsx'))
  && /paddingTop: 8, minHeight: 44/.test(ler('src/screens/EmitirReciboScreen.tsx'))
  && /minHeight: 44, paddingHorizontal: 14, paddingVertical: 8/.test(ler('src/screens/OrdemServicoScreen.tsx')));

console.log(falhas ? `\nFALHOU: ${falhas}` : '\nPASSOU');
process.exit(falhas ? 1 : 0);

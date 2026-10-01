/**
 * Regras puras da tela Agenda do celular (src/utils/agendaDominio.ts).
 *
 *     node scripts/teste-agenda-tela.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que isto tranca:
 * - técnico vê só a própria agenda, e "não sei o papel" nunca vira "agenda
 *   vazia" nem "agenda da equipe" (3 estados);
 * - compromisso novo hoje nasce no próximo meio-hora (não às 09:00 já passadas),
 *   e nunca à meia-noite (que é a marca de "sem hora");
 * - fim sugerido pela duração do tipo (mesma tabela do painel);
 * - "Dia todo" reconhecido e no topo do dia;
 * - busca de cliente sem corte e sem acento;
 * - aviso de agendar no passado.
 */
import {
  agendamentoNoPassado, aplicarEscopo, diaDaOcorrencia, duracaoEstimadaMin, filtrarClientes, horaFimSugerida,
  inicioPadraoNovo, ordenarDoDia, paraHHMM, proximoMeioHora, resolverEscopoAgenda, rotuloDuracao, semHoraMarcada,
} from '../src/utils/agendaDominio.ts';

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

const local = (a: number, m: number, d: number, h = 0, min = 0, s = 0) => new Date(a, m - 1, d, h, min, s, 0);

console.log('Escopo (quem vê o quê)');
const base = { papelResolvido: true, papelCarregando: false, podeVerEquipe: true, usuario: { status: 'ok' as const, id: 'u1' } };
checar('gestão/pessoal vê a equipe', resolverEscopoAgenda(base), { status: 'equipe' });
checar('técnico vê só a própria', resolverEscopoAgenda({ ...base, podeVerEquipe: false }), { status: 'propria', userId: 'u1' });
checar('papel em leitura = carregando', resolverEscopoAgenda({ ...base, papelResolvido: false, papelCarregando: true }), { status: 'carregando' });
checar('papel falhou = erro (nunca vazio, nunca equipe)', resolverEscopoAgenda({ ...base, papelResolvido: false, papelCarregando: false }), { status: 'erro' });
checar('papel indeterminado ignora podeVerEquipe', resolverEscopoAgenda({ ...base, papelResolvido: false, papelCarregando: false, podeVerEquipe: true }), { status: 'erro' });
checar('técnico com usuário em leitura = carregando', resolverEscopoAgenda({ ...base, podeVerEquipe: false, usuario: { status: 'carregando' } }), { status: 'carregando' });
checar('técnico sem sessão = erro', resolverEscopoAgenda({ ...base, podeVerEquipe: false, usuario: { status: 'ok', id: null } }), { status: 'erro' });

const itens = [
  { id: 'a', responsavelId: 'u1' },
  { id: 'b', responsavelId: 'u2' },
  { id: 'c', responsavelId: undefined },
];
checar('equipe vê tudo', aplicarEscopo(itens, { status: 'equipe' }).map(i => i.id), ['a', 'b', 'c']);
checar('técnico vê só o dele', aplicarEscopo(itens, { status: 'propria', userId: 'u1' }).map(i => i.id), ['a']);
checar('carregando não mostra nada', aplicarEscopo(itens, { status: 'carregando' }).length, 0);
checar('erro não mostra nada', aplicarEscopo(itens, { status: 'erro' }).length, 0);

console.log('Horário de um compromisso novo');
checar('15:10 → 15:30', paraHHMM(proximoMeioHora(local(2026, 10, 1, 15, 10, 20))), '15:30');
checar('15:30 em ponto → 16:00', paraHHMM(proximoMeioHora(local(2026, 10, 1, 15, 30, 0))), '16:00');
checar('15:29:59 → 15:30', paraHHMM(proximoMeioHora(local(2026, 10, 1, 15, 29, 59))), '15:30');
const agora = local(2026, 10, 1, 15, 10);
checar('hoje às 15h10 nasce 15:30', paraHHMM(inicioPadraoNovo(local(2026, 10, 1), agora)), '15:30');
checar('outro dia nasce 09:00', paraHHMM(inicioPadraoNovo(local(2026, 10, 3), agora)), '09:00');
const tarde = inicioPadraoNovo(local(2026, 10, 1), local(2026, 10, 1, 23, 45));
checar('23h45 não vira meia-noite: amanhã 09:00', [tarde.getDate(), paraHHMM(tarde)], [2, '09:00']);
checar('23h10 ainda cabe 23:30 hoje', paraHHMM(inicioPadraoNovo(local(2026, 10, 1), local(2026, 10, 1, 23, 10))), '23:30');

console.log('Duração por tipo (mesma tabela do painel)');
checar('instalação 3h', duracaoEstimadaMin('instalacao'), 180);
checar('orçamento 30min', duracaoEstimadaMin('orcamento'), 30);
checar('visita 1h', duracaoEstimadaMin('visita'), 60);
checar('fim da instalação às 08:00 = 11:00', horaFimSugerida(local(2026, 10, 1, 8, 0), 'instalacao'), '11:00');
checar('fim do orçamento às 15:30 = 16:00', horaFimSugerida(local(2026, 10, 1, 15, 30), 'orcamento'), '16:00');
checar('fim que passa da meia-noite = vazio', horaFimSugerida(local(2026, 10, 1, 22, 30), 'instalacao'), '');
checar('rótulo 30min', rotuloDuracao(30), '30min');
checar('rótulo 3h', rotuloDuracao(180), '3h');
checar('rótulo 1h30', rotuloDuracao(90), '1h30');

console.log('Dia todo (sem hora marcada)');
const meiaNoite = local(2026, 10, 1).toISOString();
checar('meia-noite sem fim = dia todo', semHoraMarcada({ inicio: meiaNoite }), true);
checar('meia-noite com fim = horário de verdade', semHoraMarcada({ inicio: meiaNoite, fim: local(2026, 10, 1, 1).toISOString() }), false);
checar('09:00 sem fim = horário de verdade', semHoraMarcada({ inicio: local(2026, 10, 1, 9).toISOString() }), false);
checar('data inválida não é dia todo', semHoraMarcada({ inicio: 'lixo' }), false);
const doDia = ordenarDoDia([
  { id: 'tarde', inicio: local(2026, 10, 1, 14).toISOString() },
  { id: 'diaTodo', inicio: meiaNoite },
  { id: 'manha', inicio: local(2026, 10, 1, 8).toISOString() },
]);
checar('dia todo no topo, depois pela hora', doDia.map(i => i.id), ['diaTodo', 'manha', 'tarde']);

console.log('Notificação de uma ocorrência');
checar('id comum não tem dia', diaDaOcorrencia('abc'), null);
const occ = diaDaOcorrencia('abc@2026-10-15');
checar('id@dia vira o dia local', occ ? [occ.getFullYear(), occ.getMonth() + 1, occ.getDate()] : null, [2026, 10, 15]);
checar('dia impossível = null', diaDaOcorrencia('abc@2026-02-31'), null);

console.log('Agendar no passado');
checar('início antes de agora = passado', agendamentoNoPassado(local(2026, 10, 1, 9), true, agora), true);
checar('início depois de agora = ok', agendamentoNoPassado(local(2026, 10, 1, 16), true, agora), false);
checar('dia todo de hoje ainda não passou', agendamentoNoPassado(local(2026, 10, 1), false, agora), false);
checar('dia todo de ontem passou', agendamentoNoPassado(local(2026, 9, 30), false, agora), true);

console.log('Busca de cliente');
const clientes = Array.from({ length: 45 }, (_, i) => ({ nome: `Cliente ${i + 1}`, telefone: `(11) 9${String(i).padStart(4, '0')}-0000` }));
clientes.push({ nome: 'José Antônio', telefone: '(21) 98888-7777' });
checar('busca vazia devolve todos (sem o corte de 30)', filtrarClientes(clientes, '').length, 46);
checar('acha sem acento', filtrarClientes(clientes, 'jose antonio').map(c => c.nome), ['José Antônio']);
checar('acha sem caixa', filtrarClientes(clientes, 'JOSÉ').map(c => c.nome), ['José Antônio']);
checar('acha pelo telefone', filtrarClientes(clientes, '98888').map(c => c.nome), ['José Antônio']);
checar('o 45º cliente aparece', filtrarClientes(clientes, 'cliente 45').map(c => c.nome), ['Cliente 45']);

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);

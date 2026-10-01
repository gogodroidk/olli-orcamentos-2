/**
 * Agenda nível top (item 2.9) — regras puras de src/utils/agendaVisual.ts e a
 * ligação delas na tela.
 *
 *     node scripts/teste-agenda-top.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que isto tranca:
 * - cor por técnico estável e diferente para cada membro da equipe;
 * - grade do Dia: posição, sobrepostos lado a lado, faixa de horas, encaixe de 15 min
 *   e arrastar preso ao próprio dia (com a duração mantida);
 * - editar UMA ocorrência: só o que mudou vira mudança, e "só esta" some quando a
 *   mudança é de série (cliente/tipo/endereço) ou da regra;
 * - extras de série vão para a linha certa (série nova × base) e "só esta" recusa;
 * - puxar para atualizar ESPERA o sync em voo e roda um novo (o bug do aparelho),
 *   com 3 respostas honestas (ok / falhou / demorou);
 * - a tela usa tudo isso (fonte): sincronizarAgora, editarRecorrente,
 *   encontrarConflitosPorTecnico, FAB que some ao rolar.
 */
import { readFileSync } from 'node:fs';
import {
  COR_SEM_RESPONSAVEL, PALETA_TECNICOS, ajustarAoPasso, alcancesPermitidos, aplicarExtrasAoPlano, atualizarDaNuvem,
  corDoTecnico, diferencaDaOcorrencia, faixaDeHoras, inicioArrastado, layoutDoDia, minutosParaHHMM, remarcarNoDia,
  type EstadoOcorrencia,
} from '../src/utils/agendaVisual.ts';

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

const local = (a: number, m: number, d: number, h = 0, min = 0) => new Date(a, m - 1, d, h, min, 0, 0);
const iso = (d: Date) => d.toISOString();

console.log('Cor por técnico');
const ordem = ['u1', 'u2', 'u3'];
checar('membros ganham cores diferentes, na ordem', ordem.map(id => corDoTecnico(id, ordem)), PALETA_TECNICOS.slice(0, 3));
checar('sem responsável = cinza', corDoTecnico(undefined, ordem), COR_SEM_RESPONSAVEL);
checar('fora da equipe: cor estável pelo id', corDoTecnico('xyz'), corDoTecnico('xyz'));
checar('fora da equipe: está na paleta', (PALETA_TECNICOS as readonly string[]).includes(corDoTecnico('xyz')), true);

console.log('Grade do dia');
const dia = local(2026, 10, 1);
const dur = () => 60;
const it = (id: string, h: number, m: number, fimH?: number, fimM = 0) => ({
  id, tipo: 'visita' as const,
  inicio: iso(local(2026, 10, 1, h, m)),
  fim: fimH !== undefined ? iso(local(2026, 10, 1, fimH, fimM)) : undefined,
});
const blocos = layoutDoDia([it('a', 9, 0, 10), it('b', 9, 30, 11), it('c', 11, 0), it('d', 14, 0, 15)], dia, dur);
checar('posição em minutos', blocos.map(b => [b.item.id, b.iniMin, b.fimMin]), [['a', 540, 600], ['b', 570, 660], ['c', 660, 720], ['d', 840, 900]]);
checar('sobrepostos lado a lado', blocos.map(b => [b.item.id, b.coluna, b.colunas]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1], ['d', 0, 1]]);
checar('sem fim = duração do tipo', layoutDoDia([it('x', 8, 0)], dia, () => 180).map(b => b.fimMin), [660]);
checar('início ilegível fica de fora', layoutDoDia([{ id: 'z', tipo: 'visita', inicio: 'lixo' }], dia, dur).length, 0);
checar('faixa padrão 07h–20h', faixaDeHoras([]), { de: 7, ate: 20 });
checar('faixa alarga para caber', faixaDeHoras([{ iniMin: 5 * 60 + 30, fimMin: 22 * 60 + 15 }]), { de: 5, ate: 23 });
checar('faixa inclui o agora', faixaDeHoras([], 23 * 60 + 10), { de: 7, ate: 24 });

console.log('Arrastar (encaixe de 15 min, mesmo dia)');
checar('arredonda no passo', [ajustarAoPasso(7), ajustarAoPasso(8), ajustarAoPasso(22)], [0, 15, 15]);
checar('desce 1h (64 px por hora)', inicioArrastado(540, 64, 64, 60), 600);
checar('encaixa em 15 min', inicioArrastado(540, 20, 64, 60), 555);
checar('não começa antes da meia-noite', inicioArrastado(30, -500, 64, 60), 0);
checar('não vaza para o dia seguinte', inicioArrastado(1200, 5000, 64, 120), 1320);
checar('HH:mm', [minutosParaHHMM(0), minutosParaHHMM(605), minutosParaHHMM(1439)], ['00:00', '10:05', '23:59']);
const rem = remarcarNoDia({ inicio: iso(local(2026, 10, 1, 9)), fim: iso(local(2026, 10, 1, 10, 30)) }, 14 * 60);
checar('remarcar mantém a duração', rem, { inicio: iso(local(2026, 10, 1, 14)), fim: iso(local(2026, 10, 1, 15, 30)) });
checar('sem fim continua sem fim', remarcarNoDia({ inicio: iso(local(2026, 10, 1, 9)) }, 600), { inicio: iso(local(2026, 10, 1, 10)) });
checar('início inválido não remarca', remarcarNoDia({ inicio: 'x' }, 600), null);

console.log('Editar uma ocorrência');
const orig: EstadoOcorrencia = {
  inicio: iso(local(2026, 10, 1, 9)), fim: iso(local(2026, 10, 1, 10)), status: 'agendado', titulo: 'Limpeza',
  observacao: undefined, responsavelId: 'u1', responsavelNome: 'Carlos', tipo: 'manutencao',
  clienteId: 'c1', clienteNome: 'Clínica', endereco: 'Rua A', recorrencia: 'mensal', recorrenciaAte: undefined,
};
const igual = diferencaDaOcorrencia(orig, { ...orig });
checar('nada mudou = vazia', igual.vazia, true);
const soHora = diferencaDaOcorrencia(orig, { ...orig, inicio: iso(local(2026, 10, 1, 14)), fim: iso(local(2026, 10, 1, 15)) });
checar('mudou a hora: só inicio/fim', Object.keys(soHora.mudanca), ['inicio', 'fim']);
checar('mudou a hora: os 3 alcances', alcancesPermitidos(soHora), ['so_esta', 'esta_e_proximas', 'toda_serie']);
const tirouFim = diferencaDaOcorrencia(orig, { ...orig, fim: undefined });
checar('tirar o fim = fim null', tirouFim.mudanca.fim, null);
const trocouTecnico = diferencaDaOcorrencia(orig, { ...orig, responsavelId: 'u2', responsavelNome: 'Rafael' });
checar('trocar técnico', trocouTecnico.mudanca, { responsavelId: 'u2', responsavelNome: 'Rafael' });
const obsVazia = diferencaDaOcorrencia(orig, { ...orig, observacao: '' });
checar('observação undefined × vazia não é mudança', obsVazia.vazia, true);
const trocouCliente = diferencaDaOcorrencia(orig, { ...orig, clienteId: 'c2', clienteNome: 'Hotel' });
checar('cliente é de série', trocouCliente.camposSerie, { clienteId: 'c2', clienteNome: 'Hotel' });
checar('cliente: sem "só esta"', alcancesPermitidos(trocouCliente), ['esta_e_proximas', 'toda_serie']);
const mudouRegra = diferencaDaOcorrencia(orig, { ...orig, recorrencia: 'semanal' });
checar('regra: só a série toda', alcancesPermitidos(mudouRegra), ['toda_serie']);

console.log('Extras de série no plano');
const base = {
  id: 'b', clienteNome: 'Clínica', titulo: 'Limpeza', tipo: 'manutencao' as const, inicio: iso(local(2026, 9, 1, 9)),
  status: 'agendado' as const, criadoEm: 'x', atualizadoEm: 'x', recorrencia: 'mensal' as const,
  excecoes: { '2026-09-01': { status: 'concluido' as const } },
};
const nova = { ...base, id: 'n' };
const comNova = aplicarExtrasAoPlano({ base, novaSerie: nova }, 'esta_e_proximas', { camposSerie: { clienteNome: 'Hotel', tipo: 'instalacao' } });
checar('esta e as próximas: muda a série NOVA', [comNova.novaSerie?.clienteNome, comNova.novaSerie?.tipo], ['Hotel', 'instalacao']);
checar('esta e as próximas: a antiga fica', comNova.base.clienteNome, 'Clínica');
const toda = aplicarExtrasAoPlano({ base }, 'toda_serie', { camposSerie: { endereco: 'Rua B' }, regra: { recorrencia: 'semanal', recorrenciaAte: '2026-12-31' } });
checar('toda a série: base com endereço e regra nova', [toda.base.endereco, toda.base.recorrencia, toda.base.recorrenciaAte], ['Rua B', 'semanal', '2026-12-31']);
const parou = aplicarExtrasAoPlano({ base }, 'toda_serie', { regra: { recorrencia: undefined, recorrenciaAte: '2026-12-31' } });
checar('deixar de repetir: sem regra, sem exceções', [parou.base.recorrencia, parou.base.recorrenciaAte, parou.base.excecoes], [undefined, undefined, undefined]);
let recusou = '';
try { aplicarExtrasAoPlano({ base }, 'so_esta', { camposSerie: { clienteNome: 'Hotel' } }); } catch (e) { recusou = (e as Error).message; }
checar('"só esta" com cliente novo é recusado', recusou.includes('série'), true);
checar('sem extras = plano intacto', aplicarExtrasAoPlano({ base }, 'so_esta', { camposSerie: {} }).base === base, true);

console.log('Puxar para atualizar');
async function cenarioAtualizar(): Promise<void> {
  let relogio = 1_000;
  const ordemChamadas: string[] = [];
  let ultimo: { em: string; falhas: string[]; abortado: boolean } | null = { em: new Date(500).toISOString(), falhas: [], abortado: false };
  let liberarVoo!: () => void;
  const voo = new Promise<void>((r) => { liberarVoo = r; });
  const pend = atualizarDaNuvem({
    emVoo: () => voo,
    sincronizar: async () => { ordemChamadas.push('sync-novo'); relogio += 10; ultimo = { em: new Date(relogio).toISOString(), falhas: [], abortado: false }; },
    ultimoPull: () => ultimo,
    tetoMs: 10_000,
    agora: () => relogio,
    esperar: () => new Promise<void>(() => {}),
  });
  ordemChamadas.push('voo-terminou');
  liberarVoo();
  checar('espera o sync em voo e roda um NOVO', [await pend, ordemChamadas], ['ok', ['voo-terminou', 'sync-novo']]);

  const semPullNovo = await atualizarDaNuvem({
    emVoo: () => null,
    sincronizar: async () => {},
    ultimoPull: () => ({ em: new Date(0).toISOString(), falhas: [], abortado: false }),
    tetoMs: 10_000, agora: () => 1_000, esperar: () => new Promise<void>(() => {}),
  });
  checar('pull velho (o sync não rodou) = falhou, não "ok"', semPullNovo, 'falhou');

  const agendaFalhou = await atualizarDaNuvem({
    emVoo: () => null,
    sincronizar: async () => {},
    ultimoPull: () => ({ em: new Date(2_000).toISOString(), falhas: ['agendamentos'], abortado: false }),
    tetoMs: 10_000, agora: () => 1_000, esperar: () => new Promise<void>(() => {}),
  });
  checar('agendamentos não vieram = falhou', agendaFalhou, 'falhou');

  const outraTabela = await atualizarDaNuvem({
    emVoo: () => null,
    sincronizar: async () => {},
    ultimoPull: () => ({ em: new Date(2_000).toISOString(), falhas: ['recibos'], abortado: false }),
    tetoMs: 10_000, agora: () => 1_000, esperar: () => new Promise<void>(() => {}),
  });
  checar('falha em outra tabela não derruba a agenda', outraTabela, 'ok');

  const demorou = await atualizarDaNuvem({
    emVoo: () => new Promise<void>(() => {}),
    sincronizar: async () => {},
    ultimoPull: () => null,
    tetoMs: 5, agora: () => 1_000, esperar: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
  });
  checar('passou do teto = demorou', demorou, 'demorou');

  // Outro sync entrou entre o em-voo e o nosso: a trava devolve na hora e o pull
  // que importa é o DELE. Espera ele terminar antes de ler o resultado.
  let pullDoOutro: { em: string; falhas: string[]; abortado: boolean } | null = null;
  let emVooAgora: Promise<void> | null = null;
  let liberarOutro!: () => void;
  const outro = new Promise<void>((r) => { liberarOutro = r; });
  const pendOutro = atualizarDaNuvem({
    emVoo: () => emVooAgora,
    sincronizar: async () => { emVooAgora = outro; },
    ultimoPull: () => pullDoOutro,
    tetoMs: 10_000, agora: () => 1_000, esperar: () => new Promise<void>(() => {}),
  });
  await Promise.resolve();
  pullDoOutro = { em: new Date(3_000).toISOString(), falhas: [], abortado: false };
  liberarOutro();
  checar('sync que entrou no meio: espera ele e responde ok', await pendOutro, 'ok');
}

console.log('Ligação na tela (fonte)');
const tela = readFileSync(new URL('../src/screens/AgendaScreen.tsx', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../src/services/cloudSync.ts', import.meta.url), 'utf8');
checar('refresh usa sincronizarAgora (não o syncOnLogin cru)', tela.includes('await sincronizarAgora()') && !tela.includes('syncOnLogin()'), true);
checar('cloudSync expõe o sync em voo', sync.includes('syncEmVoo = p') && sync.includes('export async function sincronizarAgora'), true);
checar('editar ocorrência usa editarRecorrente', tela.includes('editarRecorrente(e.ocorrenciaId, alcance'), true);
checar('arrastar usa editarRecorrente/saveAgendamento', tela.includes('editarRecorrente(item.id, alcance'), true);
checar('conflito por técnico no formulário', tela.includes('encontrarConflitosPorTecnico(doDia.itens'), true);
checar('conflito por técnico ao arrastar', /encontrarConflitosPorTecnico\(\s*itensVisiveis/.test(tela), true);
checar('FAB some ao rolar', tela.includes('moverFab(1)') && tela.includes('estiloFab'), true);
checar('lista e grade reservam o espaço do FAB', tela.includes('paddingBottom: paddingLista') && tela.includes('paddingInferior={paddingLista}'), true);
checar('sem LayoutAnimation', tela.includes('LayoutAnimation'), false);
checar('três visões', ['dia', 'semana', 'mes'].every(v => tela.includes(`visao === '${v}'`)), true);

cenarioAtualizar().then(() => {
  console.log(`\n${passes} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});

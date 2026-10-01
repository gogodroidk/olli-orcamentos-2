/**
 * Seed rolante da demo GR Tech — o PLANO (função pura) e as travas do script.
 *
 *     node scripts/teste-seed-demo-rolante.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Não toca em banco nenhum: testa `planejarSeed` com uma conta sintética e lê o
 * fonte do script para provar que a trava "só a conta demo" vem ANTES de qualquer
 * escrita e que o padrão é SIMULAÇÃO.
 */
import { readFileSync } from 'node:fs';
import { visitasParaGerar } from '../src/utils/contratoRecorrente.ts';
import { cnpjValido, cpfValido, normalizarChavePix } from '../src/utils/pixBrCode.ts';
import {
  DEMO_CHAVE_PIX,
  DEMO_CNPJ,
  DEMO_CPF,
  type EntradaSeed,
  ID_CONTRATO_PMOC,
  ID_SERIE_MENSAL,
  cnpjFicticio,
  cpfFicticio,
  idOrcamentoDoMes,
  planejarSeed,
} from './seed-demo-rolante.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) {
    console.log(`  ok   ${nome}`);
    ok++;
  } else {
    console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`);
    falhas++;
  }
}

/** Hora e minuto em Brasília (UTC−3 fixo, mesma regra do app). */
const hhmmBrasil = (iso: unknown): string => new Date(new Date(String(iso)).getTime() - 3 * 3600_000).toISOString().slice(11, 16);
const diaBrasil = (iso: unknown): string => new Date(new Date(String(iso)).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const diaDaSemana = (dia: string): number => new Date(`${dia}T12:00:00Z`).getUTCDay();

const TEC1 = { id: '00000000-0000-4000-8000-000000000101', nome: 'Carlos Lima' };
const TEC2 = { id: '00000000-0000-4000-8000-000000000102', nome: 'Rafael Souza' };

function entradaBase(): EntradaSeed {
  return {
    ownerId: '00000000-0000-4000-8000-000000000001',
    orgId: '00000000-0000-4000-8000-000000000201',
    tecnicos: [TEC1, TEC2],
    clientes: [
      { id: 'cli_a', nome: 'Condomínio Jardim', endereco: 'Rua A, 10', cidade: 'São Paulo', estado: 'SP', cnpj: '11.111.111/1111-11', cpf: null },
      { id: 'cli_b', nome: 'Ana Ribeiro', telefone: '11988887777', endereco: 'Rua B, 20', cidade: 'São Paulo', estado: 'SP', cpf: '123.456.789-00' },
      { id: 'cli_c', nome: 'Padaria Sol', endereco: 'Av. C, 30', cidade: 'Osasco', estado: 'SP', cpf: '', cnpj: '' },
    ],
    servicos: [
      { id: 'srv_1', nome: 'Manutenção preventiva', preco: 250, unidade: 'un' },
      { id: 'srv_2', nome: 'Higienização', preco: 180, unidade: 'un' },
    ],
    ativos: [{ id: 'asset_1', clienteId: 'cli_a', nome: 'Split Recepção' }],
    empresa: { id: 'e1', nome: 'GR Tech Climatização', cnpj: '12.345.678/0001-00', cpf: '111.111.111-11', chavePix: 'pix@demo' },
    serieExiste: false,
    contratoExiste: false,
    orcamentoDoMesExiste: false,
    numerosOrcamento: ['00126', '01226', '00826', 'qualquer'],
    contadorOrcamento: 12,
  };
}

// 1/10/2026 12:00 em Brasília (quinta-feira).
const AGORA = new Date('2026-10-01T15:00:00Z');
const plano = planejarSeed(entradaBase(), AGORA);

console.log('\n1) Visitas: −7 a +14 dias, 8h–17h em Brasília, com técnico');
const visitas = plano.agendamentos;
checar('hoje é calculado no fuso do Brasil', plano.hoje === '2026-10-01', plano.hoje);
checar('29 visitas (22 dias + uma segunda visita a cada 3 dias)', visitas.length === 29, String(visitas.length));
checar('ids únicos', new Set(visitas.map((v) => v.id)).size === visitas.length);
const dias = visitas.map((v) => diaBrasil(v.inicio));
checar('nenhuma antes de hoje −8 (domingo −7 recua para sábado)', dias.every((d) => d >= '2026-09-23'), dias[0]);
checar('nenhuma depois de hoje +14', dias.every((d) => d <= '2026-10-15'), dias.at(-1));
checar('tem visita hoje', dias.includes('2026-10-01'));
checar('tem visita amanhã', dias.includes('2026-10-02'));
checar('nenhuma no domingo', dias.every((d) => diaDaSemana(d) !== 0), dias.filter((d) => diaDaSemana(d) === 0).join(','));
checar(
  'todas começam às 8h ou depois (Brasília)',
  visitas.every((v) => hhmmBrasil(v.inicio) >= '08:00'),
  visitas.map((v) => hhmmBrasil(v.inicio)).join(' '),
);
checar(
  'todas terminam até 17h (Brasília)',
  visitas.every((v) => hhmmBrasil(v.fim) <= '17:00' && diaBrasil(v.fim) === diaBrasil(v.inicio)),
  visitas.map((v) => hhmmBrasil(v.fim)).join(' '),
);
checar(
  'as que já terminaram estão concluídas; as outras, agendadas',
  visitas.every((v) => (String(v.fim) <= AGORA.toISOString() ? v.status === 'concluido' : v.status === 'agendado')),
);
checar('há visitas concluídas e agendadas', visitas.some((v) => v.status === 'concluido') && visitas.some((v) => v.status === 'agendado'));
checar('os 2 técnicos recebem visitas', new Set(visitas.map((v) => v.responsavel_id)).size === 2);
checar('responsável sempre com nome (o celular do técnico não depende da view)', visitas.every((v) => v.responsavel_id && v.responsavel_nome));
checar('tudo no tenant do dono', visitas.every((v) => v.user_id === entradaBase().ownerId));
checar('com cliente e endereço', visitas.every((v) => v.cliente_id && v.endereco));

const daquiUmaSemana = planejarSeed(entradaBase(), new Date(AGORA.getTime() + 7 * 86_400_000));
checar(
  'a rodada da semana seguinte reaproveita EXATAMENTE os mesmos ids (nada órfão)',
  JSON.stringify(daquiUmaSemana.agendamentos.map((v) => v.id)) === JSON.stringify(visitas.map((v) => v.id)),
);
checar(
  'e move as datas para a nova janela',
  diaBrasil(daquiUmaSemana.agendamentos.at(-1)?.inicio) > diaBrasil(visitas.at(-1)?.inicio),
);
const deNovo = planejarSeed(entradaBase(), AGORA);
checar('mesma entrada, mesmo instante → mesmo plano (idempotente)', JSON.stringify(deNovo) === JSON.stringify(plano));

console.log('\n2) Série mensal');
const serie = plano.serie;
checar('criada quando não existe', serie?.id === ID_SERIE_MENSAL);
checar('repete todo mês', serie?.recorrencia === 'mensal');
checar('no horário comercial', hhmmBrasil(serie?.inicio) >= '08:00' && hhmmBrasil(serie?.fim) <= '17:00');
checar('não cai no domingo', diaDaSemana(diaBrasil(serie?.inicio)) !== 0);

console.log('\n3) Contrato PMOC');
const c = plano.contrato;
checar('criado quando não existe', c?.id === ID_CONTRATO_PMOC);
checar('mensal e vigente', c?.periodicidade === 'mensal' && c?.situacao === 'vigente');
checar('para o cliente com CNPJ', c?.clienteId === 'cli_a');
checar('usa o equipamento do inventário do cliente', c?.ativos[0]?.assetId === 'asset_1');
checar('com técnico responsável', c?.responsavelId === TEC1.id);
checar('o motor do app gera a visita dele', !!c && visitasParaGerar(c, AGORA).length >= 1);

console.log('\n4) Orçamento aprovado do mês');
const orc = plano.orcamento;
const dados = orc?.dados as Record<string, unknown> | undefined;
checar('id do mês', orc?.id === idOrcamentoDoMes('2026-10'));
checar('aprovado', orc?.status === 'aprovado' && dados?.status === 'aprovado');
checar('emitido neste mês e não no futuro', String(orc?.data_emissao).startsWith('2026-10') && String(orc?.data_emissao) <= '2026-10-01');
checar('número acima do maior documento e do contador (013/26)', orc?.numero === '01326', String(orc?.numero));
checar('contador avança junto', plano.contadorOrcamento === 13);
checar('coluna e blob com o mesmo número', dados?.numero === orc?.numero);
checar('aprovado não depois de agora', String(dados?.atualizadoEm) <= AGORA.toISOString());
checar('total = soma dos itens', orc?.valor_total === 250 * 3 + 180);
checar('validade em DD/MM/AAAA (formato do app)', /^\d{2}\/\d{2}\/\d{4}$/.test(String(dados?.validadeOrcamento)));
checar('Pix do orçamento é o Pix válido da empresa', dados?.chavePix === DEMO_CHAVE_PIX);
const comMuitos = planejarSeed({ ...entradaBase(), numerosOrcamento: ['04526'], contadorOrcamento: 3 }, AGORA);
checar('respeita o maior número já emitido', comMuitos.orcamento?.numero === '04626', String(comMuitos.orcamento?.numero));

console.log('\n5) Empresa e clientes com documentos válidos');
const emp = plano.empresaDados;
checar('CNPJ da empresa válido', cnpjValido(String(emp?.cnpj)));
checar('CPF da empresa válido', cpfValido(String(emp?.cpf)));
checar('chave Pix reconhecida (aleatória — não leva dinheiro a ninguém)', normalizarChavePix(String(emp?.chavePix))?.tipo === 'aleatoria');
checar('os outros campos da empresa ficam como estavam', emp?.nome === 'GR Tech Climatização');
const empresaOk = planejarSeed(
  { ...entradaBase(), empresa: { nome: 'X', cnpj: DEMO_CNPJ, cpf: DEMO_CPF, chavePix: '+5511988887777', tipoNegocio: 'empresa' } },
  AGORA,
);
checar('empresa já válida não é reescrita', empresaOk.empresaDados === null);
checar('chave do dono preservada no orçamento', (empresaOk.orcamento?.dados as Record<string, unknown>)?.chavePix === '+5511988887777');
const fixA = plano.clientesCorrigidos.find((x) => x.id === 'cli_a');
const fixB = plano.clientesCorrigidos.find((x) => x.id === 'cli_b');
checar('CNPJ inválido de cliente vira válido', !!fixA?.cnpj && cnpjValido(fixA.cnpj));
checar('CPF inválido de cliente vira válido', !!fixB?.cpf && cpfValido(fixB.cpf));
checar('documento vazio continua vazio', !plano.clientesCorrigidos.some((x) => x.id === 'cli_c'));
checar('correção estável (mesmo cliente, mesmo número)', cpfFicticio('cli_b') === fixB?.cpf);
checar('orçamento leva o CPF já corrigido', (dados?.clienteCpfCnpj as string) === fixB?.cpf);
checar('constantes da demo válidas', cnpjValido(DEMO_CNPJ) && cpfValido(DEMO_CPF) && !!normalizarChavePix(DEMO_CHAVE_PIX));
let geradosOk = true;
for (let i = 0; i < 500; i++) {
  if (!cpfValido(cpfFicticio(`s${i}`)) || !cnpjValido(cnpjFicticio(`s${i}`))) geradosOk = false;
}
checar('500 CPFs/CNPJs fictícios gerados, todos com dígito válido', geradosOk);

console.log('\n6) Idempotência: o que já existe não é reescrito');
const segunda = planejarSeed({ ...entradaBase(), serieExiste: true, contratoExiste: true, orcamentoDoMesExiste: true }, AGORA);
checar('série existente fica em paz', segunda.serie === null);
checar('contrato existente fica em paz', segunda.contrato === null);
checar('orçamento do mês existente fica em paz (nem número novo)', segunda.orcamento === null && segunda.contadorOrcamento === null);

console.log('\n7) Mapa: posição dos técnicos');
checar('uma posição por técnico, na org da demo', plano.localizacoes.length === 2 && plano.localizacoes.every((l) => l.org_id === entradaBase().orgId));

console.log('\n8) Travas do script');
const fonte = readFileSync(new URL('./seed-demo-rolante.ts', import.meta.url), 'utf8');
const corpo = fonte.slice(fonte.indexOf('async function principal'));
const trava = corpo.indexOf('dono.email.toLowerCase() !== DEMO_EMAIL');
const primeiraEscrita = Math.min(
  ...['.upsert(', '.insert(', '.update(', 'createUser('].map((s) => corpo.indexOf(s)).filter((i) => i >= 0),
);
checar('a trava "só a conta demo" existe', trava > 0);
checar('e vem ANTES de qualquer escrita', trava < primeiraEscrita);
checar('padrão é simulação (escrever exige --aplicar)', corpo.includes("process.argv.includes('--aplicar')") && corpo.includes('if (!aplicar) return 0;'));
checar('nunca apaga nada', !/\.delete\(/.test(fonte));
checar('não imprime a chave de serviço', !/console\.\w+\([^)]*chave\b/.test(corpo));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);

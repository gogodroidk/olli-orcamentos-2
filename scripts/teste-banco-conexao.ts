/**
 * Banco local estável (item 1.1 da onda 1; B01 da auditoria de 30/09/2026).
 *
 *     node scripts/teste-banco-conexao.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita o gerenciador REAL de `src/database/conexao.ts` com um handle falso que
 * imita o expo-sqlite (fecha, morre, trava) e roda a consulta REAL de "contas a
 * receber" (`src/database/contasAReceberSql.ts`) num SQLite de verdade (`node:sqlite`).
 *
 * O que prende:
 *  - dez pedidos simultâneos abrem UMA conexão (e rodam o initDb uma vez);
 *  - a troca de partição não fecha a conexão com leitura pendente, e quem pede durante
 *    a troca espera e recebe a partição NOVA (não o banco legado);
 *  - abertura que começou antes da troca e terminou depois é descartada;
 *  - conexão morta ("closed resource") é descartada: a instrução é repetida uma vez e o
 *    pedido seguinte ("Tentar de novo") funciona — antes ficava preso até o force-stop;
 *  - transação e execAsync nunca são repetidos sozinhos; nunca se repete em OUTRA partição;
 *  - "a receber" conta convertido, abate pagamento parcial, ignora estorno/lixeira e não
 *    soma orçamento sem valor como zero.
 */
import { DatabaseSync } from 'node:sqlite';
import { criarGerenciadorDeConexao, erroDeConexaoMorta } from '../src/database/conexao.ts';
import { SQL_CONTAS_A_RECEBER } from '../src/database/contasAReceberSql.ts';

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

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Handle falso: imita o SQLiteDatabase do Expo ────────────────────────────────

class HandleFalso {
  fechado = false;
  /** Próximas N chamadas falham com este erro (simula a conexão morrendo). */
  falharProximas = 0;
  erro = 'Call to function \'NativeDatabase.prepareAsync\' has been rejected.\n→ Caused by: Access to closed resource';
  chamadas: string[] = [];
  /** Atraso das leituras, para deixar consulta "em voo". */
  atrasoMs = 0;

  readonly nome: string;

  constructor(nome: string) {
    this.nome = nome;
  }

  async closeAsync(): Promise<void> {
    this.fechado = true;
  }

  private async rodar(metodo: string, sql: string): Promise<{ arquivo: string }> {
    this.chamadas.push(`${metodo}:${sql}`);
    if (this.atrasoMs) await esperar(this.atrasoMs);
    if (this.fechado) throw new Error('Access to closed resource');
    if (this.falharProximas > 0) {
      this.falharProximas--;
      throw new Error(this.erro);
    }
    return { arquivo: this.nome };
  }

  getFirstAsync(sql: string) {
    return this.rodar('getFirstAsync', sql);
  }
  getAllAsync(sql: string) {
    return this.rodar('getAllAsync', sql).then((r) => [r]);
  }
  runAsync(sql: string) {
    return this.rodar('runAsync', sql);
  }
  execAsync(sql: string) {
    return this.rodar('execAsync', sql).then(() => undefined);
  }
  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    await this.rodar('BEGIN', '');
    await fn();
  }
}

function montar(opcoes: { atrasoAberturaMs?: number } = {}) {
  const abertos: HandleFalso[] = [];
  const g = criarGerenciadorDeConexao<HandleFalso>({
    nomePadrao: 'legado.db',
    prazoDrenagemMs: 2_000,
    esperaAntesDeRepetirMs: 1,
    abrir: async (nome) => {
      if (opcoes.atrasoAberturaMs) await esperar(opcoes.atrasoAberturaMs);
      const h = new HandleFalso(nome);
      abertos.push(h);
      return h;
    },
  });
  return { g, abertos };
}

async function principal(): Promise<void> {
  console.log('\nConexão — abertura única');
  {
    const { g, abertos } = montar({ atrasoAberturaMs: 15 });
    const handles = await Promise.all(Array.from({ length: 10 }, () => g.obter()));
    checar('10 pedidos simultâneos abrem 1 conexão', abertos.length === 1, `abriu ${abertos.length}`);
    checar('todos recebem a mesma conexão', handles.every((h) => h === handles[0]));
    checar('antes do login usa o banco padrão', g.nomeAtual() === 'legado.db');
    await g.obter();
    checar('pedido depois reaproveita a conexão', abertos.length === 1);
  }

  console.log('\nConexão — abertura que falha não fica em cache');
  {
    let tentativas = 0;
    const g = criarGerenciadorDeConexao<HandleFalso>({
      nomePadrao: 'legado.db',
      abrir: async (nome) => {
        tentativas++;
        if (tentativas === 1) throw new Error('no such column: atualizado_em');
        return new HandleFalso(nome);
      },
    });
    let falhou = false;
    try {
      await g.obter();
    } catch {
      falhou = true;
    }
    const h = await g.obter();
    checar('1ª abertura falha alto', falhou);
    checar('a próxima tenta de novo e abre', h.nome === 'legado.db' && tentativas === 2);
  }

  console.log('\nPartição — fila, drenagem e espera');
  {
    const { g, abertos } = montar();
    const legado = await g.obter();
    abertos[0].atrasoMs = 40;
    const leituraEmVoo = legado.getFirstAsync('SELECT em voo');
    let resolverNome: (n: string) => void = () => {};
    const troca = g.trocarParticao(
      () =>
        new Promise<string>((r) => {
          resolverNome = r;
        }),
    );
    // Pedido DURANTE a troca: espera a partição ficar pronta.
    const pedidoNoMeio = g.obter();
    await esperar(5);
    checar('durante a troca, ninguém abre o legado de novo', abertos.length === 1);
    resolverNome('olli_u_b.db');
    const r = await leituraEmVoo;
    checar('a leitura em voo termina no banco antigo (não morre)', r.arquivo === 'legado.db');
    await troca;
    checar('o banco antigo só fecha depois de drenar', abertos[0].fechado);
    const h = await pedidoNoMeio;
    checar('quem pediu no meio recebe a partição nova', h.nome === 'olli_u_b.db', h.nome);
    checar('nomeAtual = partição escolhida', g.nomeAtual() === 'olli_u_b.db');
  }

  {
    const { g, abertos } = montar();
    await g.obter();
    await g.trocarParticao(async () => 'legado.db');
    checar('adotar o legado já aberto não fecha nem reabre', abertos.length === 1 && !abertos[0].fechado);
    const [a, b] = await Promise.all([
      g.trocarParticao(async () => 'olli_u_c.db'),
      g.trocarParticao(async () => 'olli_u_c.db'),
    ]);
    const h = await g.obter();
    checar('duas trocas simultâneas para o mesmo usuário: uma conexão', a === b && h.nome === 'olli_u_c.db' && abertos.length === 2);
  }

  console.log('\nPartição — abertura antiga em voo é descartada');
  {
    const { g, abertos } = montar({ atrasoAberturaMs: 20 });
    const pedidoAntigo = g.obter(); // começou a abrir o legado
    await esperar(1);
    await g.trocarParticao(async () => 'olli_u_d.db');
    const h = await pedidoAntigo;
    checar('o pedido antigo recebe a partição nova', h.nome === 'olli_u_d.db', h.nome);
    checar('o legado aberto por engano foi fechado', abertos[0].nome === 'legado.db' && abertos[0].fechado);
  }

  console.log('\nConexão morta — descarta e reabre');
  {
    const { g, abertos } = montar();
    const h = await g.obter();
    abertos[0].falharProximas = 99; // a conexão morreu de vez
    const r = await h.getFirstAsync('SELECT 1');
    checar('instrução avulsa é repetida uma vez numa conexão nova', r.arquivo === 'legado.db' && abertos.length === 2);
    checar('a conexão morta foi tirada de circulação', abertos[0].fechado);
    const h2 = await g.obter();
    const r2 = await h2.getAllAsync('SELECT 2');
    checar('"Tentar de novo" funciona (pedido seguinte vai na conexão nova)', r2[0].arquivo === 'legado.db' && abertos[1].chamadas.length === 2);
  }

  {
    const { g, abertos } = montar();
    const h = await g.obter();
    abertos[0].falharProximas = 1;
    let falhou = false;
    try {
      await h.execAsync('INSERT 1; INSERT 2;');
    } catch {
      falhou = true;
    }
    checar('execAsync (vários comandos) não é repetido sozinho', falhou && abertos.length === 1);
    const r = await (await g.obter()).getFirstAsync('SELECT depois');
    checar('…mas a conexão morta é descartada e a próxima abre', r.arquivo === 'legado.db' && abertos.length === 2);
  }

  {
    const { g, abertos } = montar();
    const h = await g.obter();
    let falhou = false;
    try {
      await h.withTransactionAsync(async () => {
        abertos[0].falharProximas = 1;
        await h.runAsync('INSERT dentro');
      });
    } catch {
      falhou = true;
    }
    const runsNaNova = abertos[1]?.chamadas.filter((c) => c.startsWith('runAsync')).length ?? 0;
    checar('dentro de transação nada é repetido em outra conexão', falhou && runsNaNova === 0);
  }

  {
    const { g, abertos } = montar();
    const h = await g.obter();
    abertos[0].erro = 'database is locked';
    abertos[0].falharProximas = 1;
    const r = await h.runAsync('UPDATE x');
    checar('"database is locked" também reabre e repete uma vez', r.arquivo === 'legado.db');
  }

  {
    const { g, abertos } = montar();
    const hA = await g.obter();
    await g.trocarParticao(async () => 'olli_u_e.db');
    let falhou = false;
    try {
      await hA.runAsync('INSERT da conta antiga');
    } catch {
      falhou = true;
    }
    const naNova = abertos.find((a) => a.nome === 'olli_u_e.db')?.chamadas.length ?? 0;
    checar('escrita da partição antiga nunca é refeita na partição nova', falhou && naNova === 0);
  }

  {
    const { g, abertos } = montar();
    await g.obter();
    abertos[0].falharProximas = 2; // as duas instruções da 1ª passada falham
    let passadas = 0;
    const r = await g.comConexao(async (db) => {
      passadas++;
      await db.execAsync('PRAGMA x');
      return db.getFirstAsync('SELECT y');
    });
    checar('comDb repete o bloco uma vez quando a conexão cai', passadas === 2 && r.arquivo === 'legado.db');
  }

  checar('reconhece "closed resource"', erroDeConexaoMorta(new Error('Access to closed resource')));
  checar('não confunde erro de SQL com conexão morta', !erroDeConexaoMorta(new Error('no such table: x')));

  console.log('\nContas a receber — SQL real (node:sqlite)');
  {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE orcamentos (id TEXT PRIMARY KEY, numero TEXT NOT NULL, data TEXT NOT NULL)');
    db.exec('CREATE TABLE recibos (id TEXT PRIMARY KEY, numero TEXT NOT NULL, data TEXT NOT NULL)');
    const orc = (id: string, dados: Record<string, unknown>) =>
      db.prepare('INSERT INTO orcamentos VALUES (?,?,?)').run(id, id, JSON.stringify({ id, ...dados }));
    const rec = (id: string, dados: Record<string, unknown>) =>
      db.prepare('INSERT INTO recibos VALUES (?,?,?)').run(id, id, JSON.stringify({ id, ...dados }));

    orc('o1', { status: 'aprovado', valorTotal: 1000 }); // nada pago → 1000
    orc('o2', { status: 'convertido', valorTotal: 500 }); // convertido → 500 (antes sumia)
    orc('o3', { status: 'aprovado', valorTotal: 800 }); // parcial 300 → 500
    rec('r3', { orcamentoId: 'o3', valorRecebido: 300 });
    orc('o4', { status: 'aprovado', valorTotal: 200 }); // quitado
    rec('r4', { orcamentoId: 'o4', valorRecebido: 200 });
    orc('o5', { status: 'aprovado', valorTotal: 100 }); // recibo estornado não abate → 100
    rec('r5', { orcamentoId: 'o5', valorRecebido: 100, estornadoEm: '2026-09-01T00:00:00Z' });
    orc('o6', { status: 'aprovado', valorTotal: 50 }); // recibo na lixeira não abate → 50
    rec('r6', { orcamentoId: 'o6', valorRecebido: 50, excluidoEm: '2026-09-01T00:00:00Z' });
    orc('o7', { status: 'aprovado' }); // sem valor → fora da soma, contado em sem_valor
    orc('o8', { status: 'enviado', valorTotal: 9999 }); // não ganho
    orc('o9', { status: 'aprovado', valorTotal: 70, excluidoEm: '2026-09-01T00:00:00Z' }); // lixeira
    orc('o10', { status: 'convertido', valorTotal: 100 }); // pagou 100,004 → quitado (folga)
    rec('r10', { orcamentoId: 'o10', valorRecebido: 100.004 });
    rec('r11', { valorRecebido: 400 }); // recibo avulso não abate ninguém

    const row = db.prepare(SQL_CONTAS_A_RECEBER).get() as { contagem: number; soma: number; sem_valor: number };
    checar('conta só quem tem saldo (o1,o2,o3,o5,o6)', row.contagem === 5, JSON.stringify(row));
    checar('soma os saldos: 1000+500+500+100+50 = 2150', Math.abs(row.soma - 2150) < 0.001, JSON.stringify(row));
    checar('orçamento sem valor fica fora e é contado à parte', row.sem_valor === 1, JSON.stringify(row));

    const vazio = new DatabaseSync(':memory:');
    vazio.exec('CREATE TABLE orcamentos (id TEXT PRIMARY KEY, numero TEXT NOT NULL, data TEXT NOT NULL)');
    vazio.exec('CREATE TABLE recibos (id TEXT PRIMARY KEY, numero TEXT NOT NULL, data TEXT NOT NULL)');
    const zero = vazio.prepare(SQL_CONTAS_A_RECEBER).get() as { contagem: number; soma: number; sem_valor: number };
    checar('banco vazio devolve zeros (não null)', zero.contagem === 0 && zero.soma === 0 && zero.sem_valor === 0, JSON.stringify(zero));
  }

  console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});

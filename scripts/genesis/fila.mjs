// Fila durável em memória: lease, chave única e pausa de acordar sem entrega.
// Não cria arquivo genesis.db e não abre rede.

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { classificar } from './alcada.mjs';

export const LEASE_MS = 15 * 60 * 1000;
export const TETO_ACORDAR_SEM_ARTEFATO = 6;

function lerSql(nome) {
  return readFileSync(new URL(nome, import.meta.url), 'utf8');
}

export function abrirFila() {
  const db = new DatabaseSync(':memory:');
  db.exec(lerSql('./genesis-schema.sql'));
  db.exec(lerSql('./genesis-fila.sql'));
  return new Fila(db);
}

export class Fila {
  constructor(db) {
    this.db = db;
  }

  registrarAgente(id, papel) {
    this.db.prepare('INSERT INTO agente(id, papel) VALUES (?, ?)').run(id, papel);
  }

  criar(campos) {
    if (campos.chave) {
      const ja = this.db.prepare('SELECT id, estado FROM tarefa WHERE chave = ?').get(campos.chave);
      if (ja) return { id: ja.id, estado: ja.estado, repetida: true };
    }
    const criada = this.db
      .prepare(
        `INSERT INTO tarefa(dono, titulo, chave, requisitos, depois, skill_ref, criterio_parada, handoff_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        campos.dono,
        campos.titulo,
        campos.chave || null,
        campos.requisitos || null,
        campos.depois || null,
        campos.skillRef || null,
        campos.criterioParada || null,
        campos.handoffPath || null,
      );
    return { id: Number(criada.lastInsertRowid), estado: 'fila', repetida: false };
  }

  reivindicar(id, agente, agora, leaseMs = LEASE_MS) {
    const row = this.db.prepare('SELECT estado FROM tarefa WHERE id = ?').get(id);
    if (!row) throw new Error('tarefa inexistente');
    if (row.estado !== 'fila') throw new Error('tarefa fora da fila');
    const leaseAte = new Date(agora.getTime() + leaseMs).toISOString();
    const mudou = this.db
      .prepare(
        `UPDATE tarefa
         SET estado = 'em_andamento', lease_ate = ?, lease_por = ?, tentativas = tentativas + 1
         WHERE id = ? AND estado = 'fila'`,
      )
      .run(leaseAte, agente, id);
    if (mudou.changes !== 1) throw new Error('lease nao pegou');
    return { id, leaseAte, leasePor: agente };
  }

  devolverVencidas(agora) {
    const mudou = this.db
      .prepare(
        `UPDATE tarefa
         SET estado = 'fila', lease_ate = NULL, lease_por = NULL
         WHERE estado = 'em_andamento' AND lease_ate IS NOT NULL AND lease_ate < ?`,
      )
      .run(agora.toISOString());
    return mudou.changes;
  }

  concluir(id, agente, agora) {
    this.db
      .prepare(`UPDATE tarefa SET estado = 'feita', lease_ate = NULL, lease_por = NULL WHERE id = ?`)
      .run(id);
    this.db
      .prepare(`INSERT INTO evento(ts, agente, tarefa, tipo) VALUES (?, ?, ?, 'entrega')`)
      .run(agora.toISOString(), agente, id);
  }

  registrarAcordar(agente, agora) {
    const ts = agora.toISOString();
    const desde = new Date(agora.getTime() - 60 * 60 * 1000).toISOString();
    this.db.prepare(`INSERT INTO evento(ts, agente, tipo) VALUES (?, ?, 'acordar')`).run(ts, agente);
    const acordos = this.db
      .prepare(`SELECT COUNT(*) AS n FROM evento WHERE agente = ? AND tipo = 'acordar' AND ts >= ?`)
      .get(agente, desde).n;
    const artefatos = this.db
      .prepare(`SELECT COUNT(*) AS n FROM evento WHERE agente = ? AND tipo = 'entrega' AND ts >= ?`)
      .get(agente, desde).n;
    const pausado = acordos > TETO_ACORDAR_SEM_ARTEFATO && artefatos === 0;
    if (pausado) {
      this.db.prepare(`UPDATE agente SET estado = 'travado' WHERE id = ?`).run(agente);
      this.db
        .prepare(`INSERT INTO evento(ts, agente, tipo, dados) VALUES (?, ?, 'pausa', ?)`)
        .run(ts, agente, JSON.stringify({ acordos, teto: TETO_ACORDAR_SEM_ARTEFATO }));
    }
    return { pausado, acordos, artefatos };
  }

  classificarTarefa({ tarefaId, agente, acao, agora, traceId }) {
    const resultado = classificar(acao, agora);
    this.db
      .prepare(`INSERT INTO evento(ts, agente, tarefa, tipo, dados) VALUES (?, ?, ?, 'classificacao', ?)`)
      .run(
        agora.toISOString(),
        agente,
        tarefaId,
        JSON.stringify({
          cor: resultado.cor,
          motivo: resultado.motivo,
          traceId,
          reprovado: resultado.reprovado,
        }),
      );
    if (resultado.criaAprovacao) {
      this.db.prepare(`UPDATE tarefa SET estado = 'humano' WHERE id = ?`).run(tarefaId);
      this.db
        .prepare(`INSERT INTO aprovacao(tarefa, acao, alcada, rollback) VALUES (?, ?, 'vermelho', ?)`)
        .run(tarefaId, acao.tipo, acao.rollback || null);
    }
    return resultado;
  }
}

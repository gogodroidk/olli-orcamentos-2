/**
 * Backup automático versionado (silencioso, 1x/dia).
 *
 * PAPEL deste módulo: o sync per-row (cloudSync.ts) já é um backup contínuo
 * enquanto o usuário está logado — cada mutação local é espelhada nas tabelas
 * relacionais, e um aparelho novo reconstrói tudo via pullAll(). O que falta é
 * um SNAPSHOT INTEGRAL, IMUTÁVEL E DATADO (mesmo formato de exportAllData) que
 * protege contra 3 cenários que o sync per-row NÃO cobre: corrupção local que
 * o sync propagaria para a nuvem antes de perceber; exclusão em massa (os
 * tombstones do sync também se propagam); e "quero voltar pro estado de
 * ontem", que o sync (sempre convergindo pro mais recente) não oferece.
 *
 * Sync = replicação em tempo real (1 cópia viva). Backup automático =
 * versionamento no tempo (N cópias congeladas em `backups_versionados`).
 *
 * REGRAS DE OURO (iguais ao cloudSync.ts):
 *  - NUNCA lança. Chamado fire-and-forget do App.tsx — qualquer erro (rede,
 *    Supabase fora do ar, snapshot grande) é engolido em silêncio.
 *  - Não exige wifi: o JSON de um autônomo (dezenas/centenas de orçamentos)
 *    fica na casa de KB a poucos MB — negligível em 4G. Exigir wifi faria o
 *    backup nunca rodar para quem só tem dados móveis em campo.
 *  - Só toca a tabela `backups_versionados` — nunca as tabelas relacionais nem
 *    os tombstones, então roda em paralelo ao cloudSync sem coordenação.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from './supabase';
import { exportAllData } from '../database/database';
import { AUTO_BACKUP_TOGGLE_KEY, AUTO_BACKUP_ULTIMO_KEY } from './storageKeys';
import { garantirContextoEquipe } from './cloudSync';
import { backupNuvemPermitido } from './contextoEquipe';
import {
  inserirBackupVersionado,
  podarBackupsVersionados,
  existeBackupDiarioRecente,
  getUltimoBackupSemanalData,
} from './backup';

const HORAS_ENTRE_DIARIOS = 24;
const DIAS_ENTRE_SEMANAIS = 7;
const RETENCAO_DIARIOS = 7;
const RETENCAO_SEMANAIS = 4;

/** true se o usuário desligou o backup automático nas configurações (default: ligado). */
async function autoBackupHabilitado(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(AUTO_BACKUP_TOGGLE_KEY);
    return v !== '0';
  } catch {
    // Falha ao ler preferência: assume o default (ligado) em vez de travar o backup.
    return true;
  }
}

/**
 * Roda o backup automático diário, se for a hora certa. Passos:
 *  0) Sai cedo se quem está logado NÃO é o dono do tenant (membro de equipe) ou
 *     se não dá para saber. Isto é um ATALHO, não a trava: a trava de verdade
 *     está em `inserirBackupVersionado` (backup.ts), onde o `user_id` é
 *     carimbado, e ela cobre também o botão manual. O comentário no corpo diz
 *     por que o atalho existe mesmo assim.
 *  1) No-op se deslogado, toggle desligado, ou já houve 'diario' nas últimas 24h
 *     (o carimbo local em AsyncStorage poupa a consulta de rede do passo 2 — a
 *     fonte de verdade do throttle é a própria tabela, consultada no passo 2,
 *     para cobrir o caso de troca de aparelho).
 *  2) Confirma na nuvem que não há 'diario' recente (2ª camada do throttle —
 *     cobre reinstalação/troca de aparelho, onde o carimbo local não existe).
 *  3) Gera o snapshot (exportAllData, reaproveitado de database.ts) e insere
 *     um registro 'diario'.
 *  4) Se o último 'semanal' tem mais de 7 dias (ou nunca existiu), insere
 *     também um 'semanal' a partir do MESMO snapshot (evita gerar/serializar
 *     os dados duas vezes).
 *  5) Poda o excedente: mantém 7 'diario' + 4 'semanal' mais recentes (todos
 *     os 'manual' ficam intocados — não são gatilho nem alvo de poda aqui).
 * Nunca lança: qualquer falha em qualquer etapa é engolida (best-effort).
 */
export async function maybeAutoBackup(): Promise<void> {
  try {
    if (!(await autoBackupHabilitado())) return;

    const user = await getCurrentUser();
    if (!user) return; // deslogado: sem tabela versionada para escrever (RLS exige dono)

    // POR QUE ESTA CHECAGEM CONTINUA AQUI, se `inserirBackupVersionado` já
    // recusa (backup.ts, onde o `user_id` é carimbado — é lá que mora a trava
    // que cobre os três caminhos, inclusive o botão manual)?
    //
    // Porque sem ela o membro de equipe pagaria a recusa CARO, em toda abertura
    // do app, para sempre: o fluxo abaixo faria a consulta de rede do throttle e
    // então a exportação — serializar o banco INTEIRO — só para o insert ser
    // recusado no fim. E, como nenhum backup sai, `AUTO_BACKUP_ULTIMO_KEY`
    // nunca é carimbado, então o atalho local das 24h nunca engata e o ciclo se
    // repete no próximo start. Sair antes do throttle troca isso por uma leitura
    // de contexto que, no caminho comum, já vem do cache (`garantirContextoEquipe`).
    //
    // NÃO carimbamos AUTO_BACKUP_ULTIMO_KEY aqui de propósito: nenhum backup foi
    // feito, e um carimbo faria a próxima abertura pular a checagem por 24h — se
    // o contexto resolver para dono nesse meio-tempo, o backup dele sai na hora.
    const ctx = await garantirContextoEquipe();
    if (!backupNuvemPermitido(ctx)) {
      // Diagnóstico de desenvolvedor. O que o USUÁRIO vê está na tela Conta
      // (ContaScreen/ContaDesktopScreen leem `estadoBackupNuvem`) — um
      // console.warn nunca foi aviso para ninguém.
      console.warn(
        `[autoBackup] backup na nuvem NÃO gerado: contexto de equipe "${ctx.status}"` +
          ' (só o dono do tenant faz backup — o banco local contém dados da empresa).',
      );
      return;
    }

    const ultimoLocal = await AsyncStorage.getItem(AUTO_BACKUP_ULTIMO_KEY).catch(() => null);
    if (ultimoLocal) {
      const horasDesde = (Date.now() - Date.parse(ultimoLocal)) / (1000 * 60 * 60);
      if (Number.isFinite(horasDesde) && horasDesde < HORAS_ENTRE_DIARIOS) return;
    }

    // 2ª camada do throttle (fonte de verdade): cobre aparelho novo/reinstalado,
    // onde o carimbo local não existe mas já pode haver backup de hoje na nuvem.
    if (await existeBackupDiarioRecente(HORAS_ENTRE_DIARIOS)) {
      await AsyncStorage.setItem(AUTO_BACKUP_ULTIMO_KEY, new Date().toISOString()).catch(() => {});
      return;
    }

    const snapshot = await exportAllData();
    await inserirBackupVersionado('diario', snapshot);
    await AsyncStorage.setItem(AUTO_BACKUP_ULTIMO_KEY, new Date().toISOString()).catch(() => {});

    // Semanal: se o último tem mais de 7 dias (ou nunca houve), gera um a mais
    // a partir do MESMO snapshot já em mãos — sem exportar os dados de novo.
    const ultimoSemanal = await getUltimoBackupSemanalData();
    const diasDesdeSemanal = ultimoSemanal
      ? (Date.now() - Date.parse(ultimoSemanal)) / (1000 * 60 * 60 * 24)
      : Infinity;
    if (diasDesdeSemanal >= DIAS_ENTRE_SEMANAIS) {
      await inserirBackupVersionado('semanal', snapshot);
    }

    // Poda por último — só remove excedentes DEPOIS que os novos registros já
    // existem, para nunca ficar sem nenhuma cópia entre o insert e a poda.
    await podarBackupsVersionados([
      { tipo: 'diario', manter: RETENCAO_DIARIOS },
      { tipo: 'semanal', manter: RETENCAO_SEMANAIS },
    ]);
  } catch {
    // Backup automático de fundo: nunca pode quebrar a abertura do app.
  }
}

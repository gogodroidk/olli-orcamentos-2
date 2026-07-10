import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, comAlfa, type Cores } from '../../theme';
import { AnimatedEntrance } from '../AnimatedEntrance';
import { OlliButton } from '../OlliButton';
import { STATUS_OS_LABELS, STATUS_OS_CORES } from '../../types';
import type { OrdemServico, StatusOS } from '../../types';

interface Props {
  ordem: OrdemServico;
  /** Índice na lista — escalona a entrada animada (efeito cascata). */
  index?: number;
  /** Realce visual para a seção "em execução agora". */
  destaque?: boolean;
  /** Ação de avançar status em voo (desabilita o botão + mostra spinner). */
  avancando?: boolean;
  /** Toque em qualquer parte informativa do card — abre a OS completa. */
  onAbrir: () => void;
  /** Toque no botão de ação primária — avança para o próximo status. */
  onAvancar?: (proximoStatus: StatusOS) => void;
}

/** Rótulo curto do horário: "Hoje · 14:30", "Amanhã · 09:00" ou "12/07 · 14:30". */
function quandoLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const hoje = new Date();
  const amanha = new Date();
  amanha.setDate(hoje.getDate() + 1);
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mesmoDia(d, hoje)) return `Hoje · ${hh}`;
  if (mesmoDia(d, amanha)) return `Amanhã · ${hh}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${hh}`;
}

/**
 * A ÚNICA ação de campo possível dado o status atual — 1 toque, sem menu.
 * `null` quando não há próximo passo (concluída/cancelada): o card mostra um
 * selo em vez de um botão morto.
 */
function proximaAcao(status: StatusOS): {
  label: string;
  proximo: StatusOS;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  variant: 'gradient' | 'success';
} | null {
  if (status === 'aberta' || status === 'agendada') {
    return { label: 'Iniciar serviço', proximo: 'em_execucao', icon: 'play-circle-outline', variant: 'gradient' };
  }
  if (status === 'pausada') {
    return { label: 'Continuar serviço', proximo: 'em_execucao', icon: 'play-circle-outline', variant: 'gradient' };
  }
  if (status === 'em_execucao') {
    return { label: 'Concluir serviço', proximo: 'concluida', icon: 'check-circle-outline', variant: 'success' };
  }
  return null;
}

/**
 * Card GRANDE de uma OS para o app do técnico. Alvo de toque generoso
 * (mão com luva, tela suja, sol), tipografia maior, contraste alto e UMA
 * ação primária óbvia por card. A área informativa (topo) e o botão de ação
 * são TOQUES IRMÃOS (não aninhados) — evita bug de bubbling no react-native-web
 * onde um toque no botão interno também dispararia o onPress do card externo.
 */
export function CardOS({ ordem, index = 0, destaque, avancando, onAbrir, onAvancar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = STATUS_OS_CORES[ordem.status] ?? cores.onSurfaceVariant;
  const acao = proximaAcao(ordem.status);
  const quando = quandoLabel(ordem.dataAgendada);
  const feitos = ordem.checklist?.filter((c) => c.feito).length ?? 0;
  const total = ordem.checklist?.length ?? 0;

  function abrir() {
    Haptics.selectionAsync().catch(() => {});
    onAbrir();
  }

  return (
    <AnimatedEntrance index={index}>
      <View style={[styles.card, destaque && styles.cardDestaque]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={abrir}
          accessibilityRole="button"
          accessibilityLabel={`Abrir ordem de serviço ${ordem.titulo || ordem.numero}`}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.cliente} numberOfLines={1}>{ordem.clienteNome || 'Sem cliente'}</Text>
              <Text style={styles.titulo} numberOfLines={2}>{ordem.titulo || 'Ordem de serviço'}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: cor + '26', borderColor: cor + '77' }]}>
              <Text style={[styles.badgeText, { color: cor }]}>{STATUS_OS_LABELS[ordem.status]}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaTexto}>Nº {ordem.numero}</Text>
            {quando ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="calendar-clock-outline" size={14} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipTexto}>{quando}</Text>
              </View>
            ) : null}
            {total > 0 ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="checkbox-marked-outline" size={14} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipTexto}>{feitos}/{total}</Text>
              </View>
            ) : null}
            {(ordem.fotos?.length ?? 0) > 0 ? (
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="image-multiple-outline" size={14} color={cores.onSurfaceVariant} />
                <Text style={styles.metaChipTexto}>{ordem.fotos.length}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        {acao && onAvancar ? (
          <OlliButton
            label={acao.label}
            variant={acao.variant}
            size="lg"
            fullWidth
            loading={avancando}
            onPress={() => onAvancar(acao.proximo)}
            // '#fff' fixo de propósito: o OlliButton (fora do escopo desta migração)
            // ainda pinta o próprio texto com `Colors.onSurface` estático — trocar só
            // o ícone aqui criaria uma cor diferente da do rótulo ao lado dele.
            icon={<MaterialCommunityIcons name={acao.icon} size={22} color="#fff" />}
            style={styles.acaoBtn}
          />
        ) : ordem.status === 'concluida' ? (
          <View style={styles.selo}>
            <MaterialCommunityIcons name="check-circle" size={18} color={cores.success} />
            <Text style={[styles.seloTexto, { color: cores.success }]}>Serviço concluído</Text>
          </View>
        ) : ordem.status === 'cancelada' ? (
          <View style={styles.selo}>
            <MaterialCommunityIcons name="cancel" size={18} color={cores.onSurfaceMuted} />
            <Text style={[styles.seloTexto, { color: cores.onSurfaceMuted }]}>Cancelada</Text>
          </View>
        ) : null}
      </View>
    </AnimatedEntrance>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  card: {
    backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outlineDark,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...sombrasDe(c).sm,
  },
  cardDestaque: {
    borderColor: c.warning + '88',
    borderWidth: 1.5,
    backgroundColor: comAlfa(c.warning, 0.08),
    ...sombrasDe(c).md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cliente: { fontSize: 13.5, fontWeight: '700', color: c.accentLight },
  // Era '#fff' fixo (bug latente: `card` usa `surfaceGlass`, que no modo claro é
  // quase branco — título branco sobre fundo quase branco ficava ilegível). Vira
  // `onSurface`, que segue a superfície de verdade nos dois modos.
  titulo: { fontSize: 19, fontWeight: '800', color: c.onSurface, marginTop: 3, lineHeight: 24 },
  badge: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 11, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  metaTexto: { fontSize: 13, color: c.onSurfaceMuted, fontWeight: '700' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChipTexto: { fontSize: 13, color: c.onSurfaceVariant, fontWeight: '600' },
  acaoBtn: { marginTop: 2 },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 6 },
  seloTexto: { fontSize: 14, fontWeight: '700' },
});

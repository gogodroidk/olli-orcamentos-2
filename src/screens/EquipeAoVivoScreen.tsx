/**
 * Equipe ao vivo (Onda 2 — "equipe ao vivo" sem billing).
 *
 * Lista os técnicos da equipe com a última localização conhecida (lê
 * `localizacoes_equipe` via `services/localizacaoEquipe.ts`), "há X min" e um
 * botão "Abrir no mapa" que usa o MESMO deep-link já usado no card de
 * agendamento (`abrirRotaGoogleMaps` — abre o Google Maps app/navegador,
 * funciona hoje, zero billing).
 *
 * Mapa EMBUTIDO (Google Maps SDK) é decisão de `mapaEmbutidoDisponivel()`
 * (EXPO_PUBLIC_MAPS_KEY) — hoje sempre indisponível, então esta tela sempre
 * mostra lista + deep-link. Quando a chave existir um dia, o lugar certo
 * para o <MapView> embutido é aqui, atrás desse mesmo flag (nada a fazer
 * agora além de deixar o gancho comentado).
 *
 * Captura periódica em background (o que POPULA `localizacoes_equipe`) só
 * liga de verdade na Onda 8 (prebuild com expo-location). Até lá, o cartão
 * "Compartilhar minha localização agora" funciona de verdade NA WEB (usa
 * navigator.geolocation — dá vida à tela sem esperar o prebuild). No nativo
 * (Android/iOS), como o módulo ainda não está instalado, o mesmo espaço vira
 * um aviso honesto em vez de um botão que não faria nada — a lista de
 * técnicos + deep-link do mapa abaixo continua funcionando plenamente.
 *
 * Gate de plano: recurso 'mapa_equipe' é do plano Empresa (Onda 1). Esta tela
 * é registrada pela frente 2 (convites + navegação) — aqui só preparamos o
 * componente pronto para ser importado e envolvido em <GatePro> por quem
 * registrar a rota.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliCard } from '../components/OlliCard';
import { OlliPressable } from '../components/OlliPressable';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { EmptyState } from '../components/EmptyState';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import {
  localizacoesEquipe, enviarMinhaLocalizacao, tempoRelativo,
  mapaEmbutidoDisponivel, type LocalizacaoMembro,
} from '../services/localizacaoEquipe';
import { PAPEL_LABEL } from '../services/equipe';
import { abrirRotaGoogleMaps } from '../services/rotas';
import { GuardaPapel } from '../components/GuardaPapel';

/** "recente" (<=15min) vs "desatualizado" — só um sinal visual, não filtra ninguém. */
function estaRecente(iso: string): boolean {
  const ms = Date.now() - new Date(iso).getTime();
  return !isNaN(ms) && ms >= 0 && ms <= 15 * 60000;
}

export default function EquipeAoVivoScreen() {
  // Agenda/rota da equipe inteira é de gestão — o técnico só vê a própria.
  return (
    <GuardaPapel acao="ver_agenda_equipe" area="Equipe ao vivo">
      <EquipeAoVivoConteudo />
    </GuardaPapel>
  );
}

function EquipeAoVivoConteudo() {
  const insets = useSafeAreaInsets();
  const [itens, setItens] = useState<LocalizacaoMembro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  const load = useCallback(async () => {
    const data = await localizacoesEquipe();
    setItens(data);
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function compartilharAgora() {
    Haptics.selectionAsync().catch(() => {});
    setCompartilhando(true);
    try {
      const ok = await enviarMinhaLocalizacao();
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await load();
      }
    } finally {
      setCompartilhando(false);
    }
  }

  const vazio = itens.length === 0;
  // Decide lista+deep-link (hoje, sempre) vs mapa embutido (quando billing
  // existir — EXPO_PUBLIC_MAPS_KEY). O dia que existir um
  // <MapaEquipeEmbutido>, ele substitui a ScrollView de cards abaixo,
  // condicionado a este mesmo booleano — por ora só troca o ícone do header.
  const temMapaEmbutido = mapaEmbutidoDisponivel();

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Equipe ao vivo"
        subtitle={vazio ? 'Nenhuma localização compartilhada ainda' : `${itens.length} técnico${itens.length === 1 ? '' : 's'} com localização`}
        right={
          <View style={styles.headerIconWrap}>
            <MaterialCommunityIcons
              name={temMapaEmbutido ? 'map' : 'map-marker-radius-outline'}
              size={20}
              color="#fff"
            />
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.accent]} tintColor={Colors.accent} />}
      >
        {/* Compartilhar minha localização — na web usa navigator.geolocation e
            funciona de verdade hoje (dá vida à tela sem esperar a Onda 8). No
            nativo, a captura de GPS ainda depende do prebuild com
            expo-location (Onda 8): o cartão avisa isso em vez de prometer uma
            ação que hoje não faz nada, e a lista de técnicos + deep-link do
            mapa abaixo já funciona plenamente de qualquer forma. */}
        {Platform.OS === 'web' ? (
          <TouchableOpacity
            style={styles.shareCard}
            onPress={compartilharAgora}
            activeOpacity={0.85}
            disabled={compartilhando}
            accessibilityRole="button"
            accessibilityLabel="Compartilhar minha localização agora"
          >
            <View style={styles.shareIconWrap}>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color={Colors.accentLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareTitle}>Compartilhar minha localização agora</Text>
              <Text style={styles.shareHint}>Usa a localização do navegador — um toque e pronto.</Text>
            </View>
            {compartilhando ? (
              <OlliSkeleton width={20} height={20} radius={10} />
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.onSurfaceMuted} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.shareCard}>
            <View style={styles.shareIconWrap}>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color={Colors.onSurfaceMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareTitle}>Compartilhamento automático de localização</Text>
              <Text style={styles.shareHint}>Ative a localização no próximo update para aparecer aqui automaticamente. Por enquanto, use a lista abaixo com a rota de cada técnico.</Text>
            </View>
          </View>
        )}

        {carregando ? (
          <View style={{ gap: 10 }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.item}>
                <OlliSkeleton width={44} height={44} radius={22} />
                <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                  <OlliSkeleton width="55%" height={14} />
                  <OlliSkeleton width="35%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : vazio ? (
          <EmptyState
            icon="map-marker-radius-outline"
            title="Ninguém compartilhou a localização ainda"
            subtitle="Peça para a equipe abrir esta tela pelo computador/navegador e tocar em 'Compartilhar minha localização agora'."
          />
        ) : (
          itens.map((m, i) => (
            <AnimatedEntrance key={m.userId} index={i}>
              <MembroCard membro={m} />
            </AnimatedEntrance>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function MembroCard({ membro }: { membro: LocalizacaoMembro }) {
  const recente = estaRecente(membro.capturadoEm);
  const papel = membro.papel ? PAPEL_LABEL[membro.papel] : null;

  return (
    <OlliCard style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.avatar, recente && styles.avatarRecente]}>
          <MaterialCommunityIcons name="account" size={22} color={recente ? Colors.accentLight : Colors.onSurfaceMuted} />
          {recente && <View style={styles.dot} />}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.nameRow}>
            <Text style={styles.nome} numberOfLines={1}>{membro.nome}</Text>
            {papel ? (
              <View style={styles.papelChip}>
                <Text style={styles.papelChipText}>{papel}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={13} color={Colors.onSurfaceMuted} />
            <Text style={styles.metaText}>
              {membro.lat.toFixed(4)}, {membro.lng.toFixed(4)} · {tempoRelativo(membro.capturadoEm)}
            </Text>
          </View>
        </View>
      </View>

      <OlliPressable
        onPress={() => abrirRotaGoogleMaps(`${membro.lat},${membro.lng}`)}
        scaleTo={0.97}
        haptic="selection"
        style={styles.mapBtn}
        accessibilityLabel={`Abrir no mapa a localização de ${membro.nome}`}
      >
        <MaterialCommunityIcons name="map-outline" size={18} color={Colors.accentLight} />
        <Text style={styles.mapBtnText}>Abrir no mapa</Text>
      </OlliPressable>
    </OlliCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },

  shareCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.strokeGlow,
    padding: Spacing.md, marginBottom: Spacing.lg, ...Shadow.sm,
  },
  shareIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(52,198,217,0.14)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  shareTitle: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  shareHint: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 16 },

  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.md, marginBottom: 10 },

  card: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surfaceVariant, borderWidth: 1, borderColor: Colors.outline,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarRecente: { borderColor: Colors.accent, backgroundColor: 'rgba(52,198,217,0.12)' },
  dot: {
    position: 'absolute', right: -1, bottom: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.success, borderWidth: 2, borderColor: Colors.surface,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { fontSize: 15, fontWeight: '700', color: Colors.onSurface, flexShrink: 1 },
  papelChip: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  papelChipText: { fontSize: 10.5, fontWeight: '800', color: Colors.onSurfaceVariant },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { fontSize: 12, color: Colors.onSurfaceMuted },

  mapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: Spacing.md, paddingVertical: 11,
    backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)',
    borderRadius: BorderRadius.md,
  },
  mapBtnText: { fontSize: 13.5, fontWeight: '700', color: Colors.accentLight },
});

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
 * Gate de plano: recurso 'mapa_equipe' é do plano Empresa (Onda 1). O <GatePro>
 * é aplicado AQUI MESMO, no componente exportado (ver o comentário dele) — antes
 * este cabeçalho dizia que a tela estava "pronta para ser envolvida em <GatePro>
 * por quem registrar a rota", e ninguém envolveu: o mapa ficou de graça em
 * qualquer plano até 2026-07-16 (item O1-12).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, TouchableOpacity, Platform, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GateEquipe } from '../components/GateEquipe';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
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

/**
 * PAYWALL DO PLANO EMPRESA (F0c / item O1-12) + gate de papel.
 *
 * O cabeçalho deste arquivo já dizia que o componente estava "pronto para ser
 * importado e envolvido em <GatePro> por quem" o usasse — e ninguém envolveu: o mapa
 * da equipe ao vivo ficava de graça em qualquer plano, junto com o resto do Modo
 * Empresa. `mapa_equipe` já era entitlement do plano Empresa em `RECURSOS_POR_PLANO`;
 * só faltava alguém checar.
 *
 * A ORDEM importa: `GatePro` (plano) POR FORA, `GuardaPapel` (papel) por dentro. Quem
 * não assina vê a oferta do plano; quem assina mas é técnico vê "isto é de gestão".
 * Trocar a ordem mostraria "sem permissão" para quem só precisava assinar.
 *
 * Recurso `mapa_equipe` e não `equipe`: são entitlements distintos, ainda que hoje
 * ambos caiam no Empresa.
 *
 * ⚠️ Camada de UX. O enforcement de verdade é server-side, no worker.
 */
export default function EquipeAoVivoScreen() {
  // Agenda/rota da equipe inteira é de gestão — o técnico só vê a própria.
  return (
    <GateEquipe
      recurso="mapa_equipe"
      beneficio="Veja onde cada técnico está agora e quem chega primeiro no chamado."
    >
      <GuardaPapel acao="ver_agenda_equipe" area="Equipe ao vivo">
        <EquipeAoVivoConteudo />
      </GuardaPapel>
    </GateEquipe>
  );
}

function EquipeAoVivoConteudo() {
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
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
      } else {
        // 3 estados: `false` não é "compartilhado com sucesso, sem novidade" — é falha
        // (permissão negada, GPS off, sem org, erro de gravação). Antes o card só parava
        // de girar sem explicar. Agora aponta a causa provável e o caminho.
        Alert.alert(
          'Não consegui compartilhar',
          'Confira se a localização está permitida para o OLLI e o GPS ligado, e tente de novo.',
        );
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.accentLight]} tintColor={cores.accentLight} />}
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
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color={cores.accentLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareTitle}>Compartilhar minha localização agora</Text>
              <Text style={styles.shareHint}>Usa a localização do navegador — um toque e pronto.</Text>
            </View>
            {compartilhando ? (
              <OlliSkeleton width={20} height={20} radius={10} />
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={20} color={cores.onSurfaceMuted} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.shareCard}>
            <View style={styles.shareIconWrap}>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color={cores.onSurfaceMuted} />
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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const recente = estaRecente(membro.capturadoEm);
  const papel = membro.papel ? PAPEL_LABEL[membro.papel] : null;

  return (
    <OlliCard style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.avatar, recente && styles.avatarRecente]}>
          <MaterialCommunityIcons name="account" size={22} color={recente ? cores.accentLight : cores.onSurfaceMuted} />
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
            <MaterialCommunityIcons name="map-marker-outline" size={13} color={cores.onSurfaceMuted} />
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
        <MaterialCommunityIcons name="map-outline" size={18} color={cores.accentLight} />
        <Text style={styles.mapBtnText}>Abrir no mapa</Text>
      </OlliPressable>
    </OlliCard>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  // Filho do GradientHeader: banner sempre colorido nos dois modos — branco
  // fixo continua correto (ver `header` em theme/cores.ts).
  headerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },

  shareCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.strokeGlow,
    padding: Spacing.md, marginBottom: Spacing.lg, ...sombrasDe(c).sm,
  },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  shareIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(52,198,217,0.14)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  shareTitle: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  shareHint: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 16 },

  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, marginBottom: 10 },

  card: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline,
    alignItems: 'center', justifyContent: 'center',
  },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  avatarRecente: { borderColor: c.accent, backgroundColor: 'rgba(52,198,217,0.12)' },
  dot: {
    position: 'absolute', right: -1, bottom: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: c.success, borderWidth: 2, borderColor: c.surface,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { fontSize: 15, fontWeight: '700', color: c.onSurface, flexShrink: 1 },
  // Pílula sutil sobre o card: rgba(255,255,255,0.10) some no claro (rule 8) — usa c.outline.
  papelChip: { backgroundColor: c.outline, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  papelChipText: { fontSize: 10.5, fontWeight: '800', color: c.onSurfaceVariant },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { fontSize: 12, color: c.onSurfaceMuted },

  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: Spacing.md, paddingVertical: 11,
    backgroundColor: 'rgba(52,198,217,0.10)', borderWidth: 1, borderColor: 'rgba(52,198,217,0.30)',
    borderRadius: BorderRadius.md,
  },
  mapBtnText: { fontSize: 13.5, fontWeight: '700', color: c.accentLight },
});

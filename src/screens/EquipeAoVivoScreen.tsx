/**
 * Equipe ao vivo — lista os membros com a última localização que cada um
 * compartilhou (lê `localizacoes_equipe` via `services/localizacaoEquipe.ts`), "há X
 * min" e "Abrir no mapa" (deep-link do Google Maps, `abrirRotaGoogleMaps`, sem chave).
 *
 * ESTADO REAL (auditoria B10): a localização está DESLIGADA. O celular não envia
 * posição (`LOCALIZACAO_DISPONIVEL = false`, expo-location não instalado) e o build
 * RN-web, único que tinha o botão "Compartilhar minha localização", não está
 * publicado. Por isso a lista vem vazia em produção e esta tela diz isso — e as
 * entradas na tela Equipe mostram o selo "Em breve — localização desligada".
 * Não é tempo real: lê ao abrir e ao puxar para atualizar.
 *
 * Três estados da leitura, nunca colapsados: `erro` (mostra "Não deu para carregar"
 * com "Tentar de novo" — nunca "ninguém compartilhou"), `sem_org` (conta sem equipe)
 * e `ok` (lista, que pode estar vazia de verdade). A coordenada crua só aparece ao
 * tocar e segurar o cartão; o padrão é "há X min" + "Abrir no mapa".
 *
 * Mapa EMBUTIDO (Onda I2): o MESMO mapa grátis do Mapa do dia (MapLibre +
 * OpenFreeMap, `components/mapa/MapaBase`), com um pin por técnico na última
 * posição já existente em `localizacoes_equipe`. Só aparece quando há posição
 * lida de verdade; sem ninguém, continua o aviso honesto de localização desligada.
 *
 * Gate de plano: recurso 'mapa_equipe' é do plano Empresa. O <GatePro> é aplicado
 * AQUI MESMO, no componente exportado (ver o comentário dele), com o <GuardaPapel>
 * por dentro.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, TouchableOpacity, Platform, Alert, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vibrar } from '../utils/haptico';
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
  type LocalizacaoMembro, type LeituraLocalizacoesEquipe,
} from '../services/localizacaoEquipe';
import { PAPEL_LABEL } from '../services/equipe';
import { abrirRotaGoogleMaps } from '../services/rotas';
import { GuardaPapel } from '../components/GuardaPapel';
import { goBackOrHome } from '../navigation/safeBack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { MapaBase } from '../components/mapa/MapaBase';
import type { PinMapa } from '../components/mapa/tipos';

/** "Igor Souza" → "IS"; vazio → "?". */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '')).toUpperCase();
}

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
      beneficio="Em breve: a última localização de cada técnico. Hoje a localização da equipe está desligada no app."
    >
      <GuardaPapel acao="ver_agenda_equipe" area="Equipe ao vivo">
        <EquipeAoVivoConteudo />
      </GuardaPapel>
    </GateEquipe>
  );
}

function EquipeAoVivoConteudo() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // null = carregando (1ª leitura). Erro e "sem equipe" são estados próprios.
  const [leitura, setLeitura] = useState<LeituraLocalizacoesEquipe | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  const load = useCallback(async () => {
    try {
      setLeitura(await localizacoesEquipe());
    } catch {
      // O service não lança; isto é só o cinto de segurança — erro nunca vira vazio.
      setLeitura({ estado: 'erro', mensagem: 'Confira sua conexão e tente de novo.' });
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function tentarDeNovo() {
    setLeitura(null);
    void load();
  }

  async function compartilharAgora() {
    vibrar('selecao');
    setCompartilhando(true);
    try {
      const ok = await enviarMinhaLocalizacao().catch(() => false);
      if (ok) {
        vibrar('sucesso');
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

  const itens: LocalizacaoMembro[] = leitura?.estado === 'ok' ? leitura.itens : [];
  const subtitulo =
    leitura === null ? 'Carregando…'
      : leitura.estado === 'erro' ? 'Não deu para carregar'
        : leitura.estado === 'sem_org' ? 'Você ainda não tem equipe'
          : itens.length === 0 ? 'Localização desligada no app'
            : `${itens.length} ${itens.length === 1 ? 'pessoa' : 'pessoas'} com localização`;
  // Pins da equipe no mesmo mapa grátis do Mapa do dia. Só posição lida de
  // verdade e coordenada válida vira pin (nada de ponto inventado).
  const pinsEquipe: PinMapa[] = itens
    .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng) && !(m.lat === 0 && m.lng === 0))
    .map((m) => ({
      id: m.userId,
      lat: m.lat,
      lon: m.lng,
      rotulo: iniciais(m.nome),
      tom: 'equipe',
      acessibilidade: `${m.nome}, última localização ${tempoRelativo(m.capturadoEm)}`,
    }));

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Equipe ao vivo"
        subtitle={subtitulo}
        right={
          <View style={styles.headerIconWrap}>
            <MaterialCommunityIcons
              name={pinsEquipe.length > 0 ? 'map' : 'map-marker-radius-outline'}
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
        {/* Compartilhar minha localização — só existe no build RN-web (não
            publicado hoje; usa navigator.geolocation). No nativo o
            `expo-location` NÃO está instalado: o cartão diz que está desligado
            em vez de oferecer um botão que não faria nada. */}
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
              <Text style={styles.shareTitle}>Em breve — localização desligada</Text>
              <Text style={styles.shareHint}>O OLLI ainda não usa o GPS do celular, então ninguém aparece aqui pelo app. Para ir até um cliente, use o botão de rota da visita na agenda.</Text>
            </View>
          </View>
        )}

        {leitura === null ? (
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
        ) : leitura.estado === 'erro' ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Não deu para carregar"
            subtitle={leitura.mensagem}
            actionLabel="Tentar de novo"
            onAction={tentarDeNovo}
          />
        ) : leitura.estado === 'sem_org' ? (
          <EmptyState
            icon="account-group-outline"
            title="Você ainda não tem equipe"
            subtitle="A equipe ao vivo mostra os técnicos da sua empresa. Convide alguém pela tela Equipe."
          />
        ) : itens.length === 0 ? (
          <EmptyState
            icon="map-marker-radius-outline"
            title="Ninguém aparece aqui ainda"
            subtitle={Platform.OS === 'web'
              ? "A localização está desligada no app do celular. Pelo navegador, cada pessoa pode tocar em 'Compartilhar minha localização agora'."
              : 'A localização da equipe está desligada no app. Quando ela chegar, cada técnico aparece aqui com a última posição.'}
          />
        ) : (
          <>
            {pinsEquipe.length > 0 ? (
              <View style={styles.mapaCaixa}>
                <MapaBase pins={pinsEquipe} style={styles.mapa} margens={{ topo: 40, base: 40, lados: 40 }} />
              </View>
            ) : null}
            {itens.map((m, i) => (
            <AnimatedEntrance key={m.userId} index={i}>
              <MembroCard membro={m} />
            </AnimatedEntrance>
            ))}
          </>
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
  // Coordenada crua não é informação para o dono — só para quem pedir (tocar e segurar).
  const [mostrarCoordenadas, setMostrarCoordenadas] = useState(false);

  return (
    <OlliCard style={styles.card}>
      <Pressable
        style={styles.row}
        onLongPress={() => {
          vibrar('selecao');
          setMostrarCoordenadas((v) => !v);
        }}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`${membro.nome}, última localização ${tempoRelativo(membro.capturadoEm)}`}
        accessibilityHint="Toque e segure para ver ou esconder as coordenadas"
      >
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
              {mostrarCoordenadas
                ? `${membro.lat.toFixed(5)}, ${membro.lng.toFixed(5)} · ${tempoRelativo(membro.capturadoEm)}`
                : `Última localização ${tempoRelativo(membro.capturadoEm)}`}
            </Text>
          </View>
        </View>
      </Pressable>

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

  mapaCaixa: { borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: c.outline, marginBottom: Spacing.md },
  mapa: { height: 240 },

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
  papelChipText: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
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

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius } from '../theme';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { EmptyState } from '../components/EmptyState';
import { OlliPressable } from '../components/OlliPressable';
import { KpiCard } from '../components/web/KpiCard';
import { CardOS } from '../components/tecnico/CardOS';
import { BarraOffline, comPendencia } from '../components/tecnico/BarraOffline';
import { RootStackParamList } from '../navigation/AppNavigator';
// Contrato da Onda 4 — única superfície de OS (ver ordemServico.ts).
import { getMinhasOrdens, atualizarStatusOS } from '../services/ordemServico';
import { getCurrentUser } from '../services/supabase';
import { getEmpresa } from '../database/database';
import { onSyncAplicado } from '../services/cloudSync';
import type { OrdemServico, StatusOS, Empresa } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Status que ainda contam como "trabalho em aberto" (não fechado). */
const STATUS_ABERTOS: StatusOS[] = ['aberta', 'agendada', 'pausada'];

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * TecnicoHomeScreen — a HOME do "app do funcionário" (Frente 5). Ao logar
 * como TÉCNICO, o app precisa parecer OUTRO APP: aqui não existe orçamento,
 * financeiro, plano nem relatório — só "Minhas OS", em 3 filas + o resumo do
 * dia. Local-first (offline-first): lê via o contrato de ordemServico.ts,
 * que já é SQLite local espelhado em nuvem em segundo plano.
 */
export default function TecnicoHomeScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avancandoId, setAvancandoId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getCurrentUser()
      .then((u) => { if (ativo) setUserId(u?.id ?? null); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const [emp, lista] = await Promise.all([
        getEmpresa(),
        userId ? getMinhasOrdens(userId) : Promise.resolve([] as OrdemServico[]),
      ]);
      setEmpresa(emp);
      // Mais recentes primeiro (mesma ordenação da lista completa de OS).
      lista.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
      setOrdens(lista);
    } catch {
      setOrdens([]);
    } finally {
      setCarregando(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Recarrega assim que o id do técnico chega (pode vir depois do 1º foco).
  useEffect(() => { if (userId) load(); }, [userId, load]);
  // Recarrega quando um sync com a nuvem terminar de trazer dados novos.
  useEffect(() => onSyncAplicado(() => load()), [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function abrirOrdens() {
    nav.navigate('OrdemServico');
  }

  /**
   * 1 toque, sem menu: aplica o próximo status otimisticamente (o card some/
   * muda de fila na hora) e persiste via o contrato. Em erro, desfaz e avisa.
   * `comPendencia` alimenta a BarraOffline com a contagem em voo.
   */
  async function avancarStatus(ordem: OrdemServico, proximo: StatusOS) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setAvancandoId(ordem.id);
    const statusAnterior = ordem.status;
    setOrdens((prev) => prev.map((o) => (o.id === ordem.id ? { ...o, status: proximo } : o)));
    try {
      await comPendencia(() => atualizarStatusOS(ordem.id, proximo));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      setOrdens((prev) => prev.map((o) => (o.id === ordem.id ? { ...o, status: statusAnterior } : o)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setAvancandoId(null);
      load();
    }
  }

  const hoje = new Date();

  const emExecucao = ordens.filter((o) => o.status === 'em_execucao');
  const paraHoje = ordens.filter(
    (o) => STATUS_ABERTOS.includes(o.status) && !!o.dataAgendada && mesmoDia(new Date(o.dataAgendada), hoje),
  );
  const idsHoje = new Set(paraHoje.map((o) => o.id));
  const abertas = ordens.filter((o) => STATUS_ABERTOS.includes(o.status) && !idsHoje.has(o.id));
  const concluidasHoje = ordens.filter(
    (o) => o.status === 'concluida' && !!o.atualizadoEm && mesmoDia(new Date(o.atualizadoEm), hoje),
  );

  const primeiroNome = empresa?.nomePrestador?.split(' ')[0] || 'técnico';

  if (carregando) {
    return (
      <View style={styles.container}>
        <View style={{ paddingTop: insets.top }}>
          <BarraOffline />
        </View>
        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <OlliSkeleton width="60%" height={22} />
          <OlliSkeleton width="40%" height={14} />
          <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm }}>
            <OlliSkeleton width="100%" height={90} radius={BorderRadius.lg} />
          </View>
          <OlliSkeleton width="100%" height={150} radius={BorderRadius.lg} />
          <OlliSkeleton width="100%" height={150} radius={BorderRadius.lg} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={{ paddingTop: insets.top }}>
        <BarraOffline />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 40, gap: Spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.primary]} tintColor={Colors.accent} />}
      >
        {/* Saudação — sem nada de dinheiro, plano, relatório ou equipe aqui. */}
        <AnimatedEntrance>
          <Text style={styles.saudacao}>{saudacao()}, {primeiroNome}</Text>
          <Text style={styles.subtitulo}>Minhas ordens de serviço</Text>
        </AnimatedEntrance>

        {/* Resumo do dia */}
        <View style={styles.resumoRow}>
          <KpiCard
            titulo="Em execução"
            valor={String(emExecucao.length)}
            icone="progress-wrench"
            corIcone={Colors.warning}
            rodape={emExecucao.length ? 'em andamento agora' : 'nada rolando agora'}
            onPress={abrirOrdens}
          />
          <KpiCard
            titulo="Hoje"
            valor={String(paraHoje.length)}
            icone="calendar-today"
            corIcone={Colors.accent}
            rodape={paraHoje.length ? 'toque para abrir' : 'nada agendado'}
            onPress={abrirOrdens}
          />
          <KpiCard
            titulo="Concluídas hoje"
            valor={String(concluidasHoje.length)}
            icone="check-decagram-outline"
            corIcone={Colors.success}
            rodape="serviços fechados"
            onPress={abrirOrdens}
          />
        </View>

        {/* EM EXECUÇÃO agora — destaque */}
        {emExecucao.length > 0 && (
          <Secao titulo="Em execução agora" icon="progress-wrench" cor={Colors.warning}>
            {emExecucao.map((o, i) => (
              <CardOS
                key={o.id}
                ordem={o}
                index={i}
                destaque
                avancando={avancandoId === o.id}
                onAbrir={abrirOrdens}
                onAvancar={(proximo) => avancarStatus(o, proximo)}
              />
            ))}
          </Secao>
        )}

        {/* HOJE */}
        <Secao titulo="Hoje" icon="calendar-clock-outline" cor={Colors.accent} onVerTodas={paraHoje.length ? abrirOrdens : undefined}>
          {paraHoje.length === 0 ? (
            <TextoVazio texto="Nada agendado para hoje." />
          ) : (
            paraHoje.map((o, i) => (
              <CardOS
                key={o.id}
                ordem={o}
                index={i}
                avancando={avancandoId === o.id}
                onAbrir={abrirOrdens}
                onAvancar={(proximo) => avancarStatus(o, proximo)}
              />
            ))
          )}
        </Secao>

        {/* ABERTAS — atribuídas a mim, sem data de hoje */}
        <Secao titulo="Abertas" icon="clipboard-list-outline" cor={Colors.primaryLight} onVerTodas={abertas.length ? abrirOrdens : undefined}>
          {abertas.length === 0 ? (
            <TextoVazio texto="Nenhuma outra OS em aberto." />
          ) : (
            abertas.map((o, i) => (
              <CardOS
                key={o.id}
                ordem={o}
                index={i}
                avancando={avancandoId === o.id}
                onAbrir={abrirOrdens}
                onAvancar={(proximo) => avancarStatus(o, proximo)}
              />
            ))
          )}
        </Secao>

        {/* Estado vazio geral — caloroso, sem culpa. */}
        {ordens.length === 0 && (
          <EmptyState
            icon="clipboard-text-clock-outline"
            title="Nada atribuído a você ainda"
            subtitle="Quando o escritório te atribuir uma ordem de serviço, ela aparece bem aqui."
          />
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Subcomponentes de apresentação (mesmo tema/estilo do app).
// ─────────────────────────────────────────────────────────────

function Secao({
  titulo, icon, cor, onVerTodas, children,
}: {
  titulo: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  cor: string;
  onVerTodas?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={styles.secaoHeader}>
        <View style={styles.secaoTituloRow}>
          <MaterialCommunityIcons name={icon} size={16} color={cor} />
          <Text style={styles.secaoTitulo}>{titulo}</Text>
        </View>
        {onVerTodas ? (
          <OlliPressable onPress={onVerTodas} haptic={false} hitSlop={8}>
            <Text style={styles.verTodas}>ver todas</Text>
          </OlliPressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function TextoVazio({ texto }: { texto: string }) {
  return (
    <View style={styles.vazioBox}>
      <Text style={styles.vazioTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  saudacao: { fontSize: 22, fontWeight: '800', color: '#fff' },
  subtitulo: { fontSize: 14, color: Colors.onSurfaceVariant, marginTop: 2 },

  resumoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },

  secaoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secaoTituloRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  secaoTitulo: { fontSize: 15, fontWeight: '800', color: '#fff' },
  verTodas: { fontSize: 13, fontWeight: '700', color: Colors.accent },

  vazioBox: {
    backgroundColor: Colors.surfaceGlass, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.outlineDark, padding: Spacing.lg, alignItems: 'center',
  },
  vazioTexto: { fontSize: 13.5, color: Colors.onSurfaceVariant, textAlign: 'center' },
});

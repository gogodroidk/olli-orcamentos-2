import { formatarNumeroExibicao } from '../../utils/numeroDocumento';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
import { OlliButton } from '../../components/OlliButton';
import { FormularioDadosOS } from '../../components/os/FormularioDadosOS';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
// Mesmas funções de serviço da OrdemServicoScreen mobile (NovaOS) — nenhuma
// regra de negócio (numeração, dedupe orçamento→OS) é reimplementada aqui.
import { criarOSDeOrcamento, criarOSManual, getOrdens } from '../../services/ordemServico';
import { getOrcamentos } from '../../database/database';
import { STATUS_LABELS } from '../../types';
import type { Orcamento, OrdemServico } from '../../types';
import { avisar } from './dialogo';

/** Valor numérico → "R$ 1.234,56". */
function formatarValor(v?: number): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface Props {
  visivel: boolean;
  aoFechar: () => void;
  aoCriada: (id: string) => void;
}

/**
 * Painel lateral "Nova ordem de serviço" — os dois caminhos da mobile (de um
 * orçamento aprovado, ou manual) num só painel desktop, com abas em vez de
 * telas empilhadas. Reaproveita criarOSDeOrcamento/criarOSManual.
 */
export function PainelNovaOS({ visivel, aoFechar, aoCriada }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [modo, setModo] = useState<'orcamento' | 'manual'>('orcamento');
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (visivel) setModo('orcamento');
  }, [visivel]);

  async function criarDeOrcamento(orcamentoId: string) {
    setCriando(true);
    try {
      const os = await criarOSDeOrcamento(orcamentoId);
      aoCriada(os.id);
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui criar a OS agora.');
    } finally {
      setCriando(false);
    }
  }

  async function criarManual(parcial: Partial<OrdemServico>, limpar: () => void) {
    setCriando(true);
    try {
      const os = await criarOSManual(parcial);
      limpar();
      aoCriada(os.id);
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui criar a OS agora.');
    } finally {
      setCriando(false);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.raiz}>
        <Pressable style={styles.fundoClicavel} onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.painel}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>Nova ordem de serviço</Text>
            <Pressable
              onPress={aoFechar}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ hovered, focused }: PressableWebState) => [styles.botaoFechar, hovered && styles.botaoFecharHover, focused && styles.focoVisivel]}
            >
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
            </Pressable>
          </View>

          <View style={styles.abas}>
            <Aba label="De um orçamento" ativo={modo === 'orcamento'} onPress={() => setModo('orcamento')} />
            <Aba label="Manual" ativo={modo === 'manual'} onPress={() => setModo('manual')} />
          </View>

          {modo === 'orcamento' ? (
            <NovaOSDeOrcamento criando={criando} onCriar={criarDeOrcamento} />
          ) : (
            <NovaOSManual criando={criando} onCriar={criarManual} />
          )}
        </View>
      </View>
    </Modal>
  );
}

function Aba({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: ativo }}
      style={({ hovered, focused }: PressableWebState) => [styles.aba, ativo && styles.abaAtiva, hovered && !ativo && styles.abaHover, focused && styles.focoVisivel]}
    >
      <Text style={[styles.abaTexto, ativo && styles.abaTextoAtivo]}>{label}</Text>
    </Pressable>
  );
}

function NovaOSDeOrcamento({ criando, onCriar }: { criando: boolean; onCriar: (orcamentoId: string) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [orcamentosErro, setOrcamentosErro] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const ativoRef = useRef(true);
  useEffect(() => () => { ativoRef.current = false; }, []);

  const carregarOrcamentos = useCallback(async () => {
    setCarregando(true);
    setOrcamentosErro(false);
    try {
      const [todos, ordens] = await Promise.all([getOrcamentos(), getOrdens()]);
      // Um orçamento gera no máximo uma OS: some quem já tem OS gerada.
      const jaComOS = new Set(ordens.map((os) => os.orcamentoId).filter((id): id is string => !!id));
      const elegiveis = todos.filter((o) => (o.status === 'aprovado' || o.status === 'convertido') && !jaComOS.has(o.id));
      if (ativoRef.current) setOrcamentos(elegiveis);
    } catch {
      // erro de verdade (leitura falhou) — NUNCA vira lista vazia silenciosa.
      if (ativoRef.current) setOrcamentosErro(true);
    } finally {
      if (ativoRef.current) setCarregando(false);
    }
  }, []);

  useEffect(() => { carregarOrcamentos(); }, [carregarOrcamentos]);

  if (carregando) {
    return <View style={{ padding: Spacing.xl, alignItems: 'center' }}><ActivityIndicator size="small" color={cores.primary} /></View>;
  }

  if (orcamentosErro) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Não deu para carregar"
        subtitle="Não conseguimos buscar os orçamentos elegíveis agora. Verifique a conexão e tente de novo."
        actionLabel="Tentar de novo"
        onAction={carregarOrcamentos}
      />
    );
  }

  if (orcamentos.length === 0) {
    return (
      <EmptyState
        icon="file-check-outline"
        title="Nenhum orçamento aprovado"
        subtitle="Aprove ou converta um orçamento para gerar uma ordem de serviço a partir dele."
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        {orcamentos.map((o) => {
          const sel = selecionado === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => setSelecionado(o.id)}
              accessibilityRole="button"
              accessibilityLabel={`Selecionar orçamento de ${o.clienteNome}`}
              style={({ hovered, focused }: PressableWebState) => [
                styles.orcRow, sel && styles.orcRowSel, hovered && !sel && styles.orcRowHover, focused && styles.focoVisivel,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.orcCliente} numberOfLines={1}>{o.clienteNome}</Text>
                <Text style={styles.orcMeta}>Nº {formatarNumeroExibicao(o.numero)} · {STATUS_LABELS[o.status]}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.orcValor}>{formatarValor(o.valorTotal)}</Text>
                {sel && <MaterialCommunityIcons name="check-circle" size={18} color={cores.success} style={{ marginTop: 4 }} />}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.rodape}>
        <OlliButton
          label="Gerar ordem de serviço"
          variant="gradient"
          size="lg"
          fullWidth
          loading={criando}
          disabled={!selecionado}
          onPress={() => selecionado && onCriar(selecionado)}
          icon={<MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#fff" />}
        />
      </View>
    </View>
  );
}

function NovaOSManual({ criando, onCriar }: {
  criando: boolean;
  onCriar: (parcial: Partial<OrdemServico>, limpar: () => void) => void;
}) {
  const styles = useEstilos(criarEstilos);

  return (
    <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
      <FormularioDadosOS
        rascunhoEscopo="os-nova"
        rotuloSalvar="Criar ordem de serviço"
        salvando={criando}
        onSalvar={(patch, limpar) => onCriar(patch, limpar)}
      />
    </ScrollView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: { outlineWidth: 2, outlineColor: c.accent, outlineStyle: 'solid', outlineOffset: 2 } as any,
  raiz: { flex: 1, flexDirection: 'row' },
  fundoClicavel: { flex: 1, backgroundColor: 'rgba(5,12,22,0.60)' },
  painel: { width: 420, height: '100%', backgroundColor: c.surface, borderLeftWidth: 1, borderLeftColor: c.outline },
  cabecalho: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: c.outline,
  },
  titulo: { ...Typography.h3, color: c.onSurface },
  botaoFechar: { width: 34, height: 34, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  botaoFecharHover: { backgroundColor: c.surfacePressed },

  abas: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  aba: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline },
  abaHover: { backgroundColor: c.surfacePressed },
  abaAtiva: { backgroundColor: c.primaryContainer, borderColor: c.primary },
  abaTexto: { fontSize: 13, fontWeight: '700' as const, color: c.onSurfaceVariant },
  abaTextoAtivo: { color: c.primaryLight },

  conteudo: { padding: Spacing.xl, gap: Spacing.sm },

  orcRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outlineDark, padding: Spacing.base, marginBottom: 10,
  },
  orcRowHover: { backgroundColor: c.surfacePressed },
  orcRowSel: { borderColor: c.accent, backgroundColor: c.accentContainer },
  orcCliente: { ...Typography.body, fontWeight: '700' as const, color: c.onSurface },
  orcMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  orcValor: { ...Typography.body, fontWeight: '800' as const, color: c.primaryLight },


  rodape: { padding: Spacing.xl, borderTopWidth: 1, borderTopColor: c.outline },
});

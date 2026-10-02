import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, sombrasDe, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { DicaContextual } from '../components/DicaContextual';
import { TelaRecursoPlano } from '../components/RecursoPlano';
import { Aparecer, PressableAnimado, Skeleton } from '../components/motion';
import { toast } from '../components/feedback';
import { goBackOrHome } from '../navigation/safeBack';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { getClientes } from '../database/database';
import { carregarGarantias, marcarGarantiaCuidada, type LeituraGarantias } from '../services/garantias';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { diaBr } from '../utils/historicoEquipamento';
import { mensagemCuidadoGarantia, rotuloItemGarantia, type ItemGarantia } from '../utils/garantiaServico';
import type { Cliente } from '../types';

/**
 * GARANTIAS (Onda I3, jogada 12) — "a garantia que se cuida sozinha".
 *
 * Em cima, o que cuidar hoje: a garantia que entra na última semana e o "pergunte
 * se está tudo certo" depois do serviço. [WhatsApp] abre a conversa com a pergunta
 * pronta (o prestador revisa e envia); [Feito] tira o item da lista. Embaixo, as
 * garantias vigentes, com o prazo como foi escrito e até quando vale.
 *
 * Nada é inventado: só entra OS concluída com prazo escrito (na OS ou no orçamento
 * de origem). Leitura que falha diz que falhou.
 */
export default function GarantiasScreen() {
  return (
    <TelaRecursoPlano recurso="vespera_garantia" titulo="Garantias">
      <GarantiasConteudo />
    </TelaRecursoPlano>
  );
}

function GarantiasConteudo() {
  const nav = useNavigation<any>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const ehDesktop = useEhDesktop();
  const [leitura, setLeitura] = useState<LeituraGarantias | null>(null);
  const [clientes, setClientes] = useState<Map<string, Cliente>>(new Map());
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    const [r, cls] = await Promise.all([carregarGarantias(), getClientes().catch(() => [] as Cliente[])]);
    setClientes(new Map(cls.map((c) => [c.id, c] as const)));
    setLeitura(r);
  }, []);
  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));

  async function atualizar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  async function chamar(item: ItemGarantia) {
    const tel = item.garantia.clienteId ? clientes.get(item.garantia.clienteId)?.telefone : undefined;
    if (!tel) {
      toast.info('Este cliente não tem WhatsApp no cadastro.');
      return;
    }
    try {
      await abrirWhatsApp(tel, mensagemCuidadoGarantia(item, leitura?.estado === 'ok' ? leitura.nomePrestador : null));
    } catch {
      toast.erro('Não consegui abrir o WhatsApp neste aparelho.');
    }
  }

  async function feito(item: ItemGarantia) {
    try {
      await marcarGarantiaCuidada(item.chave);
      setLeitura((l) => (l && l.estado === 'ok' ? { ...l, itens: l.itens.filter((i) => i.chave !== item.chave) } : l));
      toast.sucesso('Pronto, saiu da lista.');
    } catch {
      toast.erro('Não consegui marcar agora. Tente de novo.');
    }
  }

  let k = 0;
  return (
    <View style={styles.tela}>
      <GradientHeader title="Garantias" subtitle="Cuide antes de virar reclamação" onBack={() => goBackOrHome(nav)} />
      <ScrollView
        contentContainerStyle={[styles.scroll, ehDesktop && styles.scrollDesktop]}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.accentLight} colors={[cores.accentLight]} />}
        showsVerticalScrollIndicator={false}
      >
        <DicaContextual
          id="garantia.tela"
          icon="shield-check-outline"
          texto="A garantia vem do prazo escrito na OS ou no orçamento. Perguntar se está tudo certo antes de vencer evita reclamação e rende avaliação."
        />

        {!leitura ? (
          <View style={{ gap: 10 }}>
            {[0, 1].map((i) => (
              <View key={i} style={styles.card}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
              </View>
            ))}
          </View>
        ) : leitura.estado === 'erro' ? (
          <View style={styles.card}>
            <Text style={styles.titulo}>Não consegui ler as garantias</Text>
            <Text style={styles.texto}>Nada foi perdido. Puxe a tela para tentar de novo.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.secao}>Para cuidar hoje</Text>
            {leitura.itens.length === 0 ? (
              <View style={styles.vazio}>
                <MaterialCommunityIcons name="shield-check-outline" size={26} color={cores.success} />
                <Text style={styles.texto}>Nenhuma garantia pedindo atenção hoje.</Text>
              </View>
            ) : leitura.itens.map((item) => {
              const cor = item.motivo === 'vence' ? cores.warning : cores.accentLight;
              return (
                <Aparecer key={item.chave} indice={k++}>
                  <View style={[styles.card, { borderColor: comAlfa(cor, 0.45) }]}>
                    <View style={styles.topo}>
                      <MaterialCommunityIcons name={item.motivo === 'vence' ? 'shield-alert-outline' : 'message-question-outline'} size={18} color={cor} />
                      <Text style={[styles.rotulo, { color: cor }]}>{rotuloItemGarantia(item)}</Text>
                    </View>
                    <Text style={styles.cliente} numberOfLines={1}>{item.garantia.clienteNome || 'Cliente'}</Text>
                    <Text style={styles.texto} numberOfLines={2}>
                      {item.garantia.titulo} · {item.garantia.numero} · garantia de {item.garantia.texto}
                    </Text>
                    <View style={styles.acoes}>
                      <PressableAnimado onPress={() => void chamar(item)} haptic="light" style={styles.botaoZap} accessibilityRole="button" accessibilityLabel={`Perguntar a ${item.garantia.clienteNome} no WhatsApp`}>
                        <MaterialCommunityIcons name="whatsapp" size={16} color="#FFFFFF" />
                        <Text style={styles.botaoZapTxt}>Perguntar</Text>
                      </PressableAnimado>
                      <PressableAnimado onPress={() => void feito(item)} haptic="selection" style={styles.botaoSec} accessibilityRole="button" accessibilityLabel="Marcar como feito">
                        <MaterialCommunityIcons name="check" size={16} color={cores.accentLight} />
                        <Text style={styles.botaoSecTxt}>Feito</Text>
                      </PressableAnimado>
                    </View>
                  </View>
                </Aparecer>
              );
            })}

            <Text style={styles.secao}>Garantias vigentes</Text>
            {leitura.vigentes.length === 0 ? (
              <Text style={styles.texto}>
                Nenhuma OS concluída com prazo de garantia escrito. Escreva o prazo no orçamento ou na OS ("90 dias", "6 meses") para a OLLI acompanhar.
              </Text>
            ) : leitura.vigentes.map((g) => (
              <Aparecer key={g.osId} indice={k++}>
                <PressableAnimado
                  onPress={() => nav.navigate('OrdemServico', { ordemId: g.osId })}
                  haptic="selection"
                  style={styles.linha}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.clienteNome}, garantia até ${diaBr(g.ate)}. Abrir a OS`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaNome} numberOfLines={1}>{g.clienteNome || 'Cliente'}</Text>
                    <Text style={styles.linhaSub} numberOfLines={1}>{g.titulo} · {g.texto}</Text>
                  </View>
                  <Text style={styles.linhaAte}>até {diaBr(g.ate)}</Text>
                </PressableAnimado>
              </Aparecer>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.background },
  scroll: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 120 },
  scrollDesktop: { maxWidth: 680, width: '100%', alignSelf: 'center' },
  secao: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant, letterSpacing: 0.3, marginTop: Spacing.sm, textTransform: 'uppercase' },
  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, gap: 6, ...sombrasDe(c).sm },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rotulo: { fontSize: 13, fontWeight: '800' },
  cliente: { fontSize: 15, fontWeight: '800', color: c.onSurface, marginTop: 2 },
  titulo: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  texto: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 18 },
  vazio: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: Spacing.sm },
  acoes: { flexDirection: 'row', gap: 8, marginTop: 6 },
  botaoZap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.whatsapp, borderRadius: BorderRadius.md, paddingVertical: 10 },
  botaoZapTxt: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  botaoSec: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, paddingVertical: 10 },
  botaoSecTxt: { color: c.accentLight, fontSize: 13.5, fontWeight: '800' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: 12 },
  linhaNome: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  linhaSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  linhaAte: { fontSize: 12.5, fontWeight: '800', color: c.success },
});

import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
import { OlliInput, OlliMoneyInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
import { PressableWebState } from '../../components/web/pressableWebState';
import { saveServico, deleteServico } from '../../database/database';
import { generateId } from '../../utils/id';
import { nowISO } from '../../utils/date';
import { formatCurrency } from '../../utils/currency';
import { ServicoItem, UNIDADES } from '../../types';
import { avisar, confirmar } from './dialogo';
import { margemInfo } from './servicoMargem';

interface Props {
  servico: ServicoItem | null;
  visivel: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}

/**
 * Painel lateral direito (420px) de criação/edição de serviço — usado pela
 * ServicosDesktopScreen. Mesma regra de persistência/validação da
 * ServicosScreen mobile (saveServico/deleteServico + aviso de preço zerado),
 * só a casca de UI muda (painel lateral em vez de modal em tela cheia).
 */
export function PainelServico({ servico, visivel, aoFechar, aoSalvar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [form, setForm] = useState<Partial<ServicoItem>>({});
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const ehNovo = !servico;

  useEffect(() => {
    if (visivel) {
      setForm(servico ? { ...servico } : { unidade: 'un', preco: 0 });
    }
  }, [visivel, servico]);

  async function pickFoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { avisar('Permissão', 'Permita o acesso às fotos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!r.canceled) setForm((p) => ({ ...p, fotoUri: r.assets[0].uri }));
  }

  async function handleSalvar() {
    if (!form.nome?.trim()) return;

    const s: ServicoItem = {
      id: form.id ?? generateId(),
      nome: form.nome!,
      descricao: form.descricao,
      preco: form.preco ?? 0,
      custo: form.custo,
      unidade: form.unidade ?? 'un',
      fotoUri: form.fotoUri,
      criadoEm: form.criadoEm ?? nowISO(),
    };

    if (s.preco <= 0) {
      const confirmaMesmoAssim = confirmar(
        'Preço zerado',
        'Este serviço está com preço R$ 0,00. Se for adicionado a um orçamento assim, o cliente não pagará nada por ele. Salvar mesmo assim?'
      );
      if (!confirmaMesmoAssim) return;
    }
    await persistir(s);
  }

  async function persistir(s: ServicoItem) {
    setSalvando(true);
    try {
      await saveServico(s);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      aoSalvar();
      aoFechar();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      avisar('Erro', 'Não foi possível salvar o serviço agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir() {
    if (!servico) return;
    if (!confirmar('Excluir serviço', `Excluir "${servico.nome}"? Essa ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    try {
      await deleteServico(servico.id);
      aoSalvar();
      aoFechar();
    } catch {
      avisar('Erro', 'Não foi possível excluir o serviço agora. Tente novamente.');
    } finally {
      setExcluindo(false);
    }
  }

  const margem = margemInfo(form.preco, form.custo);

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.raiz}>
        <Pressable style={styles.fundoClicavel} onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.painel}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>{ehNovo ? 'Novo serviço' : 'Editar serviço'}</Text>
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

          <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
            <Pressable
              onPress={pickFoto}
              accessibilityRole="button"
              accessibilityLabel="Adicionar foto do serviço"
              style={({ hovered, focused }: PressableWebState) => [styles.fotoBtn, hovered && styles.fotoBtnHover, focused && styles.focoVisivel]}
            >
              {form.fotoUri ? (
                <Image source={{ uri: form.fotoUri }} style={styles.fotoPreview} />
              ) : (
                <>
                  <MaterialCommunityIcons name="camera-plus-outline" size={28} color={cores.primary} />
                  <Text style={styles.fotoBtnLabel}>Adicionar foto</Text>
                </>
              )}
            </Pressable>

            <OlliInput
              label="Nome do serviço"
              required
              autoFocus={ehNovo}
              value={form.nome ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, nome: v }))}
              placeholder="Ex: Instalação de ar condicionado"
              leftIcon="wrench-outline"
            />
            <OlliInput
              label="Descrição"
              value={form.descricao ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, descricao: v }))}
              placeholder="O que está incluso"
              multiline
            />

            <View style={styles.linhaCampos}>
              <OlliMoneyInput
                label="Preço de venda"
                value={form.preco ?? 0}
                onChangeValue={(v) => setForm((p) => ({ ...p, preco: v }))}
                containerStyle={{ flex: 1, marginRight: 10 }}
              />
              <OlliMoneyInput
                label="Custo (opcional)"
                value={form.custo ?? 0}
                onChangeValue={(v) => setForm((p) => ({ ...p, custo: v || undefined }))}
                containerStyle={{ flex: 1 }}
              />
            </View>

            {margem !== null && (
              <View style={styles.margemBanner}>
                <MaterialCommunityIcons name="trending-up" size={18} color={cores.success} />
                <Text style={styles.margemBannerText}>
                  Margem de {margem.pct}% · Lucro {formatCurrency((form.preco ?? 0) - (form.custo ?? 0))}
                </Text>
              </View>
            )}
            {!form.preco && (
              <View style={styles.avisoBanner}>
                <MaterialCommunityIcons name="alert-outline" size={18} color={cores.danger} />
                <Text style={styles.avisoBannerText}>Preço zerado — este serviço entrará de graça em qualquer orçamento.</Text>
              </View>
            )}

            <Text style={styles.unidadeLabel}>Unidade de medida</Text>
            <View style={styles.unidadesRow}>
              {UNIDADES.map((u) => {
                const ativa = form.unidade === u;
                return (
                  <Pressable
                    key={u}
                    onPress={() => setForm((p) => ({ ...p, unidade: u }))}
                    accessibilityRole="button"
                    accessibilityLabel={`Unidade ${u}`}
                    style={({ hovered, focused }: PressableWebState) => [
                      styles.unidade,
                      ativa && styles.unidadeAtiva,
                      hovered && !ativa && styles.unidadeHover,
                      focused && styles.focoVisivel,
                    ]}
                  >
                    <Text style={[styles.unidadeTexto, ativa && styles.unidadeTextoAtivo]}>{u}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.rodape}>
            {!ehNovo && (
              <Pressable
                onPress={handleExcluir}
                disabled={excluindo}
                accessibilityRole="button"
                accessibilityLabel="Excluir serviço"
                style={({ hovered, focused }: PressableWebState) => [styles.botaoExcluir, hovered && styles.botaoExcluirHover, focused && styles.focoVisivel]}
              >
                {excluindo ? (
                  <ActivityIndicator size="small" color={cores.danger} />
                ) : (
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={cores.danger} />
                )}
              </Pressable>
            )}
            <OlliButton
              label="Salvar serviço"
              variant="gradient"
              size="lg"
              fullWidth
              loading={salvando}
              onPress={handleSalvar}
              disabled={!form.nome?.trim() || salvando}
              icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />}
              style={styles.botaoSalvar}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  raiz: {
    flex: 1,
    flexDirection: 'row',
  },
  // Scrim do modal: navy translúcido fixo (mesmo padrão em toda a base), não
  // segue o tema — um backdrop de modal fica escuro em claro e escuro.
  fundoClicavel: {
    flex: 1,
    backgroundColor: 'rgba(5,12,22,0.60)',
  },
  painel: {
    width: 420,
    height: '100%',
    backgroundColor: c.surface,
    borderLeftWidth: 1,
    borderLeftColor: c.outline,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
  },
  titulo: {
    ...Typography.h3,
    color: c.onSurface,
  },
  botaoFechar: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoFecharHover: {
    backgroundColor: c.surfacePressed,
  },
  conteudo: {
    padding: Spacing.xl,
  },
  fotoBtn: {
    height: 120,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: c.primary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.base,
    overflow: 'hidden',
    backgroundColor: c.primaryContainer,
  },
  fotoBtnHover: {
    backgroundColor: c.surfacePressed,
  },
  fotoPreview: {
    width: '100%',
    height: '100%',
  },
  fotoBtnLabel: {
    fontSize: 13,
    color: c.primary,
    fontWeight: '700',
    marginTop: 4,
  },
  linhaCampos: {
    flexDirection: 'row',
  },
  margemBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.successLight,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: Spacing.base,
  },
  margemBannerText: {
    fontSize: 13,
    color: c.success,
    fontWeight: '700',
    flex: 1,
  },
  avisoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.dangerLight,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: c.danger,
  },
  avisoBannerText: {
    fontSize: 13,
    color: c.danger,
    fontWeight: '700',
    flex: 1,
  },
  unidadeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.onSurfaceVariant,
    marginBottom: 8,
  },
  unidadesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  unidade: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: c.outline,
  },
  unidadeHover: {
    backgroundColor: c.surfacePressed,
  },
  unidadeAtiva: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  unidadeTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: c.onSurfaceVariant,
  },
  unidadeTextoAtivo: {
    color: c.onPrimary,
  },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: c.outline,
  },
  botaoExcluir: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: c.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoExcluirHover: {
    backgroundColor: c.dangerLight,
    borderColor: c.danger,
  },
  botaoSalvar: {
    flex: 1,
  },
});

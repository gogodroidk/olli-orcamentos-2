import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, comAlfa, type Cores } from '../../theme';
import { OlliInput, OlliMoneyInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
import { PressableWebState } from '../../components/web/pressableWebState';
import { saveProduto, deleteProduto } from '../../database/database';
import { formatCurrency } from '../../utils/currency';
import { generateId } from '../../utils/id';
import { nowISO } from '../../utils/date';
import { ProdutoItem, UNIDADES } from '../../types';
import { avisar, confirmar } from './dialogo';
import { margemInfo } from './produtoMargem';

interface Props {
  produto: ProdutoItem | null;
  visivel: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}

/**
 * Painel lateral direito (420px) de criação/edição de produto — usado pela
 * ProdutosDesktopScreen. Mesma regra de validação/persistência da
 * ProdutosScreen mobile (saveProduto/deleteProduto, aviso de preço zerado),
 * só a casca de UI muda (modal lateral em vez de modal tela cheia).
 */
export function PainelProduto({ produto, visivel, aoFechar, aoSalvar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [form, setForm] = useState<Partial<ProdutoItem>>({});
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const ehNovo = !produto;

  useEffect(() => {
    if (visivel) {
      setForm(produto ? { ...produto } : { unidade: 'un', preco: 0 });
    }
  }, [visivel, produto]);

  async function pickFoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { avisar('Permissão', 'Permita o acesso às fotos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!r.canceled) setForm((p) => ({ ...p, fotoUri: r.assets[0].uri }));
  }

  async function handleSalvar() {
    if (!form.nome?.trim()) return;
    const p: ProdutoItem = {
      id: form.id ?? generateId(),
      nome: form.nome!, descricao: form.descricao,
      preco: form.preco ?? 0, custo: form.custo,
      marca: form.marca, modelo: form.modelo,
      unidade: form.unidade ?? 'un', fotoUri: form.fotoUri,
      criadoEm: form.criadoEm ?? nowISO(),
    };

    if (p.preco <= 0) {
      const ok = await confirmar(
        'Preço zerado',
        'Este produto está com preço R$ 0,00. Se for adicionado a um orçamento assim, o cliente não pagará nada por ele. Deseja salvar mesmo assim?'
      );
      if (!ok) return;
    }
    await persistir(p);
  }

  async function persistir(p: ProdutoItem) {
    setSalvando(true);
    try {
      await saveProduto(p);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      aoSalvar();
      aoFechar();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      avisar('Erro', 'Não foi possível salvar o produto agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir() {
    if (!produto) return;
    if (!(await confirmar('Excluir produto', `Excluir "${produto.nome}"? Essa ação não pode ser desfeita.`))) return;
    setExcluindo(true);
    try {
      await deleteProduto(produto.id);
      aoSalvar();
      aoFechar();
    } catch {
      avisar('Erro', 'Não foi possível excluir o produto agora. Tente novamente.');
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
            <Text style={styles.titulo}>{ehNovo ? 'Novo produto' : 'Editar produto'}</Text>
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
              accessibilityLabel="Adicionar foto do produto"
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
              label="Nome do produto"
              required
              autoFocus={ehNovo}
              value={form.nome ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, nome: v }))}
              placeholder="Ex: Fluido refrigerante R-410A"
              leftIcon="package-variant"
            />
            <OlliInput
              label="Descrição"
              value={form.descricao ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, descricao: v }))}
              placeholder="Especificação do produto"
              multiline
            />
            <View style={styles.linhaCampos}>
              <OlliInput
                label="Marca"
                value={form.marca ?? ''}
                onChangeText={(v) => setForm((p) => ({ ...p, marca: v }))}
                placeholder="Ex: Midea"
                containerStyle={{ flex: 1, marginRight: 10 }}
              />
              <OlliInput
                label="Modelo"
                value={form.modelo ?? ''}
                onChangeText={(v) => setForm((p) => ({ ...p, modelo: v }))}
                placeholder="Ex: 12.000 BTUs"
                containerStyle={{ flex: 1 }}
              />
            </View>
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

            {margem && (
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
                <Text style={styles.avisoBannerText}>Preço zerado — este produto entrará de graça em qualquer orçamento.</Text>
              </View>
            )}

            <Text style={styles.unidadeLabel}>Unidade de medida</Text>
            <View style={styles.unidadesRow}>
              {UNIDADES.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setForm((p) => ({ ...p, unidade: u }))}
                  accessibilityRole="button"
                  accessibilityLabel={`Unidade ${u}`}
                  style={({ hovered, focused }: PressableWebState) => [
                    styles.unidade,
                    form.unidade === u && styles.unidadeAtiva,
                    hovered && form.unidade !== u && styles.unidadeHover,
                    focused && styles.focoVisivel,
                  ]}
                >
                  <Text style={[styles.unidadeTexto, form.unidade === u && styles.unidadeTextoAtivo]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={styles.rodape}>
            {!ehNovo && (
              <Pressable
                onPress={handleExcluir}
                disabled={excluindo}
                accessibilityRole="button"
                accessibilityLabel="Excluir produto"
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
              label="Salvar produto"
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
    backgroundColor: c.surfaceVariant,
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
    borderColor: comAlfa(c.danger, 0.4),
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

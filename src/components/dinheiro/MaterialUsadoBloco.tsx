/**
 * BAIXA LEVE DE MATERIAL NA OS (Onda I4) — "o que saiu nesta OS".
 *
 * Não é estoque: só registra cobre, gás, peças… usados no serviço. É o custo de
 * material do Lucro Real da Visita. Três estados de verdade:
 *   não informado → "Ainda não informado" + [Não usei material];
 *   []            → "Nenhum material usado nesta OS";
 *   [itens]       → a lista, com o custo para quem pode ver valores.
 *
 * O item pode vir do catálogo de produtos (o custo já vem junto) ou ser digitado.
 * Para refrigeração há atalhos de gás (R-410A, R-32, R-22, em kg). O técnico da
 * equipe registra nome e quantidade; custo é dado de gestão (não aparece para ele).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { DicaContextual } from '../DicaContextual';
import { PressableAnimado } from '../motion/PressableAnimado';
import { toast } from '../feedback';
import { vibrar } from '../../utils/haptico';
import { generateId } from '../../utils/id';
import { parseCurrency } from '../../utils/currency';
import { GASES_REFRIGERACAO, textoMaterial } from '../../utils/materiaisOS';
import { reais } from '../../services/lucroVisita';
import { atualizarMateriaisOS } from '../../services/ordemServico';
import { getProdutos } from '../../database/database';
import type { MaterialUsado, OrdemServico, ProdutoItem } from '../../types';

interface Props {
  ordem: OrdemServico;
  /** Pode ver/editar custo (gestão). O técnico só registra o que saiu. */
  podeVerCusto: boolean;
  /** Ofício de refrigeração: mostra os atalhos de gás. */
  ehRefrigeracao: boolean;
  onSalvo: (ordem: OrdemServico) => void;
}

const UNIDADES = ['un', 'm', 'kg', 'g', 'L'];

export function MaterialUsadoBloco({ ordem, podeVerCusto, ehRefrigeracao, onSalvo }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoItem[] | null>(null);
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [unidade, setUnidade] = useState('un');
  const [custo, setCusto] = useState('');
  const [produtoId, setProdutoId] = useState<string | undefined>(undefined);

  const materiais = ordem.materiais;

  // Catálogo só quando o formulário abre (a OS abre rápido mesmo com catálogo grande).
  useEffect(() => {
    if (!abrindo || produtos !== null) return;
    getProdutos().then(setProdutos).catch(() => setProdutos([]));
  }, [abrindo, produtos]);

  const sugestoes = useMemo(() => {
    const t = nome.trim().toLowerCase();
    if (!t || !produtos) return [];
    return produtos.filter((p) => p.nome.toLowerCase().includes(t)).slice(0, 4);
  }, [nome, produtos]);

  function limparForm() {
    setNome('');
    setQuantidade('1');
    setUnidade('un');
    setCusto('');
    setProdutoId(undefined);
  }

  function escolherProduto(p: ProdutoItem) {
    vibrar('selecao');
    setNome(p.nome);
    setUnidade(p.unidade || 'un');
    setProdutoId(p.id);
    if (typeof p.custo === 'number') setCusto(String(p.custo).replace('.', ','));
  }

  function escolherGas(g: { nome: string; unidade: string }) {
    vibrar('selecao');
    setNome(g.nome);
    setUnidade(g.unidade);
    setProdutoId(undefined);
    setQuantidade('');
  }

  async function salvar(lista: MaterialUsado[], mensagem: string) {
    setSalvando(true);
    try {
      const atualizada = await atualizarMateriaisOS(ordem.id, lista);
      vibrar('sucesso');
      onSalvo(atualizada);
      toast.sucesso(mensagem);
      return true;
    } catch {
      vibrar('erro');
      toast.erro('Não consegui salvar o material agora. Tente de novo.');
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function adicionar() {
    const n = nome.trim();
    const q = parseCurrency(quantidade);
    if (!n) {
      toast.info('Diga o que saiu (ex.: Gás R-410A, Suporte 400 mm).');
      return;
    }
    if (!(q > 0)) {
      toast.info('Informe a quantidade que saiu.');
      return;
    }
    const item: MaterialUsado = { id: generateId(), nome: n, quantidade: q, unidade: unidade.trim() || 'un' };
    if (produtoId) item.produtoId = produtoId;
    // Custo: só quem pode ver valores digita; o técnico herda o do catálogo (se houver).
    const c = custo.trim();
    if (c) item.custoUnitario = Math.max(0, parseCurrency(c));
    else if (produtoId) {
      const p = produtos?.find((x) => x.id === produtoId);
      if (typeof p?.custo === 'number') item.custoUnitario = p.custo;
    }
    const ok = await salvar([...(materiais ?? []), item], `Anotado: ${textoMaterial(item)}.`);
    if (ok) {
      limparForm();
      setAbrindo(false);
    }
  }

  function remover(id: string) {
    vibrar('selecao');
    void salvar((materiais ?? []).filter((m) => m.id !== id), 'Material removido.');
  }

  const total = (materiais ?? []).reduce(
    (s, m) => (typeof m.custoUnitario === 'number' ? s + m.custoUnitario * m.quantidade : s),
    0,
  );
  const semCusto = (materiais ?? []).filter((m) => typeof m.custoUnitario !== 'number').length;

  return (
    <View style={styles.bloco}>
      <View style={styles.header}>
        <Text style={styles.titulo}>Material usado</Text>
        {podeVerCusto && materiais && materiais.length > 0 ? (
          <Text style={styles.total}>{reais(total)}{semCusto ? ` · ${semCusto} sem custo` : ''}</Text>
        ) : null}
      </View>

      {materiais === undefined ? (
        <Text style={styles.vazio}>Ainda não informado. É o que mostra quanto sobrou deste serviço.</Text>
      ) : materiais.length === 0 ? (
        <Text style={styles.vazio}>Nenhum material usado nesta OS.</Text>
      ) : (
        materiais.map((m) => (
          <View key={m.id} style={styles.item}>
            <MaterialCommunityIcons name="package-variant-closed" size={18} color={cores.onSurfaceVariant} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTexto}>{textoMaterial(m)}</Text>
              {podeVerCusto ? (
                <Text style={styles.itemCusto}>
                  {typeof m.custoUnitario === 'number'
                    ? `${reais(m.custoUnitario)} por ${m.unidade} · ${reais(m.custoUnitario * m.quantidade)}`
                    : 'sem custo informado'}
                </Text>
              ) : null}
            </View>
            <PressableAnimado
              onPress={() => remover(m.id)}
              disabled={salvando}
              hitSlop={8}
              accessibilityLabel={`Remover ${textoMaterial(m)}`}
            >
              <MaterialCommunityIcons name="close" size={18} color={cores.onSurfaceMuted} />
            </PressableAnimado>
          </View>
        ))
      )}

      {abrindo ? (
        <View style={styles.form}>
          {ehRefrigeracao ? (
            <View style={styles.chips}>
              {GASES_REFRIGERACAO.map((g) => (
                <PressableAnimado key={g.nome} style={styles.chip} onPress={() => escolherGas(g)} haptic={false} accessibilityLabel={`Usar ${g.nome}`}>
                  <Text style={styles.chipTxt}>{g.nome}</Text>
                </PressableAnimado>
              ))}
            </View>
          ) : null}
          <TextInput
            style={styles.input}
            value={nome}
            onChangeText={(t) => { setNome(t); setProdutoId(undefined); }}
            placeholder="O que saiu (ex.: Suporte 400 mm)"
            placeholderTextColor={cores.onSurfaceMuted}
            accessibilityLabel="Nome do material"
          />
          {sugestoes.length > 0 && !produtoId ? (
            <View style={styles.chips}>
              {sugestoes.map((p) => (
                <PressableAnimado key={p.id} style={styles.chip} onPress={() => escolherProduto(p)} accessibilityLabel={`Usar ${p.nome} do catálogo`}>
                  <MaterialCommunityIcons name="tag-outline" size={13} color={cores.accentLight} />
                  <Text style={styles.chipTxt} numberOfLines={1}>{p.nome}</Text>
                </PressableAnimado>
              ))}
            </View>
          ) : null}
          <View style={styles.linha}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={quantidade}
              onChangeText={setQuantidade}
              keyboardType="decimal-pad"
              placeholder="Qtd."
              placeholderTextColor={cores.onSurfaceMuted}
              accessibilityLabel="Quantidade"
            />
            {podeVerCusto ? (
              <TextInput
                style={[styles.input, { flex: 1.4 }]}
                value={custo}
                onChangeText={setCusto}
                keyboardType="decimal-pad"
                placeholder={`Custo por ${unidade} (R$)`}
                placeholderTextColor={cores.onSurfaceMuted}
                accessibilityLabel="Custo por unidade em reais"
              />
            ) : null}
          </View>
          <View style={styles.chips}>
            {UNIDADES.map((u) => (
              <PressableAnimado
                key={u}
                style={[styles.chip, unidade === u && styles.chipAtivo]}
                onPress={() => { vibrar('selecao'); setUnidade(u); }}
                accessibilityLabel={`Unidade ${u}`}
                accessibilityState={{ selected: unidade === u }}
              >
                <Text style={[styles.chipTxt, unidade === u && styles.chipTxtAtivo]}>{u}</Text>
              </PressableAnimado>
            ))}
          </View>
          <View style={styles.linha}>
            <PressableAnimado style={styles.botaoSec} onPress={() => { limparForm(); setAbrindo(false); }} accessibilityLabel="Cancelar">
              <Text style={styles.botaoSecTxt}>Cancelar</Text>
            </PressableAnimado>
            <PressableAnimado style={styles.botao} onPress={() => void adicionar()} disabled={salvando} haptic="light" accessibilityLabel="Salvar material" accessibilityState={{ busy: salvando }}>
              <Text style={styles.botaoTxt}>{salvando ? 'Salvando…' : 'Salvar'}</Text>
            </PressableAnimado>
          </View>
        </View>
      ) : (
        <View style={styles.linha}>
          <PressableAnimado style={styles.botaoSec} onPress={() => { vibrar('selecao'); setAbrindo(true); }} accessibilityLabel="Adicionar material usado">
            <MaterialCommunityIcons name="plus" size={16} color={cores.accentLight} />
            <Text style={styles.botaoSecTxt}>Adicionar material</Text>
          </PressableAnimado>
          {materiais === undefined ? (
            <PressableAnimado
              style={styles.botaoSec}
              onPress={() => void salvar([], 'Anotado: nenhum material nesta OS.')}
              disabled={salvando}
              accessibilityLabel="Não usei material nesta OS"
            >
              <Text style={styles.botaoSecTxt}>Não usei material</Text>
            </PressableAnimado>
          ) : null}
        </View>
      )}

      <DicaContextual
        id="os.material-baixa"
        icon="package-variant"
        texto="Anote o que saiu nesta OS (cobre, gás, peças). Não é estoque: é o que mostra quanto sobrou de verdade."
      />
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    bloco: {
      backgroundColor: c.surface,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: c.outlineDark,
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titulo: { fontSize: 15, fontWeight: '700', color: c.onSurface },
    total: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },
    vazio: { fontSize: 13, lineHeight: 18, color: c.onSurfaceVariant },
    item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
    itemTexto: { fontSize: 13.5, color: c.onSurface },
    itemCusto: { fontSize: 13, color: c.onSurfaceMuted, marginTop: 1 },
    form: { gap: Spacing.sm },
    input: {
      minHeight: 44,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: c.outlineDark,
      backgroundColor: c.surfaceGlass,
      paddingHorizontal: Spacing.md,
      color: c.onSurface,
      fontSize: 14,
    },
    linha: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
    chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 32,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.outlineDark,
      backgroundColor: c.surfaceGlass,
      maxWidth: 220,
    },
    chipAtivo: { borderColor: c.accentLight, backgroundColor: c.accentContainer },
    chipTxt: { fontSize: 12.5, fontWeight: '600', color: c.onSurfaceVariant },
    chipTxtAtivo: { color: c.accentLight },
    botao: {
      flex: 1,
      minHeight: 44,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    botaoTxt: { fontSize: 14, fontWeight: '800', color: c.onPrimary },
    botaoSec: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: Spacing.base,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.outlineDark,
    },
    botaoSecTxt: { fontSize: 13.5, fontWeight: '700', color: c.accentLight },
  });

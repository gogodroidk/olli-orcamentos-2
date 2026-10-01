import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, FlatList, Modal, Image, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, comAlfa, type Cores } from '../theme';
import { Orcamento, ItemOrcamento, ServicoItem, ProdutoItem, UNIDADES } from '../types';
import { searchServicos, searchProdutos, getCatalogoMaisUsados, type CatalogoComUso } from '../database/database';
import { formatCurrency, formatQty, parseNumber, parseNumberPositive } from '../utils/currency';
import { generateId } from '../utils/id';
import { formatarNumeroExibicao } from '../utils/numeroDocumento';
import {
  adicionarDoCatalogo,
  quantidadeNoOrcamento,
  sugestoesParaAdicionar,
  type EstadoUltimoOrcamento,
} from '../utils/orcarRapido';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { Aparecer, ContadorAnimado, PressableAnimado, Skeleton } from '../components/motion';
import { confirmar } from '../components/feedback';

interface Props {
  orc: Orcamento;
  onChangeItens: (itens: ItemOrcamento[]) => void;
  onChangeOrc: (partial: Partial<Orcamento>) => void;
  /** IDs de itens com preço R$ 0,00 já confirmados pelo usuário como cortesia/brinde. */
  itensZeroConfirmados: Set<string>;
  /** Marca um item como confirmado (preço zero é intencional). */
  onConfirmarItemZero: (id: string) => void;
  /**
   * Atalho "Repetir o último orçamento deste cliente" (só na criação, com cliente
   * do cadastro). Ausente = não se aplica; aparece só enquanto a lista está vazia.
   */
  ultimoDoCliente?: EstadoUltimoOrcamento;
  onRepetirUltimo?: (origem: Orcamento) => void;
  onTentarUltimoDeNovo?: () => void;
}

type Tab = 'servico' | 'produto';

/** "Você mais usa" em 3 estados: erro de leitura nunca vira "sem sugestão". */
type EstadoSugestoes =
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'pronto'; lista: CatalogoComUso[] };

/** Busca do catálogo (modal) em 3 estados, pelo mesmo motivo. */
type EstadoBusca = 'carregando' | 'erro' | 'pronto';

export default function Step2Itens({
  orc, onChangeItens, onChangeOrc, itensZeroConfirmados, onConfirmarItemZero,
  ultimoDoCliente, onRepetirUltimo, onTentarUltimoDeNovo,
}: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [activeTab, setActiveTab] = useState<Tab>('servico');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<(ServicoItem | ProdutoItem)[]>([]);
  const [estadoBusca, setEstadoBusca] = useState<EstadoBusca>('carregando');
  const [showCatalog, setShowCatalog] = useState(false);
  // Quantos toques de "adicionar" desde que o catálogo abriu: o modal agora fica
  // aberto para escolher vários itens de uma vez, e o botão de fechar conta.
  const [adicionadosNaSessao, setAdicionadosNaSessao] = useState(0);
  const [sugestoes, setSugestoes] = useState<Partial<Record<Tab, EstadoSugestoes>>>({});
  const [editingItem, setEditingItem] = useState<ItemOrcamento | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);
  // Texto local do campo de desconto percentual, para preservar a digitação
  // decimal do usuário (ex: "12,5") sem o React reformatar com ponto no meio.
  const [descontoPercentText, setDescontoPercentText] = useState<string | null>(null);
  // Mesma técnica para o campo de quantidade do item (ex: "2," digitando os
  // decimais de "2,5") — sem isso, o valor derivado de volta pelo parser a
  // cada tecla apaga a vírgula/ponto que o usuário acabou de digitar.
  const [qtyText, setQtyText] = useState<string | null>(null);

  // A lista de itens vive no pai e chega por props; toques rápidos em sequência
  // (antes do re-render) precisam da versão MAIS NOVA, não da capturada no
  // render — senão o 2º toque apagaria o 1º.
  const itensRef = useRef(orc.itens);
  itensRef.current = orc.itens;
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  // ─── "VOCÊ MAIS USA" ─────────────────────────────────────────────
  const carregarSugestoes = useCallback(async (tab: Tab) => {
    setSugestoes(prev => ({ ...prev, [tab]: { estado: 'carregando' } }));
    try {
      const lista = await getCatalogoMaisUsados(tab, 12);
      if (montadoRef.current) setSugestoes(prev => ({ ...prev, [tab]: { estado: 'pronto', lista } }));
    } catch {
      if (montadoRef.current) setSugestoes(prev => ({ ...prev, [tab]: { estado: 'erro' } }));
    }
  }, []);

  const estadoSugestoesDaAba = sugestoes[activeTab];
  useEffect(() => {
    if (!estadoSugestoesDaAba) void carregarSugestoes(activeTab);
  }, [activeTab, estadoSugestoesDaAba, carregarSugestoes]);

  // ─── BUSCA DO CATÁLOGO ───────────────────────────────────────────
  // Busca vazia ('') também é válida: o LIKE '%%' do banco traz o catálogo
  // inteiro (mais usados primeiro), igual ao painel — o técnico já vê tudo ao
  // abrir o modal e só filtra se quiser. A sequência descarta a resposta de uma
  // tecla antiga que chegou depois da mais nova.
  const buscaSeqRef = useRef(0);
  const handleCatalogSearch = useCallback(async (q: string) => {
    setCatalogQuery(q);
    const seq = ++buscaSeqRef.current;
    setEstadoBusca('carregando');
    try {
      const res = activeTab === 'servico' ? await searchServicos(q) : await searchProdutos(q);
      if (!montadoRef.current || seq !== buscaSeqRef.current) return;
      setCatalogResults(res);
      setEstadoBusca('pronto');
    } catch {
      if (!montadoRef.current || seq !== buscaSeqRef.current) return;
      setEstadoBusca('erro');
    }
  }, [activeTab]);

  function openCatalog() {
    setAdicionadosNaSessao(0);
    setShowCatalog(true);
    void handleCatalogSearch('');
  }

  function aplicarAdicao(item: ServicoItem | ProdutoItem, tab: Tab, cortesiaConfirmada = false) {
    const { itens, novoId } = adicionarDoCatalogo(itensRef.current, item, tab, generateId);
    if (cortesiaConfirmada && novoId) onConfirmarItemZero(novoId);
    itensRef.current = itens;
    onChangeItens(itens);
    setAdicionadosNaSessao(n => n + 1);
  }

  /**
   * Põe um item do catálogo no orçamento (do modal OU de um chip de sugestão). O
   * catálogo fica aberto: dá para escolher vários de uma vez, e cada toque soma 1.
   */
  async function addFromCatalog(item: ServicoItem | ProdutoItem, tab: Tab = activeTab) {
    vibrar('selecao');
    const jaEsta = quantidadeNoOrcamento(itensRef.current, item.id, tab) > 0;

    // Item de catálogo cadastrado com preço 0: mesma trava de cortesia/brinde
    // do item manual, para não entrar de graça no orçamento sem o técnico notar.
    if (!jaEsta && item.preco <= 0) {
      const ok = await confirmar({
        titulo: 'Item sem valor: é cortesia?',
        mensagem: `"${item.nome}" está no catálogo com preço R$ 0,00. Confirme só se for mesmo cortesia ou brinde. Se não for, ajuste o preço no catálogo antes.`,
        rotuloConfirmar: 'É cortesia, adicionar',
        rotuloCancelar: 'Cancelar',
      });
      if (ok) aplicarAdicao(item, tab, true);
      return;
    }
    aplicarAdicao(item, tab);
  }

  function addManual() {
    setIsNewItem(true);
    setQtyText(null);
    setEditingItem({
      id: generateId(), tipo: activeTab, catalogoId: '',
      nome: '', preco: 0, quantidade: 1, unidade: 'un', subtotal: 0,
    });
  }

  function closeCatalog() {
    setShowCatalog(false);
    setCatalogQuery('');
    setCatalogResults([]);
  }

  function removeItem(id: string) {
    vibrar('aviso');
    onChangeItens(orc.itens.filter(i => i.id !== id));
  }

  function updateQty(id: string, qty: number) {
    if (qty <= 0) { removeItem(id); return; }
    onChangeItens(orc.itens.map(i => i.id === id ? { ...i, quantidade: qty, subtotal: i.preco * qty } : i));
  }

  function commitEditingItem(item: ItemOrcamento) {
    const withSub = { ...item, subtotal: item.preco * item.quantidade };
    const exists = orc.itens.find(i => i.id === item.id);
    onChangeItens(exists ? orc.itens.map(i => i.id === item.id ? withSub : i) : [...orc.itens, withSub]);
    setEditingItem(null);
  }

  function saveEditingItem() {
    if (!editingItem || !editingItem.nome.trim()) return;
    if (editingItem.preco <= 0 && !itensZeroConfirmados.has(editingItem.id)) {
      Alert.alert(
        'Item sem valor — é cortesia?',
        `"${editingItem.nome.trim()}" está com preço R$ 0,00. Confirme só se for mesmo um item de cortesia/brinde — caso contrário, volte e informe o preço.`,
        [
          { text: 'Voltar e ajustar preço', style: 'cancel' },
          {
            text: 'É cortesia, confirmar',
            onPress: () => {
              onConfirmarItemZero(editingItem.id);
              commitEditingItem(editingItem);
            },
          },
        ],
      );
      return;
    }
    commitEditingItem(editingItem);
  }

  const tabItens = orc.itens.filter(i => i.tipo === activeTab);
  const tabTotal = tabItens.reduce((s, i) => s + i.subtotal, 0);
  const servCount = orc.itens.filter(i => i.tipo === 'servico').length;
  const prodCount = orc.itens.filter(i => i.tipo === 'produto').length;
  const nomeTipo = activeTab === 'servico' ? 'serviço' : 'produto';

  const chips = estadoSugestoesDaAba?.estado === 'pronto'
    ? sugestoesParaAdicionar(estadoSugestoesDaAba.lista, orc.itens, activeTab, 6)
    : [];
  const ultimo = ultimoDoCliente;
  const mostrarRepetir = !!ultimo && orc.itens.length === 0
    && (ultimo.estado !== 'pronto' || !!ultimo.orcamento);

  return (
    <View style={{ flex: 1, backgroundColor: cores.background }}>
      {/* TABS */}
      <View style={styles.tabs}>
        <TabButton label="Serviços" count={servCount} icon="wrench" active={activeTab === 'servico'} onPress={() => setActiveTab('servico')} />
        <TabButton label="Produtos" count={prodCount} icon="package-variant" active={activeTab === 'produto'} onPress={() => setActiveTab('produto')} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* REPETIR O ÚLTIMO ORÇAMENTO DO CLIENTE (só com a lista vazia) */}
        {mostrarRepetir && ultimo ? (
          ultimo.estado === 'carregando' ? (
            <Skeleton height={86} radius={BorderRadius.lg} style={{ marginBottom: Spacing.base }} />
          ) : ultimo.estado === 'erro' ? (
            <View style={[styles.repetirCard, styles.repetirCardErro]} accessibilityRole="alert">
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
              <Text style={[styles.repetirTexto, { flex: 1 }]}>Não consegui ler os orçamentos anteriores deste cliente.</Text>
              <OlliButton label="Tentar de novo" variant="ghost" size="sm" haptic={false} onPress={() => onTentarUltimoDeNovo?.()} />
            </View>
          ) : ultimo.orcamento ? (
            <Aparecer>
              <View style={styles.repetirCard}>
                <View style={styles.repetirIcone}>
                  <MaterialCommunityIcons name="history" size={20} color={cores.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.repetirTitulo}>Repetir o último orçamento</Text>
                  <Text style={styles.repetirTexto} numberOfLines={2}>
                    Nº {formatarNumeroExibicao(ultimo.orcamento.numero)} · {ultimo.orcamento.itens.length} {ultimo.orcamento.itens.length === 1 ? 'item' : 'itens'} · {formatCurrency(ultimo.orcamento.valorTotal)}
                  </Text>
                  <Text style={styles.repetirNota}>Vêm os itens (com os preços daquele orçamento), o desconto e as condições e garantia que ele tinha. Dá para mudar tudo depois.</Text>
                </View>
              </View>
              <OlliButton
                label="Usar estes itens"
                variant="outline"
                size="sm"
                onPress={() => {
                  if (ultimo.estado !== 'pronto' || !ultimo.orcamento) return;
                  // O desconto vem do anterior: o texto local do campo % não pode
                  // ficar mostrando o que foi digitado antes (diria um valor e
                  // aplicaria outro).
                  setDescontoPercentText(null);
                  onRepetirUltimo?.(ultimo.orcamento);
                }}
                icon={<MaterialCommunityIcons name="content-copy" size={16} color={cores.accentLight} />}
                style={styles.repetirBotao}
              />
            </Aparecer>
          ) : null
        ) : null}

        {/* VOCÊ MAIS USA — 1 toque põe o item (sem abrir o catálogo) */}
        {estadoSugestoesDaAba?.estado === 'carregando' ? (
          <View style={styles.sugestoesBloco} accessibilityLabel="Carregando os itens que você mais usa">
            <Skeleton width={110} height={14} />
            <View style={styles.chipsLinha}>
              <Skeleton width={128} height={38} radius={BorderRadius.full} />
              <Skeleton width={104} height={38} radius={BorderRadius.full} />
              <Skeleton width={92} height={38} radius={BorderRadius.full} />
            </View>
          </View>
        ) : estadoSugestoesDaAba?.estado === 'erro' ? (
          <View style={[styles.sugestoesBloco, styles.sugestoesErro]} accessibilityRole="alert">
            <Text style={[styles.sugestoesErroTexto, { flex: 1 }]}>Não consegui ler o catálogo agora.</Text>
            <OlliButton label="Tentar de novo" variant="ghost" size="sm" haptic={false} onPress={() => { void carregarSugestoes(activeTab); }} />
          </View>
        ) : chips.length > 0 ? (
          <View style={styles.sugestoesBloco}>
            <Text style={styles.sugestoesTitulo}>Você mais usa</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chipsLinha}>
              {chips.map(({ item }, i) => (
                <Aparecer key={item.id} indice={i}>
                  <PressableAnimado
                    onPress={() => { void addFromCatalog(item, activeTab); }}
                    style={styles.chip}
                    accessibilityLabel={`Adicionar ${item.nome}, ${formatCurrency(item.preco)}`}
                  >
                    <MaterialCommunityIcons name="plus" size={15} color={cores.primary} />
                    <Text style={styles.chipNome} numberOfLines={1}>{item.nome}</Text>
                    <Text style={styles.chipPreco}>{formatCurrency(item.preco)}</Text>
                  </PressableAnimado>
                </Aparecer>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* LISTA */}
        {tabItens.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name={activeTab === 'servico' ? 'wrench-outline' : 'package-variant-closed'} size={44} color={cores.onSurfaceMuted} />
            <Text style={styles.emptyText}>Nenhum {nomeTipo} adicionado</Text>
          </View>
        ) : tabItens.map((item, idx) => (
          <AnimatedEntrance key={item.id} index={idx}>
            <View style={[styles.itemCard, item.preco <= 0 && styles.itemCardZero]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.nome}</Text>
                {item.descricao ? <Text style={styles.itemDesc} numberOfLines={1}>{item.descricao}</Text> : null}
                <View style={styles.itemPriceRow}>
                  <Text style={[styles.itemPrice, item.preco <= 0 && styles.itemPriceZero]}>{formatCurrency(item.preco)} / {item.unidade}</Text>
                  {item.preco <= 0 && (
                    <View style={styles.zeroBadge}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={12} color={cores.warning} />
                      <Text style={styles.zeroBadgeText}>cortesia</Text>
                    </View>
                  )}
                </View>
                <View style={styles.itemBottom}>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, item.quantidade - 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialCommunityIcons name="minus" size={16} color={cores.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{formatQty(item.quantidade)}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, item.quantidade + 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialCommunityIcons name="plus" size={16} color={cores.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.itemSubtotal}>{formatCurrency(item.subtotal)}</Text>
                </View>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => { setIsNewItem(false); setQtyText(null); setEditingItem(item); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={cores.onSurfaceVariant} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={cores.danger} />
                </TouchableOpacity>
              </View>
            </View>
          </AnimatedEntrance>
        ))}

        {tabItens.length > 0 && (
          <View style={styles.tabTotalBar}>
            <Text style={styles.tabTotalLabel}>Total {activeTab === 'servico' ? 'serviços' : 'produtos'}</Text>
            <ContadorAnimado valor={tabTotal} formato="brl" style={styles.tabTotalValue} />
          </View>
        )}

        {/* AÇÕES */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={openCatalog} activeOpacity={0.8}>
            <MaterialCommunityIcons name="magnify" size={20} color={cores.primary} />
            <Text style={styles.actionBtnLabel}>Do catálogo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: cores.success }]} onPress={addManual} activeOpacity={0.8}>
            <MaterialCommunityIcons name="plus" size={20} color={cores.success} />
            <Text style={[styles.actionBtnLabel, { color: cores.success }]}>Adicionar manual</Text>
          </TouchableOpacity>
        </View>

        {/* DESCONTO — agora funcional */}
        <View style={styles.descontoCard}>
          <View style={styles.descontoHeader}>
            <MaterialCommunityIcons name="tag-outline" size={18} color={cores.onSurfaceVariant} />
            <Text style={styles.descontoTitle}>Desconto</Text>
          </View>
          <View style={styles.descontoRow}>
            <View style={styles.descontoToggle}>
              <TouchableOpacity
                style={[styles.descontoType, orc.descontoTipo === 'valor' && styles.descontoTypeActive]}
                onPress={() => { setDescontoPercentText(null); onChangeOrc({ descontoTipo: 'valor', desconto: 0 }); }}
              >
                <Text style={[styles.descontoTypeLabel, orc.descontoTipo === 'valor' && styles.descontoTypeLabelActive]}>R$</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.descontoType, orc.descontoTipo === 'percentual' && styles.descontoTypeActive]}
                onPress={() => { setDescontoPercentText(null); onChangeOrc({ descontoTipo: 'percentual', desconto: 0 }); }}
              >
                <Text style={[styles.descontoTypeLabel, orc.descontoTipo === 'percentual' && styles.descontoTypeLabelActive]}>%</Text>
              </TouchableOpacity>
            </View>
            {orc.descontoTipo === 'valor' ? (
              <OlliMoneyInput
                value={orc.desconto}
                onChangeValue={v => onChangeOrc({ desconto: Math.max(0, Math.min(orc.subtotal, v)) })}
                containerStyle={{ flex: 1, marginBottom: 0 }}
              />
            ) : (
              <View style={styles.percentField}>
                <TextInput
                  style={styles.percentInput}
                  value={descontoPercentText ?? (orc.desconto ? String(orc.desconto).replace('.', ',') : '')}
                  onChangeText={v => {
                    // Mantém o texto exatamente como o usuário digitou (com vírgula
                    // decimal) enquanto ele digita, evitando o React reformatar
                    // "12,5" para "12.5" a cada tecla.
                    setDescontoPercentText(v);
                    onChangeOrc({ desconto: Math.max(0, Math.min(100, parseNumber(v))) });
                  }}
                  onBlur={() => setDescontoPercentText(null)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={cores.onSurfaceMuted}
                />
                <Text style={styles.percentSign}>%</Text>
              </View>
            )}
          </View>
        </View>

        {/* TOTAL GERAL */}
        <View style={styles.grandTotal}>
          <View>
            <Text style={styles.grandTotalLabel}>Valor total</Text>
            {orc.desconto > 0 && (
              <Text style={styles.grandTotalDiscount}>
                desconto de {orc.descontoTipo === 'percentual' ? `${orc.desconto}%` : formatCurrency(orc.desconto)} aplicado
              </Text>
            )}
          </View>
          <ContadorAnimado valor={orc.valorTotal} formato="brl" style={styles.grandTotalValue} />
        </View>
      </ScrollView>

      {/* MODAL CATÁLOGO */}
      <Modal visible={showCatalog} animationType="slide" onRequestClose={closeCatalog}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{activeTab === 'servico' ? 'Serviços' : 'Produtos'}</Text>
            <TouchableOpacity
              onPress={closeCatalog}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Fechar o catálogo"
            >
              <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: Spacing.base }}>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={22} color={cores.onSurfaceVariant} />
              <TextInput
                style={styles.searchInput}
                placeholder={`Buscar ${nomeTipo}...`}
                value={catalogQuery}
                onChangeText={handleCatalogSearch}
                autoFocus
                placeholderTextColor={cores.onSurfaceMuted}
              />
            </View>
          </View>
          <FlatList
            data={estadoBusca === 'erro' ? [] : catalogResults}
            extraData={orc.itens}
            keyExtractor={i => i.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.base }}
            renderItem={({ item }) => {
              const qtd = quantidadeNoOrcamento(orc.itens, item.id, activeTab);
              return (
                <TouchableOpacity
                  style={styles.catalogItem}
                  onPress={() => { void addFromCatalog(item); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.nome}, ${formatCurrency(item.preco)}${qtd > 0 ? `, ${formatQty(qtd)} no orçamento` : ''}. Toque para adicionar.`}
                >
                  {item.fotoUri ? (
                    <Image source={{ uri: item.fotoUri }} style={styles.catalogThumb} />
                  ) : (
                    <View style={[styles.catalogThumb, styles.catalogThumbPlaceholder]}>
                      <MaterialCommunityIcons name={activeTab === 'servico' ? 'wrench' : 'package-variant'} size={20} color={cores.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.catalogName}>{item.nome}</Text>
                    {item.descricao ? <Text style={styles.catalogDesc} numberOfLines={1}>{item.descricao}</Text> : null}
                  </View>
                  <Text style={styles.catalogPrice}>{formatCurrency(item.preco)}</Text>
                  {qtd > 0 ? (
                    <View style={styles.catalogQtd}>
                      <Text style={styles.catalogQtdTexto}>{formatQty(qtd)}</Text>
                    </View>
                  ) : (
                    <MaterialCommunityIcons name="plus-circle" size={24} color={cores.success} style={{ marginLeft: 8 }} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              estadoBusca === 'carregando' ? (
                <View style={{ gap: 12, paddingTop: 8 }} accessibilityLabel="Carregando o catálogo">
                  <Skeleton height={46} />
                  <Skeleton height={46} />
                  <Skeleton height={46} />
                </View>
              ) : estadoBusca === 'erro' ? (
                <View style={styles.catalogErro} accessibilityRole="alert">
                  <Text style={styles.catalogEmpty}>Não consegui ler o catálogo agora. Nada foi perdido.</Text>
                  <OlliButton label="Tentar de novo" variant="outline" size="sm" onPress={() => { void handleCatalogSearch(catalogQuery); }} />
                </View>
              ) : (
                <Text style={styles.catalogEmpty}>
                  {catalogQuery.length > 0
                    ? 'Nenhum resultado. Feche e use "Adicionar manual".'
                    : `Nenhum ${nomeTipo} cadastrado no catálogo ainda.`}
                </Text>
              )
            }
          />
          <View style={styles.modalFooter}>
            <OlliButton
              label={adicionadosNaSessao > 0
                ? `Pronto · ${adicionadosNaSessao} ${adicionadosNaSessao === 1 ? 'adicionado' : 'adicionados'}`
                : 'Fechar'}
              variant={adicionadosNaSessao > 0 ? 'gradient' : 'outline'}
              size="lg"
              fullWidth
              haptic={false}
              onPress={closeCatalog}
              icon={adicionadosNaSessao > 0 ? <MaterialCommunityIcons name="check" size={20} color="#fff" /> : undefined}
            />
          </View>
        </View>
      </Modal>

      {/* MODAL EDITAR ITEM */}
      <Modal visible={!!editingItem} animationType="slide" onRequestClose={() => setEditingItem(null)}>
        {editingItem && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isNewItem ? 'Novo item' : 'Editar item'}</Text>
              <TouchableOpacity onPress={() => setEditingItem(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.base }} keyboardShouldPersistTaps="handled">
              <OlliInput label="Nome do item" required value={editingItem.nome} onChangeText={v => setEditingItem(p => p ? { ...p, nome: v } : p)} placeholder="Ex: Limpeza de ar condicionado" />
              <OlliInput label="Descrição" value={editingItem.descricao ?? ''} onChangeText={v => setEditingItem(p => p ? { ...p, descricao: v } : p)} placeholder="Detalhe opcional" multiline />
              <View style={styles.rowFields}>
                <OlliMoneyInput
                  label="Preço unitário"
                  value={editingItem.preco}
                  onChangeValue={v => setEditingItem(p => p ? { ...p, preco: v } : p)}
                  error={editingItem.preco <= 0 ? 'Preço R$ 0,00 — só confirme se for cortesia/brinde' : undefined}
                  containerStyle={{ flex: 1, marginRight: 10 }}
                />
                <OlliInput
                  label="Quantidade"
                  value={qtyText ?? (editingItem.quantidade ? formatQty(editingItem.quantidade) : '')}
                  onChangeText={v => {
                    // Preserva o texto exatamente como digitado (com vírgula
                    // decimal) enquanto o usuário digita — mesmo padrão do
                    // campo de desconto percentual, para não apagar a vírgula
                    // recém-digitada a cada tecla.
                    setQtyText(v);
                    setEditingItem(p => p ? { ...p, quantidade: parseNumberPositive(v) } : p);
                  }}
                  onBlur={() => setQtyText(null)}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  containerStyle={{ flex: 1 }}
                />
              </View>
              <Text style={styles.unidadeLabel}>Unidade</Text>
              <View style={styles.unidadesRow}>
                {UNIDADES.map(u => (
                  <TouchableOpacity key={u} style={[styles.unidade, editingItem.unidade === u && styles.unidadeActive]} onPress={() => setEditingItem(p => p ? { ...p, unidade: u } : p)}>
                    <Text style={[styles.unidadeText, editingItem.unidade === u && { color: cores.onPrimary }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Text style={styles.editSubtotal}>Subtotal: {formatCurrency((editingItem.preco || 0) * (editingItem.quantidade || 1))}</Text>
              <OlliButton label="Confirmar item" variant="gradient" size="lg" fullWidth onPress={saveEditingItem} disabled={!editingItem.nome.trim()} icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />} />
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

function TabButton({ label, count, icon, active, onPress }: { label: string; count: number; icon: keyof typeof MaterialCommunityIcons.glyphMap; active: boolean; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress} activeOpacity={0.7}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? cores.primary : cores.onSurfaceMuted} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      {count > 0 && (
        <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, active && { color: cores.onPrimary }]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, gap: 6 },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: c.primary },
  tabLabel: { fontSize: 14, fontWeight: '600', color: c.onSurfaceMuted },
  tabLabelActive: { color: c.primary },
  tabBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.outline, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  tabBadgeActive: { backgroundColor: c.primary },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: c.onSurfaceVariant },

  emptyBox: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 14, color: c.onSurfaceMuted, marginTop: 8 },

  itemCard: {
    flexDirection: 'row', backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: 10, ...sombrasDe(c).sm,
  },
  itemCardZero: { borderWidth: 1.5, borderColor: c.warning, backgroundColor: c.warningLight },
  itemName: { fontSize: 15, fontWeight: '700', color: c.onSurface },
  itemDesc: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  itemPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemPrice: { fontSize: 12, color: c.primary, marginTop: 4, fontWeight: '600' },
  itemPriceZero: { color: c.warning },
  zeroBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full, backgroundColor: c.warningLight, borderWidth: 1, borderColor: c.warning },
  zeroBadgeText: { fontSize: 10, fontWeight: '700', color: c.warning },
  itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: c.primary, justifyContent: 'center', alignItems: 'center' },
  qtyValue: { fontSize: 15, fontWeight: '800', color: c.onSurface, minWidth: 24, textAlign: 'center' },
  itemSubtotal: { fontSize: 16, fontWeight: '800', color: c.primary },
  itemActions: { justifyContent: 'space-between', alignItems: 'center', marginLeft: 12, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: c.outline },

  tabTotalBar: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.primaryContainer, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.base },
  tabTotalLabel: { fontSize: 13, color: c.primary, fontWeight: '600' },
  tabTotalValue: { fontSize: 15, fontWeight: '800', color: c.primary },

  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: c.primary, borderRadius: BorderRadius.md, paddingVertical: 14, backgroundColor: c.surface },
  actionBtnLabel: { fontSize: 13, color: c.primary, fontWeight: '700' },

  descontoCard: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginTop: Spacing.base, ...sombrasDe(c).sm },
  descontoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  descontoTitle: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  descontoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  descontoToggle: { flexDirection: 'row', gap: 6 },
  descontoType: { width: 44, height: 50, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: c.outline, justifyContent: 'center', alignItems: 'center' },
  descontoTypeActive: { backgroundColor: c.primary, borderColor: c.primary },
  descontoTypeLabel: { fontSize: 15, fontWeight: '800', color: c.onSurfaceVariant },
  descontoTypeLabelActive: { color: c.onPrimary },
  percentField: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.outline, borderRadius: BorderRadius.md, paddingHorizontal: 14, backgroundColor: c.surfaceVariant, minHeight: 50 },
  percentInput: { flex: 1, fontSize: 15, color: c.onSurface },
  percentSign: { fontSize: 15, fontWeight: '700', color: c.onSurfaceMuted },

  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.primary, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginTop: Spacing.base, ...sombrasDe(c).md },
  // Branco fixo com alfa (0.82/0.75) sobre o preenchimento primary — agora
  // deriva de onPrimary (branco OU tinta escura, conforme o contraste exigir)
  // via comAlfa, em vez de assumir que o texto sobre a marca é sempre branco.
  grandTotalLabel: { fontSize: 13, color: comAlfa(c.onPrimary, 0.82), fontWeight: '600' },
  grandTotalDiscount: { fontSize: 11, color: comAlfa(c.onPrimary, 0.75), marginTop: 2 },
  grandTotalValue: { ...Typography.displaySerif, color: c.onPrimary },

  modal: { flex: 1, backgroundColor: c.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.onSurface },
  modalFooter: { padding: Spacing.base, paddingBottom: 28, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  editSubtotal: { textAlign: 'right', fontSize: 16, fontWeight: '800', color: c.primary, marginBottom: 12 },

  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.base, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: c.outline },
  searchInput: { flex: 1, fontSize: 16, color: c.onSurface },
  catalogItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.outline },
  catalogThumb: { width: 46, height: 46, borderRadius: BorderRadius.md },
  catalogThumbPlaceholder: { backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  catalogName: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  catalogDesc: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  catalogPrice: { fontSize: 14, fontWeight: '700', color: c.primary },
  catalogEmpty: { textAlign: 'center', color: c.onSurfaceMuted, padding: 32, fontSize: 14 },
  catalogErro: { alignItems: 'center', gap: 4, paddingBottom: 16 },
  catalogQtd: {
    marginLeft: 8, minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 6,
    backgroundColor: c.success, alignItems: 'center', justifyContent: 'center',
  },
  catalogQtdTexto: { fontSize: 12, fontWeight: '800', color: c.onPrimary },

  repetirCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 11,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: comAlfa(c.primary, 0.28),
  },
  repetirCardErro: { alignItems: 'center', borderColor: c.warning, marginBottom: Spacing.base },
  repetirIcone: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: c.primaryContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  repetirTitulo: { fontSize: 14.5, fontWeight: '800', color: c.onSurface },
  repetirTexto: { fontSize: 13, color: c.onSurface, marginTop: 2, fontWeight: '600' },
  repetirNota: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 16 },
  repetirBotao: { marginTop: 8, marginBottom: Spacing.base, alignSelf: 'flex-start' },

  sugestoesBloco: { marginBottom: Spacing.base, gap: 8 },
  sugestoesTitulo: { fontSize: 12, fontWeight: '800', color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.4 },
  sugestoesErro: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sugestoesErroTexto: { fontSize: 13, color: c.onSurfaceVariant },
  chipsLinha: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 260, minHeight: 40,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: c.surface, borderWidth: 1, borderColor: comAlfa(c.primary, 0.35),
  },
  chipNome: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: c.onSurface },
  chipPreco: { fontSize: 12, fontWeight: '700', color: c.primary },

  rowFields: { flexDirection: 'row' },
  unidadeLabel: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant, marginBottom: 8 },
  unidadesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unidade: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: c.outline },
  unidadeActive: { backgroundColor: c.primary, borderColor: c.primary },
  unidadeText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
});

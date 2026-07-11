import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, ActivityIndicator, TextInput, StyleSheet, Image,
  type GestureResponderEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, comAlfa, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { ChipsFiltro, ItemChipFiltro } from '../../components/web/ChipsFiltro';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import { OlliInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
import { PainelOS } from './PainelOS';
import { PainelNovaOS } from './PainelNovaOS';
import { usePermissao } from '../../hooks/usePermissao';
import { useTipoConta } from '../../hooks/useTipoConta';
// Contrato da FRENTE A (PMOC Fase 1) — mesma superfície de serviço consumida
// pela EquipamentoScreen mobile. Nenhuma regra de negócio é reimplementada
// aqui: defaults, preservação do qrToken e soft-delete → lixeira vivem só lá.
import {
  getEquipamentos,
  salvarEquipamento,
  removerEquipamento,
  revogarQr,
  urlEtiqueta,
} from '../../services/equipamentos';
import { getClientes } from '../../database/database';
import { onSyncAplicado } from '../../services/cloudSync';
import { formatDate } from '../../utils/date';
import {
  STATUS_EQUIP_LABELS,
  STATUS_EQUIP_CORES,
  CATEGORIAS_HVAC,
} from '../../types';
import type {
  Equipamento,
  SituacaoEquipamento,
  CriticidadeEquipamento,
  CategoriaHvac,
  Cliente,
} from '../../types';
import { avisar, confirmar } from './dialogo';

type LinhaEquipamento = Equipamento & { clienteNome?: string };
type FiltroSituacao = SituacaoEquipamento | 'todas';

/** Mesma ordem lógica de vida do ativo usada na EquipamentoScreen mobile —
 * derivada das chaves de STATUS_EQUIP_LABELS (fonte única) em vez de
 * duplicar o array ali definido. */
const SITUACOES_ORDEM = Object.keys(STATUS_EQUIP_LABELS) as SituacaoEquipamento[];

/**
 * Criticidades (id + rótulo + cor) — mesmo mapeamento da EquipamentoScreen
 * mobile (função, não array de módulo: cor depende do tema em uso). 'Alta'
 * usa um laranja fixo porque a rampa de severidade PMOC ainda não tem token
 * próprio no tema — mantido idêntico à mobile para as duas telas concordarem.
 */
function criarCriticidades(c: Cores): { id: CriticidadeEquipamento; label: string; cor: string }[] {
  return [
    { id: 'baixa', label: 'Baixa', cor: c.onSurfaceVariant },
    { id: 'media', label: 'Média', cor: c.warning },
    { id: 'alta', label: 'Alta', cor: '#F97316' },
    { id: 'critica', label: 'Crítica', cor: c.danger },
  ];
}

/** Rótulo curto da categoria a partir do id (texto livre → melhor esforço). */
function labelCategoria(id?: string): string {
  if (!id) return '';
  const found = CATEGORIAS_HVAC.find((c) => c.id === id);
  return found ? found.label : id;
}

/** Ícone da categoria (fallback para um genérico de ar-condicionado). */
function iconeCategoria(id?: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const found = CATEGORIAS_HVAC.find((c) => c.id === id);
  return (found?.icon as keyof typeof MaterialCommunityIcons.glyphMap) ?? 'air-conditioner';
}

/** "9.000 BTU" a partir do número (vazio se ausente/inválido). */
function formatarBtu(v?: number): string {
  if (typeof v !== 'number' || Number.isNaN(v) || v <= 0) return '';
  return `${v.toLocaleString('pt-BR')} BTU`;
}

/** Nome de exibição do equipamento: fabricante+modelo, senão a categoria. */
function nomeEquipamento(e: Equipamento): string {
  return [e.fabricante, e.modelo].filter(Boolean).join(' ') || labelCategoria(e.categoria) || 'Equipamento';
}

/** Linha secundária: "Split · 9.000 BTU". */
function subEquipamento(e: Equipamento): string {
  return [labelCategoria(e.categoria), formatarBtu(e.capacidadeBtu)].filter(Boolean).join(' · ');
}

/**
 * Equipamentos desktop (v4) — tabela densa com chips de situação (ChipsFiltro)
 * e painel lateral de criação/edição, no mesmo idioma de ClientesDesktopScreen.
 * A coluna QR é o momento-uau do inventário: estado da etiqueta à vista, um
 * clique abre o link pronto pra imprimir. "Nova OS" reaproveita o mesmo par
 * PainelNovaOS/PainelOS já usado em OrdensDesktopScreen — sem reinventar o
 * fluxo de criação de ordem aqui.
 */
export default function EquipamentosDesktopScreen() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { papel, pode, carregando: carregandoPapel } = usePermissao();
  const { org } = useTipoConta();
  // Fail-closed enquanto o papel não resolveu (mesmo padrão de
  // OrdensDesktopScreen/OrdemServicoScreen.tsx:221): "não sei" nunca vale
  // mais que "sou técnico", senão `undefined !== 'tecnico'` liberava
  // "Nova ordem de serviço" pro técnico antes da leitura do papel terminar.
  const ehGestao = !carregandoPapel && papel !== 'tecnico';
  // Mesma regra do DetalheOS mobile: só quem é gestão E tem a permissão de
  // ver a agenda de toda a equipe pode reatribuir técnico dentro do PainelOS.
  const podeAtribuir = ehGestao && pode('ver_agenda_equipe');

  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroSituacao>('todas');

  const [equipamentoEditando, setEquipamentoEditando] = useState<Equipamento | null>(null);
  const [painelVisivel, setPainelVisivel] = useState(false);
  const [etiquetaAlvo, setEtiquetaAlvo] = useState<Equipamento | null>(null);

  // Fluxo "Nova OS" a partir de um equipamento — mesmo par de painéis da
  // OrdensDesktopScreen: cria (PainelNovaOS) e já abre o detalhe (PainelOS).
  const [novaOsVisivel, setNovaOsVisivel] = useState(false);
  const [osDetalheId, setOsDetalheId] = useState<string | null>(null);
  const [osDetalheVisivel, setOsDetalheVisivel] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [eqs, cls] = await Promise.all([getEquipamentos(), getClientes()]);
      eqs.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
      setEquipamentos(eqs);
      setClientes(cls);
    } catch {
      setEquipamentos([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);

  const clientesPorId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of clientes) mapa.set(c.id, c.nome);
    return mapa;
  }, [clientes]);

  const contagemPorSituacao = useMemo(() => {
    const mapa = new Map<SituacaoEquipamento, number>();
    for (const e of equipamentos) mapa.set(e.situacao, (mapa.get(e.situacao) ?? 0) + 1);
    return mapa;
  }, [equipamentos]);

  const itensChips: ItemChipFiltro<FiltroSituacao>[] = useMemo(() => [
    { chave: 'todas', rotulo: 'Todos', contagem: equipamentos.length },
    ...SITUACOES_ORDEM.map((s) => ({
      chave: s as FiltroSituacao,
      rotulo: STATUS_EQUIP_LABELS[s],
      cor: STATUS_EQUIP_CORES[s],
      contagem: contagemPorSituacao.get(s) ?? 0,
    })),
  ], [equipamentos.length, contagemPorSituacao]);

  const linhas: LinhaEquipamento[] = useMemo(() => {
    let r: LinhaEquipamento[] = equipamentos.map((e) => ({
      ...e,
      clienteNome: e.clienteId ? clientesPorId.get(e.clienteId) : undefined,
    }));
    if (filtro !== 'todas') r = r.filter((e) => e.situacao === filtro);
    if (busca.trim()) {
      const q = normalizarBusca(busca);
      r = r.filter((e) =>
        normalizarBusca(e.codigoInterno ?? '').includes(q) ||
        normalizarBusca(e.numeroSerie ?? '').includes(q) ||
        normalizarBusca(e.patrimonio ?? '').includes(q) ||
        normalizarBusca(e.fabricante ?? '').includes(q) ||
        normalizarBusca(e.modelo ?? '').includes(q) ||
        normalizarBusca(e.localizacao ?? '').includes(q) ||
        normalizarBusca(e.clienteNome ?? '').includes(q)
      );
    }
    return r;
  }, [equipamentos, clientesPorId, filtro, busca]);

  function abrirNovo() {
    setEquipamentoEditando(null);
    setPainelVisivel(true);
  }

  function abrirEdicao(e: Equipamento) {
    setEquipamentoEditando(e);
    setPainelVisivel(true);
  }

  const colunas: Coluna<LinhaEquipamento>[] = useMemo(() => [
    {
      chave: 'codigo',
      titulo: 'Código',
      largura: 110,
      ordenavel: true,
      valorOrdenacao: (e) => e.codigoInterno ?? '',
      render: (e) => <Text style={styles.celulaTexto} numberOfLines={1}>{e.codigoInterno || '—'}</Text>,
    },
    {
      chave: 'equipamento',
      titulo: 'Equipamento',
      largura: '20%',
      ordenavel: true,
      valorOrdenacao: (e) => nomeEquipamento(e),
      render: (e) => (
        <View style={styles.equipCelula}>
          <View style={styles.equipIcone}>
            <MaterialCommunityIcons name={iconeCategoria(e.categoria)} size={16} color={cores.accentLight} />
          </View>
          <View style={styles.equipTextos}>
            <Text style={styles.celulaTexto} numberOfLines={1}>{nomeEquipamento(e)}</Text>
            {subEquipamento(e) ? <Text style={styles.celulaSub} numberOfLines={1}>{subEquipamento(e)}</Text> : null}
          </View>
        </View>
      ),
      tituloCompleto: (e) => [nomeEquipamento(e), subEquipamento(e)].filter(Boolean).join(' — '),
    },
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (e) => e.clienteNome ?? '',
      render: (e) => <Text style={styles.celulaTexto} numberOfLines={1}>{e.clienteNome || '—'}</Text>,
      tituloCompleto: (e) => e.clienteNome,
    },
    {
      chave: 'localizacao',
      titulo: 'Localização',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (e) => e.localizacao ?? '',
      render: (e) => <Text style={styles.celulaTexto} numberOfLines={1}>{e.localizacao || '—'}</Text>,
      tituloCompleto: (e) => e.localizacao,
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      largura: 160,
      ordenavel: true,
      valorOrdenacao: (e) => STATUS_EQUIP_LABELS[e.situacao],
      render: (e) => <SituacaoChip situacao={e.situacao} />,
    },
    {
      chave: 'criticidade',
      titulo: 'Criticidade',
      largura: 110,
      ordenavel: true,
      valorOrdenacao: (e) => (e.criticidade ? criarCriticidades(cores).find((c) => c.id === e.criticidade)?.label ?? '' : ''),
      render: (e) => <CriticidadeChip criticidade={e.criticidade} />,
    },
    {
      chave: 'qr',
      titulo: 'QR',
      largura: 56,
      render: (e) => <QrCelula equipamento={e} onAbrir={() => setEtiquetaAlvo(e)} />,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: ehGestao ? 130 : 90,
      render: (e) => (
        <View style={styles.acoesLinha}>
          <AcaoIcone icone="qrcode" rotulo="Etiqueta / QR" onPress={() => setEtiquetaAlvo(e)} />
          {ehGestao && (
            <AcaoIcone icone="clipboard-plus-outline" rotulo="Nova ordem de serviço" onPress={() => setNovaOsVisivel(true)} />
          )}
          <AcaoIcone icone="pencil-outline" rotulo="Editar" onPress={() => abrirEdicao(e)} />
        </View>
      ),
    },
  ], [cores, styles, ehGestao]);

  const totalInterditados = useMemo(() => equipamentos.filter((e) => e.situacao === 'interditado').length, [equipamentos]);
  const subtitulo = `${equipamentos.length} equipamento${equipamentos.length === 1 ? '' : 's'}`
    + (totalInterditados > 0 ? ` · ${totalInterditados} interditado${totalInterditados === 1 ? '' : 's'}` : '');

  return (
    <LayoutDesktop
      titulo="Equipamentos"
      subtitulo={subtitulo}
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por código, série, marca, local ou cliente…" largura={300} />
          <Pressable
            onPress={abrirNovo}
            accessibilityRole="button"
            accessibilityLabel="Novo equipamento"
            style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={cores.onPrimary} />
            <Text style={styles.botaoNovoLabel}>Novo equipamento</Text>
          </Pressable>
        </>
      }
    >
      <ChipsFiltro<FiltroSituacao> itens={itensChips} selecionado={filtro} aoSelecionar={setFiltro} />

      <TabelaDados<LinhaEquipamento>
        colunas={colunas}
        dados={linhas}
        carregando={carregando}
        aoClicarLinha={(e) => abrirEdicao(e)}
        ordenacaoInicial={{ chave: 'equipamento', direcao: 'asc' }}
        vazio={
          <EmptyState
            icon="air-conditioner"
            title={busca || filtro !== 'todas' ? 'Nada por aqui' : 'Nenhum equipamento ainda'}
            subtitle={
              busca || filtro !== 'todas'
                ? 'Nenhum equipamento bate com esse filtro. Tente outra busca.'
                : 'Cadastre o primeiro ar-condicionado do inventário e gere a etiqueta QR para a porta.'
            }
            actionLabel={!busca && filtro === 'todas' ? 'Novo equipamento' : undefined}
            onAction={!busca && filtro === 'todas' ? abrirNovo : undefined}
          />
        }
      />

      <PainelEquipamento
        equipamento={equipamentoEditando}
        clientes={clientes}
        visivel={painelVisivel}
        aoFechar={() => setPainelVisivel(false)}
        aoSalvar={carregar}
      />

      {etiquetaAlvo && (
        <EtiquetaModal
          equipamento={etiquetaAlvo}
          onFechar={() => setEtiquetaAlvo(null)}
          onRevogado={carregar}
        />
      )}

      {ehGestao && (
        <PainelNovaOS
          visivel={novaOsVisivel}
          aoFechar={() => setNovaOsVisivel(false)}
          aoCriada={(id) => {
            setNovaOsVisivel(false);
            setOsDetalheId(id);
            setOsDetalheVisivel(true);
          }}
        />
      )}

      <PainelOS
        ordemId={osDetalheId}
        orgId={org?.id}
        ehGestao={ehGestao}
        podeAtribuir={podeAtribuir}
        visivel={osDetalheVisivel}
        aoFechar={() => setOsDetalheVisivel(false)}
        aoMudou={() => {}}
      />
    </LayoutDesktop>
  );
}

/** Chip com dot colorido — mesmos tokens (STATUS_EQUIP_CORES/LABELS) da situação na mobile. */
function SituacaoChip({ situacao }: { situacao: SituacaoEquipamento }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = STATUS_EQUIP_CORES[situacao] ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.situacaoChip, { backgroundColor: comAlfa(cor, 0.14), borderColor: comAlfa(cor, 0.4) }]}>
      <View style={[styles.situacaoDot, { backgroundColor: cor }]} />
      <Text style={[styles.situacaoTexto, { color: cor }]} numberOfLines={1}>{STATUS_EQUIP_LABELS[situacao]}</Text>
    </View>
  );
}

function CriticidadeChip({ criticidade }: { criticidade?: CriticidadeEquipamento }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  if (!criticidade) return <Text style={styles.celulaTexto}>—</Text>;
  const item = criarCriticidades(cores).find((c) => c.id === criticidade);
  const cor = item?.cor ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.critChip, { backgroundColor: comAlfa(cor, 0.14), borderColor: comAlfa(cor, 0.4) }]}>
      <Text style={[styles.critTexto, { color: cor }]} numberOfLines={1}>{item?.label ?? criticidade}</Text>
    </View>
  );
}

/**
 * Estado da etiqueta QR à vista na tabela — o momento-uau do inventário:
 * normal (clicável, abre a etiqueta), riscado (revogado) ou fantasma (token
 * ainda vazio, aguardando o 1º sync que o banco gera).
 */
function QrCelula({ equipamento, onAbrir }: { equipamento: Equipamento; onAbrir: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (equipamento.qrRevogadoEm) {
    return (
      <Pressable
        onPress={(e: GestureResponderEvent) => { e.stopPropagation(); onAbrir(); }}
        accessibilityRole="button"
        accessibilityLabel="QR revogado — ver etiqueta"
        style={({ hovered, focused }: PressableWebState) => [styles.qrBotao, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
      >
        <MaterialCommunityIcons name="qrcode-remove" size={19} color={cores.danger} />
      </Pressable>
    );
  }
  if (!equipamento.qrToken) {
    return (
      <View style={styles.qrBotao} accessible accessibilityLabel="QR aguardando sincronização">
        <MaterialCommunityIcons name="qrcode" size={19} color={cores.onSurfaceMuted} style={{ opacity: 0.4 }} />
      </View>
    );
  }
  return (
    <Pressable
      onPress={(e: GestureResponderEvent) => { e.stopPropagation(); onAbrir(); }}
      accessibilityRole="button"
      accessibilityLabel="Ver etiqueta QR"
      style={({ hovered, focused }: PressableWebState) => [styles.qrBotao, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
    >
      <MaterialCommunityIcons name="qrcode" size={19} color={cores.accentLight} />
    </Pressable>
  );
}

function AcaoIcone({ icone, rotulo, onPress }: { icone: keyof typeof MaterialCommunityIcons.glyphMap; rotulo: string; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      // Sem stopPropagation, o clique num ícone de ação também dispara o
      // aoClicarLinha da TabelaDados (abre o painel de edição por cima).
      onPress={(e: GestureResponderEvent) => { e.stopPropagation(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [styles.acaoIcone, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
    >
      <MaterialCommunityIcons name={icone} size={17} color={cores.onSurfaceVariant} />
    </Pressable>
  );
}

/**
 * Modal central com o link pronto pra imprimir + revogar — mesma regra da
 * EtiquetaSheet/confirmarRevogar da mobile (urlEtiqueta/revogarQr), casca de
 * card centralizado em vez de bottom-sheet.
 */
function EtiquetaModal({ equipamento, onFechar, onRevogado }: {
  equipamento: Equipamento;
  onFechar: () => void;
  onRevogado: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [revogando, setRevogando] = useState(false);
  const url = urlEtiqueta(equipamento.qrToken);

  async function copiar() {
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        avisar('Copiado', 'O link da etiqueta foi copiado.');
        return;
      }
    } catch {
      // sem permissão de clipboard no navegador — mostra o link pra copiar à mão
    }
    avisar('Link da etiqueta', url);
  }

  async function revogar() {
    if (!(await confirmar('Revogar QR?', 'A etiqueta atual deixa de funcionar: quem escanear verá que foi revogado. Esta ação não pode ser desfeita pelo app.'))) return;
    setRevogando(true);
    try {
      await revogarQr(equipamento.id);
      onRevogado();
      onFechar();
    } catch {
      avisar('Não deu', 'Não foi possível revogar o QR agora.');
    } finally {
      setRevogando(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFechar}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.etiquetaCard}>
          <View style={styles.etiquetaHeader}>
            <Text style={styles.etiquetaTitulo}>Etiqueta / QR</Text>
            <Pressable onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurface} />
            </Pressable>
          </View>
          <Text style={styles.etiquetaSub} numberOfLines={1}>{nomeEquipamento(equipamento)}</Text>

          {equipamento.qrRevogadoEm ? (
            <View style={styles.qrRevogadoBox}>
              <MaterialCommunityIcons name="qrcode-remove" size={22} color={cores.danger} />
              <Text style={styles.qrRevogadoTexto}>
                QR revogado em {formatDate(equipamento.qrRevogadoEm)}. Gere uma nova etiqueta com a equipe responsável para voltar a usar o scan.
              </Text>
            </View>
          ) : equipamento.qrToken ? (
            <>
              <View style={styles.qrIconWrap}>
                <MaterialCommunityIcons name="qrcode" size={64} color={cores.accentLight} />
              </View>
              <View style={styles.urlBox}>
                <Text style={styles.urlTexto} numberOfLines={2} selectable>{url}</Text>
              </View>
              <Pressable
                onPress={copiar}
                accessibilityRole="button"
                accessibilityLabel="Copiar link da etiqueta"
                style={({ hovered, focused }: PressableWebState) => [styles.etiquetaBotao, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
              >
                <MaterialCommunityIcons name="content-copy" size={18} color={cores.accentLight} />
                <Text style={styles.etiquetaBotaoTexto}>Copiar link</Text>
              </Pressable>
              <Pressable
                onPress={revogar}
                disabled={revogando}
                accessibilityRole="button"
                accessibilityLabel="Revogar QR"
                style={({ hovered, focused }: PressableWebState) => [styles.botaoRevogar, hovered && styles.botaoRevogarHover, focused && styles.focoVisivel]}
              >
                {revogando ? <ActivityIndicator size="small" color={cores.danger} /> : <MaterialCommunityIcons name="qrcode-remove" size={18} color={cores.danger} />}
                <Text style={styles.botaoRevogarTexto}>Revogar QR</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.vazioTexto}>
              A etiqueta é gerada assim que o equipamento sincroniza com a nuvem pela primeira vez. Fique online um instante e volte aqui.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Painel lateral direito (420px) de criação/edição de equipamento — mesma
 * regra de persistência/validação da EquipamentoScreen mobile
 * (salvarEquipamento/removerEquipamento; exclusão vai pra lixeira, não é
 * definitiva), só a casca de UI muda (painel lateral em vez de tela cheia).
 * Fotos já anexadas aparecem só como leitura (miniaturas): captura por
 * câmera/galeria é fluxo de campo (utils/fotosOrcamento é NATIVO — não roda
 * na web, ver o próprio arquivo) e continua fora daqui.
 */
function PainelEquipamento({ equipamento, clientes, visivel, aoFechar, aoSalvar }: {
  equipamento: Equipamento | null;
  clientes: Cliente[];
  visivel: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const CRITICIDADES = useMemo(() => criarCriticidades(cores), [cores]);

  const [categoria, setCategoria] = useState<CategoriaHvac | undefined>(undefined);
  const [codigoInterno, setCodigoInterno] = useState('');
  const [fabricante, setFabricante] = useState('');
  const [modelo, setModelo] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [patrimonio, setPatrimonio] = useState('');
  const [capacidadeBtu, setCapacidadeBtu] = useState('');
  const [tensao, setTensao] = useState('');
  const [refrigerante, setRefrigerante] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [criticidade, setCriticidade] = useState<CriticidadeEquipamento | undefined>(undefined);
  const [situacao, setSituacao] = useState<SituacaoEquipamento>('ativo');
  const [clienteId, setClienteId] = useState<string | undefined>(undefined);

  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const ehNovo = !equipamento;

  useEffect(() => {
    if (!visivel) return;
    setCategoria(equipamento?.categoria as CategoriaHvac | undefined);
    setCodigoInterno(equipamento?.codigoInterno ?? '');
    setFabricante(equipamento?.fabricante ?? '');
    setModelo(equipamento?.modelo ?? '');
    setNumeroSerie(equipamento?.numeroSerie ?? '');
    setPatrimonio(equipamento?.patrimonio ?? '');
    setCapacidadeBtu(typeof equipamento?.capacidadeBtu === 'number' ? String(equipamento.capacidadeBtu) : '');
    setTensao(equipamento?.tensao ?? '');
    setRefrigerante(equipamento?.refrigerante ?? '');
    setLocalizacao(equipamento?.localizacao ?? '');
    setCriticidade(equipamento?.criticidade);
    setSituacao(equipamento?.situacao ?? 'ativo');
    setClienteId(equipamento?.clienteId);
  }, [visivel, equipamento]);

  function onBtuChange(v: string) {
    setCapacidadeBtu(v.replace(/\D/g, ''));
  }

  async function handleSalvar() {
    // Um cadastro mínimo útil precisa de ALGO que identifique o ativo (mesma
    // regra da mobile): categoria OU código OU série.
    const temIdentificacao = !!categoria || !!codigoInterno.trim() || !!numeroSerie.trim();
    if (!temIdentificacao) {
      avisar('Falta identificar', 'Escolha a categoria ou informe um código/número de série para cadastrar o equipamento.');
      return;
    }
    const btu = capacidadeBtu ? parseInt(capacidadeBtu, 10) : undefined;
    setSalvando(true);
    try {
      await salvarEquipamento({
        id: equipamento?.id,
        categoria,
        codigoInterno: codigoInterno.trim() || undefined,
        fabricante: fabricante.trim() || undefined,
        modelo: modelo.trim() || undefined,
        numeroSerie: numeroSerie.trim() || undefined,
        patrimonio: patrimonio.trim() || undefined,
        capacidadeBtu: btu && !Number.isNaN(btu) ? btu : undefined,
        tensao: tensao.trim() || undefined,
        refrigerante: refrigerante.trim() || undefined,
        localizacao: localizacao.trim() || undefined,
        criticidade,
        situacao,
        clienteId: clienteId || undefined,
      });
      aoSalvar();
      aoFechar();
    } catch (e: any) {
      avisar('Não deu', e?.message ?? 'Não consegui salvar o equipamento agora.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir() {
    if (!equipamento) return;
    if (!(await confirmar('Excluir equipamento', `Excluir "${nomeEquipamento(equipamento)}"? Ele vai para a lixeira — dá para restaurar por lá.`))) return;
    setExcluindo(true);
    try {
      await removerEquipamento(equipamento.id);
      aoSalvar();
      aoFechar();
    } catch {
      avisar('Erro', 'Não foi possível excluir agora. Tente novamente.');
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.raiz}>
        <Pressable style={styles.fundoClicavel} onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.painel}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>{ehNovo ? 'Novo equipamento' : 'Editar equipamento'}</Text>
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
            <View>
              <Text style={styles.formLabel}>Categoria</Text>
              <View style={styles.chipsWrap}>
                {CATEGORIAS_HVAC.map((c) => {
                  const ativo = categoria === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCategoria(ativo ? undefined : c.id)}
                      accessibilityRole="button"
                      accessibilityLabel={c.label}
                      style={({ hovered, focused }: PressableWebState) => [styles.catChip, ativo && styles.catChipActive, hovered && !ativo && styles.chipHover, focused && styles.focoVisivel]}
                    >
                      <MaterialCommunityIcons
                        name={c.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                        size={14}
                        color={ativo ? cores.accentLight : cores.onSurfaceVariant}
                      />
                      <Text style={[styles.catChipText, ativo && styles.catChipTextActive]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <OlliInput label="Código interno" value={codigoInterno} onChangeText={setCodigoInterno} placeholder="Ex.: AC-014" leftIcon="tag-outline" autoCapitalize="characters" />
            <OlliInput label="Fabricante" value={fabricante} onChangeText={setFabricante} placeholder="Ex.: Fujitsu, LG, Daikin" leftIcon="factory" />
            <OlliInput label="Modelo" value={modelo} onChangeText={setModelo} placeholder="Ex.: Inverter 12k" leftIcon="cog-outline" />
            <OlliInput label="Número de série" value={numeroSerie} onChangeText={setNumeroSerie} placeholder="Nº de série da placa" leftIcon="barcode" autoCapitalize="characters" />
            <OlliInput label="Patrimônio" value={patrimonio} onChangeText={setPatrimonio} placeholder="Código/patrimônio do cliente" leftIcon="clipboard-list-outline" />
            <OlliInput label="Capacidade (BTU/h)" value={capacidadeBtu} onChangeText={onBtuChange} placeholder="Ex.: 9000" leftIcon="snowflake" keyboardType="numeric" />
            <OlliInput label="Tensão" value={tensao} onChangeText={setTensao} placeholder="Ex.: 220V, 380V trifásico" leftIcon="flash-outline" />
            <OlliInput label="Refrigerante" value={refrigerante} onChangeText={setRefrigerante} placeholder="Ex.: R410A, R32" leftIcon="water-outline" autoCapitalize="characters" />
            <OlliInput label="Localização" value={localizacao} onChangeText={setLocalizacao} placeholder="Ex.: Sala 302 - 3º andar" leftIcon="map-marker-outline" />

            <View>
              <Text style={styles.formLabel}>Criticidade</Text>
              <View style={styles.chipsWrap}>
                {CRITICIDADES.map((c) => {
                  const ativo = criticidade === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCriticidade(ativo ? undefined : c.id)}
                      accessibilityRole="button"
                      accessibilityLabel={c.label}
                      style={({ hovered, focused }: PressableWebState) => [styles.selChip, ativo && { backgroundColor: comAlfa(c.cor, 0.16), borderColor: c.cor }, hovered && !ativo && styles.chipHover, focused && styles.focoVisivel]}
                    >
                      <Text style={[styles.selChipText, ativo && { color: c.cor }]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={styles.formLabel}>Situação</Text>
              <View style={styles.chipsWrap}>
                {SITUACOES_ORDEM.map((s) => {
                  const ativo = situacao === s;
                  const cor = STATUS_EQUIP_CORES[s] ?? cores.primary;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setSituacao(s)}
                      accessibilityRole="button"
                      accessibilityLabel={STATUS_EQUIP_LABELS[s]}
                      style={({ hovered, focused }: PressableWebState) => [styles.selChip, ativo && { backgroundColor: comAlfa(cor, 0.16), borderColor: cor }, hovered && !ativo && styles.chipHover, focused && styles.focoVisivel]}
                    >
                      <Text style={[styles.selChipText, ativo && { color: cor }]}>{STATUS_EQUIP_LABELS[s]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.caveatTexto}>
                A situação é o estado operacional do equipamento — não uma declaração de conformidade com o PMOC ou norma legal.
              </Text>
            </View>

            {/* Fotos já anexadas — só leitura aqui: a captura (câmera/galeria) é
                fluxo de campo, feito no app pela EquipamentoScreen mobile. */}
            {!ehNovo && !!equipamento?.fotos.length && (
              <View>
                <Text style={styles.formLabel}>Fotos anexadas</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.fotosLinha}>
                    {equipamento.fotos.map((uri) => (
                      <Image key={uri} source={{ uri }} style={styles.fotoThumb} />
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <View>
              <Text style={styles.formLabel}>Cliente (opcional)</Text>
              <SeletorClientePainel
                clientes={clientes}
                clienteId={clienteId}
                onSelecionar={setClienteId}
                onLimpar={() => setClienteId(undefined)}
              />
            </View>
          </ScrollView>

          <View style={styles.rodape}>
            {!ehNovo && (
              <Pressable
                onPress={handleExcluir}
                disabled={excluindo}
                accessibilityRole="button"
                accessibilityLabel="Excluir equipamento"
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
              label={ehNovo ? 'Cadastrar equipamento' : 'Salvar alterações'}
              variant="gradient"
              size="lg"
              fullWidth
              loading={salvando}
              onPress={handleSalvar}
              icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />}
              style={styles.botaoSalvar}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Busca + lista filtrada inline (client-side, sobre a lista de clientes já
 * carregada pela tela) — versão desktop do SeletorCliente da mobile, sem o
 * sheet full-screen. */
function SeletorClientePainel({ clientes, clienteId, onSelecionar, onLimpar }: {
  clientes: Cliente[];
  clienteId?: string;
  onSelecionar: (id: string) => void;
  onLimpar: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const clienteAtual = clientes.find((c) => c.id === clienteId);

  const filtrados = useMemo(() => {
    const q = normalizarBusca(busca);
    const base = q ? clientes.filter((c) => normalizarBusca(c.nome).includes(q)) : clientes;
    return base.slice(0, 8);
  }, [clientes, busca]);

  if (clienteAtual) {
    return (
      <View style={styles.clienteSel}>
        <MaterialCommunityIcons name="account-check" size={18} color={cores.success} />
        <Text style={styles.clienteSelNome} numberOfLines={1}>{clienteAtual.nome}</Text>
        <Pressable onPress={onLimpar} accessibilityRole="button" accessibilityLabel="Remover cliente vinculado" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="close-circle" size={20} color={cores.danger} />
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.buscaClienteBox, aberto && styles.buscaClienteBoxFocado]}>
        <MaterialCommunityIcons name="account-search-outline" size={18} color={cores.onSurfaceVariant} />
        <TextInput
          value={busca}
          onChangeText={setBusca}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          placeholder="Buscar cliente pelo nome…"
          placeholderTextColor={cores.onSurfaceMuted}
          style={styles.buscaClienteInput}
        />
      </View>
      {aberto && filtrados.length > 0 && (
        <View style={styles.listaClientes}>
          {filtrados.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => { onSelecionar(c.id); setBusca(''); setAberto(false); }}
              accessibilityRole="button"
              accessibilityLabel={c.nome}
              style={({ hovered }: PressableWebState) => [styles.itemCliente, hovered && styles.itemClienteHover]}
            >
              <Text style={styles.itemClienteNome} numberOfLines={1}>{c.nome}</Text>
              <Text style={styles.itemClienteSub} numberOfLines={1}>{c.telefone || 'Sem telefone'}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  botaoNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: c.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  botaoNovoHover: {
    backgroundColor: c.primaryLight,
  },
  botaoNovoLabel: {
    ...Typography.button,
    color: c.onPrimary,
    fontSize: 13,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
  },
  celulaSub: {
    ...Typography.caption,
    color: c.onSurfaceVariant,
    marginTop: 1,
  },
  equipCelula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 0,
  },
  equipIcone: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equipTextos: {
    flexShrink: 1,
    minWidth: 0,
  },

  situacaoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  situacaoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  situacaoTexto: {
    fontSize: 11,
    fontWeight: '800',
  },

  critChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  critTexto: {
    fontSize: 11,
    fontWeight: '800',
  },

  qrBotao: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  acoesLinha: {
    flexDirection: 'row',
    gap: 2,
  },
  acaoIcone: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoIconeHover: {
    backgroundColor: c.surfacePressed,
  },

  // ─── Painel lateral (criar/editar) ───────────────────────────────────────
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
    gap: Spacing.md,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.onSurfaceVariant,
    marginBottom: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chipHover: {
    backgroundColor: c.surfacePressed,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: c.outline,
  },
  catChipActive: {
    backgroundColor: c.accentContainer,
    borderColor: c.accent,
  },
  catChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.onSurfaceVariant,
  },
  catChipTextActive: {
    color: c.accentLight,
  },
  selChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: c.outline,
  },
  selChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.onSurfaceVariant,
  },
  caveatTexto: {
    ...Typography.caption,
    color: c.onSurfaceMuted,
    marginTop: 8,
    lineHeight: 16,
  },

  fotosLinha: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  fotoThumb: {
    width: 88,
    height: 88,
    borderRadius: BorderRadius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
  },

  clienteSel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.successLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: c.success,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clienteSelNome: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: c.onSurface,
  },
  buscaClienteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  buscaClienteBoxFocado: {
    borderColor: c.accent,
  },
  buscaClienteInput: {
    ...Typography.body,
    flex: 1,
    color: c.onSurface,
    outlineStyle: 'none' as any,
  },
  listaClientes: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.md,
    backgroundColor: c.surface,
    overflow: 'hidden',
  },
  itemCliente: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
  },
  itemClienteHover: {
    backgroundColor: c.surfacePressed,
  },
  itemClienteNome: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.onSurface,
  },
  itemClienteSub: {
    fontSize: 11.5,
    color: c.onSurfaceVariant,
    marginTop: 1,
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

  // ─── Modal da etiqueta / QR ──────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,12,22,0.60)',
  },
  etiquetaCard: {
    width: 420,
    maxWidth: '90%',
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  etiquetaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  etiquetaTitulo: {
    ...Typography.h3,
    color: c.onSurface,
  },
  etiquetaSub: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
  },
  qrIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  urlBox: {
    backgroundColor: c.surfaceVariant,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.md,
  },
  urlTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
  },
  etiquetaBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
  },
  etiquetaBotaoTexto: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.accentLight,
  },
  botaoRevogar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: c.danger,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
  },
  botaoRevogarHover: {
    backgroundColor: c.dangerLight,
  },
  botaoRevogarTexto: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.danger,
  },
  qrRevogadoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: c.dangerLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: c.danger,
    padding: Spacing.md,
  },
  qrRevogadoTexto: {
    ...Typography.bodySmall,
    color: c.onSurface,
    flex: 1,
    lineHeight: 19,
  },
  vazioTexto: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
    lineHeight: 19,
  },
});

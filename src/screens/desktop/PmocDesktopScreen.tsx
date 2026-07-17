import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import { OlliInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
// Serviço PMOC Fase 2 — mesmo motor da tela mobile (PmocPlanosScreen): CRUD de
// planos, cálculo de período/vencimento e geração idempotente de ordens. Nenhuma
// regra de negócio é reescrita aqui, só a casca visual muda.
import {
  listarPlanos, criarPlano, periodoDe, vencimentoDe, gerarOrdensDoPlano, podeGerarPmoc,
} from '../../services/pmoc';
import { getPmocVersaoVigente, getClientes } from '../../database/database';
import { onSyncAplicado } from '../../services/cloudSync';
import { usePermissao } from '../../hooks/usePermissao';
import { formatDate } from '../../utils/date';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { FREQUENCIAS_PMOC, PmocPlano, SituacaoPmoc, Cliente } from '../../types';
import { avisar, confirmar } from './dialogo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Rótulos da situação OPERACIONAL do plano — cópia fiel de PmocPlanosScreen
 * (mobile). Nenhum rótulo é declaração de conformidade legal: descrevem só o
 * estágio do plano no fluxo de trabalho do prestador.
 */
const SIT_PMOC_LABEL: Record<SituacaoPmoc, string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  aguardando_aprovacao_tecnica: 'Aguardando responsável técnico',
  aprovado: 'Aprovado',
  vigente: 'Vigente',
  substituido: 'Substituído',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
};

function criarSitPmocCor(c: Cores): Record<SituacaoPmoc, string> {
  return {
    rascunho: c.onSurfaceVariant,
    em_revisao: c.warning,
    aguardando_aprovacao_tecnica: c.warning,
    aprovado: c.primaryLight,
    vigente: c.success,
    substituido: c.onSurfaceMuted,
    // Laranja fixo: precisa continuar distinto de "em_revisao"/"aguardando_..."
    // (que já usam c.warning) — mesma decisão da tela mobile, sem equivalente
    // semântico no tema.
    suspenso: '#F97316',
    encerrado: c.onSurfaceMuted,
  };
}

/** Rótulo PT-BR da frequência ('mensal' → 'Mensal'); cai no id se desconhecida. */
function labelFrequencia(frequencia: string): string {
  return FREQUENCIAS_PMOC.find((f) => f.id === frequencia)?.label ?? frequencia;
}

/** Dias de calendário até `iso` (curta, 'YYYY-MM-DD'); negativo = já venceu. */
function diasAte(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const alvo = new Date(y, (m || 1) - 1, d || 1);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

/**
 * Resumo derivado por plano a partir da versão vigente — mesmo cálculo do mobile.
 *
 * `periodicidades` (contagem) acompanha `periodicidadeLabels` mesmo não sendo
 * consumido nesta tela: é o MESMO shape de resumo que a tela mobile
 * (PmocPlanosScreen) usa no chip "N periodicidades". Mantendo os dois campos
 * alinhados nas duas telas, um ajuste futuro num lado não quebra o outro em
 * silêncio por divergência de shape.
 */
interface ResumoPlano {
  equipamentos: number;
  numeroVersao?: number;
  /** Contagem de periodicidades definidas. */
  periodicidades: number;
  /** Rótulos únicos das frequências das periodicidades ("Mensal", "Trimestral"...). */
  periodicidadeLabels: string[];
  /**
   * ISO curta (YYYY-MM-DD) da próxima visita devida — o FIM do bloco de
   * calendário atual, calculado das periodicidades (mesma matemática usada na
   * geração real da OS). Data OPERACIONAL derivada, nunca afirmação de
   * conformidade. `null` quando não há periodicidade calculável.
   */
  proximaVisita: string | null;
}

function StatusPmocBadge({ situacao }: { situacao: SituacaoPmoc }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = criarSitPmocCor(cores)[situacao] ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cor + '22', borderColor: cor + '66' }]}>
      <Text style={[styles.statusBadgeText, { color: cor }]} numberOfLines={1}>
        {SIT_PMOC_LABEL[situacao] ?? situacao}
      </Text>
    </View>
  );
}

/**
 * Planos PMOC (desktop, v4) — tabela com busca e painel lateral de criação
 * (PainelNovoPlano). Reaproveita listarPlanos/criarPlano/periodoDe/vencimentoDe/
 * gerarOrdensDoPlano do mesmo services/pmoc.ts da tela mobile; a permissão de
 * quem acessa a aba já é gateada centralmente (SidebarNav filtra por
 * 'ver_valores_agregados', mesma ação do GuardaPapel na tela mobile). A ação
 * "gerar ordens" é gateada de novo aqui, dentro da própria tela — como o
 * comentário de podeGerarPmoc em services/pmoc.ts pede.
 */
export default function PmocDesktopScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { pode } = usePermissao();

  const [planos, setPlanos] = useState<PmocPlano[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumos, setResumos] = useState<Record<string, ResumoPlano>>({});
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  // 3 estados explícitos (nunca colapsar erro em vazio): `erro` só vira `true`
  // se o load de fato falhar — a lista NÃO é esvaziada no catch, senão a tabela
  // mostraria "nada por aqui" quando na verdade a leitura só falhou agora.
  const [erro, setErro] = useState(false);
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  const [painelVisivel, setPainelVisivel] = useState(false);

  const podeGerar = podeGerarPmoc(pode('ver_valores_agregados'));

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      const [lista, listaClientes] = await Promise.all([listarPlanos(), getClientes()]);
      setPlanos(lista);
      setClientes(listaClientes);
      // Enriquecimento por plano (equipamentos, periodicidades, próxima visita).
      // N+1 sobre o SQLite local, aceitável para o volume pequeno de planos;
      // cada leitura é isolada para um plano problemático não derrubar a lista.
      const agora = new Date();
      const pares = await Promise.all(
        lista.map(async (p): Promise<[string, ResumoPlano]> => {
          try {
            const vigente = await getPmocVersaoVigente(p.id);
            const pers = vigente?.periodicidades ?? [];
            const vencimentos = pers
              .map((per) => {
                const periodo = periodoDe(agora, per.frequencia);
                return periodo ? vencimentoDe(periodo, per.frequencia) : '';
              })
              .filter((v): v is string => !!v)
              .sort();
            const labels = Array.from(new Set(pers.map((per) => labelFrequencia(per.frequencia))));
            return [p.id, {
              equipamentos: vigente?.equipamentoIds.length ?? 0,
              numeroVersao: vigente?.numeroVersao,
              periodicidades: pers.length,
              periodicidadeLabels: labels,
              proximaVisita: vencimentos[0] ?? null,
            }];
          } catch {
            return [p.id, { equipamentos: 0, periodicidades: 0, periodicidadeLabels: [], proximaVisita: null }];
          }
        }),
      );
      setResumos(Object.fromEntries(pares));
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);

  const clientesMapa = useMemo(
    () => Object.fromEntries(clientes.map((c) => [c.id, c.nome])),
    [clientes],
  );

  const linhas = useMemo(() => {
    if (!busca.trim()) return planos;
    const q = normalizarBusca(busca);
    return planos.filter((p) => {
      const nomeCliente = p.clienteId ? clientesMapa[p.clienteId] ?? '' : '';
      return (
        normalizarBusca(p.titulo).includes(q) ||
        (p.numero ? normalizarBusca(p.numero).includes(q) : false) ||
        normalizarBusca(nomeCliente).includes(q)
      );
    });
  }, [planos, busca, clientesMapa]);

  function abrirPlano(id: string) {
    nav.navigate('PmocPlano', { id });
  }

  function abrirNovo() {
    setPainelVisivel(true);
  }

  async function gerarOrdens(plano: PmocPlano) {
    if (!podeGerar) return;
    if (!(await confirmar(
      'Gerar ordens do período',
      `Gerar as ordens de serviço devidas até hoje para "${plano.titulo}"? Visitas que já têm ordem não são duplicadas.`,
    ))) return;
    setGerandoId(plano.id);
    try {
      const r = await gerarOrdensDoPlano(plano.id);
      const partes: string[] = [];
      if (r.criadas) partes.push(`${r.criadas} nova${r.criadas === 1 ? '' : 's'}`);
      if (r.recuperadas) partes.push(`${r.recuperadas} recuperada${r.recuperadas === 1 ? '' : 's'}`);
      if (r.jaExistiam) partes.push(`${r.jaExistiam} já existia${r.jaExistiam === 1 ? '' : 'm'}`);
      if (r.naLixeira) partes.push(`${r.naLixeira} na lixeira`);
      if (r.removidas) partes.push(`${r.removidas} removida${r.removidas === 1 ? '' : 's'} definitivamente`);
      if (r.ignoradas) partes.push(`${r.ignoradas} ignorada${r.ignoradas === 1 ? '' : 's'}`);
      // 'omitidas' NUNCA fica de fora: são períodos antigos descartados pelo teto
      // de MAX_PERIODOS_POR_COMBINACAO — um teto silencioso passaria a impressão
      // de que o plano cobriu tudo quando na verdade não cobriu. Mesmo tratamento
      // de destaque que a tela mobile (ResultadoGeracao) dá a esse contador.
      if (r.omitidas) partes.push(`⚠ ${r.omitidas} omitida${r.omitidas === 1 ? '' : 's'} (fora do limite de períodos)`);
      avisar('Ordens do período', partes.length ? partes.join(' · ') : 'Nenhuma visita devida no momento.');
      await carregar();
    } catch (e) {
      avisar('Erro', e instanceof Error ? e.message : 'Não foi possível gerar as ordens agora.');
    } finally {
      setGerandoId(null);
    }
  }

  const colunas: Coluna<PmocPlano>[] = useMemo(() => [
    {
      chave: 'plano',
      titulo: 'Plano',
      largura: '22%',
      ordenavel: true,
      valorOrdenacao: (p) => p.titulo,
      render: (p) => (
        <View style={{ minWidth: 0 }}>
          <Text style={styles.celulaTitulo} numberOfLines={1}>{p.titulo || 'Plano de manutenção'}</Text>
          {p.numero ? <Text style={styles.celulaSub} numberOfLines={1}>Nº {p.numero}</Text> : null}
        </View>
      ),
      tituloCompleto: (p) => p.titulo,
    },
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: '16%',
      ordenavel: true,
      valorOrdenacao: (p) => (p.clienteId ? clientesMapa[p.clienteId] ?? '' : ''),
      render: (p) => {
        const nome = p.clienteId ? clientesMapa[p.clienteId] : undefined;
        return (
          <Text style={nome ? styles.celulaTexto : styles.celulaMuted} numberOfLines={1}>
            {nome || 'Sem cliente vinculado'}
          </Text>
        );
      },
      tituloCompleto: (p) => (p.clienteId ? clientesMapa[p.clienteId] : undefined),
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      largura: 170,
      ordenavel: true,
      valorOrdenacao: (p) => SIT_PMOC_LABEL[p.situacao] ?? p.situacao,
      render: (p) => <StatusPmocBadge situacao={p.situacao} />,
    },
    {
      chave: 'versao',
      titulo: 'Versão',
      largura: 70,
      ordenavel: true,
      valorOrdenacao: (p) => resumos[p.id]?.numeroVersao ?? 0,
      render: (p) => {
        const n = resumos[p.id]?.numeroVersao;
        return <Text style={styles.celulaTexto}>{n ? `v${n}` : '—'}</Text>;
      },
    },
    {
      chave: 'equipamentos',
      titulo: 'Equipamentos',
      largura: 120,
      ordenavel: true,
      valorOrdenacao: (p) => resumos[p.id]?.equipamentos ?? 0,
      render: (p) => (
        <View style={styles.equipCel}>
          <MaterialCommunityIcons name="air-conditioner" size={14} color={cores.onSurfaceVariant} />
          <Text style={styles.celulaTexto}>{resumos[p.id]?.equipamentos ?? 0}</Text>
        </View>
      ),
    },
    {
      chave: 'periodicidades',
      titulo: 'Periodicidades',
      largura: 210,
      render: (p) => {
        const labels = resumos[p.id]?.periodicidadeLabels ?? [];
        if (!labels.length) return <Text style={styles.celulaMuted}>—</Text>;
        const visiveis = labels.slice(0, 2);
        const resto = labels.length - visiveis.length;
        return (
          <View style={styles.chipsRow}>
            {visiveis.map((l) => (
              <View key={l} style={styles.miniChip}>
                <Text style={styles.miniChipText} numberOfLines={1}>{l}</Text>
              </View>
            ))}
            {resto > 0 && (
              <View style={styles.miniChip}>
                <Text style={styles.miniChipText}>+{resto}</Text>
              </View>
            )}
          </View>
        );
      },
      tituloCompleto: (p) => (resumos[p.id]?.periodicidadeLabels ?? []).join(' · ') || undefined,
    },
    {
      chave: 'proximaVisita',
      titulo: 'Próximo vencimento',
      largura: 170,
      ordenavel: true,
      // Sem data calculável ordena para o FIM (não é "o mais urgente") — sentinela
      // bem no futuro em vez de string vazia, que localeCompare colocaria primeiro.
      valorOrdenacao: (p) => resumos[p.id]?.proximaVisita ?? '9999-12-31',
      render: (p) => {
        const r = resumos[p.id];
        const venc = r?.proximaVisita;
        if (!venc) {
          return (
            <Text style={styles.celulaMuted}>
              {r?.periodicidadeLabels.length ? 'Sem data calculável' : 'Sem periodicidade'}
            </Text>
          );
        }
        const dias = diasAte(venc);
        const vencido = dias < 0;
        const proximo = !vencido && dias < 15;
        const cor = vencido ? cores.danger : proximo ? cores.warning : cores.onSurface;
        return (
          <View style={styles.vencimentoCel}>
            {(vencido || proximo) && (
              <MaterialCommunityIcons
                name={vencido ? 'alert-circle' : 'clock-alert-outline'}
                size={14}
                color={cor}
              />
            )}
            <Text style={[styles.celulaTexto, { color: cor, fontWeight: vencido || proximo ? '800' : '400' }]}>
              {formatDate(venc)}
            </Text>
          </View>
        );
      },
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 130,
      render: (p) => (
        <View style={styles.acoesLinha}>
          <AcaoIcone icone="open-in-new" rotulo="Abrir plano" onPress={() => abrirPlano(p.id)} />
          {podeGerar && (
            <AcaoIcone
              icone="calendar-sync-outline"
              rotulo="Gerar ordens do período"
              onPress={() => gerarOrdens(p)}
              carregando={gerandoId === p.id}
            />
          )}
        </View>
      ),
    },
  ], [nav, styles, cores, clientesMapa, resumos, podeGerar, gerandoId]);

  return (
    <LayoutDesktop
      titulo="Planos PMOC"
      subtitulo={`${planos.length} plano${planos.length === 1 ? '' : 's'} · manutenção programada`}
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por título, nº ou cliente…" />
          <Pressable
            onPress={abrirNovo}
            accessibilityRole="button"
            accessibilityLabel="Novo plano de manutenção"
            style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={cores.onPrimary} />
            <Text style={styles.botaoNovoLabel}>Novo plano</Text>
          </Pressable>
        </>
      }
    >
      <TabelaDados<PmocPlano>
        colunas={colunas}
        // Em erro, força "sem linhas" pra cair no `vazio` abaixo com o aviso de
        // retry — em vez de listar dados possivelmente desatualizados de uma
        // carga anterior enquanto a leitura atual falhou.
        dados={erro ? [] : linhas}
        carregando={carregando}
        aoClicarLinha={(p) => abrirPlano(p.id)}
        ordenacaoInicial={{ chave: 'proximaVisita', direcao: 'asc' }}
        vazio={
          erro ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Não foi possível carregar"
              subtitle="Não conseguimos buscar os planos PMOC agora. Verifique a conexão e tente de novo."
              actionLabel="Tentar de novo"
              onAction={carregar}
            />
          ) : (
            <EmptyState
              icon="clipboard-text-clock-outline"
              title="Nenhum plano de manutenção ainda"
              subtitle="Um plano PMOC organiza as visitas programadas dos equipamentos de um cliente. Crie o primeiro e defina as periodicidades."
              actionLabel="Criar primeiro plano"
              onAction={abrirNovo}
            />
          )
        }
      />

      <PainelNovoPlano
        visivel={painelVisivel}
        clientes={clientes}
        aoFechar={() => setPainelVisivel(false)}
        aoCriado={(plano) => {
          setPainelVisivel(false);
          carregar();
          nav.navigate('PmocPlano', { id: plano.id });
        }}
      />
    </LayoutDesktop>
  );
}

function AcaoIcone({
  icone, rotulo, onPress, carregando,
}: {
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  rotulo: string;
  onPress: () => void;
  carregando?: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      onPress={carregando ? undefined : (e) => { e.stopPropagation(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [styles.acaoIcone, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
    >
      {carregando ? (
        <ActivityIndicator size="small" color={cores.accentLight} />
      ) : (
        <MaterialCommunityIcons name={icone} size={17} color={cores.onSurfaceVariant} />
      )}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────
// Painel lateral "Novo plano" — título (obrigatório) + cliente (opcional).
// Mesma casca do PainelCliente; a persistência é a MESMA função `criarPlano`
// usada pelo NovoPlanoModal da tela mobile.
// ─────────────────────────────────────────────────────────────
function PainelNovoPlano({
  visivel, clientes, aoFechar, aoCriado,
}: {
  visivel: boolean;
  clientes: Cliente[];
  aoFechar: () => void;
  aoCriado: (plano: PmocPlano) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [titulo, setTitulo] = useState('');
  const [clienteId, setClienteId] = useState<string | undefined>(undefined);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visivel) return;
    setTitulo(''); setClienteId(undefined); setBuscaCliente(''); setErro(null);
  }, [visivel]);

  const clientesFiltrados = useMemo(() => {
    const q = normalizarBusca(buscaCliente);
    if (!q) return clientes;
    return clientes.filter((c) => normalizarBusca(c.nome).includes(q));
  }, [clientes, buscaCliente]);

  async function salvar() {
    const t = titulo.trim();
    if (!t) { setErro('Dê um título ao plano (ex.: "PMOC — Loja Centro").'); return; }
    setSalvando(true);
    setErro(null);
    try {
      const plano = await criarPlano({ titulo: t, clienteId });
      aoCriado(plano);
    } catch {
      setErro('Não foi possível criar o plano. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  if (!visivel) return null;

  return (
    <View style={styles.raizPainel} accessibilityRole="none">
      <Pressable style={styles.fundoClicavel} onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
      <View style={styles.painel}>
        <View style={styles.cabecalho}>
          <Text style={styles.tituloPainel}>Novo plano de manutenção</Text>
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

        <ScrollView contentContainerStyle={styles.conteudoPainel} keyboardShouldPersistTaps="handled">
          <OlliInput
            label="Título do plano"
            required
            autoFocus
            value={titulo}
            onChangeText={setTitulo}
            placeholder='Ex.: "PMOC — Edifício Aurora"'
            leftIcon="clipboard-text-outline"
            error={erro && !titulo.trim() ? erro : undefined}
          />

          <Text style={styles.rotuloSecao}>Cliente (opcional)</Text>
          <OlliInput
            value={buscaCliente}
            onChangeText={setBuscaCliente}
            placeholder="Buscar cliente…"
            leftIcon="magnify"
          />

          <Pressable
            onPress={() => setClienteId(undefined)}
            accessibilityRole="button"
            accessibilityState={{ selected: !clienteId }}
            style={({ hovered, focused }: PressableWebState) => [
              styles.clienteRow, !clienteId && styles.clienteRowAtivo, hovered && styles.clienteRowHover, focused && styles.focoVisivel,
            ]}
          >
            <MaterialCommunityIcons name="account-off-outline" size={18} color={cores.onSurfaceVariant} />
            <Text style={styles.clienteRowTexto}>Sem cliente vinculado</Text>
            {!clienteId && <MaterialCommunityIcons name="check" size={18} color={cores.accentLight} />}
          </Pressable>

          {clientesFiltrados.slice(0, 30).map((c) => {
            const sel = clienteId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setClienteId(c.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                style={({ hovered, focused }: PressableWebState) => [
                  styles.clienteRow, sel && styles.clienteRowAtivo, hovered && styles.clienteRowHover, focused && styles.focoVisivel,
                ]}
              >
                <MaterialCommunityIcons name="account-outline" size={18} color={sel ? cores.accentLight : cores.onSurfaceVariant} />
                <Text style={[styles.clienteRowTexto, sel && { color: cores.onSurface }]} numberOfLines={1}>{c.nome}</Text>
                {sel && <MaterialCommunityIcons name="check" size={18} color={cores.accentLight} />}
              </Pressable>
            );
          })}

          {erro && titulo.trim() ? <Text style={styles.erroTexto}>{erro}</Text> : null}
        </ScrollView>

        <View style={styles.rodapePainel}>
          <OlliButton
            label="Criar plano"
            variant="gradient"
            size="lg"
            fullWidth
            loading={salvando}
            onPress={salvar}
            disabled={!titulo.trim() || salvando}
            icon={<MaterialCommunityIcons name="plus" size={18} color="#fff" />}
          />
        </View>
      </View>
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
  botaoNovoHover: { backgroundColor: c.primaryLight },
  botaoNovoLabel: { ...Typography.button, color: c.onPrimary, fontSize: 13 },

  celulaTexto: { ...Typography.bodySmall, color: c.onSurface },
  celulaMuted: { ...Typography.bodySmall, color: c.onSurfaceMuted },
  celulaTitulo: { ...Typography.bodySmall, color: c.onSurface, fontWeight: '800' },
  celulaSub: { ...Typography.caption, color: c.onSurfaceMuted, marginTop: 2 },

  equipCel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vencimentoCel: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniChip: {
    backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 3, maxWidth: 96,
  },
  miniChipText: { fontSize: 11, fontWeight: '700', color: c.onSurfaceVariant },

  statusBadge: {
    alignSelf: 'flex-start', borderRadius: BorderRadius.full, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4, maxWidth: '100%',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },

  acoesLinha: { flexDirection: 'row', gap: 2 },
  acaoIcone: {
    width: 30, height: 30, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  acaoIconeHover: { backgroundColor: c.surfacePressed },

  // Painel lateral "Novo plano" — mesma casca do PainelCliente (420px, direita).
  raizPainel: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    zIndex: 20,
  } as any,
  fundoClicavel: { flex: 1, backgroundColor: 'rgba(5,12,22,0.60)' },
  painel: {
    width: 420, height: '100%', backgroundColor: c.surface,
    borderLeftWidth: 1, borderLeftColor: c.outline,
  },
  cabecalho: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: c.outline,
  },
  tituloPainel: { ...Typography.h3, color: c.onSurface },
  botaoFechar: {
    width: 34, height: 34, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  botaoFecharHover: { backgroundColor: c.surfacePressed },
  conteudoPainel: { padding: Spacing.xl },
  rotuloSecao: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginTop: Spacing.sm, marginBottom: 6 },
  clienteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 12, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: c.outline, marginBottom: 6, backgroundColor: c.surface,
  },
  clienteRowAtivo: { borderColor: c.accent, backgroundColor: c.surfacePressed },
  clienteRowHover: { backgroundColor: c.surfacePressed },
  clienteRowTexto: { flex: 1, fontSize: 14, color: c.onSurfaceVariant },
  erroTexto: { color: c.danger, fontSize: 13, marginTop: 8 },
  rodapePainel: {
    padding: Spacing.xl, borderTopWidth: 1, borderTopColor: c.outline,
  },
});

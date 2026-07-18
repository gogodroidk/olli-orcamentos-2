import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, comAlfa, corCategoriaEmChip, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { GuardaPapel } from '../components/GuardaPapel';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { usePermissao } from '../hooks/usePermissao';
// Serviço PMOC Fase 2 (frente paralela): geração idempotente, versionamento e o
// cálculo de período do calendário. NÃO reimplemento nada disto na tela.
import {
  gerarOrdensDoPlano,
  salvarPeriodicidades,
  aprovarVersao,
  podeGerarPmoc,
  periodoDe,
  vencimentoDe,
  MAX_PERIODOS_POR_COMBINACAO as MAX_VISITAS_POR_COMBINACAO,
} from '../services/pmoc';
import type { ResultadoGeracao as ResultadoGeracaoPmoc } from '../services/pmoc';
// Leituras diretas do banco local (não editadas por esta frente).
import {
  getPmocPlano, getPmocVersaoVigente, getPmocVersoes, getOrdensGeradas, getClientes,
} from '../database/database';
import { getEquipamentos } from '../services/equipamentos';
import { generateId } from '../utils/id';
import { FREQUENCIAS_PMOC, CATEGORIAS_HVAC } from '../types';
import type {
  PmocPlano, PmocPlanoVersao, PmocPeriodicidade, SituacaoPmoc, Equipamento,
} from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type PmocRoute = RouteProp<RootStackParamList, 'PmocPlano'>;

/** Rótulos da situação OPERACIONAL do plano (nunca declaração de conformidade). */
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
    // (que já usam c.warning) para diferenciar "suspenso" na lista — sem
    // equivalente semântico no tema, mantido.
    suspenso: '#F97316',
    encerrado: c.onSurfaceMuted,
  };
}

/** Rótulo PT-BR da frequência a partir do id (texto livre → melhor esforço). */
function labelFrequencia(id: string): string {
  return FREQUENCIAS_PMOC.find((f) => f.id === id)?.label ?? id;
}
/** Rótulo PT-BR da categoria HVAC (cai no id livre se não estiver no catálogo). */
function labelCategoria(id: string): string {
  return CATEGORIAS_HVAC.find((c) => c.id === id)?.label ?? id;
}

/** Data ISO (curta ou completa) → "12/03/2026". Vazio se inválida. */
function formatarData(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Nome curto e legível do equipamento (para as listas de escopo/cobertura). */
function descreverEquip(e: Equipamento): string {
  return (
    e.codigoInterno?.trim() ||
    e.modelo?.trim() ||
    e.localizacao?.trim() ||
    e.patrimonio?.trim() ||
    e.numeroSerie?.trim() ||
    'Equipamento'
  );
}

/** Escopo textual de uma periodicidade (ids finos > categorias > todos do plano). */
function escopoLabel(per: PmocPeriodicidade): string {
  if (per.equipamentoIds && per.equipamentoIds.length) {
    return `${per.equipamentoIds.length} equipamento${per.equipamentoIds.length === 1 ? '' : 's'} específico${per.equipamentoIds.length === 1 ? '' : 's'}`;
  }
  if (per.categorias && per.categorias.length) {
    return `Categorias: ${per.categorias.map(labelCategoria).join(', ')}`;
  }
  return 'Todos os equipamentos do plano';
}

interface DadosPlano {
  plano: PmocPlano;
  vigente: PmocPlanoVersao | null;
  versoes: PmocPlanoVersao[];
  trabalho: PmocPlanoVersao | null;
  clienteNome: string;
  equipMap: Record<string, Equipamento>;
  equipamentos: Equipamento[];
  totalOrdens: number;
}

// ═════════════════════════════════════════════════════════════
// Tela — detalhe do plano PMOC. Gate: quem gerencia valores/planos.
// GuardaPapel segura fail-closed enquanto o papel carrega (estado neutro) e
// nega o técnico (não gera nem edita plano).
// ═════════════════════════════════════════════════════════════
export default function PmocPlanoScreen() {
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Plano PMOC">
      <PmocPlanoConteudo />
    </GuardaPapel>
  );
}

function PmocPlanoConteudo() {
  const nav = useNavigation<Nav>();
  const route = useRoute<PmocRoute>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const sitPmocCor = criarSitPmocCor(cores);
  const { id } = route.params;
  const { pode } = usePermissao();
  // A ação já passou pelo GuardaPapel; aqui reconfirmamos com o predicado do
  // serviço (contrato explícito) antes de LIBERAR o botão de gerar ordens.
  const podeGerar = podeGerarPmoc(pode('ver_valores_agregados'));

  const [dados, setDados] = useState<DadosPlano | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  // Ações
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoGeracaoPmoc | null>(null);
  const [erroGeracao, setErroGeracao] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [aprovando, setAprovando] = useState(false);

  const load = useCallback(async () => {
    try {
      const plano = await getPmocPlano(id);
      if (!plano) { setNaoEncontrado(true); setCarregando(false); return; }
      const [vigente, versoes, ordens, clientes, equipamentos] = await Promise.all([
        getPmocVersaoVigente(id),
        getPmocVersoes(id),
        getOrdensGeradas(id),
        getClientes(),
        getEquipamentos(),
      ]);
      const clienteNome = plano.clienteId
        ? (clientes.find((c) => c.id === plano.clienteId)?.nome ?? 'Cliente')
        : '';
      setDados({
        plano,
        vigente,
        versoes,
        trabalho: versoes[0] ?? null,
        clienteNome,
        equipMap: Object.fromEntries(equipamentos.map((e) => [e.id, e])),
        equipamentos,
        totalOrdens: ordens.length,
      });
    } catch {
      setNaoEncontrado(true);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function gerar() {
    if (!podeGerar || gerando) return;
    setGerando(true);
    setResultado(null);
    setErroGeracao(null);
    try {
      const r = await gerarOrdensDoPlano(id);
      setResultado(r);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await load();
    } catch (e) {
      setErroGeracao(e instanceof Error ? e.message : 'Não foi possível gerar as ordens agora.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setGerando(false);
    }
  }

  // ─── Estados de carga / erro ───────────────────────────────
  if (carregando) {
    return (
      <View style={styles.container}>
        <GradientHeader onBack={() => goBackOrHome(nav)} title="Plano PMOC" />
        <View style={{ padding: Spacing.base, gap: 12 }}>
          <OlliSkeleton height={120} radius={BorderRadius.lg} />
          <OlliSkeleton height={90} radius={BorderRadius.lg} />
          <OlliSkeleton height={160} radius={BorderRadius.lg} />
        </View>
      </View>
    );
  }

  if (naoEncontrado || !dados) {
    return (
      <View style={styles.container}>
        <GradientHeader onBack={() => goBackOrHome(nav)} title="Plano PMOC" />
        <View style={styles.centered}>
          <MaterialCommunityIcons name="file-remove-outline" size={44} color={cores.onSurfaceMuted} />
          <Text style={styles.vazioTitulo}>Plano não encontrado</Text>
          <Text style={styles.vazioSub}>Ele pode ter sido excluído ou ainda não sincronizou neste aparelho.</Text>
          <OlliButton label="Voltar" variant="outline" onPress={() => goBackOrHome(nav)} style={{ marginTop: Spacing.lg }} />
        </View>
      </View>
    );
  }

  const { plano, vigente, versoes, trabalho, clienteNome, equipMap } = dados;
  const periodicidades = vigente?.periodicidades ?? [];
  const equipamentoIds = vigente?.equipamentoIds ?? [];
  const semConteudo = periodicidades.length === 0;
  // Versão de trabalho pendente ≠ versão em vigor: há um rascunho não aprovado
  // mais novo que o vigente. Gerar ordens usa o VIGENTE (o serviço decide).
  const rascunhoPendente =
    !!trabalho && !trabalho.aprovadoEm && !!vigente && trabalho.numeroVersao !== vigente.numeroVersao;
  const podeAprovar = !!trabalho && !trabalho.aprovadoEm && (trabalho.periodicidades?.length ?? 0) > 0;

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title={plano.titulo || 'Plano de manutenção'}
        subtitle={clienteNome || 'Sem cliente vinculado'}
        compact
        right={<StatusPmocBadge situacao={plano.situacao} />}
      />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* CAVEAT LEGAL — sóbrio, sempre visível. NUNCA diz "conforme". */}
        <AnimatedEntrance index={0}>
          <View style={styles.caveat}>
            <MaterialCommunityIcons name="scale-balance" size={18} color={cores.warning} style={{ marginTop: 1 }} />
            <Text style={styles.caveatText}>
              As periodicidades, atividades e referências normativas deste plano são configuráveis e
              definidas pelo responsável técnico habilitado. Este aplicativo não avalia nem declara
              conformidade com qualquer norma — a validação técnica é do profissional habilitado.
            </Text>
          </View>
        </AnimatedEntrance>

        {/* DADOS DO PLANO */}
        <AnimatedEntrance index={1}>
          <View style={styles.card}>
            <LinhaInfo icone="clipboard-text-outline" rotulo="Plano" valor={plano.titulo} />
            {plano.numero ? <LinhaInfo icone="pound" rotulo="Número" valor={plano.numero} /> : null}
            <LinhaInfo icone="account-outline" rotulo="Cliente" valor={clienteNome || 'Não vinculado'} />
            <LinhaInfo
              icone="progress-check"
              rotulo="Situação (operacional)"
              valor={SIT_PMOC_LABEL[plano.situacao]}
              valorCor={corCategoriaEmChip(sitPmocCor[plano.situacao], cores.surface)}
            />
            <LinhaInfo
              icone="source-branch"
              rotulo="Versão em vigor"
              valor={vigente ? `v${vigente.numeroVersao}${vigente.aprovadoEm ? ' · aprovada' : ' · rascunho'}` : 'Sem versão ainda'}
            />
            <LinhaInfo icone="calendar-plus" rotulo="Criado em" valor={formatarData(plano.criadoEm)} ultima />
          </View>
        </AnimatedEntrance>

        {rascunhoPendente && (
          <AnimatedEntrance index={2}>
            <View style={styles.aviso}>
              <MaterialCommunityIcons name="information-outline" size={18} color={cores.primaryLight} />
              <Text style={styles.avisoText}>
                Existe uma versão em revisão (v{trabalho?.numeroVersao}) ainda não aprovada. O plano em
                vigor é a v{vigente?.numeroVersao} — é ela que a geração de ordens usa.
              </Text>
            </View>
          </AnimatedEntrance>
        )}

        {/* RESPONSÁVEL TÉCNICO + DOCUMENTO DE RESPONSABILIDADE */}
        <AnimatedEntrance index={3}>
          <Secao titulo="Responsável técnico" icone="certificate-outline">
            {vigente?.responsavelTecnico ? (
              <>
                <LinhaInfo icone="account-hard-hat" rotulo="Responsável" valor={vigente.responsavelTecnico} />
                <LinhaInfo
                  icone="file-certificate-outline"
                  rotulo="Documento de responsabilidade"
                  valor={vigente.docResponsabilidade || 'Não informado'}
                />
                <LinhaInfo
                  icone="check-decagram-outline"
                  rotulo="Aprovação técnica registrada em"
                  valor={formatarData(vigente.aprovadoEm)}
                  ultima
                />
              </>
            ) : (
              <View style={styles.vazioInline}>
                <Text style={styles.vazioInlineText}>
                  Nenhuma versão aprovada por responsável técnico. A aprovação apenas registra quem
                  assinou — não é declaração de conformidade do app.
                </Text>
                {podeAprovar && (
                  <OlliButton
                    label="Registrar aprovação técnica"
                    variant="outline"
                    size="sm"
                    onPress={() => setAprovando(true)}
                    icon={<MaterialCommunityIcons name="certificate-outline" size={16} color={cores.accentLight} />}
                    style={{ marginTop: Spacing.sm, alignSelf: 'flex-start' }}
                  />
                )}
              </View>
            )}
          </Secao>
        </AnimatedEntrance>

        {/* PERIODICIDADES */}
        <AnimatedEntrance index={4}>
          <Secao
            titulo="Periodicidades"
            icone="repeat-variant"
            acao={<BotaoTextoIcone
              label={semConteudo ? 'Definir' : 'Editar'}
              icone={semConteudo ? 'plus' : 'pencil-outline'}
              onPress={() => setEditando(true)}
            />}
          >
            {semConteudo ? (
              <View style={styles.vazioInline}>
                <Text style={styles.vazioInlineText}>
                  Nenhuma periodicidade definida. Cadastre as rotinas de manutenção (nome, frequência e
                  atividades) para o plano gerar as ordens de serviço.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {periodicidades.map((per) => (
                  <PeriodicidadeCard key={per.id} per={per} />
                ))}
              </View>
            )}
          </Secao>
        </AnimatedEntrance>

        {/* EQUIPAMENTOS COBERTOS */}
        <AnimatedEntrance index={5}>
          <Secao titulo="Equipamentos cobertos" icone="air-conditioner" contagem={equipamentoIds.length}>
            {equipamentoIds.length === 0 ? (
              <View style={styles.vazioInline}>
                <Text style={styles.vazioInlineText}>
                  Nenhum equipamento no escopo do plano. Edite as periodicidades para escolher quais
                  ativos entram na manutenção programada.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {equipamentoIds.map((eid) => {
                  const e = equipMap[eid];
                  return (
                    <View key={eid} style={styles.equipRow}>
                      <MaterialCommunityIcons
                        name={e ? 'air-conditioner' : 'help-circle-outline'}
                        size={18}
                        color={e ? cores.accentLight : cores.onSurfaceMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.equipTitulo} numberOfLines={1}>
                          {e ? descreverEquip(e) : 'Equipamento fora do inventário'}
                        </Text>
                        {e ? (
                          <Text style={styles.equipSub} numberOfLines={1}>
                            {[labelCategoria(e.categoria ?? ''), e.localizacao?.trim()].filter(Boolean).join(' · ') || '—'}
                          </Text>
                        ) : (
                          <Text style={styles.equipSub}>Removido ou não sincronizado — cai em "ignoradas"</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Secao>
        </AnimatedEntrance>

        {/* HISTÓRICO DE VERSÕES */}
        <AnimatedEntrance index={6}>
          <Secao titulo="Histórico de versões" icone="history" contagem={versoes.length}>
            {versoes.length === 0 ? (
              <Text style={styles.vazioInlineText}>Nenhuma versão salva ainda.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {versoes.map((v) => {
                  const emVigor = plano.versaoVigente === v.numeroVersao || (plano.versaoVigente == null && v.numeroVersao === vigente?.numeroVersao);
                  return (
                    <View key={v.id} style={styles.versaoRow}>
                      <View style={styles.versaoNum}><Text style={styles.versaoNumText}>v{v.numeroVersao}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.versaoTitulo}>
                          {v.aprovadoEm ? 'Aprovada' : 'Rascunho'}
                          {v.responsavelTecnico ? ` · ${v.responsavelTecnico}` : ''}
                        </Text>
                        <Text style={styles.versaoSub}>
                          {v.aprovadoEm ? `Aprovada em ${formatarData(v.aprovadoEm)}` : `Criada em ${formatarData(v.criadoEm)}`}
                        </Text>
                      </View>
                      {emVigor && (
                        <View style={styles.vigorTag}><Text style={styles.vigorTagText}>Em vigor</Text></View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </Secao>
        </AnimatedEntrance>

        {/* AÇÃO PRINCIPAL — GERAR ORDENS DO PERÍODO */}
        <AnimatedEntrance index={7}>
          <View style={styles.card}>
            <View style={styles.gerarHeader}>
              <MaterialCommunityIcons name="calendar-sync-outline" size={20} color={cores.accentLight} />
              <Text style={styles.gerarTitulo}>Gerar ordens do período</Text>
            </View>
            <Text style={styles.gerarDesc}>
              Cria as ordens de serviço das visitas devidas até o período atual — inclusive a do período
              em andamento, agendada para o fim dele. Nunca gera um período que ainda não começou, e
              nunca repete uma visita já gerada.
            </Text>

            <OlliButton
              label={gerando ? 'Gerando...' : 'Gerar ordens do período'}
              variant="gradient"
              fullWidth
              loading={gerando}
              disabled={semConteudo || !podeGerar}
              onPress={gerar}
              icon={<MaterialCommunityIcons name="cog-play-outline" size={18} color="#fff" />}
              style={{ marginTop: Spacing.sm }}
            />
            {semConteudo && (
              <Text style={styles.gerarHint}>Defina ao menos uma periodicidade para gerar ordens.</Text>
            )}

            {resultado && <ResultadoGeracao resultado={resultado} />}
            {erroGeracao && (
              <View style={[styles.aviso, { marginTop: Spacing.md, borderColor: cores.danger + '55', backgroundColor: cores.dangerLight }]}>
                <MaterialCommunityIcons name="alert-outline" size={18} color={cores.danger} />
                <Text style={[styles.avisoText, { color: cores.danger }]}>{erroGeracao}</Text>
              </View>
            )}
          </View>
        </AnimatedEntrance>
      </ScrollView>

      {/* Editor de periodicidades + escopo (salvarPeriodicidades). */}
      <EditorPeriodicidadesModal
        visivel={editando}
        planoId={id}
        base={trabalho}
        equipamentos={dados.equipamentos}
        onFechar={() => setEditando(false)}
        onSalvo={() => { setEditando(false); load(); }}
      />

      {/* Registro de aprovação técnica (aprovarVersao). */}
      {trabalho && (
        <AprovacaoModal
          visivel={aprovando}
          planoId={id}
          numeroVersao={trabalho.numeroVersao}
          onFechar={() => setAprovando(false)}
          onAprovado={() => { setAprovando(false); load(); }}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Componentes de apresentação
// ─────────────────────────────────────────────────────────────
function StatusPmocBadge({ situacao }: { situacao: SituacaoPmoc }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const cor = criarSitPmocCor(cores)[situacao] ?? cores.onSurfaceVariant;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cor + '22', borderColor: cor + '88' }]}>
      <Text style={[styles.statusBadgeText, { color: corCategoriaEmChip(cor, cores.surface) }]}>{SIT_PMOC_LABEL[situacao] ?? situacao}</Text>
    </View>
  );
}

function LinhaInfo({
  icone, rotulo, valor, valorCor, ultima,
}: {
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  rotulo: string;
  valor: string;
  valorCor?: string;
  ultima?: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={[styles.linha, !ultima && styles.linhaBorda]}>
      <MaterialCommunityIcons name={icone} size={17} color={cores.onSurfaceVariant} />
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={[styles.linhaValor, valorCor && { color: valorCor }]} numberOfLines={2}>{valor || '—'}</Text>
    </View>
  );
}

function Secao({
  titulo, icone, contagem, acao, children,
}: {
  titulo: string;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  contagem?: number;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.card}>
      <View style={styles.secaoHeader}>
        <MaterialCommunityIcons name={icone} size={18} color={cores.accentLight} />
        <Text style={styles.secaoTitulo}>{titulo}</Text>
        {typeof contagem === 'number' && (
          <View style={styles.contagemPill}><Text style={styles.contagemText}>{contagem}</Text></View>
        )}
        <View style={{ flex: 1 }} />
        {acao}
      </View>
      {children}
    </View>
  );
}

function BotaoTextoIcone({
  label, icone, onPress,
}: {
  label: string;
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity onPress={onPress} style={styles.botaoTexto} accessibilityRole="button" accessibilityLabel={label} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <MaterialCommunityIcons name={icone} size={15} color={cores.accentLight} />
      <Text style={styles.botaoTextoLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function PeriodicidadeCard({ per }: { per: PmocPeriodicidade }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const periodoAtual = periodoDe(new Date(), per.frequencia);
  const vencAtual = periodoAtual ? vencimentoDe(periodoAtual, per.frequencia) : '';
  const atividades = (per.atividades ?? []).filter((a) => a && a.trim());
  return (
    <View style={styles.perCard}>
      <View style={styles.perHeader}>
        <Text style={styles.perNome} numberOfLines={1}>{per.nome || 'Rotina'}</Text>
        <View style={styles.freqPill}><Text style={styles.freqPillText}>{labelFrequencia(per.frequencia)}</Text></View>
      </View>

      <View style={styles.perMetaRow}>
        <MaterialCommunityIcons name="target" size={13} color={cores.onSurfaceVariant} />
        <Text style={styles.perMeta} numberOfLines={2}>{escopoLabel(per)}</Text>
      </View>

      {periodoAtual ? (
        <View style={styles.perMetaRow}>
          <MaterialCommunityIcons name="calendar-clock-outline" size={13} color={cores.onSurfaceVariant} />
          <Text style={styles.perMeta}>Período atual: {periodoAtual}{vencAtual ? ` · vence ${formatarData(vencAtual)}` : ''}</Text>
        </View>
      ) : (
        <View style={styles.perMetaRow}>
          <MaterialCommunityIcons name="calendar-alert" size={13} color={cores.warning} />
          <Text style={[styles.perMeta, { color: cores.warning }]}>Frequência não reconhecida pelo cálculo do app.</Text>
        </View>
      )}

      {atividades.length > 0 && (
        <View style={styles.atividadesWrap}>
          {atividades.map((a, i) => (
            <View key={i} style={styles.atividadeItem}>
              <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={11} color={cores.accentLight} style={{ marginTop: 3 }} />
              <Text style={styles.atividadeText}>{a.trim()}</Text>
            </View>
          ))}
        </View>
      )}

      {per.referencia ? (
        <View style={styles.referenciaWrap}>
          <MaterialCommunityIcons name="book-open-variant" size={12} color={cores.onSurfaceMuted} />
          <Text style={styles.referenciaText} numberOfLines={2}>
            Referência informada pelo responsável técnico: {per.referencia}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Resultado HONESTO da geração. "Já existiam" NÃO é erro: é a idempotência
 * funcionando. Os contadores incomuns (recuperadas/na lixeira/removidas/omitidas)
 * só aparecem quando são diferentes de zero — mas NUNCA são escondidos, porque um
 * número calado leva o usuário a achar que o plano cobriu tudo.
 */
function ResultadoGeracao({ resultado }: { resultado: ResultadoGeracaoPmoc }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { criadas, recuperadas, jaExistiam, naLixeira, removidas, ignoradas, omitidas } = resultado;
  return (
    <View style={styles.resultado}>
      <View style={styles.resultadoLinha}>
        <Contador n={criadas} label="criadas" cor={cores.success} icone="plus-circle-outline" />
        <Contador n={jaExistiam} label="já existiam" cor={cores.primaryLight} icone="check-circle-outline" />
        <Contador n={ignoradas} label="ignoradas" cor={cores.onSurfaceVariant} icone="minus-circle-outline" />
      </View>
      {(recuperadas > 0 || naLixeira > 0 || removidas > 0 || omitidas > 0) && (
        <View style={styles.resultadoLinha}>
          {recuperadas > 0 && (
            <Contador n={recuperadas} label="recuperadas" cor={cores.success} icone="backup-restore" />
          )}
          {naLixeira > 0 && (
            <Contador n={naLixeira} label="na lixeira" cor={cores.warning} icone="delete-outline" />
          )}
          {removidas > 0 && (
            <Contador n={removidas} label="removidas" cor={cores.onSurfaceVariant} icone="delete-forever-outline" />
          )}
          {omitidas > 0 && (
            <Contador n={omitidas} label="omitidas" cor={cores.warning} icone="alert-outline" />
          )}
        </View>
      )}
      <Text style={styles.resultadoNota}>
        "Já existiam" não é erro: é a proteção contra duplicar visitas — o plano só cria o que ainda
        faltava.
        {ignoradas > 0 ? ' "Ignoradas" são combinações sem período devido ou com equipamento fora do inventário.' : ''}
        {recuperadas > 0 ? ' "Recuperadas" são visitas que tinham reserva sem ordem (uma geração interrompida) e foram refeitas agora.' : ''}
        {naLixeira > 0 ? ' Há visitas cuja ordem está na lixeira — restaure por lá em vez de gerar de novo.' : ''}
        {removidas > 0 ? ' Há visitas cuja ordem foi excluída de vez; elas não são recriadas.' : ''}
        {omitidas > 0 ? ` ${omitidas} visita(s) antiga(s) não foram geradas: o plano só cria os ${MAX_VISITAS_POR_COMBINACAO} períodos mais recentes de cada equipamento.` : ''}
      </Text>
    </View>
  );
}

function Contador({ n, label, cor, icone }: { n: number; label: string; cor: string; icone: keyof typeof MaterialCommunityIcons.glyphMap }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.contador}>
      <MaterialCommunityIcons name={icone} size={18} color={cor} />
      <Text style={[styles.contadorNum, { color: cor }]}>{n}</Text>
      <Text style={styles.contadorLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Editor de periodicidades + escopo de equipamentos
// ─────────────────────────────────────────────────────────────
interface PerEdit {
  id: string;
  nome: string;
  frequencia: string;
  atividadesTexto: string;
  referencia: string;
  // Escopo fino preservado da versão de origem (não editado nesta UI simples).
  categorias?: string[];
  equipamentoIds?: string[];
}

function EditorPeriodicidadesModal({
  visivel, planoId, base, equipamentos, onFechar, onSalvo,
}: {
  visivel: boolean;
  planoId: string;
  base: PmocPlanoVersao | null;
  equipamentos: Equipamento[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [pers, setPers] = useState<PerEdit[]>([]);
  const [equipSel, setEquipSel] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Carrega o estado a partir da versão de trabalho ao abrir.
  React.useEffect(() => {
    if (!visivel) return;
    setErro(null);
    setBusca('');
    const src = base?.periodicidades ?? [];
    setPers(src.map((p) => ({
      id: p.id || generateId(),
      nome: p.nome,
      frequencia: p.frequencia,
      atividadesTexto: (p.atividades ?? []).join('\n'),
      referencia: p.referencia ?? '',
      categorias: p.categorias,
      equipamentoIds: p.equipamentoIds,
    })));
    setEquipSel(base?.equipamentoIds ?? []);
  }, [visivel, base]);

  const equipFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return equipamentos;
    return equipamentos.filter((e) =>
      descreverEquip(e).toLowerCase().includes(q) ||
      (e.localizacao ?? '').toLowerCase().includes(q) ||
      (e.numeroSerie ?? '').toLowerCase().includes(q),
    );
  }, [equipamentos, busca]);

  function addPer() {
    setPers((atual) => [...atual, {
      id: generateId(), nome: '', frequencia: 'trimestral', atividadesTexto: '', referencia: '',
    }]);
  }
  function removePer(pid: string) {
    setPers((atual) => atual.filter((p) => p.id !== pid));
  }
  function patchPer(pid: string, patch: Partial<PerEdit>) {
    setPers((atual) => atual.map((p) => (p.id === pid ? { ...p, ...patch } : p)));
  }
  function toggleEquip(eid: string) {
    setEquipSel((atual) => (atual.includes(eid) ? atual.filter((x) => x !== eid) : [...atual, eid]));
  }

  async function salvar() {
    setErro(null);
    // Validação: cada periodicidade precisa de nome. Frequência sempre vem dos
    // chips (sempre conhecida). Atividades viram linhas não vazias.
    const limpos: PmocPeriodicidade[] = [];
    for (const p of pers) {
      if (!p.nome.trim()) { setErro('Toda periodicidade precisa de um nome.'); return; }
      limpos.push({
        id: p.id,
        nome: p.nome.trim(),
        frequencia: p.frequencia,
        atividades: p.atividadesTexto.split('\n').map((a) => a.trim()).filter(Boolean),
        categorias: p.categorias,
        equipamentoIds: p.equipamentoIds,
        referencia: p.referencia.trim() || undefined,
      });
    }
    setSalvando(true);
    try {
      await salvarPeriodicidades(planoId, limpos, equipSel);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar as periodicidades.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <View style={styles.editorContainer}>
        <GradientHeader
          onBack={onFechar}
          title="Periodicidades"
          subtitle="Rotinas + equipamentos do plano"
          compact
        />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl, gap: 14 }}>
          <View style={styles.caveat}>
            <MaterialCommunityIcons name="scale-balance" size={16} color={cores.warning} style={{ marginTop: 1 }} />
            <Text style={styles.caveatText}>
              O conteúdo abaixo é definido pelo responsável técnico. O app apenas registra e calcula os
              períodos — não declara conformidade com norma alguma.
            </Text>
          </View>

          {/* PERIODICIDADES */}
          <View style={styles.card}>
            <View style={styles.secaoHeader}>
              <MaterialCommunityIcons name="repeat-variant" size={18} color={cores.accentLight} />
              <Text style={styles.secaoTitulo}>Rotinas de manutenção</Text>
              <View style={{ flex: 1 }} />
              <BotaoTextoIcone label="Adicionar" icone="plus" onPress={addPer} />
            </View>

            {pers.length === 0 ? (
              <Text style={styles.vazioInlineText}>Nenhuma rotina. Toque em "Adicionar" para criar a primeira.</Text>
            ) : (
              <View style={{ gap: 14 }}>
                {pers.map((p, idx) => (
                  <View key={p.id} style={styles.perEdit}>
                    <View style={styles.perEditHeader}>
                      <Text style={styles.perEditNum}>Rotina {idx + 1}</Text>
                      <TouchableOpacity onPress={() => removePer(p.id)} accessibilityRole="button" accessibilityLabel={`Remover rotina ${idx + 1}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={cores.danger} />
                      </TouchableOpacity>
                    </View>
                    <OlliInput
                      label="Nome da rotina"
                      value={p.nome}
                      onChangeText={(t) => patchPer(p.id, { nome: t })}
                      placeholder='Ex.: "Limpeza de filtros"'
                    />
                    <Text style={styles.miniLabel}>Frequência</Text>
                    <View style={styles.freqChips}>
                      {FREQUENCIAS_PMOC.map((f) => {
                        const ativo = p.frequencia === f.id;
                        return (
                          <TouchableOpacity
                            key={f.id}
                            style={[styles.freqChip, ativo && styles.freqChipAtivo]}
                            onPress={() => patchPer(p.id, { frequencia: f.id })}
                            accessibilityRole="button"
                            accessibilityState={{ selected: ativo }}
                          >
                            <Text style={[styles.freqChipText, ativo && styles.freqChipTextAtivo]}>{f.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <OlliInput
                      label="Atividades (uma por linha)"
                      value={p.atividadesTexto}
                      onChangeText={(t) => patchPer(p.id, { atividadesTexto: t })}
                      placeholder={'Verificar pressão\nLimpar serpentina\nMedir corrente'}
                      multiline
                      numberOfLines={4}
                      helper="Cada linha vira um item do checklist da OS gerada."
                    />
                    <OlliInput
                      label="Referência normativa (opcional)"
                      value={p.referencia}
                      onChangeText={(t) => patchPer(p.id, { referencia: t })}
                      placeholder="Informada pelo responsável técnico"
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ESCOPO — EQUIPAMENTOS DO PLANO */}
          <View style={styles.card}>
            <View style={styles.secaoHeader}>
              <MaterialCommunityIcons name="air-conditioner" size={18} color={cores.accentLight} />
              <Text style={styles.secaoTitulo}>Equipamentos do plano</Text>
              <View style={styles.contagemPill}><Text style={styles.contagemText}>{equipSel.length}</Text></View>
            </View>

            {equipamentos.length === 0 ? (
              <Text style={styles.vazioInlineText}>
                Nenhum equipamento no inventário. Cadastre equipamentos na tela de Equipamentos primeiro.
              </Text>
            ) : (
              <>
                <OlliInput value={busca} onChangeText={setBusca} placeholder="Buscar equipamento..." leftIcon="magnify" />
                <View style={{ gap: 6, marginTop: 6 }}>
                  {equipFiltrados.slice(0, 60).map((e) => {
                    const sel = equipSel.includes(e.id);
                    return (
                      <TouchableOpacity
                        key={e.id}
                        style={[styles.equipPick, sel && styles.equipPickAtivo]}
                        onPress={() => toggleEquip(e.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: sel }}
                      >
                        <MaterialCommunityIcons
                          name={sel ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={20}
                          color={sel ? cores.accent : cores.onSurfaceMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.equipTitulo} numberOfLines={1}>{descreverEquip(e)}</Text>
                          <Text style={styles.equipSub} numberOfLines={1}>
                            {[labelCategoria(e.categoria ?? ''), e.localizacao?.trim()].filter(Boolean).join(' · ') || '—'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>

          {erro ? <Text style={styles.erroTexto}>{erro}</Text> : null}

          <OlliButton
            label="Salvar periodicidades"
            variant="gradient"
            fullWidth
            loading={salvando}
            onPress={salvar}
            icon={<MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />}
          />
          <Text style={styles.editorNota}>
            Salvar edita a versão de trabalho. Se a versão vigente já estiver aprovada, uma nova versão é
            criada e o plano volta para revisão — a versão assinada nunca é reescrita.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Registro de aprovação técnica (aprovarVersao)
// ─────────────────────────────────────────────────────────────
function AprovacaoModal({
  visivel, planoId, numeroVersao, onFechar, onAprovado,
}: {
  visivel: boolean;
  planoId: string;
  numeroVersao: number;
  onFechar: () => void;
  onAprovado: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [responsavel, setResponsavel] = useState('');
  const [doc, setDoc] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  React.useEffect(() => {
    if (visivel) { setResponsavel(''); setDoc(''); setErro(null); }
  }, [visivel]);

  async function confirmar() {
    setErro(null);
    if (!responsavel.trim()) { setErro('Informe o responsável técnico habilitado.'); return; }
    if (!doc.trim()) { setErro('Informe o documento de responsabilidade (ART/RRT/TRT).'); return; }
    setSalvando(true);
    try {
      await aprovarVersao(planoId, numeroVersao, responsavel, doc);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onAprovado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a aprovação.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Aprovação técnica · v{numeroVersao}</Text>
            <TouchableOpacity onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={24} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Spacing.base }}>
            <View style={[styles.caveat, { marginBottom: Spacing.md }]}>
              <MaterialCommunityIcons name="scale-balance" size={16} color={cores.warning} style={{ marginTop: 1 }} />
              <Text style={styles.caveatText}>
                Ao registrar, você confirma que um responsável técnico habilitado validou o conteúdo desta
                versão. O app apenas registra a responsabilidade informada — não valida nem declara
                conformidade com qualquer norma. A versão aprovada passa a ser imutável.
              </Text>
            </View>
            <OlliInput
              label="Responsável técnico"
              required
              value={responsavel}
              onChangeText={setResponsavel}
              placeholder="Nome do profissional habilitado"
              leftIcon="account-hard-hat"
            />
            <OlliInput
              label="Documento de responsabilidade"
              required
              value={doc}
              onChangeText={setDoc}
              placeholder="Nº da ART / RRT / TRT"
              leftIcon="file-certificate-outline"
            />
            {erro ? <Text style={styles.erroTexto}>{erro}</Text> : null}
          </ScrollView>

          <OlliButton
            label="Registrar aprovação"
            variant="gradient"
            fullWidth
            loading={salvando}
            onPress={confirmar}
            icon={<MaterialCommunityIcons name="certificate-outline" size={18} color="#fff" />}
            style={{ marginTop: Spacing.sm }}
          />
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  vazioTitulo: { fontSize: 18, fontWeight: '800', color: c.onSurface, marginTop: Spacing.md, textAlign: 'center' },
  vazioSub: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 6, textAlign: 'center', lineHeight: 19, maxWidth: 320 },

  card: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.base,
    ...sombrasDe(c).sm,
  },

  // rgba(247,178,59,x) era o warning estático — vira o warning do tema.
  caveat: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: c.warningLight, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: comAlfa(c.warning, 0.32), padding: Spacing.md,
  },
  caveatText: { flex: 1, fontSize: 12.5, color: c.onSurface, lineHeight: 18 },

  // rgba(11,111,206,x) era o primary estático — vira o primary do tema.
  aviso: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: c.primaryContainer, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: comAlfa(c.primary, 0.32), padding: Spacing.md,
  },
  avisoText: { flex: 1, fontSize: 12.5, color: c.primaryContainerText, lineHeight: 18 },

  // Linha de info (dado do plano)
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  linhaBorda: { borderBottomWidth: 1, borderBottomColor: c.outline },
  linhaRotulo: { fontSize: 13, color: c.onSurfaceVariant, width: 118 },
  linhaValor: { flex: 1, fontSize: 13.5, color: c.onSurface, fontWeight: '600', textAlign: 'right' },

  // Seção genérica
  secaoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  secaoTitulo: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  contagemPill: { backgroundColor: c.accentContainer, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 1, minWidth: 22, alignItems: 'center' },
  contagemText: { fontSize: 11, fontWeight: '800', color: c.accentLight },
  botaoTexto: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: BorderRadius.full, backgroundColor: c.surfacePressed },
  botaoTextoLabel: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },

  vazioInline: { paddingVertical: 4 },
  vazioInlineText: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19 },

  // Periodicidade (leitura)
  perCard: { backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: Spacing.md, gap: 7 },
  perHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  perNome: { flex: 1, fontSize: 14.5, fontWeight: '800', color: c.onSurface },
  freqPill: { backgroundColor: c.primaryContainer, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  freqPillText: { fontSize: 11, fontWeight: '800', color: c.primaryContainerText },
  perMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  perMeta: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  atividadesWrap: { marginTop: 2, gap: 4, borderTopWidth: 1, borderTopColor: c.outline, paddingTop: 8 },
  atividadeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  atividadeText: { flex: 1, fontSize: 13, color: c.onSurface, lineHeight: 18 },
  referenciaWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  referenciaText: { flex: 1, fontSize: 11.5, color: c.onSurfaceMuted, fontStyle: 'italic', lineHeight: 16 },

  // Equipamentos
  equipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, paddingVertical: 9, paddingHorizontal: 11 },
  equipTitulo: { fontSize: 13.5, fontWeight: '700', color: c.onSurface },
  equipSub: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: 1 },

  // Versões
  versaoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  versaoNum: { width: 38, height: 38, borderRadius: BorderRadius.chip, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline, alignItems: 'center', justifyContent: 'center' },
  versaoNumText: { fontSize: 13, fontWeight: '800', color: c.accentLight },
  versaoTitulo: { fontSize: 13.5, fontWeight: '700', color: c.onSurface },
  versaoSub: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: 1 },
  vigorTag: { backgroundColor: c.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  vigorTagText: { fontSize: 10.5, fontWeight: '800', color: c.success },

  // Gerar
  gerarHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gerarTitulo: { fontSize: 15, fontWeight: '800', color: c.onSurface },
  gerarDesc: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19, marginTop: 6 },
  gerarHint: { fontSize: 12, color: c.onSurfaceMuted, marginTop: 8, textAlign: 'center' },

  resultado: { marginTop: Spacing.md, backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.md },
  resultadoLinha: { flexDirection: 'row', justifyContent: 'space-around' },
  contador: { alignItems: 'center', gap: 2, flex: 1 },
  contadorNum: { fontSize: 22, fontWeight: '800' },
  contadorLabel: { fontSize: 11, color: c.onSurfaceVariant, fontWeight: '600' },
  resultadoNota: { fontSize: 12, color: c.onSurfaceVariant, lineHeight: 17, marginTop: Spacing.md, textAlign: 'center' },

  statusBadge: { borderRadius: BorderRadius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },

  // Editor
  editorContainer: { flex: 1, backgroundColor: c.background },
  miniLabel: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginBottom: 8 },
  freqChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  freqChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: BorderRadius.full, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline },
  freqChipAtivo: { backgroundColor: c.accentContainer, borderColor: c.accent },
  freqChipText: { fontSize: 12.5, fontWeight: '700', color: c.onSurfaceVariant },
  freqChipTextAtivo: { color: c.accentLight },
  perEdit: { backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: Spacing.md },
  perEditHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  perEditNum: { fontSize: 12, fontWeight: '800', color: c.accentLight, letterSpacing: 0.5 },
  equipPick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 11, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
  equipPickAtivo: { borderColor: c.accent, backgroundColor: c.surfacePressed },
  editorNota: { fontSize: 11.5, color: c.onSurfaceMuted, lineHeight: 17, marginTop: Spacing.md, textAlign: 'center' },

  // Modais em sheet (aprovação) — scrim padrão de modal, sempre escuro.
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: c.surfaceVariant,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base, paddingTop: Spacing.sm, maxHeight: '88%',
    borderTopWidth: 1, borderColor: c.strokeGlow,
  },
  modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: c.outlineDark, alignSelf: 'center', marginBottom: Spacing.sm },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  modalTitulo: { fontSize: 17, fontWeight: '800', color: c.onSurface },
  erroTexto: { color: c.danger, fontSize: 13, marginTop: 8 },
});

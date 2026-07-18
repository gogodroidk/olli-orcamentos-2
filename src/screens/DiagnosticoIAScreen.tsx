import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { EstadoIA } from '../components/EstadoIA';
import { SinalizarIA } from '../components/SinalizarIA';
import { diagnosticarCaso, motivoFalhaDiagnostico, type MotivoFalhaIA } from '../services/olliIA';
import { buscaExternaUrl, confiancaBaixa, type TipoErroIA } from '../services/erroIA';
import { DiagnosticoIA, DiagnosticoResultado } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { usePlano } from '../hooks/usePlano';

/** Depois de quantos segundos de loading o botão "Cancelar" aparece. */
const SEGUNDOS_PARA_MOSTRAR_CANCELAR = 4;

/**
 * O diagnóstico gerado, remontado como o texto corrido que o usuário LEU na
 * tela — é isso que ele denuncia quando toca em "Sinalizar", então é isso que
 * precisa chegar em quem modera. Um resumo só não serve: a frase problemática
 * pode estar num teste, numa peça ou na mensagem pro cliente.
 * Sem `fontes` (links, não conteúdo gerado) e sem `nivelConfianca` (metadado).
 */
function textoDoDiagnostico(d: DiagnosticoIA): string {
  const lista = (titulo: string, itens: string[]) =>
    itens?.length ? `${titulo}:\n${itens.map(t => `- ${t}`).join('\n')}` : '';
  return [
    d.resumo,
    d.significadoProvavel,
    lista('Testes em ordem', d.testesEmOrdem),
    lista('Causas mais comuns', d.causasComuns),
    lista('Peças suspeitas', d.pecasSuspeitas),
    lista('Não faça ainda', d.naoFacaAinda),
    d.mensagemCliente ? `Mensagem pro cliente:\n${d.mensagemCliente}` : '',
    d.sugestaoOrcamento ? `Sugestão de orçamento:\n${d.sugestaoOrcamento}` : '',
  ].filter(Boolean).join('\n\n');
}

/** O pedido do usuário, do jeito que ele digitou — nada além dos 4 campos do form. */
function descreverPedido(p: { marca?: string; modelo?: string; codigo?: string; sintoma?: string }): string {
  return [
    [p.marca, p.modelo].filter(Boolean).join(' '),
    p.codigo ? `código ${p.codigo}` : '',
    p.sintoma ? `sintoma: ${p.sintoma}` : '',
  ].filter(Boolean).join(' · ');
}

type Route = RouteProp<RootStackParamList, 'DiagnosticoIA'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DiagnosticoIAScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const p = route.params ?? {};

  const [marca, setMarca] = useState(p.marca ?? '');
  const [modelo, setModelo] = useState(p.modelo ?? '');
  const [codigo, setCodigo] = useState(p.codigo ?? '');
  const [sintoma, setSintoma] = useState(p.sintoma ?? '');
  const [loading, setLoading] = useState(false);
  const [podeCancelar, setPodeCancelar] = useState(false);
  const [res, setRes] = useState<DiagnosticoResultado | null>(null);
  // O pedido CONGELADO no instante da chamada. Ler os campos do form na hora de
  // sinalizar mandaria o que está na tela AGORA — e eles continuam editáveis
  // depois do resultado, então o moderador receberia um par que nunca existiu.
  const [pedidoDoResultado, setPedidoDoResultado] = useState('');
  const [motivoErro, setMotivoErro] = useState<MotivoFalhaIA>(null);
  const [avisoCota, setAvisoCota] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { temAcesso, usosIaRestantes, consumirUsoIa } = usePlano();
  // Grátis tem 3 usos de IA/mês (voz + chat + diagnóstico). Esgotou → o
  // diagnóstico continua funcionando pela base offline de 698 códigos (nunca
  // fica mudo), só sem a análise da nuvem, com um aviso caloroso + CTA.
  const iaNuvemEsgotada = !temAcesso('ia_ilimitada') && usosIaRestantes <= 0;

  // limpa timers/abort pendentes ao desmontar a tela
  useEffect(() => {
    return () => {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const podeEnviar = !!codigo.trim() || !!sintoma.trim();

  async function pedirDiagnostico() {
    if (!podeEnviar) return;
    Haptics.selectionAsync().catch(() => {});
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setPodeCancelar(false);
    setRes(null);
    setMotivoErro(null);
    setAvisoCota(iaNuvemEsgotada);
    cancelarTimerRef.current = setTimeout(() => setPodeCancelar(true), SEGUNDOS_PARA_MOSTRAR_CANCELAR * 1000);
    const alvo = {
      marca: marca.trim() || undefined,
      modelo: modelo.trim() || undefined,
      codigo: codigo.trim() || undefined,
      sintoma: sintoma.trim() || undefined,
    };
    try {
      const r = await diagnosticarCaso(alvo, controller.signal, { forcarOffline: iaNuvemEsgotada });
      setRes(r);
      setPedidoDoResultado(descreverPedido(alvo));
      setMotivoErro(motivoFalhaDiagnostico());
      // Só consome cota quando a NUVEM realmente respondeu (fonte 'ia').
      // A base offline (fonte 'base') e o cache são sempre livres.
      if (r.fonte === 'ia') await consumirUsoIa();
    } finally {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      setLoading(false);
      setPodeCancelar(false);
      abortRef.current = null;
    }
  }

  function cancelarDiagnostico() {
    Haptics.selectionAsync().catch(() => {});
    abortRef.current?.abort();
  }

  const d = res?.diagnostico;
  // Texto gerado que o usuário está lendo. Também é a `key` do <SinalizarIA>:
  // esta tela REUSA o mesmo lugar da árvore a cada "Pedir diagnóstico", e sem a
  // key um "Obrigado, vamos revisar" de um diagnóstico antigo ficaria colado no
  // novo — confirmando uma denúncia que ninguém fez sobre este conteúdo.
  const textoGerado = d ? textoDoDiagnostico(d) : '';

  // Taxonomia única de erro (erroIA.ts): decide UM motivo pra mostrar, nunca dois
  // avisos concorrentes (cota esgotada tinha prioridade visual, mas o aviso
  // genérico da nuvem também aparecia por baixo — agora só um, com cópia certa).
  const tipoErroAtual: TipoErroIA | undefined = avisoCota
    ? 'cota'
    : motivoErro
      ? motivoErro
      : res?.aviso
        ? 'desconhecido'
        : undefined;
  const onAcaoErro = avisoCota
    ? () => nav.navigate('Planos')
    : motivoErro
      ? pedirDiagnostico
      : undefined;
  // Fora da taxonomia (timeout/offline/servidor/auth/cota) o único aviso restante é
  // "IA não configurada" — mantém o texto exato do serviço, mais preciso que a
  // cópia genérica de 'desconhecido'.
  const mensagemErroAtual = !avisoCota && !motivoErro ? res?.aviso : undefined;

  // Cria um novo orçamento já com um item-serviço descrevendo o reparo do caso.
  // O técnico só ajusta preço/quantidade no fluxo do orçamento.
  function criarOrcamento() {
    if (!d) return;
    Haptics.selectionAsync().catch(() => {});
    const partes = [marca.trim(), modelo.trim()].filter(Boolean).join(' ');
    const ref = codigo.trim() ? `código ${codigo.trim()}` : sintoma.trim();
    const nome = [
      'Diagnóstico e reparo',
      partes ? `— ${partes}` : '',
      ref ? `(${ref})` : '',
    ].filter(Boolean).join(' ').trim() || 'Serviço de diagnóstico e reparo';
    const descricao = d.sugestaoOrcamento?.trim() || d.significadoProvavel?.trim() || d.resumo?.trim();
    nav.navigate('NovoOrcamento', {
      prefillItem: { tipo: 'servico', nome, descricao },
    });
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="Me ajuda com esse caso" subtitle="OLLI Técnica · diagnóstico guiado" onBack={() => goBackOrHome(nav)} />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* FORM */}
        <View style={styles.card}>
          <View style={styles.rowFields}>
            <OlliInput label="Marca" value={marca} onChangeText={setMarca} placeholder="Ex: Fujitsu" containerStyle={{ flex: 1, marginRight: 10 }} />
            <OlliInput label="Modelo" value={modelo} onChangeText={setModelo} placeholder="Ex: ASBG12" containerStyle={{ flex: 1 }} />
          </View>
          <OlliInput label="Código / display" value={codigo} onChangeText={setCodigo} placeholder='Ex: "EE:04" ou "3 piscadas"' autoCapitalize="characters" />
          <OlliInput label="Sintoma" value={sintoma} onChangeText={setSintoma} placeholder="O que a máquina está fazendo?" multiline containerStyle={{ marginBottom: 4 }} />
          <OlliButton
            label={loading ? 'Analisando…' : 'Pedir diagnóstico'}
            variant="gradient"
            size="lg"
            fullWidth
            onPress={pedirDiagnostico}
            disabled={!podeEnviar || loading}
            icon={loading ? undefined : <MaterialCommunityIcons name="robot-happy-outline" size={20} color="#fff" />}
          />
        </View>

        {loading && (
          <EstadoIA
            variante="carregando"
            titulo="A OLLI está pensando"
            mensagem="Cruzando código, marca e a base…"
            onDark
            onAcaoSecundaria={podeCancelar ? cancelarDiagnostico : undefined}
            acaoSecundariaLabel="Cancelar"
          >
            <OlliSkeleton.Lines count={4} style={{ width: '100%', marginTop: 16 }} />
          </EstadoIA>
        )}

        {d && (
          <View>
            {/* origem do diagnóstico */}
            <AnimatedEntrance index={0}>
              <View style={styles.originRow}>
                <View style={[styles.originPill, res!.fonte === 'base' ? styles.originBase : styles.originIa]}>
                  <MaterialCommunityIcons
                    name={res!.fonte === 'base' ? 'database-search-outline' : res!.fonte === 'cache' ? 'lightning-bolt-outline' : 'robot-happy-outline'}
                    size={13}
                    color={res!.fonte === 'base' ? cores.warning : cores.accentLight}
                  />
                  <Text style={[styles.originText, { color: res!.fonte === 'base' ? cores.warning : cores.accentLight }]}>
                    {res!.fonte === 'base' ? 'Base de códigos' : res!.fonte === 'cache' ? 'Cache' : `OLLI Técnica${res!.modelo ? ` · ${res!.modelo}` : ''}`}
                  </Text>
                </View>
                <View style={[styles.confBadge, { backgroundColor: confColor(d.nivelConfianca, cores) + '22' }]}>
                  <Text style={[styles.confText, { color: confColor(d.nivelConfianca, cores) }]}>Confiança {d.nivelConfianca}</Text>
                </View>
              </View>
            </AnimatedEntrance>

            {!!tipoErroAtual && (
              <AnimatedEntrance index={1}>
                <EstadoIA
                  variante="erro"
                  tipoErro={tipoErroAtual}
                  mensagem={mensagemErroAtual}
                  onAcao={onAcaoErro}
                  tamanho={34}
                  style={styles.avisoCard}
                />
              </AnimatedEntrance>
            )}

            <AnimatedEntrance index={2}>
              <Text style={styles.resumo}>{d.resumo}</Text>
              {!!d.significadoProvavel && <Text style={styles.significado}>{d.significadoProvavel}</Text>}
            </AnimatedEntrance>

            {/* Item 1.15 — recuperação honesta: confiança baixa também abre uma
                busca REAL (Google/YouTube) com o que já se sabe do aparelho. Zero
                IA nova, zero alucinação. */}
            {confiancaBaixa(d.nivelConfianca) && (
              <AnimatedEntrance index={2}>
                <View style={styles.buscaExterna}>
                  <MaterialCommunityIcons name="magnify" size={15} color={cores.onSurfaceVariant} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.buscaExternaText}>
                      Confiança baixa — vale buscar por fora com o que você já sabe do aparelho.
                    </Text>
                    <View style={styles.buscaExternaBtns}>
                      <OlliButton
                        label="Buscar no Google"
                        variant="outline"
                        size="sm"
                        haptic={false}
                        icon={<MaterialCommunityIcons name="google" size={15} color={cores.accentLight} />}
                        onPress={() => Linking.openURL(buscaExternaUrl('google', { marca, modelo, codigo, sintoma })).catch(() => {})}
                      />
                      <OlliButton
                        label="Buscar no YouTube"
                        variant="outline"
                        size="sm"
                        haptic={false}
                        icon={<MaterialCommunityIcons name="youtube" size={15} color={cores.accentLight} />}
                        onPress={() => Linking.openURL(buscaExternaUrl('youtube', { marca, modelo, codigo, sintoma })).catch(() => {})}
                      />
                    </View>
                  </View>
                </View>
              </AnimatedEntrance>
            )}

            <AnimatedEntrance index={3}>
              <ListSection icon="format-list-numbered" title="Testes em ordem" items={d.testesEmOrdem} accent />
            </AnimatedEntrance>
            <AnimatedEntrance index={4}>
              <ListSection icon="magnify" title="Causas mais comuns" items={d.causasComuns} />
            </AnimatedEntrance>
            <AnimatedEntrance index={5}>
              <ListSection icon="wrench-outline" title="Peças suspeitas" items={d.pecasSuspeitas} />
            </AnimatedEntrance>

            {d.naoFacaAinda?.length > 0 && (
              <AnimatedEntrance index={6}>
                <View style={styles.warnBox}>
                  <View style={styles.warnHead}>
                    <MaterialCommunityIcons name="alert-octagon-outline" size={18} color={cores.warning} />
                    <Text style={styles.warnTitle}>Não faça ainda</Text>
                  </View>
                  {d.naoFacaAinda.map((t, i) => <Text key={i} style={styles.warnItem}>• {t}</Text>)}
                </View>
              </AnimatedEntrance>
            )}

            {!!d.mensagemCliente && (
              <AnimatedEntrance index={7}>
                <Block icon="message-text-outline" title="Mensagem pro cliente" text={d.mensagemCliente} />
              </AnimatedEntrance>
            )}
            {!!d.sugestaoOrcamento && (
              <AnimatedEntrance index={8}>
                <Block icon="file-document-outline" title="Sugestão de orçamento" text={d.sugestaoOrcamento} />
              </AnimatedEntrance>
            )}

            {d.fontes?.length > 0 && (
              <AnimatedEntrance index={9}>
                <ListSection icon="link-variant" title="Fontes" items={d.fontes} />
              </AnimatedEntrance>
            )}

            {/* CTA — vira orçamento com 1 toque (ciclo do dinheiro) */}
            <OlliButton
              label="Criar orçamento com este serviço"
              variant="gradient"
              size="lg"
              fullWidth
              onPress={criarOrcamento}
              icon={<MaterialCommunityIcons name="file-plus-outline" size={20} color="#fff" />}
              style={{ marginTop: 16 }}
            />

            {/* Denúncia de conteúdo gerado (política de AI-Generated Content da
                Google Play) — depois e bem abaixo do CTA, de propósito. O
                diagnóstico continua na tela inteiro: sinalizar não apaga nada. */}
            <SinalizarIA
              key={textoGerado}
              tela="DiagnosticoIAScreen"
              resposta={textoGerado}
              pedido={pedidoDoResultado}
              style={{ marginTop: 14, alignSelf: 'center' }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function confColor(nivel: string, c: Cores): string {
  const v = (nivel || '').toLowerCase();
  if (v.startsWith('baix')) return c.danger;
  if (v.startsWith('méd') || v.startsWith('med')) return c.warning;
  return c.success;
}

function ListSection({ icon, title, items, accent }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; items: string[]; accent?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  if (!items || items.length === 0) return null;
  return (
    <View style={[styles.section, accent && styles.sectionAccent]}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon} size={16} color={accent ? cores.accentLight : cores.onSurfaceVariant} />
        <Text style={[styles.sectionTitle, accent && { color: cores.accentLight }]}>{title}</Text>
      </View>
      {items.map((t, i) => <Text key={i} style={styles.sectionItem}>{/^\s*\d/.test(t) ? '' : '• '}{t}</Text>)}
    </View>
  );
}

function Block({ icon, title, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; text: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon} size={16} color={cores.onSurfaceVariant} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.blockText}>{text}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  rowFields: { flexDirection: 'row' },
  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, borderWidth: 1, borderColor: c.outline, ...sombrasDe(c).sm },

  originRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  originPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full, borderWidth: 1 },
  // Cyan/amarelo fixos (base #7FE9F5 / warning do handoff): decorativos, sem chave semântica exata.
  originIa: { backgroundColor: 'rgba(127,233,245,0.10)', borderColor: 'rgba(127,233,245,0.3)' },
  originBase: { backgroundColor: 'rgba(247,178,59,0.10)', borderColor: 'rgba(247,178,59,0.3)' },
  originText: { fontSize: 11.5, fontWeight: '800' },
  confBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5 },
  confText: { fontSize: 11.5, fontWeight: '800' },

  avisoCard: { marginBottom: 12, paddingVertical: Spacing.base },

  buscaExterna: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, padding: 10, marginBottom: 12 },
  buscaExternaText: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, lineHeight: 17 },
  buscaExternaBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },

  resumo: { fontSize: 18, fontWeight: '800', color: c.onSurface, lineHeight: 24 },
  significado: { fontSize: 14, color: c.onSurfaceVariant, lineHeight: 20, marginTop: 4 },

  section: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, marginTop: 12 },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  sectionAccent: { borderColor: 'rgba(52,198,217,0.35)', backgroundColor: 'rgba(52,198,217,0.06)' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionItem: { fontSize: 14.5, color: c.onSurface, lineHeight: 22 },
  blockText: { fontSize: 14.5, color: c.onSurface, lineHeight: 21 },

  // Amarelo/warning fixo do handoff cockpit; próximo de `warningLight` mas alfa/hex não batem (ver rule 7).
  warnBox: { backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.lg, padding: Spacing.base, marginTop: 12 },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  warnTitle: { fontSize: 14, fontWeight: '800', color: c.warning },
  warnItem: { fontSize: 13.5, color: c.onSurface, lineHeight: 20 },
});

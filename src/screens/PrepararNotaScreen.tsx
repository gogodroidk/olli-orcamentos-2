import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Share, Linking, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliCard } from '../components/OlliCard';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { OlliPressable } from '../components/OlliPressable';
import { getCliente, getEmpresa, getOrcamento, getRecibo } from '../database/database';
import { usePermissao } from '../hooks/usePermissao';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import {
  guardarNotaPreparada,
  lerInteresseNotaAutomatica,
  lerNotaDoRecibo,
  marcarNotaEmitida,
  registrarInteresseNotaAutomatica,
  textoDesligado,
  voltarNotaParaPreparada,
  type LeituraInteresse,
  type LeituraNota,
} from '../services/notaPreparada';
import {
  AVISO_NAO_EMITE,
  CODIGOS_NACIONAIS,
  LIMITE_DESCRICAO,
  OBRIGATORIEDADE_NFSE,
  ROTULO_INTERESSE_NOTA_AUTOMATICA,
  TEXTO_INTERESSE_NOTA_AUTOMATICA,
  TEXTO_INTERESSE_REGISTRADO,
  URL_EMISSOR_NACIONAL,
  camposParaCopiar,
  checklistNota,
  formatarCodigoNacional,
  normalizarCodigoNacional,
  prepararDadosNota,
  sugerirCodigoServico,
  type CampoCopiavel,
  type EntradaNota,
} from '../utils/notaServico';
import { formatDateTime } from '../utils/date';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rota = RouteProp<RootStackParamList, 'PrepararNota'>;

type Origem = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'valor'; entrada: EntradaNota };

/**
 * "OLLI PREPARA A NOTA" — a NFS-e montada a partir de um recibo, para o prestador
 * copiar campo a campo no Emissor Nacional (mobile e desktop, a mesma tela).
 *
 * O OLLI NÃO EMITE: nenhum botão aqui diz "emitir". A regra da nota (código por
 * ofício, descrição, município do ISS, checklist) é a mesma do painel
 * (utils/notaServico.ts). Três estados em tudo que vem de fora: o recibo local
 * (carregando | erro | valor) e o que está guardado na nuvem (carregando | erro |
 * desligado | valor). "Não consegui ver" nunca vira "ainda não guardada".
 */
export default function PrepararNotaScreen() {
  const nav = useNavigation<Nav>();
  const { reciboId } = useRoute<Rota>().params;
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { papel, carregando: carregandoPapel } = usePermissao();
  // Recibo é do DONO (RLS: auth.uid() = user_id). Membro não guarda nem marca.
  const ehDono = !carregandoPapel && (papel === null || papel === 'owner');

  const [origem, setOrigem] = useState<Origem>({ tipo: 'carregando' });
  const [salva, setSalva] = useState<LeituraNota | { tipo: 'carregando' }>({ tipo: 'carregando' });
  const [interesse, setInteresse] = useState<LeituraInteresse | { tipo: 'carregando' }>({ tipo: 'carregando' });
  const [codigo, setCodigo] = useState<string | null>(null);
  const [outroCodigo, setOutroCodigo] = useState('');
  const [descricao, setDescricao] = useState<string | null>(null);
  const [numero, setNumero] = useState('');
  const [ocupado, setOcupado] = useState<null | 'guardar' | 'emitida' | 'voltar' | 'interesse'>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const montado = useRef(true);

  const carregarOrigem = useCallback(async () => {
    setOrigem({ tipo: 'carregando' });
    try {
      const recibo = await getRecibo(reciboId);
      if (!recibo) {
        if (montado.current) setOrigem({ tipo: 'erro', mensagem: 'Recibo não encontrado neste aparelho.' });
        return;
      }
      const [empresa, cliente, orcamento] = await Promise.all([
        getEmpresa(),
        recibo.clienteId ? getCliente(recibo.clienteId) : Promise.resolve(null),
        recibo.orcamentoId ? getOrcamento(recibo.orcamentoId) : Promise.resolve(null),
      ]);
      if (montado.current) setOrigem({ tipo: 'valor', entrada: { recibo, empresa, cliente, orcamento } });
    } catch {
      if (montado.current) setOrigem({ tipo: 'erro', mensagem: 'Não consegui ler o recibo agora.' });
    }
  }, [reciboId]);

  const carregarSalva = useCallback(async () => {
    setSalva({ tipo: 'carregando' });
    const r = await lerNotaDoRecibo(reciboId);
    if (!montado.current) return;
    setSalva(r);
    // O que já foi escolhido e guardado volta para a tela (código e descrição).
    if (r.tipo === 'valor' && r.nota) {
      setCodigo(r.nota.dados.servico.codigo);
      setDescricao(r.nota.dados.servico.descricao);
    }
  }, [reciboId]);

  const carregarInteresse = useCallback(async () => {
    setInteresse({ tipo: 'carregando' });
    const r = await lerInteresseNotaAutomatica();
    if (montado.current) setInteresse(r);
  }, []);

  useEffect(() => {
    montado.current = true;
    void carregarOrigem();
    void carregarSalva();
    void carregarInteresse();
    return () => {
      montado.current = false;
    };
  }, [carregarOrigem, carregarSalva, carregarInteresse]);

  const entrada = origem.tipo === 'valor' ? origem.entrada : null;
  const notaSalva = salva.tipo === 'valor' ? salva.nota : null;
  const emitida = notaSalva?.status === 'emitida';

  // Nota emitida: mostra o que foi guardado (o que foi para o portal), não o recalculado.
  const dados = useMemo(() => {
    if (emitida && notaSalva) return notaSalva.dados;
    if (!entrada) return null;
    return prepararDadosNota(entrada, { codigo, descricao });
  }, [emitida, notaSalva, entrada, codigo, descricao]);

  const sugestao = useMemo(() => sugerirCodigoServico(entrada?.empresa?.verticais), [entrada]);
  const opcoesCodigo = useMemo(() => {
    const lista = sugestao ? [sugestao.principal, ...sugestao.alternativas] : Object.values(CODIGOS_NACIONAIS);
    const atual = dados?.servico.codigo;
    if (atual && CODIGOS_NACIONAIS[atual] && !lista.some((c) => c.codigo === atual)) lista.push(CODIGOS_NACIONAIS[atual]);
    return lista;
  }, [sugestao, dados?.servico.codigo]);

  const campos = useMemo(() => (dados ? camposParaCopiar(dados) : []), [dados]);
  const checklist = useMemo(() => (dados ? checklistNota(dados) : []), [dados]);

  async function copiar(campo: CampoCopiavel) {
    if (!campo.valor) return;
    if (Platform.OS === 'web') {
      try {
        const n = (typeof navigator !== 'undefined' ? navigator : undefined) as
          | { clipboard?: { writeText?: (texto: string) => Promise<void> } }
          | undefined;
        if (n?.clipboard?.writeText) {
          await n.clipboard.writeText(campo.valor);
          setCopiado(campo.id);
          return;
        }
      } catch {
        /* sem permissão de área de transferência: cai no compartilhar */
      }
    }
    // Celular sem biblioteca de área de transferência: o menu do sistema tem "Copiar".
    try {
      await Share.share({ message: campo.valor });
    } catch {
      /* cancelado */
    }
  }

  function aplicarOutroCodigo() {
    const c = normalizarCodigoNacional(outroCodigo);
    if (c) setCodigo(c);
  }

  async function guardar() {
    if (!dados || emitida) return;
    setOcupado('guardar');
    setMensagem(null);
    const r = await guardarNotaPreparada(dados);
    if (!montado.current) return;
    setOcupado(null);
    if (r.ok) {
      setSalva({ tipo: 'valor', nota: r.nota });
      setMensagem({ tipo: 'ok', texto: 'Nota preparada guardada. Ela ainda não foi emitida.' });
    } else {
      setMensagem({ tipo: 'erro', texto: r.motivo === 'desligado' ? textoDesligado('sem_tabela') : 'Não consegui guardar agora. Nada foi alterado.' });
    }
  }

  async function informarEmitida() {
    if (!notaSalva) return;
    setOcupado('emitida');
    setMensagem(null);
    const r = await marcarNotaEmitida(notaSalva.id, numero);
    if (!montado.current) return;
    setOcupado(null);
    if (r.ok) {
      setSalva({ tipo: 'valor', nota: r.nota });
      setNumero('');
      setMensagem({ tipo: 'ok', texto: `Anotado: NFS-e nº ${r.nota.numero} emitida por você.` });
    } else if (r.motivo === 'numero_invalido') {
      setMensagem({ tipo: 'erro', texto: 'Digite o número da NFS-e (até 13 números) ou a chave de acesso (50 números).' });
    } else {
      setMensagem({ tipo: 'erro', texto: 'Não consegui anotar agora. Nada foi alterado.' });
    }
  }

  async function desfazerEmitida() {
    if (!notaSalva) return;
    setOcupado('voltar');
    setMensagem(null);
    const r = await voltarNotaParaPreparada(notaSalva.id);
    if (!montado.current) return;
    setOcupado(null);
    if (r.ok) setSalva({ tipo: 'valor', nota: r.nota });
    else setMensagem({ tipo: 'erro', texto: 'Não consegui desfazer agora. Nada foi alterado.' });
  }

  async function quererNotaAutomatica() {
    setOcupado('interesse');
    const r = await registrarInteresseNotaAutomatica('app');
    if (!montado.current) return;
    setOcupado(null);
    if (r === 'ok') setInteresse({ tipo: 'valor', registrado: true });
    else if (r === 'desligado') setInteresse({ tipo: 'desligado', motivo: 'sem_tabela' });
    else setMensagem({ tipo: 'erro', texto: 'Não consegui registrar seu interesse agora. Tente de novo.' });
  }

  const subtitulo = entrada ? `Recibo ${entrada.recibo.numero} · ${entrada.recibo.clienteNome}` : 'Dados para o Emissor Nacional';

  return (
    <View style={styles.tela}>
      <GradientHeader title="Preparar nota fiscal" subtitle={subtitulo} onBack={() => goBackOrHome(nav)} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <OlliCard style={styles.aviso}>
            <MaterialCommunityIcons name="information-outline" size={20} color={cores.primaryLight} />
            <View style={styles.flex}>
              <Text style={styles.avisoTexto}>{AVISO_NAO_EMITE}</Text>
              <Text style={styles.avisoMenor}>{OBRIGATORIEDADE_NFSE}</Text>
            </View>
          </OlliCard>

          {origem.tipo === 'carregando' ? (
            <View style={styles.centro}>
              <ActivityIndicator color={cores.primaryLight} />
              <Text style={styles.muted}>Lendo o recibo…</Text>
            </View>
          ) : origem.tipo === 'erro' ? (
            <OlliCard style={styles.bloco}>
              <Text style={styles.erroTexto}>{origem.mensagem}</Text>
              <OlliButton label="Tentar de novo" variant="outline" size="sm" onPress={carregarOrigem} />
            </OlliCard>
          ) : dados ? (
            <>
              {/* ─── Status guardado (3 estados + desligado) ─── */}
              <OlliCard style={styles.bloco}>
                <Text style={styles.secao}>Situação</Text>
                {salva.tipo === 'carregando' ? (
                  <Text style={styles.muted}>Conferindo se esta nota já foi guardada…</Text>
                ) : salva.tipo === 'erro' ? (
                  <View style={styles.linhaAcao}>
                    <Text style={[styles.erroTexto, styles.flex]}>Não consegui ver se esta nota já foi guardada.</Text>
                    <OlliButton label="Tentar de novo" variant="outline" size="sm" onPress={carregarSalva} />
                  </View>
                ) : salva.tipo === 'desligado' ? (
                  <Text style={styles.muted}>{textoDesligado(salva.motivo)}</Text>
                ) : !notaSalva ? (
                  <Text style={styles.texto}>Ainda não guardada. Os dados abaixo foram montados a partir do recibo.</Text>
                ) : notaSalva.status === 'emitida' ? (
                  <Text style={styles.okTexto}>
                    Emitida por você · NFS-e nº {notaSalva.numero}
                    {notaSalva.emitidaEm ? ` · anotada em ${formatDateTime(notaSalva.emitidaEm)}` : ''}
                  </Text>
                ) : (
                  <Text style={styles.texto}>
                    Preparada{notaSalva.atualizadoEm ? ` em ${formatDateTime(notaSalva.atualizadoEm)}` : ''}. Ainda não emitida.
                  </Text>
                )}
              </OlliCard>

              {/* ─── Código de serviço ─── */}
              {!emitida && (
                <OlliCard style={styles.bloco}>
                  <Text style={styles.secao}>Código do serviço</Text>
                  {sugestao ? (
                    <Text style={styles.texto}>
                      Sugestão para {sugestao.oficioLabel}: {formatarCodigoNacional(sugestao.principal.codigo)}. {sugestao.explicacao}
                    </Text>
                  ) : (
                    <Text style={styles.texto}>
                      Seu ofício não tem uma sugestão. Escolha o código que descreve o serviço que você fez, ou digite outro.
                    </Text>
                  )}
                  <View style={styles.chips}>
                    {opcoesCodigo.map((c) => {
                      const ativo = dados.servico.codigo === c.codigo;
                      return (
                        <OlliPressable
                          key={c.codigo}
                          onPress={() => setCodigo(c.codigo)}
                          style={[styles.chip, ativo && styles.chipAtivo]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: ativo }}
                          accessibilityLabel={`${formatarCodigoNacional(c.codigo)}, ${c.titulo}`}
                        >
                          <Text style={[styles.chipCodigo, ativo && styles.chipTextoAtivo]}>{formatarCodigoNacional(c.codigo)}</Text>
                          <Text style={[styles.chipTitulo, ativo && styles.chipTextoAtivo]} numberOfLines={2}>{c.titulo}</Text>
                        </OlliPressable>
                      );
                    })}
                  </View>
                  <View style={styles.linhaAcao}>
                    <OlliInput
                      label="Outro código (6 números)"
                      value={outroCodigo}
                      onChangeText={setOutroCodigo}
                      keyboardType="numeric"
                      placeholder="Ex.: 14.01.01"
                      containerStyle={styles.flex}
                      error={outroCodigo && !normalizarCodigoNacional(outroCodigo) ? 'São 6 números: item, subitem e desdobramento.' : undefined}
                    />
                    <OlliButton label="Usar" variant="outline" size="sm" onPress={aplicarOutroCodigo} disabled={!normalizarCodigoNacional(outroCodigo)} />
                  </View>
                </OlliCard>
              )}

              {/* ─── Campos para copiar ─── */}
              <OlliCard style={styles.bloco}>
                <Text style={styles.secao}>Copie campo a campo</Text>
                {(['Pessoas', 'Serviço', 'Valores'] as const).map((etapa) => (
                  <View key={etapa} style={styles.etapa}>
                    <Text style={styles.etapaTitulo}>Tela “{etapa}” do emissor</Text>
                    {campos.filter((c) => c.etapa === etapa).map((c) => (
                      <View key={c.id} style={styles.campo}>
                        <View style={styles.flex}>
                          <Text style={styles.campoRotulo}>{c.rotulo}</Text>
                          {c.id === 'descricao' && !emitida ? (
                            <OlliInput
                              label="Descrição (pode editar)"
                              value={dados.servico.descricao}
                              onChangeText={setDescricao}
                              multiline
                              maxLength={LIMITE_DESCRICAO}
                              helper={`${dados.servico.descricao.length}/${LIMITE_DESCRICAO} caracteres`}
                            />
                          ) : (
                            <Text style={c.exibicao ? styles.campoValor : styles.campoFaltando} selectable>
                              {c.exibicao || 'Falta este dado'}
                            </Text>
                          )}
                          {c.dica ? <Text style={styles.campoDica}>{c.dica}</Text> : null}
                        </View>
                        <OlliButton
                          label={copiado === c.id ? 'Copiado' : 'Copiar'}
                          variant="ghost"
                          size="sm"
                          onPress={() => copiar(c)}
                          disabled={!c.valor}
                          accessibilityLabel={Platform.OS === 'web' ? `Copiar ${c.rotulo}` : `Copiar ${c.rotulo} pelo menu do sistema`}
                          icon={<MaterialCommunityIcons name={copiado === c.id ? 'check' : 'content-copy'} size={16} color={cores.onSurfaceVariant} />}
                        />
                      </View>
                    ))}
                  </View>
                ))}
                {descricao !== null && !emitida && (
                  <OlliButton label="Voltar à descrição automática" variant="ghost" size="sm" onPress={() => setDescricao(null)} />
                )}
              </OlliCard>

              {/* ─── Checklist ─── */}
              <OlliCard style={styles.bloco}>
                <Text style={styles.secao}>Antes de emitir, confira</Text>
                {checklist.map((i) => (
                  <View key={i.id} style={styles.checkItem}>
                    <MaterialCommunityIcons
                      name={i.alerta ? 'alert-circle-outline' : 'checkbox-blank-outline'}
                      size={18}
                      color={i.alerta ? cores.warning : cores.onSurfaceVariant}
                    />
                    <Text style={[styles.texto, styles.flex, i.alerta && styles.alertaTexto]}>{i.texto}</Text>
                  </View>
                ))}
              </OlliCard>

              {/* ─── Ações ─── */}
              <OlliCard style={styles.bloco}>
                <OlliButton
                  label="Abrir o Emissor Nacional"
                  variant="gradient"
                  fullWidth
                  onPress={() => Linking.openURL(URL_EMISSOR_NACIONAL).catch(() => undefined)}
                  icon={<MaterialCommunityIcons name="open-in-new" size={18} color="#fff" />}
                />
                {carregandoPapel ? (
                  <Text style={styles.muted}>Verificando suas permissões…</Text>
                ) : !ehDono ? (
                  <Text style={styles.muted}>A nota é guardada pelo dono da conta, que emite os recibos.</Text>
                ) : salva.tipo === 'valor' ? (
                  emitida ? (
                    <OlliButton label="Não emiti: voltar para preparada" variant="ghost" size="sm" loading={ocupado === 'voltar'} disabled={!!ocupado} onPress={desfazerEmitida} />
                  ) : (
                    <>
                      <OlliButton
                        label={notaSalva ? 'Atualizar nota preparada' : 'Guardar nota preparada'}
                        variant="outline"
                        fullWidth
                        loading={ocupado === 'guardar'}
                        disabled={!!ocupado}
                        onPress={guardar}
                      />
                      {notaSalva && (
                        <View style={styles.linhaAcao}>
                          <OlliInput
                            label="Já emitiu? Número da NFS-e"
                            value={numero}
                            onChangeText={setNumero}
                            keyboardType="numeric"
                            placeholder="Número que o portal mostrou"
                            containerStyle={styles.flex}
                          />
                          <OlliButton label="Anotar" size="sm" loading={ocupado === 'emitida'} disabled={!!ocupado || !numero.trim()} onPress={informarEmitida} />
                        </View>
                      )}
                    </>
                  )
                ) : null}
                {mensagem && <Text style={mensagem.tipo === 'ok' ? styles.okTexto : styles.erroTexto} accessibilityLiveRegion="polite">{mensagem.texto}</Text>}
              </OlliCard>

              {/* ─── Pré-venda: nota automática (sem preço, sem cobrança) ─── */}
              <OlliCard style={styles.bloco}>
                <Text style={styles.secao}>Nota automática</Text>
                {interesse.tipo === 'valor' && interesse.registrado ? (
                  <Text style={styles.okTexto}>{TEXTO_INTERESSE_REGISTRADO}</Text>
                ) : (
                  <>
                    <Text style={styles.texto}>{TEXTO_INTERESSE_NOTA_AUTOMATICA}</Text>
                    {interesse.tipo === 'carregando' ? (
                      <Text style={styles.muted}>Carregando…</Text>
                    ) : interesse.tipo === 'erro' ? (
                      <View style={styles.linhaAcao}>
                        <Text style={[styles.erroTexto, styles.flex]}>Não consegui ver se você já pediu.</Text>
                        <OlliButton label="Tentar de novo" variant="outline" size="sm" onPress={carregarInteresse} />
                      </View>
                    ) : interesse.tipo === 'desligado' ? (
                      <Text style={styles.muted}>
                        {interesse.motivo === 'sem_tabela'
                          ? 'O registro de interesse ainda está desligado no servidor.'
                          : 'Entre na sua conta para registrar o interesse.'}
                      </Text>
                    ) : (
                      <OlliButton label={ROTULO_INTERESSE_NOTA_AUTOMATICA} variant="outline" loading={ocupado === 'interesse'} disabled={!!ocupado} onPress={quererNotaAutomatica} />
                    )}
                  </>
                )}
              </OlliCard>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    scroll: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxxl },
    centro: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
    aviso: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
    avisoTexto: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.onSurface, lineHeight: 20 },
    avisoMenor: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: Spacing.xs, lineHeight: 17 },
    bloco: { gap: Spacing.sm },
    secao: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
    texto: { fontSize: 14, fontFamily: Fonts.regular, color: c.onSurface, lineHeight: 20 },
    muted: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, lineHeight: 18 },
    erroTexto: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.danger, lineHeight: 18 },
    okTexto: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.success, lineHeight: 20 },
    alertaTexto: { color: c.onSurface, fontFamily: Fonts.semiBold },
    linhaAcao: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: {
      minWidth: 140,
      maxWidth: 260,
      flexGrow: 1,
      flexBasis: 140,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1.5,
      borderColor: c.strokeGlow,
      backgroundColor: c.surfaceVariant,
    },
    chipAtivo: { borderColor: c.primaryLight, backgroundColor: c.surface },
    chipCodigo: { fontSize: 14, fontFamily: Fonts.extraBold, color: c.onSurface },
    chipTitulo: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: 2 },
    chipTextoAtivo: { color: c.primaryLight },
    etapa: { gap: Spacing.xs, marginTop: Spacing.xs },
    etapaTitulo: { fontSize: 12, fontFamily: Fonts.extraBold, color: c.primaryLight },
    campo: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.strokeGlow,
    },
    campoRotulo: { fontSize: 12, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant },
    campoValor: { fontSize: 15, fontFamily: Fonts.regular, color: c.onSurface, marginTop: 2, lineHeight: 21 },
    campoFaltando: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.warning, marginTop: 2 },
    campoDica: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: 4, lineHeight: 17 },
    checkItem: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  });

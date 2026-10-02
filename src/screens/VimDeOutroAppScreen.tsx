import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliCard } from '../components/OlliCard';
import { OlliInput } from '../components/OlliInput';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { WHATSAPP_SUPORTE } from '../config';
import { CREDITO_TROCA_MESES_MAX, CREDITO_TROCA_PEDIDOS_MAX } from '../services/limitesComerciais';
import {
  resumoPedidoTroca,
  validarFormularioTroca,
  APP_ANTERIOR_MAX,
  OBSERVACAO_MAX,
  type EstadoPedidoTroca,
} from '../services/creditoTrocaRegras';
import { enviarPedidoTroca, obterMeuPedidoTroca, prepararComprovante, type ComprovantePreparado } from '../services/creditoTroca';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * "Vim de outro app" — crédito de troca.
 *
 * Quem já pagou outro app de orçamento manda o print da assinatura de lá; uma
 * pessoa do OLLI confere e libera o Pro por até CREDITO_TROCA_MESES_MAX meses, uma
 * vez por conta. NÃO é venda (sem preço, sem cobrança, sem renovação), então a tela
 * é a mesma em todas as plataformas, inclusive no build da Play.
 *
 * Estados (nunca colapsar erro em vazio): carregando · sem sessão · indisponível
 * (não mostra formulário como se não houvesse pedido) · pronto (sem pedido →
 * formulário; pendente/aprovado → só o status; recusado → motivo + formulário de
 * novo, se ainda houver pedidos).
 *
 * Encaixe: rota `VimDeOutroApp` (/vim-de-outro-app) e atalho
 * `CreditoTrocaAtalho` em Planos. Conta/Home estão bloqueadas nesta leva; o mesmo
 * atalho entra lá depois sem mudança (ver o componente).
 */
function hojeIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function VimDeOutroAppScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const ehDesktop = useEhDesktop();

  const [estado, setEstado] = useState<EstadoPedidoTroca>({ tipo: 'carregando' });
  const [appAnterior, setAppAnterior] = useState('');
  const [venceEm, setVenceEm] = useState('');
  const [observacao, setObservacao] = useState('');
  const [comprovante, setComprovante] = useState<ComprovantePreparado | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setEstado((atual) => (atual.tipo === 'pronto' ? atual : { tipo: 'carregando' }));
    setEstado(await obterMeuPedidoTroca());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function escolherImagem() {
    setErro(null);
    if (Platform.OS !== 'web') {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Libere o acesso às fotos para anexar o print da assinatura.');
        return;
      }
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (r.canceled || !r.assets?.[0]) return;
    setPreparando(true);
    const preparado = await prepararComprovante(r.assets[0]);
    setPreparando(false);
    if (!preparado.ok) {
      setErro(preparado.erro);
      return;
    }
    setComprovante(preparado.comprovante);
  }

  async function enviar() {
    const invalido = validarFormularioTroca(
      { appAnterior, venceEm, observacao, temComprovante: !!comprovante },
      hojeIso(),
    );
    if (invalido) {
      setErro(invalido);
      return;
    }
    if (!comprovante) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarPedidoTroca({ appAnterior, venceEm, observacao, comprovante });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      // Recusa por regra (ex.: já existe pedido em análise): o estado mudou no
      // servidor, então relê. Falha de rede: mantém o formulário e o erro na tela.
      if (r.recusadoPeloServidor) void carregar();
      return;
    }
    setComprovante(null);
    setObservacao('');
    await carregar();
  }

  const pedido = estado.tipo === 'pronto' ? estado.pedido : null;
  const podePedir = estado.tipo === 'pronto'
    && (!pedido || pedido.status === 'recusado')
    && estado.totalPedidos < CREDITO_TROCA_PEDIDOS_MAX;
  const esgotou = estado.tipo === 'pronto' && pedido?.status === 'recusado' && estado.totalPedidos >= CREDITO_TROCA_PEDIDOS_MAX;
  const resumo = resumoPedidoTroca(pedido);
  const iconeStatus = !pedido ? 'swap-horizontal-circle-outline'
    : pedido.status === 'aprovado' ? 'check-decagram'
      : pedido.status === 'pendente' ? 'progress-clock'
        : 'alert-circle-outline';
  const corStatus = !pedido ? cores.accentLight
    : pedido.status === 'aprovado' ? cores.success
      : pedido.status === 'pendente' ? cores.accentLight
        : cores.warning;

  return (
    <View style={styles.tela}>
      <GradientHeader title="Vim de outro app" subtitle="Crédito de troca" onBack={() => goBackOrHome(nav)} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, ehDesktop && styles.scrollDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {estado.tipo === 'carregando' ? (
            <View style={styles.centro} accessibilityLabel="Carregando seu pedido">
              <ActivityIndicator color={cores.accentLight} />
            </View>
          ) : estado.tipo === 'sem_sessao' ? (
            <OlliCard>
              <Text style={styles.titulo}>Entre na sua conta</Text>
              <Text style={styles.texto}>O crédito de troca fica ligado à sua conta. Entre para pedir.</Text>
            </OlliCard>
          ) : estado.tipo === 'indisponivel' ? (
            <OlliCard>
              <View style={styles.linha}>
                <MaterialCommunityIcons name="cloud-alert-outline" size={22} color={cores.warning} />
                <Text style={[styles.titulo, { flex: 1 }]}>Não consegui ver seu pedido agora</Text>
              </View>
              <Text style={styles.texto}>
                Pode ser a internet. Não mostramos o formulário enquanto não soubermos se você já tem um pedido.
              </Text>
              <OlliButton label="Tentar de novo" variant="outline" onPress={carregar} style={styles.botao} />
            </OlliCard>
          ) : (
            <>
              <OlliCard>
                <View style={styles.linha}>
                  <MaterialCommunityIcons name={iconeStatus} size={26} color={corStatus} />
                  <Text style={[styles.titulo, { flex: 1 }]} accessibilityRole="header">{resumo.titulo}</Text>
                </View>
                <Text style={styles.texto}>{resumo.texto}</Text>
                {pedido?.status === 'aprovado' ? (
                  <OlliButton label="Ver meu plano" variant="outline" onPress={() => nav.navigate('Planos')} style={styles.botao} />
                ) : null}
              </OlliCard>

              {!pedido ? (
                <OlliCard>
                  <Text style={styles.subtitulo}>Como funciona</Text>
                  {[
                    'Diga qual app você usava e anexe o print ou a foto da assinatura (tela do app, recibo ou e-mail de pagamento).',
                    'Uma pessoa do OLLI confere. Não é automático.',
                    `Aprovado, você usa o Pro sem pagar por até ${CREDITO_TROCA_MESES_MAX} meses, de acordo com o tempo que ainda tem pago lá.`,
                    'Vale uma vez por conta. Não é assinatura: não há cobrança nem renovação automática. Depois, o acesso liberado termina sozinho e todos os seus dados continuam na conta.',
                  ].map((t, i) => (
                    <View key={t} style={styles.passo}>
                      <Text style={styles.passoNum}>{i + 1}</Text>
                      <Text style={[styles.texto, { flex: 1 }]}>{t}</Text>
                    </View>
                  ))}
                </OlliCard>
              ) : null}

              {esgotou ? (
                <OlliCard>
                  <Text style={styles.texto}>Você já usou os {CREDITO_TROCA_PEDIDOS_MAX} envios. Se acha que foi engano, fale com a gente.</Text>
                  <OlliButton
                    label="Falar com o suporte"
                    variant="outline"
                    onPress={() => { abrirWhatsApp(WHATSAPP_SUPORTE, 'Oi! Meu pedido de crédito de troca foi recusado e queria entender.').catch(() => undefined); }}
                    style={styles.botao}
                  />
                </OlliCard>
              ) : null}

              {podePedir ? (
                <OlliCard>
                  <Text style={styles.subtitulo}>{pedido?.status === 'recusado' ? 'Enviar de novo' : 'Pedir o crédito'}</Text>
                  <OlliInput
                    label="Qual app você usava?"
                    value={appAnterior}
                    onChangeText={setAppAnterior}
                    placeholder="Nome do app de orçamento"
                    maxLength={APP_ANTERIOR_MAX}
                    required
                  />
                  <OlliInput
                    label="Quando vence a assinatura lá? (opcional)"
                    value={venceEm}
                    onChangeText={setVenceEm}
                    mask="date"
                    placeholder="dd/mm/aaaa"
                    helper="Ajuda a definir quantos meses liberar."
                  />
                  <OlliInput
                    label="Observação (opcional)"
                    value={observacao}
                    onChangeText={setObservacao}
                    placeholder="Ex.: plano anual pago em agosto"
                    maxLength={OBSERVACAO_MAX}
                    multiline
                  />

                  <Text style={styles.rotulo}>Print ou foto da assinatura</Text>
                  {comprovante ? (
                    <View style={styles.previa}>
                      <Image source={{ uri: comprovante.uri }} style={styles.previaImg} resizeMode="contain" accessibilityLabel="Comprovante escolhido" />
                      <OlliButton label="Trocar imagem" variant="ghost" size="sm" onPress={escolherImagem} />
                    </View>
                  ) : (
                    <OlliButton
                      label={preparando ? 'Preparando imagem…' : 'Escolher print ou foto'}
                      variant="outline"
                      loading={preparando}
                      disabled={preparando || enviando}
                      onPress={escolherImagem}
                      icon={<MaterialCommunityIcons name="image-plus" size={18} color={cores.accentLight} />}
                    />
                  )}
                  <Text style={styles.nota}>
                    A imagem fica guardada no espaço privado da sua conta e é usada só para conferir o pedido.
                  </Text>

                  {erro ? (
                    <View style={styles.erro} accessibilityRole="alert">
                      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.danger} />
                      <Text style={styles.erroTexto}>{erro}</Text>
                    </View>
                  ) : null}

                  <OlliButton
                    label="Enviar para conferência"
                    onPress={enviar}
                    loading={enviando}
                    disabled={enviando || preparando}
                    fullWidth
                    style={styles.botao}
                  />
                </OlliCard>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxxl },
    scrollDesktop: { maxWidth: 640, width: '100%', alignSelf: 'center' },
    centro: { paddingVertical: Spacing.xxxl, alignItems: 'center' },
    linha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
    titulo: { fontSize: 17, fontFamily: Fonts.semiBold, color: c.onSurface },
    subtitulo: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.onSurface, marginBottom: Spacing.sm },
    texto: { fontSize: 14, fontFamily: Fonts.regular, color: c.onSurfaceVariant, lineHeight: 20 },
    rotulo: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurface, marginBottom: Spacing.xs, marginTop: Spacing.xs },
    nota: { fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: Spacing.sm, lineHeight: 18 },
    passo: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
    passoNum: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, fontSize: 12, fontFamily: Fonts.semiBold, color: c.accentLight, backgroundColor: c.accentLight + '20', overflow: 'hidden' },
    botao: { marginTop: Spacing.md },
    previa: { alignItems: 'center', gap: Spacing.xs },
    previaImg: { width: '100%', height: 220, borderRadius: BorderRadius.md, backgroundColor: c.surface },
    erro: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, marginTop: Spacing.md },
    erroTexto: { flex: 1, fontSize: 13.5, fontFamily: Fonts.medium, color: c.danger, lineHeight: 19 },
  });

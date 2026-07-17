import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator,
  Share, Platform, Alert, TouchableOpacity, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SvgXml } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, type Cores } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliCard } from '../components/OlliCard';
import { qrSvg } from '../utils/qrcode';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import {
  getMeuSaldo, getMeuExtrato, formatarCreditos, rotuloOrigemCredito,
  type LancamentoCredito,
} from '../services/creditos';
import {
  getPacotesPix, criarCobrancaPix, checarStatusPix, formatarPrecoCentavos,
  type PacotePix, type CobrancaPix,
} from '../services/pixCreditos';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * CreditosScreen — saldo de Créditos OLLI + RECARGA POR PIX (Mercado Pago).
 *
 * Créditos custeiam voz na nuvem, WhatsApp e consultas (ver worker/creditos.js).
 * Aqui o prestador vê o saldo, escolhe um pacote e paga por Pix: o worker cria a
 * cobrança (QR + copia-e-cola), o app faz polling de UX do status, e o CRÉDITO
 * cai pelo WEBHOOK (nunca otimista). O QR usa o PNG do gateway (brCodeBase64) —
 * sempre válido — com fallback pro gerador local do brCode.
 */

/** "há 3 dias" / data curta a partir do ISO do lançamento. */
function dataCurta(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function CreditosScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [saldo, setSaldo] = useState<number | null | undefined>(undefined); // undefined=carregando
  const [pacotes, setPacotes] = useState<PacotePix[]>([]);
  const [carregandoPacotes, setCarregandoPacotes] = useState(true);
  // 3 estados explícitos (nunca colapsar erro em vazio): `pacotesErro` só vira
  // true numa falha de rede real; lista vazia por resposta válida é "indisponível".
  const [pacotesErro, setPacotesErro] = useState(false);
  const [extrato, setExtrato] = useState<LancamentoCredito[] | null>(null);

  const [cobranca, setCobranca] = useState<CobrancaPix | null>(null);
  const [criando, setCriando] = useState<string | null>(null); // pacoteId em criação
  const [pago, setPago] = useState(false);
  const [expirado, setExpirado] = useState(false);

  // Aplica um resultado de leitura SEM regredir um valor bom já conhecido: uma
  // falha transitória (null) num refresh não apaga o saldo/extrato que já tínhamos
  // (regra "erro vira vazio"). Só na 1ª carga (prev não-número/não-lista) o null passa.
  const aplicarSaldo = useCallback((v: number | null) => {
    setSaldo((prev) => (v !== null ? v : typeof prev === 'number' ? prev : null));
  }, []);
  const aplicarExtrato = useCallback((v: LancamentoCredito[] | null) => {
    setExtrato((prev) => (v !== null ? v : Array.isArray(prev) ? prev : null));
  }, []);

  const recarregarSaldo = useCallback(() => {
    getMeuSaldo().then(aplicarSaldo).catch(() => aplicarSaldo(null));
    getMeuExtrato(8).then(aplicarExtrato).catch(() => aplicarExtrato(null));
  }, [aplicarSaldo, aplicarExtrato]);

  const carregarPacotes = useCallback(async () => {
    setCarregandoPacotes(true);
    setPacotesErro(false);
    try {
      const p = await getPacotesPix();
      setPacotes(p);
    } catch {
      setPacotesErro(true);
    } finally {
      setCarregandoPacotes(false);
    }
  }, []);

  useEffect(() => {
    recarregarSaldo();
    carregarPacotes();
  }, [recarregarSaldo, carregarPacotes]);

  // Polling de UX enquanto a cobrança está aberta, não paga e não expirada. A
  // fonte de verdade é o saldo (o webhook credita); isto só antecipa o "pago!".
  useEffect(() => {
    if (!cobranca || pago || expirado) return;
    let ativo = true;
    const tick = async () => {
      // Pix expira (~30 min): para de perguntar e mostra "gere outro" em vez de
      // ficar eternamente em "aguardando".
      if (cobranca.expiresAt && Date.now() > Date.parse(cobranca.expiresAt)) {
        if (ativo) setExpirado(true);
        return;
      }
      const s = await checarStatusPix(cobranca.id);
      if (!ativo || !s) return;
      if (s.pago) {
        setPago(true);
        getMeuSaldo().then((v) => { if (ativo) aplicarSaldo(v); });
        getMeuExtrato(8).then((v) => { if (ativo) aplicarExtrato(v); });
      } else if (s.status === 'cancelled' || s.status === 'expired' || s.status === 'rejected') {
        if (ativo) setExpirado(true);
      }
    };
    const iv = setInterval(tick, 4000);
    return () => { ativo = false; clearInterval(iv); };
  }, [cobranca, pago, expirado, aplicarSaldo, aplicarExtrato]);

  async function comprar(p: PacotePix) {
    if (criando) return;
    setCriando(p.id);
    try {
      const c = await criarCobrancaPix(p.id);
      if (!c) {
        Alert.alert('Não deu para gerar o Pix', 'Verifique sua conexão e tente de novo.');
        return;
      }
      setPago(false);
      setExpirado(false);
      setCobranca(c);
    } finally {
      setCriando(null);
    }
  }

  async function copiarCodigo() {
    if (!cobranca) return;
    const codigo = cobranca.brCode;
    if (Platform.OS === 'web') {
      try {
        const n: any = typeof navigator !== 'undefined' ? navigator : undefined;
        if (n?.clipboard?.writeText) {
          await n.clipboard.writeText(codigo);
          Alert.alert('Copiado', 'Código Pix copiado. Cole no app do seu banco.');
          return;
        }
      } catch { /* cai no compartilhar */ }
    }
    try {
      await Share.share({ message: `Pix para recarregar créditos OLLI:\n\n${codigo}` });
    } catch { /* cancelado */ }
  }

  function fecharCobranca() {
    setCobranca(null);
    setPago(false);
    setExpirado(false);
    recarregarSaldo();
  }

  /** QR robusto: usa o PNG do Mercado Pago (sempre válido); só cai no gerador
   *  local (que pode lançar se o código for grande demais) quando o PNG faltar. */
  function qrElemento(c: CobrancaPix): React.ReactNode {
    if (c.brCodeBase64) return <Image source={{ uri: c.brCodeBase64 }} style={styles.qrImg} />;
    try {
      return <SvgXml xml={qrSvg(c.brCode)} width={208} height={208} />;
    } catch {
      return null;
    }
  }

  const semPix = !carregandoPacotes && !pacotesErro && pacotes.length === 0;

  return (
    <View style={styles.tela}>
      <GradientHeader
        title="Créditos"
        subtitle="Voz na nuvem, WhatsApp e consultas"
        onBack={() => (cobranca ? fecharCobranca() : goBackOrHome(nav))}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Saldo */}
        <OlliCard style={styles.saldoCard} padding={Spacing.lg}>
          <Text style={styles.saldoLabel}>Seu saldo</Text>
          <Text style={styles.saldoValor}>
            {saldo === undefined ? '—' : saldo === null ? 'indisponível' : formatarCreditos(saldo)}
          </Text>
          {saldo === null ? (
            <Text style={styles.saldoHint}>Fique online um instante para atualizar o saldo.</Text>
          ) : null}
        </OlliCard>

        {cobranca ? (
          pago ? (
            // Sucesso
            <OlliCard style={styles.pixCard} padding={Spacing.lg}>
              <MaterialCommunityIcons name="check-circle" size={56} color={cores.success} />
              <Text style={styles.pagoTitulo}>Pagamento confirmado!</Text>
              <Text style={styles.pagoSub}>
                +{cobranca.pacote.creditos} créditos foram adicionados à sua conta.
              </Text>
              <OlliButton label="Concluir" variant="gradient" fullWidth onPress={fecharCobranca} style={styles.cta} />
            </OlliCard>
          ) : expirado ? (
            // Expirado — para de "aguardar" e oferece gerar outro
            <OlliCard style={styles.pixCard} padding={Spacing.lg}>
              <MaterialCommunityIcons name="clock-alert-outline" size={52} color={cores.warning} />
              <Text style={styles.pagoTitulo}>Código expirado</Text>
              <Text style={styles.pagoSub}>Esse Pix venceu. Gere um novo para pagar.</Text>
              <OlliButton label="Escolher pacote" variant="gradient" fullWidth onPress={fecharCobranca} style={styles.cta} />
            </OlliCard>
          ) : (
            // Aguardando pagamento
            <OlliCard style={styles.pixCard} padding={Spacing.lg}>
              <View style={styles.qrWrap}>
                {qrElemento(cobranca) ?? <Text style={styles.pixInstr}>Use o código copia-e-cola abaixo.</Text>}
              </View>
              <Text style={styles.pixValor}>{formatarPrecoCentavos(cobranca.pacote.amount)}</Text>
              <Text style={styles.pixCreditos}>{formatarCreditos(cobranca.pacote.creditos)}</Text>
              <Text style={styles.pixInstr}>Aponte a câmera do banco no QR, ou copie o código:</Text>
              <View style={styles.codeBox}>
                <Text style={styles.code} selectable numberOfLines={4}>{cobranca.brCode}</Text>
              </View>
              <OlliButton
                label={Platform.OS === 'web' ? 'Copiar código Pix' : 'Copiar / compartilhar código'}
                icon={<MaterialCommunityIcons name="content-copy" size={18} color="#fff" />}
                variant="gradient"
                fullWidth
                onPress={copiarCodigo}
                style={styles.cta}
              />
              <View style={styles.aguardando}>
                <ActivityIndicator size="small" color={cores.accentLight} />
                <Text style={styles.aguardandoTxt}>Aguardando o pagamento…</Text>
              </View>
              <TouchableOpacity onPress={fecharCobranca} accessibilityRole="button" accessibilityLabel="Escolher outro pacote">
                <Text style={styles.voltarLink}>Escolher outro pacote</Text>
              </TouchableOpacity>
            </OlliCard>
          )
        ) : (
          <>
            {/* Pacotes */}
            <Text style={styles.secaoTitulo}>Recarregar por Pix</Text>
            {carregandoPacotes ? (
              <ActivityIndicator style={{ marginVertical: Spacing.lg }} color={cores.accentLight} />
            ) : pacotesErro ? (
              <OlliCard style={styles.card} padding={Spacing.lg}>
                <EmptyState
                  icon="alert-circle-outline"
                  title="Não deu para carregar"
                  subtitle="Não conseguimos buscar os pacotes de recarga agora. Verifique a conexão e tente de novo."
                  actionLabel="Tentar de novo"
                  onAction={carregarPacotes}
                />
              </OlliCard>
            ) : semPix ? (
              <OlliCard style={styles.card} padding={Spacing.lg}>
                <Text style={styles.indisponivel}>
                  A recarga por Pix está indisponível no momento. Tente novamente mais tarde.
                </Text>
              </OlliCard>
            ) : (
              pacotes.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => comprar(p)}
                  disabled={!!criando}
                  style={({ pressed }) => [styles.pacoteCard, pressed && styles.pacotePress]}
                  accessibilityRole="button"
                  accessibilityLabel={`Comprar ${p.nome} por ${formatarPrecoCentavos(p.amount)}`}
                >
                  <View style={styles.pacoteIcone}>
                    <MaterialCommunityIcons name="lightning-bolt" size={22} color={cores.accentLight} />
                  </View>
                  <View style={styles.pacoteTexto}>
                    <Text style={styles.pacoteNome}>{p.nome}</Text>
                    <Text style={styles.pacotePreco}>{formatarPrecoCentavos(p.amount)}</Text>
                  </View>
                  {criando === p.id ? (
                    <ActivityIndicator size="small" color={cores.accentLight} />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceVariant} />
                  )}
                </Pressable>
              ))
            )}

            {/* Extrato — 3 estados: null=indisponível (não confundir com []=vazio). */}
            {extrato === null ? (
              <Text style={styles.extErro}>Não foi possível carregar o extrato agora.</Text>
            ) : extrato.length > 0 ? (
              <>
                <Text style={styles.secaoTitulo}>Últimos lançamentos</Text>
                <OlliCard style={styles.card} padding={Spacing.base}>
                  {extrato.map((l, i) => (
                    <View key={i} style={[styles.extLinha, i > 0 && styles.extLinhaBorda]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.extOrigem}>{rotuloOrigemCredito(l.origem)}</Text>
                        {l.descricao ? <Text style={styles.extDesc} numberOfLines={1}>{l.descricao}</Text> : null}
                      </View>
                      <View style={styles.extDir}>
                        <Text style={[styles.extDelta, { color: l.delta >= 0 ? cores.success : cores.onSurfaceVariant }]}>
                          {l.delta >= 0 ? '+' : ''}{l.delta}
                        </Text>
                        <Text style={styles.extData}>{dataCurta(l.criadoEm)}</Text>
                      </View>
                    </View>
                  ))}
                </OlliCard>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxxl },
    card: {},

    saldoCard: { alignItems: 'center', gap: 2 },
    saldoLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
    saldoValor: { fontSize: 30, fontFamily: Fonts.serifBold, color: c.accentLight },
    saldoHint: { fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 2 },

    secaoTitulo: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.onSurface, marginTop: Spacing.xs },
    indisponivel: { fontSize: 13.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },

    pacoteCard: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
      padding: Spacing.base,
    },
    pacotePress: { backgroundColor: c.surfacePressed },
    pacoteIcone: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentLight + '20' },
    pacoteTexto: { flex: 1, gap: 2 },
    pacoteNome: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.onSurface },
    pacotePreco: { fontSize: 13.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant },

    // cobrança pix
    pixCard: { alignItems: 'center', gap: Spacing.sm },
    qrWrap: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, padding: 12 },
    qrImg: { width: 208, height: 208 },
    pixValor: { fontSize: 26, fontFamily: Fonts.serifBold, color: c.accentLight, marginTop: Spacing.xs },
    pixCreditos: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.onSurface },
    pixInstr: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center' },
    codeBox: { alignSelf: 'stretch', backgroundColor: c.background, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.md },
    code: { fontSize: 11, fontFamily: 'monospace', color: c.onSurface, lineHeight: 16 },
    cta: { alignSelf: 'stretch', marginTop: Spacing.xs },
    aguardando: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
    aguardandoTxt: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant },
    voltarLink: { fontSize: 13.5, fontFamily: Fonts.semiBold, color: c.accentLight, marginTop: Spacing.sm },

    // sucesso
    pagoTitulo: { fontSize: 20, fontFamily: Fonts.extraBold, color: c.onSurface, marginTop: Spacing.xs },
    pagoSub: { fontSize: 14, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },

    // extrato
    extLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
    extLinhaBorda: { borderTopWidth: 1, borderTopColor: c.outline },
    extOrigem: { fontSize: 14, fontFamily: Fonts.medium, color: c.onSurface },
    extDesc: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant },
    extDir: { alignItems: 'flex-end' },
    extDelta: { fontSize: 15, fontFamily: Fonts.semiBold },
    extData: { fontSize: 11.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant },
    extErro: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm },
  });

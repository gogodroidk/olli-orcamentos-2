import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator,
  Share, Platform, Alert, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SvgXml } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, type Cores } from '../theme';
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
 * CreditosScreen — saldo de Créditos OLLI + RECARGA POR PIX (AbacatePay).
 *
 * Créditos custeiam voz na nuvem, WhatsApp e consultas (ver worker/creditos.js).
 * Aqui o prestador vê o saldo, escolhe um pacote e paga por Pix: o worker cria a
 * cobrança (QR + copia-e-cola), o app faz polling de UX do status, e o CRÉDITO
 * cai pelo WEBHOOK (nunca otimista). O QR é renderizado localmente do brCode
 * (mesmo gerador do resto do app), não do PNG do gateway.
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
  const [extrato, setExtrato] = useState<LancamentoCredito[] | null>(null);

  const [cobranca, setCobranca] = useState<CobrancaPix | null>(null);
  const [criando, setCriando] = useState<string | null>(null); // pacoteId em criação
  const [pago, setPago] = useState(false);

  const recarregarSaldo = useCallback(() => {
    getMeuSaldo().then(setSaldo).catch(() => setSaldo(null));
    getMeuExtrato(8).then(setExtrato).catch(() => setExtrato(null));
  }, []);

  useEffect(() => {
    recarregarSaldo();
    getPacotesPix()
      .then(setPacotes)
      .catch(() => setPacotes([]))
      .finally(() => setCarregandoPacotes(false));
  }, [recarregarSaldo]);

  // Polling de UX enquanto a cobrança está aberta e ainda não paga. A fonte de
  // verdade é o saldo (o webhook credita); isto só antecipa o "pago!" na tela.
  useEffect(() => {
    if (!cobranca || pago) return;
    let ativo = true;
    const tick = async () => {
      const s = await checarStatusPix(cobranca.id);
      if (!ativo || !s) return;
      if (s.pago) {
        setPago(true);
        getMeuSaldo().then((v) => { if (ativo) setSaldo(v); });
        getMeuExtrato(8).then((v) => { if (ativo) setExtrato(v); });
      }
    };
    const iv = setInterval(tick, 4000);
    return () => { ativo = false; clearInterval(iv); };
  }, [cobranca, pago]);

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
    recarregarSaldo();
  }

  const semPix = !carregandoPacotes && pacotes.length === 0;

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
          ) : (
            // Aguardando pagamento
            <OlliCard style={styles.pixCard} padding={Spacing.lg}>
              <View style={styles.qrWrap}>
                <SvgXml xml={qrSvg(cobranca.brCode)} width={208} height={208} />
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

            {/* Extrato */}
            {extrato && extrato.length > 0 ? (
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
  });

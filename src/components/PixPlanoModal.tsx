import React, { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView, Image, Platform, Share, ActivityIndicator, Alert } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { qrSvg } from '../utils/qrcode';
import { formatCurrency } from '../utils/currency';
import { textoValidadePix } from '../utils/pixValidade';
import { textoArrependimentoCurto } from '../content/legal/arrependimento';
import { checarPixPlano, type CobrancaPixPlano } from '../services/pixPlano';
import { track, Eventos } from '../services/analytics';

/**
 * PixPlanoModal — pagar o PLANO por Pix (AbacatePay). Mostra o QR e o copia-e-cola
 * e faz polling do status. Quando o worker responde `pago`, o plano JÁ foi liberado
 * no servidor (o app nunca libera otimista) — aqui só avisamos e recarregamos.
 */
export interface PixPlanoModalProps {
  cobranca: CobrancaPixPlano | null;
  aoFechar: () => void;
  /** Pagamento confirmado: a tela recarrega o plano. */
  aoPago: () => void;
  /** Pix venceu: gera outro do mesmo plano. */
  aoGerarNovo: () => void;
}

export function PixPlanoModal({ cobranca, aoFechar, aoPago, aoGerarNovo }: PixPlanoModalProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [pago, setPago] = useState(false);
  const [expirado, setExpirado] = useState(false);

  useEffect(() => {
    setPago(false);
    setExpirado(false);
  }, [cobranca?.id]);

  // Polling a cada 4s enquanto aberto, não pago e não vencido. `null` do serviço =
  // indisponível agora (rede) → só tenta de novo no próximo tick, nunca conclui.
  useEffect(() => {
    if (!cobranca || pago || expirado) return;
    let ativo = true;
    const tick = async () => {
      if (cobranca.expiresAt && Date.now() > Date.parse(cobranca.expiresAt)) {
        if (ativo) setExpirado(true);
        return;
      }
      const s = await checarPixPlano(cobranca.id);
      if (!ativo || !s) return;
      if (s.pago) {
        setPago(true);
        track(Eventos.pixPago); // funil: 1º pagamento (só o nome do evento)
        aoPago();
      }
    };
    const iv = setInterval(tick, 4000);
    return () => { ativo = false; clearInterval(iv); };
  }, [cobranca, pago, expirado, aoPago]);

  async function copiarCodigo() {
    if (!cobranca) return;
    if (Platform.OS === 'web') {
      try {
        const n: any = typeof navigator !== 'undefined' ? navigator : undefined;
        if (n?.clipboard?.writeText) {
          await n.clipboard.writeText(cobranca.brCode);
          Alert.alert('Copiado', 'Código Pix copiado. Cole no app do seu banco.');
          return;
        }
      } catch { /* cai no compartilhar */ }
    }
    try {
      await Share.share({ message: cobranca.brCode });
    } catch { /* cancelado */ }
  }

  /** PNG da AbacatePay primeiro (sempre válido); gerador local só como reserva. */
  function qr(c: CobrancaPixPlano): React.ReactNode {
    if (c.brCodeBase64) return <Image source={{ uri: c.brCodeBase64 }} style={styles.qrImg} />;
    try {
      return <SvgXml xml={qrSvg(c.brCode)} width={208} height={208} />;
    } catch {
      return null;
    }
  }

  const validadeTexto = cobranca ? textoValidadePix(cobranca.expiresAt) : null;
  const periodoTexto = cobranca ? (cobranca.plano.meses >= 12 ? '12 meses' : '1 mês') : '';

  return (
    <Modal visible={!!cobranca} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTxt}>
              <Text style={styles.titulo}>Pagar com Pix</Text>
              {cobranca ? <Text style={styles.ref}>{cobranca.plano.nome.replace('·', '—')}</Text> : null}
            </View>
            <TouchableOpacity onPress={aoFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {!cobranca ? null : pago ? (
            <View style={styles.corpo}>
              <MaterialCommunityIcons name="check-circle" size={56} color={cores.success} />
              <Text style={styles.estadoTitulo}>Pagamento confirmado!</Text>
              <Text style={styles.estadoSub}>Seu plano já está ativo por {periodoTexto}.</Text>
              <OlliButton label="Concluir" variant="gradient" fullWidth onPress={aoFechar} style={styles.cta} />
            </View>
          ) : expirado ? (
            <View style={styles.corpo}>
              <MaterialCommunityIcons name="clock-alert-outline" size={52} color={cores.warning} />
              <Text style={styles.estadoTitulo}>Código expirado</Text>
              <Text style={styles.estadoSub}>Esse Pix venceu sem pagamento. Gere um novo para continuar.</Text>
              <OlliButton label="Gerar novo Pix" variant="gradient" fullWidth onPress={aoGerarNovo} style={styles.cta} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.corpo} showsVerticalScrollIndicator={false}>
              <View style={styles.qrWrap}>{qr(cobranca) ?? <Text style={styles.instr}>Use o código copia-e-cola abaixo.</Text>}</View>
              <Text style={styles.valor}>{formatCurrency(cobranca.desconto ? cobranca.desconto.por : cobranca.plano.valor)}</Text>
              {cobranca.desconto ? <Text style={styles.desconto}>{cobranca.desconto.texto}</Text> : null}
              <Text style={styles.periodo}>Libera {periodoTexto} de plano</Text>
              {validadeTexto ? <Text style={styles.validade}>{validadeTexto}</Text> : null}
              <Text style={styles.instr}>Aponte a câmera do banco no QR, ou copie o código:</Text>
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
              {/* P0-08: sair sem pagar agora. Só fecha: a cobrança continua valendo até a validade acima. */}
              <OlliButton label="Pagar depois" variant="ghost" fullWidth onPress={aoFechar} />
              <Text style={styles.nota}>Pode fechar o app e pagar depois: o plano libera sozinho quando o banco confirmar.</Text>
              <Text style={styles.nota}>{textoArrependimentoCurto()}</Text>
              <Text style={styles.nota}>
                Pix não renova sozinho: perto do vencimento você paga de novo{cobranca.plano.meses >= 12 ? '.' : ' (no anual, só 1 vez por ano).'}
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    card: {
      width: '100%',
      maxWidth: 400,
      maxHeight: '90%',
      backgroundColor: c.surface,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: c.strokeGlow,
      padding: Spacing.lg,
      ...sombrasDe(c).lg,
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.base },
    headerTxt: { flex: 1 },
    titulo: { fontSize: 19, fontFamily: Fonts.extraBold, color: c.onSurface },
    ref: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: 2 },
    corpo: { alignItems: 'center', gap: Spacing.sm },
    qrWrap: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, padding: 12 },
    qrImg: { width: 208, height: 208 },
    valor: { fontSize: 26, fontFamily: Fonts.serifBold, color: c.accentLight, marginTop: Spacing.xs },
    desconto: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.success, textAlign: 'center', lineHeight: 18 },
    periodo: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.onSurface },
    validade: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.warning },
    instr: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center' },
    codeBox: { alignSelf: 'stretch', backgroundColor: c.background, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.md },
    code: { fontSize: 11, fontFamily: 'monospace', color: c.onSurface, lineHeight: 16 },
    cta: { alignSelf: 'stretch', marginTop: Spacing.xs },
    aguardando: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
    aguardandoTxt: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant },
    nota: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 17, marginTop: Spacing.xs },
    estadoTitulo: { fontSize: 20, fontFamily: Fonts.extraBold, color: c.onSurface, marginTop: Spacing.xs },
    estadoSub: { fontSize: 14, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  });

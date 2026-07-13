import React from 'react';
import { View, Text, Modal, StyleSheet, Share, TouchableOpacity, ScrollView } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { qrSvg } from '../utils/qrcode';
import { formatCurrency } from '../utils/currency';

/**
 * PixCobrancaModal — mostra o QR + o "copia e cola" do Pix (BR Code com o valor já
 * embutido) para o prestador RECEBER na hora. 100% offline: o QR é gerado localmente
 * (qrSvg) e o "copia e cola" é só a string do banco — NÃO processa pagamento.
 *
 * O QR sai do MESMO gerador puro do PDF (utils/qrcode.ts), renderizado in-app via
 * react-native-svg (SvgXml). "Compartilhar" manda o código pronto por qualquer app
 * (WhatsApp, etc.), sem depender de expo-clipboard.
 */
export interface PixCobrancaModalProps {
  visivel: boolean;
  aoFechar: () => void;
  /** Pix Copia e Cola (BR Code EMV). Se vazio, o modal não mostra o QR/código. */
  brcode: string;
  /** Valor da cobrança (para exibir). */
  valor: number;
  /** Subtítulo (ex.: "Orçamento nº 123"). */
  referencia?: string;
}

export function PixCobrancaModal({ visivel, aoFechar, brcode, valor, referencia }: PixCobrancaModalProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  async function compartilhar() {
    if (!brcode) return;
    const ref = referencia ? ` (${referencia})` : '';
    try {
      await Share.share({
        message: `Pix para pagar${ref} — ${formatCurrency(valor)}.\nÉ só copiar o código abaixo e pagar no app do banco:\n\n${brcode}`,
      });
    } catch {
      // usuário cancelou o compartilhamento — sem ação
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTxt}>
              <Text style={styles.titulo}>Cobrar por Pix</Text>
              {referencia ? <Text style={styles.ref}>{referencia}</Text> : null}
            </View>
            <TouchableOpacity onPress={aoFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {brcode ? (
            <ScrollView contentContainerStyle={styles.corpo} showsVerticalScrollIndicator={false}>
              <View style={styles.qrWrap}>
                <SvgXml xml={qrSvg(brcode)} width={210} height={210} />
              </View>
              <Text style={styles.valor}>{formatCurrency(valor)}</Text>
              <Text style={styles.instr}>Aponte a câmera do banco no QR, ou copie o código:</Text>
              <View style={styles.codeBox}>
                <Text style={styles.code} selectable numberOfLines={4}>{brcode}</Text>
              </View>
              <OlliButton label="Compartilhar código" icon={<MaterialCommunityIcons name="share-variant" size={18} color="#fff" />} variant="gradient" fullWidth onPress={compartilhar} style={styles.cta} />
            </ScrollView>
          ) : (
            <View style={styles.corpo}>
              <MaterialCommunityIcons name="qrcode-remove" size={40} color={cores.onSurfaceVariant} />
              <Text style={styles.instr}>Cadastre sua chave Pix em "Meu negócio" para cobrar por aqui.</Text>
            </View>
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
      maxWidth: 380,
      maxHeight: '86%',
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
    valor: { fontSize: 26, fontFamily: Fonts.serifBold, color: c.accentLight, marginTop: Spacing.xs },
    instr: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center' },
    codeBox: { alignSelf: 'stretch', backgroundColor: c.background, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.strokeGlow, padding: Spacing.md },
    code: { fontSize: 11, fontFamily: 'monospace', color: c.onSurface, lineHeight: 16 },
    cta: { alignSelf: 'stretch', marginTop: Spacing.xs },
  });

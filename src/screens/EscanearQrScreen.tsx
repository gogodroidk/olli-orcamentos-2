import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, Fonts, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * EscanearQrScreen — o técnico aponta a câmera no QR colado na máquina e o app
 * abre AQUELE equipamento na hora (amor do técnico — 1 toque, sem digitar). Lê o
 * token do endereço /q/<token> (o mesmo que a etiqueta imprime) e devolve para a
 * lista de equipamentos com `abrirToken`, que casa pelo qrToken local.
 *
 * expo-camera SDK 56: CameraView + useCameraPermissions; barcodeScannerSettings
 * com barcodeTypes:['qr']; callback onBarcodeScanned (result.data = conteúdo).
 * A permissão de câmera é pedida na hora (nunca no boot).
 */

/** Extrai o token opaco do conteúdo do QR: URL /q/<token> ou token cru. */
export function extrairTokenQr(data: string): string | null {
  if (!data) return null;
  const m = data.match(/\/q\/([^/?#\s]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  const cru = data.trim();
  // Fallback: um token cru (sem barras, tamanho plausível) — nunca uma URL alheia.
  if (/^[A-Za-z0-9_-]{8,}$/.test(cru)) return cru;
  return null;
}

export default function EscanearQrScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [permission, requestPermission] = useCameraPermissions();
  // Trava para o onBarcodeScanned (que dispara em rajada) processar só 1 leitura.
  const travado = useRef(false);
  const [lido, setLido] = useState(false);

  function aoLerQr(result: { data?: string }) {
    if (travado.current) return;
    const token = extrairTokenQr(result?.data ?? '');
    if (!token) return; // QR que não é do OLLI — ignora e continua escaneando
    travado.current = true;
    setLido(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Volta para a lista de equipamentos, que abre o detalhe pelo token.
    nav.navigate('Equipamento', { abrirToken: token });
  }

  // Web/sem suporte: o scanner é um recurso de celular.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.telaCentrada}>
        <MaterialCommunityIcons name="cellphone" size={48} color={cores.onSurfaceVariant} />
        <Text style={styles.msg}>Escaneie o QR pelo app no celular.</Text>
        <OlliButton label="Voltar" variant="secondary" onPress={() => goBackOrHome(nav)} />
      </View>
    );
  }

  // Permissão ainda carregando.
  if (!permission) {
    return <View style={styles.telaEscura} />;
  }

  // Sem permissão: pede (ou manda às configurações se já negou definitivamente).
  if (!permission.granted) {
    return (
      <View style={styles.telaCentrada}>
        <MaterialCommunityIcons name="camera-outline" size={48} color={cores.accentLight} />
        <Text style={styles.titulo}>Ler o QR do equipamento</Text>
        <Text style={styles.msg}>
          Precisamos da câmera para escanear a etiqueta colada na máquina.
        </Text>
        {permission.canAskAgain ? (
          <OlliButton
            label="Permitir câmera"
            variant="gradient"
            fullWidth
            onPress={() => { requestPermission().catch(() => {}); }}
            icon={<MaterialCommunityIcons name="camera" size={18} color="#fff" />}
          />
        ) : (
          <OlliButton
            label="Abrir configurações"
            variant="gradient"
            fullWidth
            onPress={() => { Linking.openSettings().catch(() => {}); }}
          />
        )}
        <TouchableOpacity onPress={() => goBackOrHome(nav)} style={{ marginTop: Spacing.md }}>
          <Text style={styles.voltarLink}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Permissão concedida: câmera + moldura de mira.
  return (
    <View style={styles.telaEscura}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={lido ? undefined : aoLerQr}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.overlayTopo}>Aponte para o QR da etiqueta</Text>
        <View style={styles.mira}>
          <View style={[styles.canto, styles.cantoTL]} />
          <View style={[styles.canto, styles.cantoTR]} />
          <View style={[styles.canto, styles.cantoBL]} />
          <View style={[styles.canto, styles.cantoBR]} />
        </View>
        <TouchableOpacity
          style={styles.fechar}
          onPress={() => goBackOrHome(nav)}
          accessibilityRole="button"
          accessibilityLabel="Fechar o scanner"
        >
          <MaterialCommunityIcons name="close" size={22} color="#fff" />
          <Text style={styles.fecharTxt}>Fechar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    telaEscura: { flex: 1, backgroundColor: '#000' },
    telaCentrada: {
      flex: 1, backgroundColor: c.background,
      alignItems: 'center', justifyContent: 'center',
      padding: Spacing.xl, gap: Spacing.base,
    },
    titulo: { fontSize: 19, fontFamily: Fonts.extraBold, color: c.onSurface, textAlign: 'center' },
    msg: { fontSize: 14, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
    voltarLink: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.accentLight },

    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    overlayTopo: {
      position: 'absolute', top: 80, left: 24, right: 24,
      color: '#fff', fontSize: 16, fontFamily: Fonts.semiBold, textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6,
    },
    mira: { width: 240, height: 240 },
    canto: { position: 'absolute', width: 34, height: 34, borderColor: '#7FE9F5' },
    cantoTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
    cantoTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
    cantoBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
    cantoBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
    fechar: {
      position: 'absolute', bottom: 56, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 12, paddingHorizontal: 22, borderRadius: BorderRadius.full,
    },
    fecharTxt: { color: '#fff', fontSize: 15, fontFamily: Fonts.semiBold },
  });

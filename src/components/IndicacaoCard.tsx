import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, Share, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { qrSvg } from '../utils/qrcode';
import { mensagemWhatsApp, textoPromessa, textoResumo } from '../utils/indicacaoTexto';
import { cupomAtivo } from '../services/cupom';
import {
  obterMeuLinkIndicacao,
  registrarEventoIndicacao,
  type MeuLinkIndicacao,
  type MomentoIndicacao,
} from '../services/indicacao';

/**
 * IndicacaoCard — "Colega que orça igual a você?". Aparece depois que o prestador
 * confirma que enviou o orçamento (momento 'apos_envio') ou quando o cliente aprova
 * ('apos_aprovacao'). O prestador escolhe o contato no PRÓPRIO WhatsApp: o OLLI não
 * lê agenda nem sobe número de terceiro (LGPD) e não envia nada em massa.
 *
 * Estático (sem animação nova). Sem link do servidor (offline/erro) mostra o aviso e
 * NÃO inventa código. Copiar = o link sozinho pela folha de compartilhar (o app não
 * usa expo-clipboard — mesmo padrão do PixCobrancaModal).
 */
interface Props {
  visivel: boolean;
  momento: MomentoIndicacao;
  aoFechar: () => void;
}

export function IndicacaoCard({ visivel, momento, aoFechar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [dados, setDados] = useState<MeuLinkIndicacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [qr, setQr] = useState(false);
  // Cupom ligado no servidor: o cartão avisa que cupom e indicação não se somam (nada na tela com ele desligado).
  const [cupomLigado, setCupomLigado] = useState(false);
  const jaVisto = useRef(false);

  useEffect(() => {
    if (!visivel) return;
    let vivo = true;
    setCarregando(true);
    setQr(false);
    void cupomAtivo().then((a) => { if (vivo) setCupomLigado(a); });
    obterMeuLinkIndicacao().then((d) => {
      if (!vivo) return;
      setDados(d);
      setCarregando(false);
      // Só conta "visto" quando havia algo para ver, 1 vez por abertura.
      if (d && !jaVisto.current) {
        jaVisto.current = true;
        void registrarEventoIndicacao('cartao_visto', momento);
      }
    });
    return () => {
      vivo = false;
      jaVisto.current = false;
    };
  }, [visivel, momento]);

  async function compartilhar(canal: 'whatsapp' | 'copiar') {
    if (!dados) return;
    try {
      const message = canal === 'whatsapp' ? mensagemWhatsApp(dados.link, dados.meses, dados.indicadorPaga) : dados.link;
      await Share.share({ message });
      void registrarEventoIndicacao('compartilhada', momento, canal);
    } catch {
      // cancelou a folha de compartilhar — sem ação
    }
  }

  function alternarQr() {
    if (!qr) void registrarEventoIndicacao('compartilhada', momento, 'qr');
    setQr((v) => !v);
  }

  // Recurso desligado (creditos = 0): sem contador, não há o que acumular.
  const resumo = dados && dados.meses > 0 ? textoResumo(dados.resumo) : null;

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.titulo}>Colega que orça igual a você?</Text>
            <TouchableOpacity onPress={aoFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
          {carregando ? (
            <ActivityIndicator color={cores.primary} style={styles.espera} />
          ) : dados ? (
            <View style={styles.corpo}>
              <Text style={styles.texto}>{textoPromessa(dados.meses, dados.teto, dados.indicadorPaga, cupomLigado)}</Text>
              <OlliButton label="Mandar no WhatsApp" icon={<MaterialCommunityIcons name="whatsapp" size={18} color="#fff" />} variant="gradient" fullWidth onPress={() => compartilhar('whatsapp')} />
              <View style={styles.linha}>
                <OlliButton label="Copiar link" variant="outline" size="sm" onPress={() => compartilhar('copiar')} style={styles.meio} />
                <OlliButton label={qr ? 'Esconder QR' : 'Mostrar QR'} variant="outline" size="sm" onPress={alternarQr} style={styles.meio} />
              </View>
              {qr ? (
                <View style={styles.qrWrap}>
                  <SvgXml xml={qrSvg(dados.link)} width={190} height={190} />
                </View>
              ) : null}
              {resumo ? <Text style={styles.resumo}>{resumo}</Text> : null}
            </View>
          ) : (
            <Text style={styles.texto}>Não consegui carregar seu link agora. Confira a internet e tente de novo mais tarde.</Text>
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
      backgroundColor: c.surface,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: c.strokeGlow,
      padding: Spacing.lg,
      ...sombrasDe(c).lg,
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.sm },
    titulo: { flex: 1, fontSize: 19, fontFamily: Fonts.extraBold, color: c.onSurface },
    corpo: { gap: Spacing.sm },
    espera: { marginVertical: Spacing.lg },
    texto: { fontSize: 14, fontFamily: Fonts.regular, color: c.onSurfaceVariant, lineHeight: 20 },
    linha: { flexDirection: 'row', gap: Spacing.sm },
    meio: { flex: 1 },
    qrWrap: { alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, padding: 12 },
    resumo: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center' },
  });

import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, Typography, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { COPY_FEEDBACK_CADEADO, OPCOES_MOTIVO, TEXTO_LIVRE_MAX, type OpcaoMotivo } from '../services/feedbackCadeadoCopy';

/**
 * "O que faltou para você assinar o Pro?" — 3 estados de verdade: enviando | erro (a resposta não se perde, com
 * "tentar de novo") | enviado. Erro nunca vira "obrigado". Sem animação decorativa; alvos >= 44 px.
 */
export type EstadoEnvioFeedback = 'ocioso' | 'enviando' | 'erro' | 'enviado';

interface Props {
  visivel: boolean;
  estado: EstadoEnvioFeedback;
  onEnviar: (opcao: OpcaoMotivo, texto: string) => void;
  onAgoraNao: () => void;
  onNaoPerguntarMais: () => void;
  onFechar: () => void;
}

export function FeedbackCadeadoModal({ visivel, estado, onEnviar, onAgoraNao, onNaoPerguntarMais, onFechar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [opcao, setOpcao] = useState<OpcaoMotivo | null>(null);
  const [texto, setTexto] = useState('');
  const c = COPY_FEEDBACK_CADEADO;
  const enviando = estado === 'enviando';

  return (
    <Modal visible={visivel} transparent animationType="none" onRequestClose={estado === 'enviado' ? onFechar : estado === 'ocioso' ? onAgoraNao : () => {}}>
      <View style={styles.fundo}>
        <View style={[styles.folha, { paddingBottom: Spacing.base + insets.bottom }]} accessibilityViewIsModal>
          {estado === 'enviado' ? (
            <View style={styles.centro}>
              <MaterialCommunityIcons name="check-circle-outline" size={36} color={cores.success} />
              <Text style={styles.titulo} accessibilityRole="header">{c.enviado}</Text>
              <OlliButton label={c.fechar} variant="gradient" size="lg" fullWidth onPress={onFechar} />
            </View>
          ) : (
            <>
              <Text style={styles.titulo} accessibilityRole="header">{c.pergunta}</Text>
              <View accessibilityRole="radiogroup" style={styles.opcoes}>
                {OPCOES_MOTIVO.map((o) => {
                  const marcada = opcao === o.id;
                  return (
                    <Pressable key={o.id} disabled={enviando} onPress={() => setOpcao(o.id)} style={[styles.opcao, marcada && styles.opcaoMarcada]}
                      accessibilityRole="radio" accessibilityState={{ checked: marcada, disabled: enviando }} accessibilityLabel={o.rotulo}>
                      <MaterialCommunityIcons name={marcada ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={marcada ? cores.primary : cores.onSurfaceMuted} />
                      <Text style={styles.opcaoTxt}>{o.rotulo}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={texto}
                onChangeText={(t) => setTexto(t.slice(0, TEXTO_LIVRE_MAX))}
                editable={!enviando}
                placeholder={c.campoLivre}
                placeholderTextColor={cores.onSurfaceMuted}
                multiline
                maxLength={TEXTO_LIVRE_MAX}
                style={styles.campo}
                accessibilityLabel={c.campoLivre}
              />
              <Text style={styles.aviso}>{c.aviso}</Text>
              {estado === 'erro' ? (
                <Text style={styles.erro} accessibilityRole="alert" accessibilityLiveRegion="polite">{c.erro}</Text>
              ) : null}
              <OlliButton
                label={enviando ? c.enviando : estado === 'erro' ? c.tentarDeNovo : c.enviar}
                variant="gradient" size="lg" fullWidth
                disabled={!opcao || enviando}
                onPress={() => { if (opcao) onEnviar(opcao, texto); }}
                icon={enviando ? <ActivityIndicator size="small" color="#fff" /> : undefined}
              />
              <View style={styles.rodape}>
                <Pressable disabled={enviando} onPress={onAgoraNao} style={styles.link} accessibilityRole="button"><Text style={styles.linkTxt}>{c.agoraNao}</Text></Pressable>
                <Pressable disabled={enviando} onPress={onNaoPerguntarMais} style={styles.link} accessibilityRole="button"><Text style={styles.linkTxt}>{c.naoPerguntarMais}</Text></Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  folha: { backgroundColor: c.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.base, paddingBottom: Spacing.xl, gap: Spacing.md },
  centro: { alignItems: 'center', gap: Spacing.md },
  titulo: { ...Typography.h3, color: c.onSurface },
  opcoes: { gap: Spacing.sm },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 48, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline },
  opcaoMarcada: { borderColor: c.primary, backgroundColor: c.surfaceVariant },
  opcaoTxt: { ...Typography.body, color: c.onSurface, flex: 1 },
  campo: { minHeight: 64, maxHeight: 120, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.lg, padding: Spacing.md, color: c.onSurface, textAlignVertical: 'top' },
  aviso: { ...Typography.caption, color: c.onSurfaceVariant },
  erro: { ...Typography.body, color: c.danger },
  rodape: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  linkTxt: { ...Typography.body, color: c.accentLight, fontWeight: '700' },
});

/**
 * FolhaRemarcarChuva — "Serviço externo com chuva prevista. Quer avisar o
 * cliente?" com [Remarcar e avisar] e [Manter] (Onda I1, jogada 1).
 *
 * Componente ISOLADO: a tela abre a folha quando `analise.sugerirRemarcar` é
 * `true` (visita EXTERNA com chuva forte ≥ 2 mm/h, símbolo de chuva forte/
 * trovoada do MET, ou alerta oficial no horário). A folha:
 *  - mostra o motivo (o mesmo texto do chip + o alerta oficial, se houver) e o
 *    crédito da previsão (CC BY 4.0);
 *  - mostra a mensagem que vai para o cliente (`mensagemRemarcarChuva`), já com
 *    os horários alternativos quando a tela passar (ex.: do Encaixe);
 *  - [Remarcar e avisar] abre o WhatsApp do cliente com a mensagem pronta
 *    (`abrirWhatsApp`, número pela regra única `numeroWhatsAppBR`) e depois
 *    chama `aoRemarcar` — a tela abre o seletor de data/Encaixe;
 *  - [Manter] chama `aoManter` e não manda nada.
 *
 * Sem número brasileiro válido, a folha AVISA que o WhatsApp vai abrir no
 * seletor de contato (a mensagem vai pronta) — nada de chute de número. Se o
 * WhatsApp não abrir, o erro aparece na folha e ela não chama `aoRemarcar`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { OlliButton } from '../OlliButton';
import { Aparecer, PressableAnimado } from '../motion';
import { abrirWhatsApp } from '../../utils/exportarDocumento';
import {
  mensagemRemarcarChuva,
  whatsappRemarcarChuva,
  type ResultadoClimaVisita,
} from '../../services/climaVisitaRegra';

export interface FolhaRemarcarChuvaProps {
  visivel: boolean;
  analise: ResultadoClimaVisita;
  visita: {
    /** ISO da visita. */
    inicio: string;
    clienteNome?: string | null;
    clienteTelefone?: string | null;
    /** "limpeza do split" */
    servico?: string | null;
  };
  /** Nome do negócio do prestador, para a mensagem ("Aqui é da …"). */
  empresaNome?: string | null;
  /** Horários alternativos em texto curto (ex.: `SugestaoEncaixe.quando`). */
  alternativas?: string[];
  /** Depois de abrir o WhatsApp: a tela abre o seletor de nova data. */
  aoRemarcar: () => void;
  /** Prestador decidiu manter a visita. */
  aoManter: () => void;
  /** Fechar sem decidir (voltar/fundo). Padrão: `aoManter`. */
  aoFechar?: () => void;
}

export function FolhaRemarcarChuva({
  visivel,
  analise,
  visita,
  empresaNome,
  alternativas,
  aoRemarcar,
  aoManter,
  aoFechar,
}: FolhaRemarcarChuvaProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (visivel) {
      setErro(null);
      setAbrindo(false);
    }
  }, [visivel]);

  const mensagem = useMemo(
    () =>
      mensagemRemarcarChuva({
        clienteNome: visita.clienteNome,
        empresaNome,
        servico: visita.servico,
        inicio: visita.inicio,
        analise,
        alternativas,
      }),
    [visita.clienteNome, visita.servico, visita.inicio, empresaNome, analise, alternativas],
  );
  const { temNumero } = whatsappRemarcarChuva(visita.clienteTelefone, mensagem);
  const fechar = aoFechar ?? aoManter;
  const corIcone = analise.alerta?.nivel === 'vermelho' ? cores.danger : cores.warning;

  async function remarcarEAvisar() {
    setAbrindo(true);
    setErro(null);
    try {
      await abrirWhatsApp(visita.clienteTelefone ?? null, mensagem);
      aoRemarcar();
    } catch {
      setErro('Não consegui abrir o WhatsApp neste aparelho. Copie a mensagem acima e envie pelo app.');
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={fechar}>
      <View style={styles.fundo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} accessibilityLabel="Fechar" accessibilityRole="button" />
        <View style={styles.caixa}>
          <View style={styles.cabecalho}>
            <View style={[styles.icone, { backgroundColor: comAlfa(corIcone, 0.14) }]}>
              <MaterialCommunityIcons
                name={analise.alerta ? 'alert' : 'weather-pouring'}
                size={22}
                color={corIcone}
              />
            </View>
            <View style={styles.cabecalhoTexto}>
              <Text style={styles.titulo}>
                {analise.alerta && analise.nivel !== 'forte'
                  ? 'Serviço externo com alerta oficial'
                  : 'Serviço externo com chuva prevista'}
              </Text>
              <Text style={styles.subtitulo}>Quer avisar o cliente?</Text>
            </View>
            <PressableAnimado onPress={fechar} accessibilityLabel="Fechar" hitSlop={10}>
              <MaterialCommunityIcons name="close" size={23} color={cores.onSurfaceVariant} />
            </PressableAnimado>
          </View>

          <View style={styles.conteudo}>
            <Aparecer indice={0}>
              {analise.textoAlerta ? <Text style={[styles.motivo, { color: corIcone }]}>{analise.textoAlerta}</Text> : null}
              <Text style={styles.motivo}>{analise.texto}</Text>
              {analise.atribuicao ? <Text style={styles.credito}>{analise.atribuicao}</Text> : null}
            </Aparecer>

            <Aparecer indice={1}>
              <Text style={styles.rotulo}>Mensagem para {visita.clienteNome?.trim() || 'o cliente'}</Text>
              <View style={styles.mensagem}>
                <Text style={styles.mensagemTexto} selectable>
                  {mensagem}
                </Text>
              </View>
              {!temNumero ? (
                <Text style={styles.aviso}>
                  Este cliente não tem um WhatsApp válido no cadastro. O WhatsApp vai abrir para você escolher o
                  contato, com a mensagem pronta.
                </Text>
              ) : null}
              {erro ? (
                <Text style={styles.erro} accessibilityRole="alert">
                  {erro}
                </Text>
              ) : null}
            </Aparecer>

            <OlliButton
              label="Remarcar e avisar"
              variant="success"
              fullWidth
              size="lg"
              loading={abrindo}
              onPress={() => {
                void remarcarEAvisar();
              }}
              icon={<MaterialCommunityIcons name="whatsapp" size={20} color="#fff" />}
              style={{ marginTop: Spacing.lg }}
            />
            <OlliButton
              label="Manter a visita"
              variant="outline"
              fullWidth
              size="lg"
              disabled={abrindo}
              onPress={aoManter}
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    caixa: {
      backgroundColor: c.surface,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      paddingBottom: Spacing.xl,
    },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: c.outline,
    },
    cabecalhoTexto: { flex: 1 },
    icone: { width: 40, height: 40, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
    titulo: { color: c.onSurface, fontSize: 17, fontWeight: '800' },
    subtitulo: { color: c.onSurfaceMuted, fontSize: 13, marginTop: 2 },
    conteudo: { padding: Spacing.base },
    motivo: { color: c.onSurface, fontSize: 15, fontWeight: '700', marginBottom: 2 },
    credito: { color: c.onSurfaceMuted, fontSize: 11, marginTop: 2 },
    rotulo: { color: c.onSurface, fontSize: 13, fontWeight: '700', marginTop: Spacing.lg, marginBottom: Spacing.sm },
    mensagem: {
      backgroundColor: c.surfaceVariant,
      borderWidth: 1,
      borderColor: c.outline,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
    },
    mensagemTexto: { color: c.onSurfaceVariant, fontSize: 14, lineHeight: 20 },
    aviso: {
      color: c.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 17,
      marginTop: Spacing.sm,
      padding: Spacing.sm,
      backgroundColor: comAlfa(c.warning, 0.1),
      borderRadius: BorderRadius.sm,
    },
    erro: { color: c.danger, fontSize: 13, marginTop: Spacing.sm },
  });

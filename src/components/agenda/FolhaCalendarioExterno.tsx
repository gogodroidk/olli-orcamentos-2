import { useState } from 'react';
import { Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { getAgendamentos } from '../../services/agenda';
import { ativarLinkIcal, compartilharArquivoIcs, revogarLinkIcal } from '../../services/agendaIcal';
import { aplicarEscopo, escopoConhecido, type EscopoAgenda } from '../../utils/agendaDominio';
import type { EscopoIcal } from '../../utils/assinaturaIcal';

/**
 * Arquivo .ics e link de assinatura. O Google Agenda nativo (OAuth) continua
 * desligado: isto não pede login do Google.
 */
export function FolhaCalendarioExterno({
  visivel,
  aoFechar,
  escopo,
}: {
  visivel: boolean;
  aoFechar: () => void;
  escopo: EscopoAgenda;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [link, setLink] = useState<{ https: string; webcal: string; escopo: EscopoIcal } | null>(null);
  const [trocar, setTrocar] = useState(false);

  function fechar() {
    setAviso(null);
    setTrocar(false);
    aoFechar();
  }

  function escopoPedido(): EscopoIcal | null {
    if (escopo.status === 'equipe') return 'equipe';
    if (escopo.status === 'propria') return 'propria';
    return null;
  }

  async function baixar() {
    if (!escopoConhecido(escopo)) {
      setAviso('Não consegui saber de quem é esta agenda. Nada foi exportado.');
      return;
    }
    setOcupado(true);
    setAviso(null);
    try {
      const todos = await getAgendamentos();
      const meus = aplicarEscopo(todos, escopo);
      const r = await compartilharArquivoIcs(meus);
      if (r === 'vazio') setAviso('Não há compromisso dos últimos 30 dias, nem série que se repete, para exportar.');
      else if (r === 'sem_folha') setAviso('Não consegui abrir o compartilhar neste aparelho.');
      else if (r === 'erro') setAviso('Não consegui gerar o arquivo.');
    } finally {
      setOcupado(false);
    }
  }

  async function criarLink(substituir: boolean) {
    const pedido = escopoPedido();
    if (!pedido) {
      setAviso('Não consegui saber de quem é esta agenda. O link não foi criado.');
      return;
    }
    setOcupado(true);
    setAviso(null);
    try {
      if (substituir && link) {
        const morto = await revogarLinkIcal(link.escopo);
        if (morto === 'indisponivel') {
          setAviso('A assinatura por link ainda não está disponível nesta conta. O arquivo .ics continua funcionando.');
          return;
        }
        if (morto !== 'ok') {
          setAviso('Não consegui cancelar o link antigo. Ele continua valendo.');
          return;
        }
      }
      const r = await ativarLinkIcal(pedido);
      if (r.estado === 'pronto') {
        setLink({ https: r.https, webcal: r.webcal, escopo: r.escopo });
        setTrocar(false);
        return;
      }
      if (r.estado === 'indisponivel') {
        setAviso('A assinatura por link ainda não está disponível nesta conta. Enquanto isso, baixe o arquivo .ics.');
        return;
      }
      if (r.estado === 'sem_sessao') {
        setAviso('Entre de novo na sua conta para criar o link. O arquivo .ics não precisa de rede.');
        return;
      }
      if (r.estado === 'sem_acesso') {
        setAviso('Este papel não assina a agenda da equipe. Nada foi criado.');
        return;
      }
      setAviso('Não consegui criar o link agora. O arquivo .ics continua disponível.');
    } finally {
      setOcupado(false);
    }
  }

  async function enviarLink() {
    if (!link) return;
    try {
      await Share.share({ message: link.https });
    } catch {
      // a pessoa fechou a folha de enviar
    }
  }

  const fraseEscopo = link?.escopo === 'propria'
    ? 'Este link tem só as visitas em que você é o responsável.'
    : 'Este link tem a agenda da conta, inclusive a da equipe.';

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={fechar}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.titulo}>Outro calendário</Text>
            <TouchableOpacity onPress={fechar} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={22} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.corpo}>
            <Text style={styles.texto}>
              Baixe um arquivo .ics ou assine um link no Google Agenda, no iPhone ou no Outlook. O que você mudar lá não volta para o OLLI. A conexão direta com a conta Google continua desligada.
            </Text>
            <TouchableOpacity style={styles.botao} onPress={() => { void baixar(); }} disabled={ocupado} accessibilityRole="button">
              <MaterialCommunityIcons name="calendar-export" size={18} color={cores.accentLight} />
              <Text style={styles.botaoTexto}>Compartilhar arquivo .ics</Text>
            </TouchableOpacity>
            <Text style={styles.nota}>O arquivo leva de 30 dias atrás para a frente, e as séries que se repetem. É uma cópia de agora.</Text>

            {!link ? (
              <TouchableOpacity style={styles.botao} onPress={() => { void criarLink(false); }} disabled={ocupado} accessibilityRole="button">
                <MaterialCommunityIcons name="link-variant" size={18} color={cores.accentLight} />
                <Text style={styles.botaoTexto}>Criar link de assinatura</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.linkBox}>
                <Text style={styles.nota}>{fraseEscopo} Quem tiver o link vê título, cliente, endereço e observação. Se vazar, gere outro.</Text>
                <Text style={styles.link} selectable>{link.https}</Text>
                <Text style={styles.nota}>No iPhone, use o endereço webcal:</Text>
                <Text style={styles.link} selectable>{link.webcal}</Text>
                <TouchableOpacity style={styles.botao} onPress={() => { void enviarLink(); }} accessibilityRole="button">
                  <MaterialCommunityIcons name="share-variant" size={18} color={cores.accentLight} />
                  <Text style={styles.botaoTexto}>Enviar o link https</Text>
                </TouchableOpacity>
                {!trocar ? (
                  <TouchableOpacity onPress={() => setTrocar(true)} disabled={ocupado} accessibilityRole="button">
                    <Text style={styles.perigo}>Gerar outro link</Text>
                  </TouchableOpacity>
                ) : (
                  <View>
                    <Text style={styles.nota}>O link antigo para de atualizar. Quem já assinou precisa do link novo.</Text>
                    <TouchableOpacity onPress={() => { void criarLink(true); }} disabled={ocupado} accessibilityRole="button">
                      <Text style={styles.perigo}>Confirmar e gerar outro</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTrocar(false)} accessibilityRole="button">
                      <Text style={styles.nota}>Manter o link atual</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            {aviso ? <Text style={styles.aviso} accessibilityRole="alert">{aviso}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function criarEstilos(c: Cores) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    card: { maxHeight: '88%', backgroundColor: c.surface, borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, paddingBottom: Spacing.lg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm },
    titulo: { fontSize: 18, fontWeight: '800', color: c.onSurface },
    corpo: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.lg, gap: 10 },
    texto: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
    nota: { color: c.onSurfaceMuted, fontSize: 13, lineHeight: 18 },
    botao: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 12 },
    botaoTexto: { color: c.onSurface, fontWeight: '700', fontSize: 14 },
    linkBox: { gap: 8 },
    link: { color: c.onSurface, fontSize: 13, lineHeight: 18 },
    aviso: { color: c.danger, fontSize: 13, lineHeight: 18 },
    perigo: { color: c.danger, fontWeight: '800', fontSize: 13, paddingVertical: 6 },
  });
}

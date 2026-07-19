import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Fonts, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { OlliButton } from '../OlliButton';
import { OlliSkeleton } from '../OlliSkeleton';
import { PdfPreviewModal } from '../PdfPreviewModal';
import { AssinaturaClienteModal } from '../assinatura/AssinaturaClienteModal';
import { getOrcamentos, saveOrcamento } from '../../database/database';
import { usePlano } from '../../hooks/usePlano';
import { RECURSO_REMOVE_MARCA } from '../../services/planos';
import { Empresa, Orcamento } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { AVISO_APP } from '../../utils/documentoBase';
import { montarHtmlContratoCompleto, termosPadraoContrato } from '../../utils/contratoPdf';
import {
  dadosConclusaoDeOrcamento,
  dadosGarantiaDeOrcamento,
  montarHtmlTermoConclusao,
  montarHtmlTermoGarantia,
} from '../../utils/termosPdf';

/**
 * GerarDocumentoModal — o caminho curto entre "tenho um orçamento" e "tenho o
 * documento na mão".
 *
 * A PROMESSA desta tela é que o prestador NÃO REDIGITA NADA: ele escolhe de qual
 * orçamento o documento sai, e o documento já vem preenchido com as partes, os
 * itens, o valor, o prazo, a garantia e as formas de pagamento que ele digitou
 * uma única vez, no wizard. O que sobra para ele é ajustar (em "Cláusulas
 * padrão") e enviar.
 *
 * TRÊS ESTADOS, sempre (regra da casa): carregando ≠ erro ≠ lista vazia. Se a
 * leitura do banco falhar, a tela DIZ que falhou e oferece "Tentar de novo" — ela
 * nunca mostra "nenhum orçamento ainda" para quem tem cinquenta.
 */

export type TipoDocumento = 'contrato' | 'garantia' | 'conclusao';

export const TITULOS_DOCUMENTO: Record<TipoDocumento, string> = {
  contrato: 'Contrato de prestação de serviço',
  garantia: 'Termo de garantia',
  conclusao: 'Termo de conclusão e aceite',
};

interface Props {
  visivel: boolean;
  tipo: TipoDocumento;
  empresa: Empresa | null;
  aoFechar: () => void;
}

type Estado = 'carregando' | 'erro' | 'pronto';

export function GerarDocumentoModal({ visivel, tipo, empresa, aoFechar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const { temAcesso } = usePlano();

  const [estado, setEstado] = useState<Estado>('carregando');
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [escolhido, setEscolhido] = useState<Orcamento | null>(null);
  const [previa, setPrevia] = useState(false);
  const [assinando, setAssinando] = useState(false);
  const [assinaturaFalhou, setAssinaturaFalhou] = useState(false);

  const carregar = useCallback(async () => {
    setEstado('carregando');
    try {
      const todos = await getOrcamentos();
      // Aprovados e convertidos primeiro: é deles que sai um contrato de verdade.
      const peso = (o: Orcamento) => (o.status === 'aprovado' || o.status === 'convertido' ? 0 : 1);
      setOrcamentos([...todos].sort((a, b) => peso(a) - peso(b)));
      setEstado('pronto');
    } catch {
      // "Não consegui ler" NUNCA pode ser exibido como "você não tem nenhum".
      setEstado('erro');
    }
  }, []);

  useEffect(() => {
    if (!visivel) {
      setEscolhido(null);
      setPrevia(false);
      setAssinando(false);
      setAssinaturaFalhou(false);
      return;
    }
    carregar();
  }, [visivel, carregar]);

  /**
   * Grava a assinatura do contrato no orçamento e SÓ ENTÃO resolve. O contrato
   * do AssinaturaClienteModal exige exatamente isto: lançar quando não gravou —
   * é a rejeição que segura o pad aberto com o desenho do cliente intacto.
   *
   * Grava em `assinaturaContratoUri`, campo próprio: a assinatura do contrato
   * não é a mesma coisa que o aceite da proposta e não pode vazar para o PDF
   * do orçamento.
   */
  const gravarAssinatura = useCallback(async (dataUri: string, assinadoEmISO: string) => {
    if (!escolhido) throw new Error('Nenhum orçamento selecionado.');
    const atualizado: Orcamento = {
      ...escolhido,
      assinaturaContratoUri: dataUri,
      dataAssinaturaContrato: assinadoEmISO,
    };
    try {
      await saveOrcamento(atualizado);
    } catch (e) {
      setAssinaturaFalhou(true);
      throw e;
    }
    setAssinaturaFalhou(false);
    setEscolhido(atualizado);
    setAssinando(false);
  }, [escolhido]);

  /**
   * Constrói o HTML do documento pedido. Passado ao PdfPreviewModal, que já sabe
   * pré-visualizar E exportar o PDF de verdade — não há segundo caminho de saída.
   */
  const construirHtml = useCallback(async (): Promise<string> => {
    if (!escolhido || !empresa) throw new Error('Faltam dados para montar o documento.');
    const removerMarca = temAcesso(RECURSO_REMOVE_MARCA);
    const assinatura = {
      assinaturaClienteUri: escolhido.assinaturaContratoUri,
      dataAssinaturaCliente: escolhido.dataAssinaturaContrato,
      removerMarca,
    };
    if (tipo === 'contrato') {
      return montarHtmlContratoCompleto(
        escolhido,
        empresa,
        termosPadraoContrato(escolhido, empresa, empresa.contratoPadrao),
        assinatura,
      );
    }
    if (tipo === 'garantia') {
      return montarHtmlTermoGarantia(dadosGarantiaDeOrcamento(escolhido, empresa), empresa, assinatura);
    }
    return montarHtmlTermoConclusao(dadosConclusaoDeOrcamento(escolhido, empresa), empresa, assinatura);
  }, [escolhido, empresa, tipo, temAcesso]);

  const assinado = !!escolhido?.assinaturaContratoUri;

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={aoFechar} presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: insets.top ? 0 : Spacing.md }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo} numberOfLines={1}>{TITULOS_DOCUMENTO[tipo]}</Text>
            <Text style={styles.sub}>Escolha de qual orçamento o documento sai</Text>
          </View>
          <TouchableOpacity onPress={aoFechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <MaterialCommunityIcons name="close" size={24} color={cores.onSurface} />
          </TouchableOpacity>
        </View>

        {estado === 'carregando' && (
          <View style={styles.corpo}>
            <OlliSkeleton height={64} radius={14} />
            <OlliSkeleton height={64} radius={14} style={{ marginTop: Spacing.sm }} />
            <OlliSkeleton height={64} radius={14} style={{ marginTop: Spacing.sm }} />
          </View>
        )}

        {estado === 'erro' && (
          <View style={styles.centro}>
            <MaterialCommunityIcons name="cloud-off-outline" size={34} color={cores.onSurfaceVariant} />
            <Text style={styles.centroTitulo}>Não consegui ler seus orçamentos</Text>
            <Text style={styles.centroTexto}>
              Isso é uma falha de leitura, não quer dizer que você não tenha orçamentos salvos.
            </Text>
            <OlliButton label="Tentar de novo" variant="outline" onPress={carregar} style={{ marginTop: Spacing.md }} />
          </View>
        )}

        {estado === 'pronto' && orcamentos.length === 0 && (
          <View style={styles.centro}>
            <MaterialCommunityIcons name="file-document-outline" size={34} color={cores.onSurfaceVariant} />
            <Text style={styles.centroTitulo}>Nenhum orçamento salvo ainda</Text>
            <Text style={styles.centroTexto}>
              O documento se preenche a partir de um orçamento. Crie um e volte aqui.
            </Text>
          </View>
        )}

        {estado === 'pronto' && orcamentos.length > 0 && (
          <FlatList
            data={orcamentos}
            keyExtractor={o => o.id}
            contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xl + insets.bottom, gap: Spacing.sm }}
            ListHeaderComponent={
              <View style={styles.avisoBox}>
                <MaterialCommunityIcons name="information-outline" size={16} color={cores.onSurfaceVariant} />
                <Text style={styles.avisoTexto}>{AVISO_APP}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const ativo = escolhido?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.card, ativo && { borderColor: cores.primary, borderWidth: 2 }]}
                  onPress={() => setEscolhido(item)}
                  activeOpacity={0.9}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardNome} numberOfLines={1}>{item.clienteNome}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      Nº {item.numero} · {formatCurrency(item.valorTotal)} · {formatDate(item.criadoEm)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={ativo ? 'radiobox-marked' : 'radiobox-blank'}
                    size={22}
                    color={ativo ? cores.primary : cores.onSurfaceMuted}
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}

        {escolhido && (
          <View style={[styles.rodape, { paddingBottom: Spacing.md + insets.bottom }]}>
            {assinaturaFalhou && (
              <View style={styles.erroLinha}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={cores.danger} />
                <Text style={styles.erroTexto}>Não consegui salvar a assinatura. Tente assinar de novo.</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.assinarBtn}
              onPress={() => setAssinando(true)}
              accessibilityRole="button"
              accessibilityLabel={assinado ? 'Assinar de novo no aparelho' : 'Colher a assinatura do cliente no aparelho'}
            >
              <MaterialCommunityIcons
                name={assinado ? 'check-decagram-outline' : 'draw-pen'}
                size={18}
                color={assinado ? cores.success : cores.accentLight}
              />
              <Text style={[styles.assinarTexto, assinado && { color: cores.success }]}>
                {assinado ? 'Assinado pelo cliente · assinar de novo' : 'Cliente assina aqui no aparelho'}
              </Text>
            </TouchableOpacity>
            <OlliButton
              label="Ver e enviar documento"
              variant="gradient"
              fullWidth
              onPress={() => setPrevia(true)}
              icon={<MaterialCommunityIcons name="file-document-outline" size={18} color="#fff" />}
            />
          </View>
        )}
      </View>

      <AssinaturaClienteModal
        visivel={assinando}
        clienteNome={escolhido?.clienteNome ?? ''}
        referencia={escolhido ? `${TITULOS_DOCUMENTO[tipo]} · Nº ${escolhido.numero}` : undefined}
        aoConfirmar={gravarAssinatura}
        aoCancelar={() => setAssinando(false)}
      />

      <PdfPreviewModal
        visible={previa}
        onClose={() => setPrevia(false)}
        empresa={empresa}
        titulo={TITULOS_DOCUMENTO[tipo]}
        // `chave` inclui a assinatura: assinar e reabrir tem que RECONSTRUIR o
        // HTML, senão o prestador veria a prévia antiga (sem assinatura) e
        // acharia que a assinatura não entrou no documento.
        chave={`${tipo}:${escolhido?.id ?? ''}:${escolhido?.dataAssinaturaContrato ?? ''}`}
        construirHtml={construirHtml}
        nomeArquivo={escolhido ? `${tipo}-${escolhido.numero}` : undefined}
      />
    </Modal>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline,
  },
  titulo: { fontSize: 17, fontFamily: Fonts.extraBold, color: c.onSurface },
  sub: { fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: 1 },

  corpo: { padding: Spacing.base },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: 6 },
  centroTitulo: { fontSize: 15.5, fontFamily: Fonts.bold, color: c.onSurface, marginTop: 6, textAlign: 'center' },
  centroTexto: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 19 },

  avisoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.xs,
  },
  avisoTexto: { flex: 1, fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, lineHeight: 17 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: c.outline, padding: Spacing.md,
    minHeight: 64, ...sombrasDe(c).sm,
  },
  cardNome: { fontSize: 15, fontFamily: Fonts.bold, color: c.onSurface },
  cardMeta: { fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, marginTop: 2 },

  rodape: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, gap: Spacing.sm,
    backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline,
  },
  // minHeight 48: alvo de dedo, não de ponteiro.
  assinarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 48, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline,
  },
  assinarTexto: { fontSize: 13.5, fontFamily: Fonts.bold, color: c.accentLight },
  erroLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  erroTexto: { flex: 1, fontSize: 12.5, fontFamily: Fonts.regular, color: c.danger },
});

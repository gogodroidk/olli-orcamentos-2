import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../../theme';
import { OlliButton } from '../OlliButton';
import { PdfPreviewModal } from '../PdfPreviewModal';
import { EditorClausulasContrato } from './EditorClausulasContrato';
import { getDepoimentos, getEmpresa } from '../../database/database';
import { usePlano } from '../../hooks/usePlano';
import { RECURSO_REMOVE_MARCA } from '../../services/planos';
import { exigirCadastroParaEnviar } from '../../services/exigirCadastro';
import type { Depoimento, Empresa, Orcamento } from '../../types';
import { formatarNumeroExibicao } from '../../utils/numeroDocumento';
import { linhasDeClausulas, montarHtmlContratoCompleto, termosPadraoContrato } from '../../utils/contratoPdf';
import { compartilharPdfOrcamento } from '../../utils/pdfGenerator';
import { compartilharPdfContrato } from '../../utils/contratoPdf';
import {
  compartilharPdfTermoConclusao,
  compartilharPdfTermoGarantia,
  dadosConclusaoDeOrcamento,
  dadosGarantiaDeOrcamento,
  montarHtmlTermoConclusao,
  montarHtmlTermoGarantia,
} from '../../utils/termosPdf';

export type TipoPainelDocumento = 'orcamento' | 'contrato' | 'garantia' | 'conclusao';

interface Props {
  visivel: boolean;
  tipo: TipoPainelDocumento;
  orcamento: Orcamento | null;
  empresa: Empresa | null;
  /** Quando a abertura veio da linha "Contrato", as cláusulas já aparecem no topo. */
  focarClausulas?: boolean;
  aoFechar: () => void;
  aoEmpresaSalva: (empresa: Empresa) => void;
  aoAbrirFicha: () => void;
}

type Previa = 'orcamento' | 'contrato' | 'garantia' | 'conclusao' | null;
type Impressao = 'orcamento' | 'contrato' | 'termo' | null;

/**
 * Ver o orçamento, ver o contrato, ver e editar as cláusulas, imprimir.
 * Um caminho só: os mesmos geradores do PDF que o cliente recebe.
 */
export function PainelDocumentoCentral({
  visivel, tipo, orcamento, empresa, focarClausulas, aoFechar, aoEmpresaSalva, aoAbrirFicha,
}: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { temAcesso } = usePlano();
  const [previa, setPrevia] = useState<Previa>(null);
  const [editorAberto, setEditorAberto] = useState(false);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [imprimindo, setImprimindo] = useState<Impressao>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visivel) {
      setPrevia(null);
      setEditorAberto(false);
      setImprimindo(null);
      setErro(null);
      return;
    }
    let vivo = true;
    getDepoimentos().then((lista) => { if (vivo) setDepoimentos(lista); }).catch(() => { if (vivo) setDepoimentos([]); });
    return () => { vivo = false; };
  }, [visivel]);

  if (!orcamento) return null;

  const removerMarca = temAcesso(RECURSO_REMOVE_MARCA);
  const termos = empresa ? termosPadraoContrato(orcamento, empresa, empresa.contratoPadrao) : null;
  const clausulas = termos ? linhasDeClausulas(termos) : [];
  const numero = formatarNumeroExibicao(orcamento.numero);

  async function empresaAtual(): Promise<Empresa | null> {
    try {
      return await getEmpresa();
    } catch {
      return empresa;
    }
  }

  async function imprimirOrcamento() {
    if (imprimindo || !orcamento) return;
    setErro(null);
    if (!(await exigirCadastroParaEnviar('orcamento'))) return;
    const emp = await empresaAtual();
    if (!emp) {
      setErro('Preencha os dados em Meu Negócio antes de imprimir o orçamento.');
      return;
    }
    setImprimindo('orcamento');
    try {
      await compartilharPdfOrcamento(orcamento, emp, depoimentos, orcamento.corMarca, { removerMarca });
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não consegui imprimir o orçamento. Tente de novo.');
    } finally {
      setImprimindo(null);
    }
  }

  async function imprimirContrato() {
    if (imprimindo || !orcamento) return;
    setErro(null);
    if (!(await exigirCadastroParaEnviar('documento'))) return;
    const emp = await empresaAtual();
    if (!emp) {
      setErro('Preencha os dados em Meu Negócio antes de imprimir o contrato.');
      return;
    }
    setImprimindo('contrato');
    try {
      await compartilharPdfContrato(orcamento, emp, termosPadraoContrato(orcamento, emp, emp.contratoPadrao), {
        removerMarca,
        assinaturaClienteUri: orcamento.assinaturaContratoUri,
        dataAssinaturaCliente: orcamento.dataAssinaturaContrato,
      });
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não consegui imprimir o contrato. Tente de novo.');
    } finally {
      setImprimindo(null);
    }
  }

  async function imprimirTermo() {
    if (imprimindo || !orcamento || (tipo !== 'garantia' && tipo !== 'conclusao')) return;
    setErro(null);
    if (!(await exigirCadastroParaEnviar('documento'))) return;
    const emp = await empresaAtual();
    if (!emp) {
      setErro('Preencha os dados em Meu Negócio antes de imprimir.');
      return;
    }
    setImprimindo('termo');
    try {
      const opts = { removerMarca, assinaturaClienteUri: orcamento.assinaturaContratoUri, dataAssinaturaCliente: orcamento.dataAssinaturaContrato };
      if (tipo === 'garantia') await compartilharPdfTermoGarantia(dadosGarantiaDeOrcamento(orcamento, emp), emp, opts);
      else await compartilharPdfTermoConclusao(dadosConclusaoDeOrcamento(orcamento, emp), emp, opts);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não consegui imprimir este documento. Tente de novo.');
    } finally {
      setImprimindo(null);
    }
  }

  async function htmlContrato(): Promise<string> {
    const emp = await empresaAtual();
    if (!emp || !orcamento) throw new Error('Faltam dados para montar o contrato.');
    return montarHtmlContratoCompleto(orcamento, emp, termosPadraoContrato(orcamento, emp, emp.contratoPadrao), {
      removerMarca,
      assinaturaClienteUri: orcamento.assinaturaContratoUri,
      dataAssinaturaCliente: orcamento.dataAssinaturaContrato,
    });
  }

  async function htmlTermo(): Promise<string> {
    const emp = await empresaAtual();
    if (!emp || !orcamento) throw new Error('Faltam dados para montar o documento.');
    const opts = { removerMarca, assinaturaClienteUri: orcamento.assinaturaContratoUri, dataAssinaturaCliente: orcamento.dataAssinaturaContrato };
    if (tipo === 'garantia') return montarHtmlTermoGarantia(dadosGarantiaDeOrcamento(orcamento, emp), emp, opts);
    return montarHtmlTermoConclusao(dadosConclusaoDeOrcamento(orcamento, emp), emp, opts);
  }

  const titulo = tipo === 'contrato'
    ? `Contrato · orçamento nº ${numero}`
    : tipo === 'garantia'
      ? `Garantia · orçamento nº ${numero}`
      : tipo === 'conclusao'
        ? `Conclusão · orçamento nº ${numero}`
        : `Orçamento nº ${numero}`;

  return (
    <>
    <Modal visible={visivel && previa === null && !editorAberto} transparent animationType="slide" onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.caixa}>
          <View style={styles.cabecalho}>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo} numberOfLines={2}>{titulo}</Text>
              <Text style={styles.sub} numberOfLines={1}>{orcamento.clienteNome || 'Cliente'}</Text>
            </View>
            <TouchableOpacity onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Fechar documento" hitSlop={10}>
              <MaterialCommunityIcons name="close" size={24} color={cores.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.corpo} keyboardShouldPersistTaps="handled">
            <View style={styles.acoes}>
              <OlliButton label="Ver orçamento" variant="outline" onPress={() => setPrevia('orcamento')} icon={<MaterialCommunityIcons name="eye-outline" size={18} color={cores.primary} />} />
              <OlliButton label="Ver contrato" variant="outline" onPress={() => setPrevia('contrato')} icon={<MaterialCommunityIcons name="file-sign" size={18} color={cores.primary} />} />
              <OlliButton label="Imprimir orçamento" variant="gradient" loading={imprimindo === 'orcamento'} disabled={!!imprimindo} onPress={() => { void imprimirOrcamento(); }} icon={<MaterialCommunityIcons name="printer" size={18} color="#fff" />} />
              <OlliButton label="Imprimir contrato" variant="gradient" loading={imprimindo === 'contrato'} disabled={!!imprimindo} onPress={() => { void imprimirContrato(); }} icon={<MaterialCommunityIcons name="printer" size={18} color="#fff" />} />
              {(tipo === 'garantia' || tipo === 'conclusao') && (
                <OlliButton
                  label={tipo === 'garantia' ? 'Ver garantia' : 'Ver conclusão'}
                  variant="outline"
                  onPress={() => setPrevia(tipo)}
                  icon={<MaterialCommunityIcons name="eye-outline" size={18} color={cores.primary} />}
                />
              )}
              {(tipo === 'garantia' || tipo === 'conclusao') && (
                <OlliButton
                  label={tipo === 'garantia' ? 'Imprimir garantia' : 'Imprimir conclusão'}
                  variant="outline"
                  loading={imprimindo === 'termo'}
                  disabled={!!imprimindo}
                  onPress={() => { void imprimirTermo(); }}
                  icon={<MaterialCommunityIcons name="printer" size={18} color={cores.primary} />}
                />
              )}
            </View>

            {erro && (
              <View style={styles.erro}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.danger} />
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            )}

            <Text style={styles.secao}>Ver e editar cláusulas</Text>
            {focarClausulas ? <Text style={styles.nota}>Cláusulas deste contrato, como saem no papel.</Text> : null}
            <Text style={styles.nota}>
              O que você salva vale para os contratos novos. O papel que o cliente já recebeu não muda.
              A multa de atraso não passa de 2% (CDC, art. 52, §1º).
            </Text>
            {!empresa || clausulas.length === 0 ? (
              <Text style={styles.vazio}>Preencha Meu Negócio para ver as cláusulas deste contrato.</Text>
            ) : (
              <View style={styles.lista}>
                {clausulas.map((linha) => (
                  <View key={linha.titulo} style={styles.clausula}>
                    <Text style={styles.clausulaTitulo}>{linha.titulo}</Text>
                    <Text style={styles.clausulaTexto}>{linha.texto}</Text>
                  </View>
                ))}
              </View>
            )}
            <OlliButton
              label="Editar cláusulas"
              variant="outline"
              fullWidth
              onPress={() => setEditorAberto(true)}
              icon={<MaterialCommunityIcons name="text-box-edit-outline" size={18} color={cores.primary} />}
              style={{ marginTop: Spacing.sm }}
            />
            <OlliButton
              label="Abrir ficha do orçamento"
              variant="ghost"
              fullWidth
              onPress={aoAbrirFicha}
              icon={<MaterialCommunityIcons name="open-in-new" size={18} color={cores.primary} />}
              style={{ marginTop: Spacing.xs }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>

      <PdfPreviewModal
        visible={previa === 'orcamento'}
        onClose={() => setPrevia(null)}
        orcamento={orcamento}
        empresa={empresa}
        depoimentos={depoimentos}
        removerMarca={removerMarca}
        titulo={`Orçamento nº ${numero}`}
        antesDeExportar={() => exigirCadastroParaEnviar('orcamento')}
      />
      <PdfPreviewModal
        visible={previa === 'contrato'}
        onClose={() => setPrevia(null)}
        empresa={empresa}
        titulo={`Contrato · orçamento nº ${numero}`}
        chave={`${orcamento.id}:${JSON.stringify(empresa?.contratoPadrao ?? {})}`}
        construirHtml={htmlContrato}
        nomeArquivo={`Contrato-${orcamento.numero}`}
        antesDeExportar={() => exigirCadastroParaEnviar('documento')}
      />
      <PdfPreviewModal
        visible={previa === 'garantia' || previa === 'conclusao'}
        onClose={() => setPrevia(null)}
        empresa={empresa}
        titulo={previa === 'garantia' ? `Garantia · orçamento nº ${numero}` : `Conclusão · orçamento nº ${numero}`}
        chave={`${tipo}:${orcamento.id}`}
        construirHtml={htmlTermo}
        nomeArquivo={tipo === 'garantia' ? `Garantia-${orcamento.numero}` : `Conclusao-${orcamento.numero}`}
        antesDeExportar={() => exigirCadastroParaEnviar('documento')}
      />
      <EditorClausulasContrato
        visivel={editorAberto}
        empresa={empresa}
        aoFechar={() => setEditorAberto(false)}
        aoSalvar={(atualizada) => { aoEmpresaSalva(atualizada); setEditorAberto(false); }}
      />
    </>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  caixa: { maxHeight: '92%', backgroundColor: c.surface, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: c.outline },
  titulo: { color: c.onSurface, fontSize: 17, fontWeight: '800' },
  sub: { color: c.onSurfaceMuted, fontSize: 13, marginTop: 3 },
  corpo: { padding: Spacing.base, paddingBottom: Spacing.xl, gap: Spacing.sm },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  secao: { color: c.onSurface, fontSize: 15, fontWeight: '800', marginTop: Spacing.sm },
  nota: { color: c.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 },
  vazio: { color: c.onSurfaceMuted, fontSize: 13, lineHeight: 18 },
  lista: { gap: Spacing.sm },
  clausula: { backgroundColor: c.background, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: Spacing.sm },
  clausulaTitulo: { color: c.onSurface, fontSize: 12.5, fontWeight: '800' },
  clausulaTexto: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 18, marginTop: 3 },
  erro: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.danger + '14', borderRadius: BorderRadius.md, padding: Spacing.sm },
  erroTexto: { flex: 1, color: c.danger, fontSize: 13, lineHeight: 18 },
});

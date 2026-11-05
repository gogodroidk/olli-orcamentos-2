import { StyleSheet, View } from 'react-native';
import type { EsquemaLayout } from '../../content/modelosLayout';

/**
 * Miniatura estática do layout do PDF. Não é o documento: é um esquema das
 * peças que o modelo realmente muda (capa, faixa, cabeçalho, marca d'água).
 * O papel é claro de propósito — o PDF do cliente sai claro nos dois temas.
 * Sem animação: é legenda, não enfeite.
 */
const PAPEL = '#FFFFFF';
const TINTA = '#1A2230';
const LINHA = '#C5CDD6';

export function PreviaEsquemaLayout({ esquema, cor }: { esquema: EsquemaLayout; cor: string }) {
  const faixaLarga = esquema === 'faixa';
  const faixaFina = esquema === 'editorial';
  const comFaixa = faixaLarga || faixaFina;
  const compacto = esquema === 'compacto';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[estilos.folha, compacto && estilos.folhaCurta, esquema === 'classico' && estilos.folhaClassica]}
    >
      {comFaixa ? (
        <View style={[estilos.faixa, { width: faixaLarga ? 10 : 4, backgroundColor: cor }]} />
      ) : null}
      <View style={[estilos.miolo, compacto && estilos.mioloCurto]}>
        {esquema === 'capa' ? <View style={[estilos.capa, { backgroundColor: cor }]} /> : null}
        {esquema === 'cabecalho' ? <View style={[estilos.cabecalho, { backgroundColor: cor }]} /> : null}
        {esquema === 'classico' ? <View style={[estilos.bordaInterna, { borderColor: cor }]} /> : null}
        <View style={[estilos.linhas, esquema === 'classico' && estilos.linhasCentro]}>
          <View style={[estilos.linha, estilos.linhaForte, esquema === 'classico' && estilos.linhaCurta]} />
          <View style={[estilos.linha, estilos.linhaMedia]} />
          {compacto ? null : <View style={[estilos.linha, estilos.linhaLonga]} />}
          {esquema === 'editorial' ? <View style={[estilos.marca, { backgroundColor: cor }]} /> : null}
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  folha: {
    width: 52,
    height: 72,
    borderRadius: 4,
    backgroundColor: PAPEL,
    borderWidth: 1,
    borderColor: '#D5DDE6',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  folhaCurta: { height: 56 },
  folhaClassica: { borderWidth: 2, borderColor: TINTA },
  faixa: { height: '100%' },
  miolo: { flex: 1, padding: 4, gap: 3, position: 'relative' },
  mioloCurto: { padding: 3, gap: 2 },
  capa: { height: 28, borderRadius: 2 },
  cabecalho: { height: 14, borderRadius: 2, marginHorizontal: -4, marginTop: -4 },
  bordaInterna: {
    ...StyleSheet.absoluteFill,
    margin: 3,
    borderWidth: 1,
    borderRadius: 2,
  },
  linhas: { flex: 1, gap: 3, justifyContent: 'flex-start' },
  linhasCentro: { alignItems: 'center', marginTop: 8 },
  linha: { height: 3, borderRadius: 2, backgroundColor: LINHA },
  linhaForte: { height: 4, backgroundColor: TINTA, width: '78%' },
  linhaMedia: { width: '92%' },
  linhaLonga: { width: '64%' },
  linhaCurta: { width: '48%' },
  marca: {
    position: 'absolute',
    right: -6,
    bottom: -8,
    width: 18,
    height: 18,
    borderRadius: 9,
    opacity: 0.35,
  },
});

import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCores, useEstilos, type Cores } from '../theme';
import { interpretarMarkdown, type ParteChat } from '../utils/chatUi';

/**
 * Desenha a resposta da OLLI com negrito, lista e código. Cada pedaço é Text
 * nativo: nada de HTML, então um markdown malicioso não vira página.
 */
export function MarkdownChat({ texto }: { texto: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const blocos = interpretarMarkdown(texto);
  return (
    <View>
      {blocos.map((bloco) => {
        if (bloco.tipo === 'codigo') {
          return (
            <ScrollView key={bloco.id} horizontal showsHorizontalScrollIndicator={false} style={styles.codigoCaixa}>
              <Text selectable style={styles.codigo}>{bloco.texto || ' '}</Text>
            </ScrollView>
          );
        }
        if (bloco.tipo === 'lista') {
          return (
            <View key={bloco.id} style={styles.lista}>
              {bloco.itens.map((item, itemIndice) => (
                <View key={item.id} style={styles.itemLista}>
                  <Text style={styles.marcador}>{bloco.ordenada ? `${itemIndice + 1}.` : '•'}</Text>
                  <Text selectable style={styles.texto}>{partes(item.partes, cores, styles)}</Text>
                </View>
              ))}
            </View>
          );
        }
        const estilo = bloco.tipo === 'titulo'
          ? bloco.nivel === 1 ? styles.titulo1 : styles.titulo
          : styles.texto;
        return (
          <Text key={bloco.id} selectable style={estilo}>
            {partes(bloco.partes, cores, styles)}
          </Text>
        );
      })}
    </View>
  );
}

function partes(lista: ParteChat[], cores: Cores, styles: ReturnType<typeof criarEstilos>) {
  return lista.map((parte) => {
    if (parte.tipo === 'negrito') return <Text key={parte.id} style={styles.negrito}>{parte.texto}</Text>;
    if (parte.tipo === 'italico') return <Text key={parte.id} style={styles.italico}>{parte.texto}</Text>;
    if (parte.tipo === 'codigo') return <Text key={parte.id} style={styles.codigoInline}>{parte.texto}</Text>;
    if (parte.tipo === 'link') {
      return (
        <Text
          key={parte.id}
          style={[styles.link, { color: cores.accentLight }]}
          accessibilityRole="link"
          onPress={() => { Linking.openURL(parte.href).catch(() => {}); }}
        >
          {parte.texto}
        </Text>
      );
    }
    return <Text key={parte.id}>{parte.texto}</Text>;
  });
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  texto: { fontSize: 15, color: c.onSurface, lineHeight: 22 },
  titulo1: { fontSize: 17, fontWeight: '800', color: c.onSurface, lineHeight: 24, marginBottom: 4 },
  titulo: { fontSize: 15.5, fontWeight: '800', color: c.onSurface, lineHeight: 22, marginTop: 2, marginBottom: 2 },
  negrito: { fontWeight: '800' },
  italico: { fontStyle: 'italic' },
  codigoInline: {
    fontFamily: 'monospace',
    fontSize: 13,
    backgroundColor: c.surfaceVariant,
    color: c.onSurface,
  },
  codigoCaixa: {
    marginVertical: 6,
    borderRadius: 10,
    backgroundColor: c.surfaceVariant,
  },
  codigo: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
    color: c.onSurface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  lista: { marginVertical: 2, gap: 3 },
  itemLista: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  marcador: { width: 18, fontSize: 15, lineHeight: 22, color: c.onSurfaceVariant },
  link: { textDecorationLine: 'underline' },
});

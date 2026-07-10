import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { GradientHeader } from './GradientHeader';
import { OlliButton } from './OlliButton';
import { usePermissao, type Acao } from '../hooks/usePermissao';
import { goBackOrHome } from '../navigation/safeBack';

/**
 * <GuardaPapel> — guarda de PAPEL para telas sensíveis (Onda 2, permissões).
 *
 * Esconder o item de menu não basta: uma tela alcançável por URL/deep link
 * (olliorcamentos://relatorio-do-dia, /servicos, ...) lê do SQLite LOCAL já
 * sincronizado, e o RLS do backend não protege um dado que já está no aparelho.
 * A porta precisa estar na própria tela — este componente é essa porta.
 *
 * Fail-closed: enquanto o papel ainda não é conhecido (`carregando`) NUNCA
 * renderiza o conteúdo protegido, só um estado neutro. Sem a permissão, mostra
 * um "acesso restrito" sóbrio com caminho de volta. O `children` só é montado
 * com a permissão confirmada — e só então seus efeitos de carga de dados rodam.
 */
interface Props {
  /** Ação que o papel do usuário precisa liberar para ver o conteúdo. */
  acao: Acao;
  /**
   * Nome curto da área, usado apenas na mensagem de acesso negado (ex.:
   * "Relatório do dia"). Opcional — sem ele a mensagem fica genérica.
   */
  area?: string;
  children: React.ReactNode;
}

export function GuardaPapel({ acao, area, children }: Props) {
  const { pode, carregando } = usePermissao();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  // Papel ainda desconhecido: segura a tela num estado neutro. Fail-closed —
  // jamais deixamos o conteúdo protegido piscar antes da permissão resolver.
  if (carregando) {
    return (
      <View style={styles.carregando}>
        <ActivityIndicator color={cores.accentLight} />
      </View>
    );
  }

  if (!pode(acao)) {
    return <AcessoNegado area={area} />;
  }

  return <>{children}</>;
}

function AcessoNegado({ area }: { area?: string }) {
  const nav = useNavigation();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const voltar = () => goBackOrHome(nav);

  return (
    <View style={styles.container}>
      <GradientHeader title="Acesso restrito" subtitle="Permissão insuficiente" onBack={voltar} />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="lock-outline" size={40} color={cores.accentLight} />
        </View>
        <Text style={styles.titulo}>Área restrita</Text>
        <Text style={styles.descricao}>
          {area ? `"${area}" não está disponível ` : 'Esta área não está disponível '}
          para o seu papel atual na equipe. Fale com o administrador da empresa se
          precisar de acesso.
        </Text>
        <OlliButton
          label="Voltar"
          onPress={voltar}
          variant="outline"
          size="lg"
          fullWidth
          icon={<MaterialCommunityIcons name="arrow-left" size={18} color={cores.accentLight} />}
          style={styles.btn}
        />
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    carregando: {
      flex: 1, backgroundColor: c.background,
      alignItems: 'center', justifyContent: 'center',
    },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
    iconWrap: {
      width: 86, height: 86, borderRadius: BorderRadius.xl,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surfaceGlass,
      borderWidth: 1, borderColor: c.strokeGlow,
      ...sombrasDe(c).sm,
    },
    titulo: { fontSize: 20, fontWeight: '800', color: c.onSurface, marginTop: Spacing.md, textAlign: 'center' },
    descricao: {
      fontSize: 14, color: c.onSurfaceVariant, marginTop: Spacing.sm,
      textAlign: 'center', lineHeight: 20, maxWidth: 340,
    },
    btn: { marginTop: Spacing.xl },
  });

export default GuardaPapel;

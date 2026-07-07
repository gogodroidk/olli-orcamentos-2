import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { TabelaDados, Coluna } from '../../components/web/TabelaDados';
import { BarraBusca, normalizarBusca } from '../../components/web/BarraBusca';
import { EmptyState } from '../../components/EmptyState';
import { PressableWebState } from '../../components/web/pressableWebState';
import { PainelCliente } from './PainelCliente';
import { getClientes, getOrcamentos } from '../../database/database';
import { onSyncAplicado } from '../../services/cloudSync';
import { formatDate } from '../../utils/date';
import { abrirWhatsApp } from '../../utils/pdfGenerator';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { Cliente, Orcamento } from '../../types';
import { avisar, confirmar } from './dialogo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type LinhaCliente = Cliente & { ultimoOrcamentoData?: string };

/**
 * Clientes desktop (v4) — tabela com busca e painel lateral de
 * criação/edição (PainelCliente). Reaproveita getClientes/getOrcamentos e
 * abrirWhatsApp já usados na ClientesScreen mobile, sem tocar nela.
 */
export default function ClientesDesktopScreen() {
  const nav = useNavigation<Nav>();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [painelVisivel, setPainelVisivel] = useState(false);

  const carregar = useCallback(async () => {
    const [c, o] = await Promise.all([getClientes(), getOrcamentos()]);
    setClientes(c);
    setOrcamentos(o);
    setCarregando(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(carregar), [carregar]);

  // Último orçamento por cliente (join client-side) — usado na coluna
  // "Último orçamento" da tabela.
  const ultimoOrcamentoPorCliente = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const o of orcamentos) {
      const atual = mapa.get(o.clienteId);
      if (!atual || o.criadoEm > atual) mapa.set(o.clienteId, o.criadoEm);
    }
    return mapa;
  }, [orcamentos]);

  const linhas: LinhaCliente[] = useMemo(() => {
    let r: LinhaCliente[] = clientes.map((c) => ({
      ...c,
      ultimoOrcamentoData: ultimoOrcamentoPorCliente.get(c.id),
    }));
    if (busca.trim()) {
      const q = normalizarBusca(busca);
      const qDigits = busca.replace(/\D/g, '');
      r = r.filter((c) =>
        normalizarBusca(c.nome).includes(q) ||
        (qDigits.length > 0 && c.telefone.replace(/\D/g, '').includes(qDigits))
      );
    }
    return r;
  }, [clientes, busca, ultimoOrcamentoPorCliente]);

  function abrirNovo() {
    setClienteEditando(null);
    setPainelVisivel(true);
  }

  function abrirEdicao(c: Cliente) {
    setClienteEditando(c);
    setPainelVisivel(true);
  }

  async function chamarWhatsApp(c: Cliente) {
    if (!c.telefone?.trim()) {
      avisar('WhatsApp', 'Este cliente não tem telefone cadastrado.');
      return;
    }
    try {
      await abrirWhatsApp(c.telefone, `Olá ${c.nome}!`);
    } catch {
      avisar('Erro', 'Não foi possível abrir o WhatsApp.');
    }
  }

  function verOrcamentos(c: Cliente) {
    nav.navigate('Tabs', { screen: 'OrcamentosTab', params: { clienteId: c.id, clienteNome: c.nome } });
  }

  function agendarVisita(c: Cliente) {
    const endereco = [c.endereco, c.complemento, c.cidade, c.estado].filter(Boolean).join(', ');
    nav.navigate('Tabs', {
      screen: 'Agenda',
      params: { novoParaClienteId: c.id, novoParaClienteNome: c.nome, novoEndereco: endereco || undefined },
    });
  }

  const colunas: Coluna<LinhaCliente>[] = useMemo(() => [
    {
      chave: 'nome',
      titulo: 'Nome',
      largura: '26%',
      ordenavel: true,
      valorOrdenacao: (c) => c.nome,
      render: (c) => <Text style={styles.celulaTexto} numberOfLines={1}>{c.nome}</Text>,
      tituloCompleto: (c) => c.nome,
    },
    {
      chave: 'telefone',
      titulo: 'Telefone',
      largura: 160,
      ordenavel: true,
      valorOrdenacao: (c) => c.telefone ?? '',
      render: (c) => <Text style={styles.celulaTexto}>{c.telefone || '—'}</Text>,
    },
    {
      chave: 'cidade',
      titulo: 'Cidade',
      largura: 180,
      ordenavel: true,
      valorOrdenacao: (c) => c.cidade ?? '',
      render: (c) => (
        <Text style={styles.celulaTexto} numberOfLines={1}>
          {c.cidade ? `${c.cidade}${c.estado ? `, ${c.estado}` : ''}` : '—'}
        </Text>
      ),
      tituloCompleto: (c) => (c.cidade ? `${c.cidade}${c.estado ? `, ${c.estado}` : ''}` : undefined),
    },
    {
      chave: 'ultimoOrcamento',
      titulo: 'Último orçamento',
      largura: 160,
      ordenavel: true,
      valorOrdenacao: (c) => c.ultimoOrcamentoData ?? '',
      render: (c) => (
        <Text style={styles.celulaTexto}>
          {c.ultimoOrcamentoData ? formatDate(c.ultimoOrcamentoData) : '—'}
        </Text>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: 150,
      render: (c) => (
        <View style={styles.acoesLinha}>
          <AcaoIcone icone="whatsapp" rotulo="WhatsApp" onPress={() => chamarWhatsApp(c)} />
          <AcaoIcone icone="file-document-outline" rotulo="Orçamentos" onPress={() => verOrcamentos(c)} />
          <AcaoIcone icone="calendar-plus" rotulo="Agendar visita" onPress={() => agendarVisita(c)} />
          <AcaoIcone icone="pencil-outline" rotulo="Editar" onPress={() => abrirEdicao(c)} />
        </View>
      ),
    },
  ], [nav]);

  return (
    <LayoutDesktop
      titulo="Clientes"
      subtitulo={`${clientes.length} cadastrado${clientes.length === 1 ? '' : 's'}`}
      acoes={
        <>
          <BarraBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome ou telefone…" />
          <Pressable
            onPress={abrirNovo}
            accessibilityRole="button"
            accessibilityLabel="Novo cliente"
            style={({ hovered, focused }: PressableWebState) => [styles.botaoNovo, hovered && styles.botaoNovoHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
            <Text style={styles.botaoNovoLabel}>Novo cliente</Text>
          </Pressable>
        </>
      }
    >
      <TabelaDados<LinhaCliente>
        colunas={colunas}
        dados={linhas}
        carregando={carregando}
        aoClicarLinha={(c) => abrirEdicao(c)}
        ordenacaoInicial={{ chave: 'nome', direcao: 'asc' }}
        vazio={
          <EmptyState
            icon="account-group-outline"
            title="Nenhum cliente"
            subtitle="Cadastre seus clientes para agilizar os orçamentos."
            actionLabel="Novo cliente"
            onAction={abrirNovo}
          />
        }
      />

      <PainelCliente
        cliente={clienteEditando}
        visivel={painelVisivel}
        aoFechar={() => setPainelVisivel(false)}
        aoSalvar={carregar}
      />
    </LayoutDesktop>
  );
}

function AcaoIcone({ icone, rotulo, onPress }: { icone: keyof typeof MaterialCommunityIcons.glyphMap; rotulo: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ hovered, focused }: PressableWebState) => [styles.acaoIcone, hovered && styles.acaoIconeHover, focused && styles.focoVisivel]}
    >
      <MaterialCommunityIcons name={icone} size={17} color={Colors.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: Colors.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  botaoNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  botaoNovoHover: {
    backgroundColor: Colors.primaryLight,
  },
  botaoNovoLabel: {
    ...Typography.button,
    color: '#fff',
    fontSize: 13,
  },
  celulaTexto: {
    ...Typography.bodySmall,
    color: Colors.onSurface,
  },
  acoesLinha: {
    flexDirection: 'row',
    gap: 2,
  },
  acaoIcone: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoIconeHover: {
    backgroundColor: Colors.surfacePressed,
  },
});

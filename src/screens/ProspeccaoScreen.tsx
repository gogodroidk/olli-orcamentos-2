/**
 * PROSPECÇÃO (D-1438 G19) — mapa dos clientes da própria conta.
 *
 * Raio, rota e nicho em cima do que o cadastro já tem (coordenada do cliente
 * e base do prestador). O mapa é o mesmo grátis do Mapa do dia. A rota abre
 * pelo link público do Google Maps. Nada de API paga e nada de buscar
 * estabelecimento que não está na conta.
 */
import { useCallback, useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { MapaBase } from '../components/mapa/MapaBase';
import type { PinMapa } from '../components/mapa/tipos';
import { getClientes, getEmpresa, getEquipamentosDb } from '../database/database';
import { goBackOrHome } from '../navigation/safeBack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { Cliente, Equipamento } from '../types';
import { CATEGORIAS_HVAC } from '../types';
import {
  NICHO_TODOS,
  RAIO_PADRAO_KM,
  RAIOS_KM,
  TEXTO_GPS_NATIVO,
  TEXTO_ROTA,
  TEXTO_SEM_ORIGEM,
  TEXTO_SO_CADASTRO,
  clienteParaMapa,
  linhaDaProspeccao,
  montarProspeccao,
  resumirNichos,
  textoKm,
  urlRotaProspeccao,
  type PontoProspeccao,
} from '../utils/prospeccaoMapa';
import { coordenadaValida } from '../utils/geoCliente';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATALOGO: Record<string, string> = Object.fromEntries(CATEGORIAS_HVAC.map((c) => [c.id, c.label]));

function nichosDosEquipamentos(equipamentos: readonly Equipamento[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const e of equipamentos) {
    if (!e.clienteId || !e.categoria) continue;
    const lista = mapa.get(e.clienteId) ?? [];
    lista.push(e.categoria);
    mapa.set(e.clienteId, lista);
  }
  return mapa;
}

interface PosicaoWeb {
  coords: { latitude: number; longitude: number };
}

function pedirPosicaoWeb(): Promise<PontoProspeccao | null> {
  const geo = (globalThis.navigator as { geolocation?: {
    getCurrentPosition: (
      ok: (p: PosicaoWeb) => void,
      erro: () => void,
      opts: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
    ) => void;
  } } | undefined)?.geolocation;
  if (!geo) return Promise.resolve(null);
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (p) => resolve(coordenadaValida(p.coords.latitude, p.coords.longitude)),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export default function ProspeccaoScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [equipamentosOk, setEquipamentosOk] = useState(true);
  const [base, setBase] = useState<PontoProspeccao | null>(null);
  const [aparelho, setAparelho] = useState<PontoProspeccao | null>(null);
  const [fonte, setFonte] = useState<'base' | 'aparelho'>('base');
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [avisoRota, setAvisoRota] = useState<string | null>(null);
  const [raioKm, setRaioKm] = useState<number>(RAIO_PADRAO_KM);
  const [nicho, setNicho] = useState<string>(NICHO_TODOS);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const carregar = useCallback(async (aindaVivo: () => boolean = () => true) => {
    if (!aindaVivo()) return;
    setEstado('carregando');
    setAvisoRota(null);
    try {
      const [lista, empresa] = await Promise.all([getClientes(), getEmpresa()]);
      let eqs: Equipamento[] = [];
      let eqsOk = true;
      try {
        eqs = await getEquipamentosDb();
      } catch {
        eqsOk = false;
      }
      if (!aindaVivo()) return;
      const pontoBase = empresa ? coordenadaValida(empresa.baseLat, empresa.baseLon) : null;
      setClientes(lista);
      setEquipamentos(eqs);
      setEquipamentosOk(eqsOk);
      setBase(pontoBase);
      setEstado('ok');
    } catch {
      if (!aindaVivo()) return;
      setEstado('erro');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let vivo = true;
    void carregar(() => vivo);
    return () => { vivo = false; };
  }, [carregar]));

  const mapaClientes = useMemo(() => {
    const porCliente = nichosDosEquipamentos(equipamentos);
    return clientes.map((c) => clienteParaMapa({
      id: c.id,
      nome: c.nome,
      endereco: c.endereco,
      complemento: c.complemento,
      cidade: c.cidade,
      estado: c.estado,
      cep: c.cep,
      lat: c.lat,
      lon: c.lon,
      geoPrecisao: c.geoPrecisao,
      nichos: porCliente.get(c.id) ?? [],
    }, CATALOGO));
  }, [clientes, equipamentos]);

  const nichosLista = useMemo(() => resumirNichos(mapaClientes), [mapaClientes]);
  const nichoEfetivo = nicho !== NICHO_TODOS && nichosLista.some((n) => n.id === nicho) ? nicho : NICHO_TODOS;
  const origem: PontoProspeccao | null = fonte === 'aparelho' && aparelho ? aparelho : base;

  const resultado = useMemo(() => montarProspeccao({
    origem,
    clientes: mapaClientes,
    raioKm: origem ? raioKm : null,
    nicho: nichoEfetivo,
    nichosConfiaveis: equipamentosOk,
  }), [origem, mapaClientes, raioKm, nichoEfetivo, equipamentosOk]);

  const rota = useMemo(
    () => urlRotaProspeccao(resultado.dentro.map((item) => item.cliente.endereco)),
    [resultado.dentro],
  );

  const pins: PinMapa[] = useMemo(() => {
    const lista: PinMapa[] = [];
    if (origem) {
      lista.push({
        id: '__origem',
        lat: origem.lat,
        lon: origem.lon,
        rotulo: 'Eu',
        tom: 'equipe',
        acessibilidade: fonte === 'aparelho' && aparelho ? 'Onde você está agora' : 'Base do seu cadastro',
      });
    }
    for (const item of resultado.dentro) {
      if (item.cliente.lat === null || item.cliente.lon === null) continue;
      const distancia = item.distanciaKm === null ? '' : `, a ${textoKm(item.distanciaKm)}`;
      lista.push({
        id: item.cliente.id,
        lat: item.cliente.lat,
        lon: item.cliente.lon,
        rotulo: String(item.ordem),
        tom: 'proxima',
        aproximado: item.cliente.aproximado,
        acessibilidade: `${item.ordem}. ${item.cliente.nome}${distancia}`,
      });
    }
    return lista;
  }, [origem, fonte, aparelho, resultado.dentro]);

  const linha = useMemo(() => linhaDaProspeccao(origem, resultado.dentro), [origem, resultado.dentro]);

  async function usarOndeEstou() {
    if (Platform.OS !== 'web') {
      setAvisoGps(TEXTO_GPS_NATIVO);
      setFonte('base');
      return;
    }
    setBuscandoGps(true);
    setAvisoGps(null);
    const ponto = await pedirPosicaoWeb();
    setBuscandoGps(false);
    if (!ponto) {
      setAvisoGps('Não consegui ler a posição deste navegador. Continuo na base do cadastro, se ela existir.');
      setFonte('base');
      return;
    }
    setAparelho(ponto);
    setFonte('aparelho');
  }

  async function abrirRota() {
    if (!rota.url) return;
    setAvisoRota(null);
    try {
      await Linking.openURL(rota.url);
    } catch {
      setAvisoRota('Não consegui abrir o Maps.');
    }
  }

  const rotuloOrigem = fonte === 'aparelho' && aparelho
    ? 'Partindo de onde você está agora. Essa posição fica só nesta tela.'
    : base
      ? 'Partindo da base do cadastro (o endereço de Meu negócio).'
      : TEXTO_SEM_ORIGEM;

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Prospecção"
        subtitle="Seus clientes no mapa"
        onBack={() => goBackOrHome(nav)}
      />
      {estado === 'carregando' ? (
        <View style={styles.centro}>
          <Text style={styles.muted}>Carregando seus clientes…</Text>
        </View>
      ) : estado === 'erro' ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Não deu para carregar"
          subtitle="Não consegui ler os clientes agora. O mapa não abre vazio no lugar de um erro."
          actionLabel="Tentar de novo"
          onAction={() => { void carregar(); }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + Spacing.xl, gap: 14 }}>
          <Text style={styles.nota}>{TEXTO_SO_CADASTRO}</Text>
          <Text style={styles.corpo}>{rotuloOrigem}</Text>
          {avisoGps ? <Text style={styles.aviso}>{avisoGps}</Text> : null}
          {!equipamentosOk ? (
            <Text style={styles.aviso}>Não deu para ler os equipamentos. O filtro de nicho fica desligado até atualizar — não vou tratar todo mundo como “sem equipamento”.</Text>
          ) : null}

          <View style={styles.chips} accessibilityRole="tablist">
            <Chip
              ativo={fonte !== 'aparelho'}
              rotulo="Base do cadastro"
              desabilitado={!base}
              onPress={() => { setFonte('base'); setAvisoGps(null); }}
            />
            {Platform.OS === 'web' ? (
              <Chip
                ativo={fonte === 'aparelho' && !!aparelho}
                rotulo={buscandoGps ? 'Lendo posição…' : 'Onde estou'}
                desabilitado={buscandoGps}
                onPress={() => { void usarOndeEstou(); }}
              />
            ) : null}
            {!base ? (
              <Chip rotulo="Completar em Meu negócio" onPress={() => nav.navigate('MeuNegocio')} />
            ) : null}
          </View>

          <Text style={styles.secao}>Raio</Text>
          <View style={styles.chips}>
            {RAIOS_KM.map((km) => (
              <Chip
                key={km}
                ativo={raioKm === km}
                rotulo={`${km} km`}
                onPress={() => setRaioKm(km)}
              />
            ))}
          </View>
          {!origem ? <Text style={styles.muted}>O raio escolhido vale quando houver uma posição de partida.</Text> : null}

          {equipamentosOk ? (
            <>
              <Text style={styles.secao}>Nicho</Text>
              <Text style={styles.muted}>O nicho é o equipamento já cadastrado naquele cliente. Quem não tem equipamento entra em “Sem equipamento”.</Text>
              <View style={styles.chips}>
                <Chip ativo={nichoEfetivo === NICHO_TODOS} rotulo="Todos" onPress={() => setNicho(NICHO_TODOS)} />
                {nichosLista.map((n) => (
                  <Chip
                    key={n.id}
                    ativo={nichoEfetivo === n.id}
                    rotulo={`${n.rotulo} (${n.quantidade})`}
                    onPress={() => setNicho(n.id)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.mapaCaixa}>
            {pins.length > 0 ? (
              <MapaBase
                pins={pins}
                linha={linha.length > 1 ? linha : undefined}
                selecionado={selecionado}
                onPinPress={(id) => { if (id !== '__origem') setSelecionado(id); }}
                style={styles.mapa}
              />
            ) : (
              <View style={styles.mapaVazio}>
                <MaterialCommunityIcons name="map-marker-off-outline" size={28} color={cores.onSurfaceMuted} />
                <Text style={styles.muted}>Nenhum cliente com ponto neste recorte.</Text>
              </View>
            )}
          </View>

          <Text style={styles.nota}>{TEXTO_ROTA}</Text>
          {resultado.kmLinhaReta !== null ? (
            <Text style={styles.corpo}>
              Linha reta da rota: {textoKm(resultado.kmLinhaReta)}. Não é a distância de rua e não inclui trânsito.
            </Text>
          ) : null}
          <Text
            style={[styles.botao, !rota.url && styles.botaoOff]}
            onPress={() => { if (rota.url) void abrirRota(); }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !rota.url }}
          >
            {rota.url ? `Abrir rota no Google Maps (${rota.usadas})` : 'Nenhum endereço para abrir a rota'}
          </Text>
          {rota.deForaDoLink > 0 ? (
            <Text style={styles.aviso}>
              O link leva {rota.usadas}. {rota.deForaDoLink} {rota.deForaDoLink === 1 ? 'ficou' : 'ficaram'} de fora: o Maps só aceita 10 paradas nesse link.
            </Text>
          ) : null}
          {rota.semEndereco > 0 ? (
            <Text style={styles.muted}>
              {rota.semEndereco === 1
                ? '1 cliente está no mapa sem endereço de texto e não entra na rota.'
                : `${rota.semEndereco} clientes estão no mapa sem endereço de texto e não entram na rota.`}
            </Text>
          ) : null}
          {avisoRota ? <Text style={styles.aviso}>{avisoRota}</Text> : null}

          <Text style={styles.secao}>
            {origem && resultado.raioAplicado ? `Dentro de ${raioKm} km (${resultado.dentro.length})` : `No mapa (${resultado.dentro.length})`}
          </Text>
          {resultado.dentro.length === 0 ? (
            <Text style={styles.muted}>
              {clientes.length === 0
                ? 'Você ainda não tem cliente cadastrado.'
                : 'Ninguém deste recorte tem ponto dentro do raio. Veja quem ficou de fora ou sem coordenada.'}
            </Text>
          ) : resultado.dentro.map((item) => (
            <View key={item.cliente.id} style={[styles.linha, selecionado === item.cliente.id && styles.linhaAtiva]}>
              <Text style={styles.ordem}>{item.ordem}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>{item.cliente.nome}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {[item.distanciaKm === null ? null : textoKm(item.distanciaKm), item.cliente.cidade || null, item.cliente.aproximado ? 'ponto aproximado' : null]
                    .filter(Boolean)
                    .join(' · ') || 'Sem cidade no cadastro'}
                </Text>
              </View>
            </View>
          ))}

          {resultado.fora.length > 0 ? (
            <>
              <Text style={styles.secao}>Fora do raio ({resultado.fora.length})</Text>
              {resultado.fora.map((item) => (
                <Text key={item.cliente.id} style={styles.corpo}>
                  {item.cliente.nome} · {textoKm(item.distanciaKm)}
                </Text>
              ))}
            </>
          ) : null}

          {resultado.semPonto.length > 0 ? (
            <>
              <Text style={styles.secao}>Sem ponto no mapa ({resultado.semPonto.length})</Text>
              <Text style={styles.muted}>O ponto nasce quando o cadastro tem CEP ou cidade e UF. Sem isso, o cliente continua na lista e não some.</Text>
              {resultado.semPonto.map((c) => (
                <View key={c.id} style={styles.linha}>
                  <Text style={[styles.nome, { flex: 1 }]} numberOfLines={1}>{c.nome}</Text>
                  <Text
                    style={styles.link}
                    onPress={() => nav.navigate('ClienteDetalhe', { clienteId: c.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir o cadastro de ${c.nome}`}
                  >
                    Abrir cadastro
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({ ativo, rotulo, onPress, desabilitado }: { ativo?: boolean; rotulo: string; onPress: () => void; desabilitado?: boolean }) {
  const styles = useEstilos(criarEstilos);
  return (
    <Text
      style={[styles.chip, ativo && styles.chipAtivo, desabilitado && styles.chipOff]}
      onPress={desabilitado ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!ativo, disabled: !!desabilitado }}
    >
      {rotulo}
    </Text>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.base },
  nota: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
  corpo: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
  muted: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 18 },
  aviso: { color: c.onSurface, fontSize: 13, lineHeight: 18, backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.md, padding: 10 },
  secao: { color: c.onSurface, fontSize: 15, fontWeight: '800', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    color: c.onSurface,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: '700',
  },
  chipAtivo: { backgroundColor: c.primary, borderColor: c.primary, color: c.onPrimary },
  chipOff: { opacity: 0.45 },
  mapaCaixa: { height: 280, borderRadius: BorderRadius.lg, overflow: 'hidden', backgroundColor: c.surfaceVariant },
  mapa: { flex: 1 },
  mapaVazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.base },
  botao: {
    backgroundColor: c.primary,
    color: c.onPrimary,
    textAlign: 'center',
    fontWeight: '800',
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  botaoOff: { opacity: 0.5 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: BorderRadius.md, padding: 10 },
  linhaAtiva: { borderWidth: 1, borderColor: c.accent },
  ordem: { width: 28, textAlign: 'center', fontWeight: '800', color: c.primary },
  nome: { color: c.onSurface, fontSize: 15, fontWeight: '700' },
  link: { color: c.primary, fontWeight: '800', fontSize: 13 },
});

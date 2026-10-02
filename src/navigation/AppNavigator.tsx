import React from 'react';
import { ActivityIndicator, Easing, View, Text, StyleSheet } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import { BorderRadius, comAlfa, sombrasDe, useCores, useEstilos, useGradientes, type Cores } from '../theme';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { CURVA, DURACAO, TOQUE, useReduzirMovimento } from '../theme/motion';
import { PressableAnimado } from '../components/motion/PressableAnimado';
import { vibrar } from '../utils/haptico';
import { comCentroDesktop } from '../components/web/CentroDesktop';
import { OlliButton } from '../components/OlliButton';
import { SidebarNav } from '../components/web/SidebarNav';
import type { Recurso } from '../services/entitlements';
import type { VerticalId } from '../services/verticais';

// Screens
import HomeScreen from '../screens/HomeScreen';
import OrcamentosScreen from '../screens/OrcamentosScreen';
import NovoOrcamentoScreen from '../screens/NovoOrcamentoScreen';
import DiagnosticoScreen from '../screens/DiagnosticoScreen';
import DiagnosticoIAScreen from '../screens/DiagnosticoIAScreen';
import MeuNegocioScreen from '../screens/MeuNegocioScreen';
import ModelosDocumentoScreen from '../screens/ModelosDocumentoScreen';
import CentralDocumentosScreen from '../screens/CentralDocumentosScreen';
import VisualizarOrcamentoScreen from '../screens/VisualizarOrcamentoScreen';
import ClientesScreen from '../screens/ClientesScreen';
import ClienteDetalheScreen from '../screens/ClienteDetalheScreen';
import ServicosScreen from '../screens/ServicosScreen';
import ProdutosScreen from '../screens/ProdutosScreen';
import EmitirReciboScreen from '../screens/EmitirReciboScreen';
import ContaScreen from '../screens/ContaScreen';
import AgendaScreen from '../screens/AgendaScreen';
import HojeScreen from '../screens/HojeScreen';
import OlliVozScreen from '../screens/OlliVozScreen';
import OlliChatScreen from '../screens/OlliChatScreen';
import AutopilotScreen from '../screens/AutopilotScreen';
import ImportarScreen from '../screens/ImportarScreen';
import CalculadoraTintaScreen from '../screens/CalculadoraTintaScreen';
import CertificadoAnvisaScreen from '../screens/CertificadoAnvisaScreen';
import PrepararNotaScreen from '../screens/PrepararNotaScreen';
import CertificadoCaixaDaguaScreen from '../screens/CertificadoCaixaDaguaScreen';
import FerramentasOficioScreen from '../screens/FerramentasOficioScreen';
import CreditosScreen from '../screens/CreditosScreen';
import PlanosScreen from '../screens/PlanosScreen';
import VimDeOutroAppScreen from '../screens/VimDeOutroAppScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import EntrarScreen from '../screens/EntrarScreen';
import RelatorioDiaScreen from '../screens/RelatorioDiaScreen';
import ConfirmarVisitasScreen from '../screens/ConfirmarVisitasScreen';
import GarantiasScreen from '../screens/GarantiasScreen';
import EquipeScreen from '../screens/EquipeScreen';
import EquipeAoVivoScreen from '../screens/EquipeAoVivoScreen';
import ConviteScreen from '../screens/ConviteScreen';
import OrdemServicoScreen from '../screens/OrdemServicoScreen';
import EquipamentoScreen from '../screens/EquipamentoScreen';
import EscanearQrScreen from '../screens/EscanearQrScreen';
import PmocPlanosScreen from '../screens/PmocPlanosScreen';
import PmocPlanoScreen from '../screens/PmocPlanoScreen';
import ContratosScreen from '../screens/ContratosScreen';
import ContratoScreen from '../screens/ContratoScreen';
// Frentes novas — landing pública, lixeira, assinatura, ajuda/suporte, legal
// (Privacidade/Termos = mesmo componente) e o shell do técnico (Home dele).
import LandingScreen from '../screens/LandingScreen';
import LixeiraScreen from '../screens/LixeiraScreen';
import AssinaturaScreen from '../screens/AssinaturaScreen';
import AjudaScreen from '../screens/AjudaScreen';
import LegalScreen from '../screens/LegalScreen';
import TecnicoHomeScreen from '../screens/TecnicoHomeScreen';
import type { AjudaRouteParams } from '../screens/AjudaScreen';
import { usePermissao } from '../hooks/usePermissao';
import { getEmpresa } from '../database/database';
import { camposPendentesPerfil, ROTULO_CAMPO_PERFIL } from '../services/perfilOperacional';
import type { StatusOrcamento } from '../types';

// Telas desktop (v4) — só montadas quando `ehDesktop` (web ≥ 1024px). No
// nativo/APK nada disto entra na árvore. Barril em src/screens/desktop.
import {
  InicioDesktopScreen,
  AgendaDesktopScreen,
  OrcamentosDesktopScreen,
  ClientesDesktopScreen,
  RelatoriosDesktopScreen,
  FerramentasDesktopScreen,
  ServicosDesktopScreen,
  ProdutosDesktopScreen,
  EquipamentosDesktopScreen,
  RecibosDesktopScreen,
  OrdensDesktopScreen,
  PmocDesktopScreen,
  LixeiraDesktopScreen,
  EquipeDesktopScreen,
  AjudaDesktopScreen,
  ContaDesktopScreen,
} from '../screens/desktop';

/**
 * Item pré-carregado num novo orçamento (vindo de um diagnóstico/código de erro).
 * Só descrição/nome — o usuário ajusta preço e quantidade no fluxo do orçamento.
 */
export type PrefillItem = {
  tipo: 'servico' | 'produto';
  nome: string;
  descricao?: string;
  /** Quantidade pré-carregada (ex.: litros de tinta calculados). Default 1. */
  quantidade?: number;
  /** Unidade do item (`UNIDADES`). Default 'un'. */
  unidade?: string;
  /**
   * Valor de REFERÊNCIA (exemplo da ativação e preço sugerido do Autopilot). O editor
   * continua sendo a autoridade: o prestador troca pelo preço dele.
   */
  precoSugerido?: number;
};

export type RootStackParamList = {
  // NavigatorScreenParams: declara Tabs como um navigator ANINHADO. Além de
  // manter navigate('Tabs', { screen, params }) tipado, é o que o `linking` da
  // v4 exige para aceitar `screens` aninhados no PathConfig de Tabs.
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Onboarding: undefined;
  Entrar: undefined;
  // NovoOrcamento aceita um modelo, OU pré-seleção de cliente, OU 1 item pré-carregado
  // (origem: diagnóstico / código de erro). Tudo opcional — sem isto cai no fluxo normal.
  // `exemploVertical` marca o orçamento de exemplo da ativação (services/ativacao.ts):
  // o editor mostra o aviso "é um exemplo, troque pelos seus valores".
  // `clienteNome` (Autopilot): cliente ainda sem cadastro — entra só o nome; o usuário liga ao cadastro no passo 1.
  NovoOrcamento: { modeloId?: string; clienteId?: string; clienteNome?: string; prefillItem?: PrefillItem; prefillItems?: PrefillItem[]; exemploVertical?: VerticalId };
  EditarOrcamento: { orcamentoId: string };
  VisualizarOrcamento: { orcamentoId: string };
  // Orcamentos pode abrir filtrado por cliente (CRM: "ver orçamentos deste cliente").
  Orcamentos: { clienteId?: string; clienteNome?: string } | undefined;
  Clientes: undefined;
  ClienteDetalhe: { clienteId: string };
  Servicos: undefined;
  Produtos: undefined;
  EmitirRecibo: { orcamentoId?: string };
  // "OLLI prepara a nota": dados da NFS-e de um recibo para copiar no Emissor Nacional.
  PrepararNota: { reciboId: string };
  Conta: undefined;
  MeuNegocio: undefined;
  ModelosDocumento: undefined;
  CentralDocumentos: undefined;
  Diagnostico: undefined;
  DiagnosticoIA: { marca?: string; modelo?: string; codigo?: string; sintoma?: string };
  // Fase 3 — OLLI conversacional + planos
  OlliVoz: undefined;
  OlliChat: undefined;
  Autopilot: undefined;
  // Troque em 5 minutos: contatos (.vcf/CSV), planilha CSV/XLSX e foto de orçamento antigo (IA).
  Importar: undefined;
  // Ferramenta ÚNICA do ofício de pintura (gate `vertical: 'pintura'` em Conta).
  CalculadoraTinta: undefined;
  // Comprovante de controle de pragas (RDC 622, art. 19) do ofício de dedetização (gate `vertical: 'dedetizacao'`).
  CertificadoAnvisa: undefined;
  // Certificado de limpeza de caixa d'água (gate `vertical: 'caixa_dagua'`).
  CertificadoCaixaDagua: undefined;
  // Hub de calculadoras por ofício (adapta-se à vertical; some sem calculadora).
  FerramentasOficio: undefined;
  // Saldo de créditos + recarga por Pix (Mercado Pago — o único gateway de Pix
  // do OLLI; ver src/services/pixCreditos.ts → /mp/*).
  Creditos: undefined;
  Planos: {
    origem: 'gate';
    recurso: Recurso;
    plano: 'pro' | 'empresa';
  } | undefined;
  // Crédito de troca ("Vim de outro app"): pedido com comprovante, conferido à mão.
  VimDeOutroApp: undefined;
  // Relatório do dia falado — sempre gera o dia corrente na hora, sem params.
  RelatorioDia: undefined;
  // Onda I3 — fila "Confirmar visitas de amanhã" (aviso das 18h) e garantias para cuidar.
  ConfirmarVisitas: undefined;
  Garantias: undefined;
  // Onda 2 — Equipe (empresa): gestão de membros/papéis/convites.
  Equipe: undefined;
  // Onda 2 — Equipe ao vivo: lista de técnicos + última localização + rota no mapa.
  EquipeAoVivo: undefined;
  // Aceite de convite de equipe (deep link olliorcamentos://convite/<token>).
  Convite: { token?: string };
  // Onda 4 — Ordens de serviço (OS mínima + app do técnico). Role-aware:
  // gestão vê todas; técnico vê só as suas.
  OrdemServico: { ordemId?: string } | undefined;
  // PMOC Fase 1 — Equipamentos HVAC (inventário + etiqueta QR da porta física).
  // abrirToken: vem do scanner (EscanearQr) → abre o equipamento com esse qrToken.
  Equipamento: { abrirToken?: string } | undefined;
  // Scanner de QR (expo-camera) — lê a etiqueta e abre o equipamento.
  EscanearQr: undefined;
  // PMOC Fase 2 — planos de manutenção programada (lista) e o detalhe do plano,
  // que gera as ordens de serviço recorrentes. `PmocPlano` recebe o id do plano.
  Pmoc: undefined;
  PmocPlano: { id: string };
  // Contratos recorrentes por ativo (lista + criar/editar). Sem id = contrato novo.
  Contratos: undefined;
  Contrato: { id?: string } | undefined;
  // ─── Frentes novas ────────────────────────────────────────────────────────
  // Landing pública (web deslogado) — full-bleed, sem wrap desktop nem path.
  Landing: undefined;
  // Lixeira (soft-delete unificado) e Assinatura (billing) — telas de gestão.
  Lixeira: undefined;
  Assinatura: undefined;
  // Central de Ajuda/suporte (aceita abrir direto num artigo/categoria).
  Ajuda: AjudaRouteParams;
  // Legal: Privacidade e Termos são o MESMO componente (LegalScreen), que
  // detecta qual doc mostrar pelo route.name (começa com 'term' = Termos).
  Privacidade: undefined;
  Termos: undefined;
};

export type TabParamList = {
  Home: undefined;
  // Agenda pode abrir já criando um agendamento para um cliente/orçamento (CRM).
  // `abrirAgendamentoId`: vem do toque na notificação "Visita em 1h" (App.tsx);
  // a tela foca o dia e abre aquele compromisso.
  Agenda: { novo?: boolean; novoParaClienteId?: string; novoParaClienteNome?: string; novoParaOrcamentoId?: string; novoEndereco?: string; novoTitulo?: string; abrirAgendamentoId?: string } | undefined;
  Orcar: undefined;     // botão central elevado → abre NovoOrcamento (stack)
  Hoje: undefined;
  Conta: undefined;
  // ─── Abas SOMENTE-desktop (v4) ──────────────────────────────────────────
  // Registradas condicionalmente sob `ehDesktop`; no mobile/APK nunca montam.
  // Vivem DENTRO do shell (com a sidebar visível), em vez de cobrirem-na como
  // telas de stack. Opcionais no tipo porque não existem no modo mobile.
  OrcamentosTab?: {
    clienteId?: string;
    clienteNome?: string;
    /** Recorte contextual vindo de um KPI do dashboard, sem substituir os filtros manuais. */
    recorteInicial?: 'em_aberto' | 'a_receber' | StatusOrcamento;
  } | undefined;
  ClientesTab?: undefined;
  RelatoriosTab?: undefined;
  FerramentasTab?: undefined;
  // F6 — as 10 telas secundárias como abas do shell desktop (mantêm a sidebar).
  ServicosTab?: undefined;
  ProdutosTab?: undefined;
  EquipamentosTab?: undefined;
  RecibosTab?: undefined;
  OrdensTab?: undefined;
  PmocTab?: undefined;
  ContratosTab?: undefined;
  LixeiraTab?: undefined;
  EquipeTab?: undefined;
  AjudaTab?: undefined;
  ContaTab?: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Telas do stack raiz embrulhadas em `comCentroDesktop` (v4).
 *
 * O HOC é PASS-THROUGH PURO no nativo e na web < 1024px (identidade — zero View
 * extra, comportamento mobile/APK intacto). Só na web ≥ 1024px ele centraliza a
 * tela num container de 560px sobre o shell da sidebar.
 *
 * Referências criadas UMA vez no módulo (identidade estável) — obrigatório para
 * o React Navigation não remontar a tela a cada render. Entrar/Onboarding/Tabs
 * NÃO são embrulhados (capas full-bleed / o próprio shell).
 */
const NovoOrcamentoCentro = comCentroDesktop(NovoOrcamentoScreen);
const VisualizarOrcamentoCentro = comCentroDesktop(VisualizarOrcamentoScreen);
const OrcamentosCentro = comCentroDesktop(OrcamentosScreen);
const DiagnosticoCentro = comCentroDesktop(DiagnosticoScreen);
const ClientesCentro = comCentroDesktop(ClientesScreen);
const ClienteDetalheCentro = comCentroDesktop(ClienteDetalheScreen);
const ServicosCentro = comCentroDesktop(ServicosScreen);
const ProdutosCentro = comCentroDesktop(ProdutosScreen);
const EmitirReciboCentro = comCentroDesktop(EmitirReciboScreen);
const ContaCentro = comCentroDesktop(ContaScreen);
const MeuNegocioCentro = comCentroDesktop(MeuNegocioScreen);
const AutopilotCentro = comCentroDesktop(AutopilotScreen);
const ImportarCentro = comCentroDesktop(ImportarScreen);

/**
 * Contas antigas podem ter uma linha `empresa` criada antes dos campos mínimos.
 * Enquanto ela estiver incompleta, a porta das abas permanece fechada e aponta
 * para a edição do cadastro. O dado é relido ao voltar da tela, sem confiar num
 * flag local que poderia estar desatualizado.
 *
 * Revalidação SILENCIOSA (item 1.2 da onda 1): o card "Preparando seu espaço…"
 * aparece só na PRIMEIRA checagem. Antes, todo foco da rota 'Tabs' (voltar de
 * qualquer tela do stack) fazia `setEstado('verificando')`, o que desmontava o
 * <TabNavigator/> inteiro: a aba atual se perdia (Agenda → Início), as entradas
 * animadas rodavam de novo e tudo era buscado outra vez. Agora:
 * - depois de liberado, o foco relê o cadastro em segundo plano e só fecha a
 *   porta se faltar campo DE VERDADE;
 * - um erro de leitura nunca fecha a porta de quem já entrou (o aviso fica para
 *   a tela Meu Negócio);
 * - na 1ª checagem, erro é estado próprio ('erro'), não "cadastro incompleto":
 *   "não sei" não vira "falta preencher".
 */
type EstadoPerfilGuard = 'verificando' | 'liberado' | 'incompleto' | 'erro';

function TabsComPerfilGuard() {
  const nav = useNavigation<any>();
  const cores = useCores();
  const insets = useSafeAreaInsets();
  const [estado, setEstado] = React.useState<EstadoPerfilGuard>('verificando');
  const [pendentes, setPendentes] = React.useState<string[]>([]);
  // Espelho do estado para o callback de foco (que é estável e não deve ser
  // recriado a cada troca de estado — isso refaria a checagem em loop).
  const estadoRef = React.useRef<EstadoPerfilGuard>('verificando');
  // Só a resposta da checagem MAIS RECENTE vale (focos rápidos em sequência).
  const checagemRef = React.useRef(0);

  const mudarEstado = React.useCallback((novo: EstadoPerfilGuard) => {
    estadoRef.current = novo;
    setEstado(novo);
  }, []);

  const verificar = React.useCallback(() => {
    checagemRef.current += 1;
    const id = checagemRef.current;
    // "Verificando" só aparece enquanto ainda não se sabe nada (1ª checagem) ou
    // quando a pessoa pede "Tentar de novo" depois de um erro. Quem já está
    // liberado (ou já vê o card de pendência) revalida em silêncio.
    if (estadoRef.current === 'erro') mudarEstado('verificando');
    getEmpresa()
      .then((empresa) => {
        if (id !== checagemRef.current) return;
        // Instalação de desenvolvimento sem empresa segue compatível; contas
        // autenticadas novas chegam aqui somente depois do Onboarding.
        if (!empresa) {
          mudarEstado('liberado');
          return;
        }
        const faltantes = camposPendentesPerfil(empresa);
        setPendentes(faltantes.map(campo => ROTULO_CAMPO_PERFIL[campo]));
        mudarEstado(faltantes.length ? 'incompleto' : 'liberado');
      })
      .catch(() => {
        if (id !== checagemRef.current) return;
        // Erro de leitura não fecha a porta de quem já entrou.
        if (estadoRef.current === 'liberado') return;
        mudarEstado('erro');
      });
  }, [mudarEstado]);

  useFocusEffect(React.useCallback(() => {
    verificar();
    // Ao perder o foco, respostas em voo deixam de valer.
    return () => { checagemRef.current += 1; };
  }, [verificar]));

  if (estado === 'liberado') return <TabNavigator />;

  const titulo = estado === 'verificando'
    ? 'Preparando seu espaço…'
    : estado === 'erro'
      ? 'Não conseguimos abrir seu cadastro'
      : 'Complete seu negócio para continuar';
  const texto = estado === 'verificando'
    ? 'Conferindo os dados que identificam sua empresa nos orçamentos.'
    : estado === 'erro'
      ? 'A leitura dos dados do negócio falhou. Tente de novo; se continuar, abra os dados do negócio.'
      : pendentes.length
        ? `Falta preencher: ${pendentes.join(', ')}.`
        : 'Falta completar os dados do negócio.';

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: cores.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>
      <View style={{ width: '100%', maxWidth: 460, padding: 24, borderRadius: 20, backgroundColor: cores.surface, borderWidth: 1, borderColor: cores.outline, alignItems: 'center' }}>
        {estado === 'verificando' ? (
          <ActivityIndicator size="large" color={cores.primary} />
        ) : (
          <MaterialCommunityIcons
            name={estado === 'erro' ? 'alert-circle-outline' : 'store-cog-outline'}
            size={44}
            color={estado === 'erro' ? cores.danger : cores.primary}
          />
        )}
        <Text style={{ marginTop: 16, color: cores.onSurface, fontWeight: '800', fontSize: 21, textAlign: 'center' }}>
          {titulo}
        </Text>
        <Text style={{ marginTop: 8, color: cores.onSurfaceVariant, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
          {texto}
        </Text>
        {estado === 'incompleto' && (
          <OlliButton
            label="Completar agora"
            onPress={() => nav.navigate('MeuNegocio')}
            fullWidth
            style={{ marginTop: 20 }}
          />
        )}
        {estado === 'erro' && (
          <>
            <OlliButton
              label="Tentar de novo"
              onPress={verificar}
              fullWidth
              style={{ marginTop: 20 }}
            />
            <OlliButton
              label="Abrir dados do negócio"
              variant="ghost"
              onPress={() => nav.navigate('MeuNegocio')}
              fullWidth
              style={{ marginTop: 8 }}
            />
          </>
        )}
      </View>
    </View>
  );
}
const ModelosDocumentoCentro = comCentroDesktop(ModelosDocumentoScreen);
const CentralDocumentosCentro = comCentroDesktop(CentralDocumentosScreen);
const DiagnosticoIACentro = comCentroDesktop(DiagnosticoIAScreen);
const OlliVozCentro = comCentroDesktop(OlliVozScreen);
const OlliChatCentro = comCentroDesktop(OlliChatScreen);
const CalculadoraTintaCentro = comCentroDesktop(CalculadoraTintaScreen);
const CertificadoAnvisaCentro = comCentroDesktop(CertificadoAnvisaScreen);
const PrepararNotaCentro = comCentroDesktop(PrepararNotaScreen);
const CertificadoCaixaDaguaCentro = comCentroDesktop(CertificadoCaixaDaguaScreen);
const FerramentasOficioCentro = comCentroDesktop(FerramentasOficioScreen);
const CreditosCentro = comCentroDesktop(CreditosScreen);
const PlanosCentro = comCentroDesktop(PlanosScreen);
const VimDeOutroAppCentro = comCentroDesktop(VimDeOutroAppScreen);
const RelatorioDiaCentro = comCentroDesktop(RelatorioDiaScreen);
const ConfirmarVisitasCentro = comCentroDesktop(ConfirmarVisitasScreen);
const GarantiasCentro = comCentroDesktop(GarantiasScreen);
const EquipeCentro = comCentroDesktop(EquipeScreen);
const EquipeAoVivoCentro = comCentroDesktop(EquipeAoVivoScreen);
const ConviteCentro = comCentroDesktop(ConviteScreen);
const OrdemServicoCentro = comCentroDesktop(OrdemServicoScreen);
const EquipamentoCentro = comCentroDesktop(EquipamentoScreen);
const PmocCentro = comCentroDesktop(PmocPlanosScreen);
const PmocPlanoCentro = comCentroDesktop(PmocPlanoScreen);
const ContratosCentro = comCentroDesktop(ContratosScreen);
const ContratoCentro = comCentroDesktop(ContratoScreen);
// Frentes novas: telas mobile-like centralizadas no desktop (pass-through no
// nativo). Landing e TecnicoHome NÃO entram aqui — são full-bleed por conta
// própria. Privacidade e Termos compartilham o LegalCentro (mesmo componente).
const LixeiraCentro = comCentroDesktop(LixeiraScreen);
const AssinaturaCentro = comCentroDesktop(AssinaturaScreen);
const AjudaCentro = comCentroDesktop(AjudaScreen);
const LegalCentro = comCentroDesktop(LegalScreen);

/**
 * Troca de aba (item 2.3): cross-fade com um encolher quase imperceptível da aba
 * que sai/entra (0.985 -> 1). Sem deslize lateral: aba não é "próxima página",
 * é outro cômodo da mesma casa. Só opacity/transform, no driver nativo (o
 * bottom-tabs anima com `useNativeDriver` fora da web).
 */
const ESCALA_ABA_FORA = 0.985;
const trocaDeAbaSuave: NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']> = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [{
      scale: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [ESCALA_ABA_FORA, 1, ESCALA_ABA_FORA],
      }),
    }],
  },
});
const TRANSICAO_ABA: Pick<BottomTabNavigationOptions, 'animation' | 'sceneStyleInterpolator' | 'transitionSpec'> = {
  animation: 'fade',
  sceneStyleInterpolator: trocaDeAbaSuave,
  transitionSpec: {
    animation: 'timing',
    config: { duration: DURACAO.fast, easing: Easing.bezier(...CURVA.standard) },
  },
};

/** Tela stub para a aba central "Orcar", que nunca é exibida (tabPress.preventDefault). */
const EmptyTab = () => null;

/**
 * Home NEUTRA, exibida enquanto o papel do usuário ainda é desconhecido (leitura da
 * organização em voo, ou falhou e não há cache). Montar a HomeScreen do dono aqui
 * mostraria faturamento e conversão a um técnico durante todo cold start lento — e
 * a sessão inteira quando ele está sem sinal, que é a rotina de campo.
 */
function HomeCarregando() {
  const styles = useEstilos(criarEstilos);
  return <View style={styles.homeCarregando} />;
}

/** Botão central elevado (＋ Orçamento). Não é uma tela — abre o stack NovoOrcamento. */
function CenterButton(_props: BottomTabBarButtonProps) {
  const nav = useNavigation<any>();
  const styles = useEstilos(criarEstilos);
  const gradientes = useGradientes();
  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      {/* Ação principal do app: afunda mais que um botão comum (escalaDestaque)
          e vibra "médio" — o polegar sente que abriu algo novo. */}
      <PressableAnimado
        accessibilityLabel="Novo orçamento"
        haptic="medium"
        escala={TOQUE.escalaDestaque}
        onPress={() => nav.navigate('NovoOrcamento', {})}
        style={styles.centerTouch}
      >
        <LinearGradient
          colors={gradientes.primaryDiagonal}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.centerGrad}
        >
          <MaterialCommunityIcons name="plus" size={30} color="#fff" />
        </LinearGradient>
        <Text style={styles.centerLabel}>Orçar</Text>
      </PressableAnimado>
    </View>
  );
}

function TabNavigator() {
  const insets = useSafeAreaInsets();
  // Regra de ouro: no nativo `ehDesktop` é sempre false → tudo abaixo é o
  // comportamento mobile/APK EXATO de hoje. As diferenças (sidebar à esquerda,
  // telas desktop, 4 abas extras) só existem na web ≥ 1024px.
  const ehDesktop = useEhDesktop();
  const cores = useCores();
  // Shell do técnico (papel === 'tecnico'): no MOBILE a Home vira a
  // TecnicoHomeScreen e o atalho central de orçamento some. Para desktop e para
  // os demais papéis (owner/admin/gestor/pessoal) nada muda — `papel` é null em
  // conta pessoal, então a condição só dispara para técnicos de uma empresa.
  //
  // `carregando` é FAIL-CLOSED: enquanto o papel não é conhecido, `papel` também é
  // null (indistinguível de conta pessoal), então não dá para escolher a Home pelo
  // papel sozinho. Montamos uma Home neutra e escondemos o atalho de orçamento.
  const { papel, carregando: papelCarregando } = usePermissao();
  // "Reduzir movimento" (e o desktop, onde a sidebar troca o conteúdo como um
  // site): troca de aba seca, sem fade.
  const reduzir = useReduzirMovimento();
  const transicaoAba = ehDesktop || reduzir ? { animation: 'none' as const } : TRANSICAO_ABA;
  const homeMobile = papelCarregando
    ? HomeCarregando
    : papel === 'tecnico'
      ? TecnicoHomeScreen
      : HomeScreen;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        ...transicaoAba,
        tabBarActiveTintColor: cores.tabActive,
        tabBarInactiveTintColor: cores.tabInactive,
        // Desktop: a barra vira uma sidebar à esquerda (SidebarNav custom, abaixo).
        // A posição lateral é API do bottom-tabs v7.
        ...(ehDesktop ? { tabBarPosition: 'left' as const } : null),
        // Estilo da tab bar INFERIOR só se aplica no modo mobile — no desktop a
        // SidebarNav renderiza sua própria View, então isolamos os estilos por
        // modo para nada (borderTopRadius/altura) vazar para a barra lateral.
        tabBarStyle: ehDesktop
          ? { display: 'none' as const }
          : {
              // rgba(7,17,31,0.98) era o fundo do modo escuro (#07111F) quase
              // opaco, cravado — no claro isso virava uma barra preta. `comAlfa`
              // reproduz o mesmo efeito (fundo quase opaco) seguindo o tema/cor
              // de marca atual.
              backgroundColor: comAlfa(cores.background, 0.98),
              borderTopWidth: 1,
              borderTopColor: cores.strokeGlow,
              borderTopLeftRadius: BorderRadius.xl,
              borderTopRightRadius: BorderRadius.xl,
              height: 68 + insets.bottom,
              paddingBottom: insets.bottom + 7,
              paddingTop: 10,
              // sem position absolute: mantém o layout estável na web (PWA)
            },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800', letterSpacing: 0 },
        tabBarHideOnKeyboard: true,
      }}
      // Sidebar permanente no desktop: substitui a tab bar inferior por completo.
      // No mobile mantém a tab bar padrão do bottom-tabs (tabBar undefined).
      tabBar={ehDesktop ? (props) => <SidebarNav {...props} /> : undefined}
      // Háptico de SELEÇÃO ao trocar de aba (só no celular; a aba já focada não vibra).
      screenListeners={({ navigation }) => ({
        tabPress: () => {
          if (!ehDesktop && !navigation?.isFocused?.()) vibrar('selecao');
        },
      })}
    >
      <Tab.Screen
        name="Home"
        // Desktop: dashboard (InicioDesktopScreen — tem guarda própria de papel).
        // Mobile: técnico vê a TecnicoHomeScreen (home do campo); os demais papéis
        // mantêm a HomeScreen; papel desconhecido vê uma Home neutra.
        component={ehDesktop ? InicioDesktopScreen : homeMobile}
        options={{
          tabBarLabel: 'Início',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Agenda"
        // Desktop: grade de semana (AgendaDesktopScreen); mobile: AgendaScreen atual.
        component={ehDesktop ? AgendaDesktopScreen : AgendaScreen}
        options={{
          tabBarLabel: 'Agenda',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-month-outline" color={color} size={size} />
          ),
        }}
      />
      {/* Aba central "Orcar" (botão elevado) — só existe no mobile. No desktop o
          botão '+ Novo orçamento' vive na SidebarNav, que ignora este item. O
          técnico não vê atalho de orçamento (fluxo de campo é OS, não venda).
          Enquanto o papel carrega, o atalho fica escondido: aparecer e sumir é
          pior que aparecer um instante depois, e evita o flash para o técnico. */}
      {!ehDesktop && !papelCarregando && papel !== 'tecnico' && (
        <Tab.Screen
          name="Orcar"
          // Stub vazio: esta aba nunca é exibida (tabPress faz preventDefault e o
          // botão central abre o stack NovoOrcamento). Evita montar a HomeScreen 2x.
          component={EmptyTab}
          options={{
            tabBarLabel: '',
            tabBarIcon: () => null,
            tabBarButton: (props) => <CenterButton {...props} />,
          }}
          listeners={{
            // jamais navega para a aba "Orcar" — o botão central já cuida de abrir o stack.
            tabPress: (e) => { e.preventDefault(); },
          }}
        />
      )}
      {/* ─── Abas SOMENTE-desktop: vivem dentro do shell com a sidebar. ─────── */}
      {ehDesktop && (
        <>
          <Tab.Screen
            name="OrcamentosTab"
            component={OrcamentosDesktopScreen}
            options={{
              tabBarLabel: 'Orçamentos',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="file-document-outline" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="ClientesTab"
            component={ClientesDesktopScreen}
            options={{
              tabBarLabel: 'Clientes',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="account-group-outline" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="RelatoriosTab"
            component={RelatoriosDesktopScreen}
            options={{
              tabBarLabel: 'Relatórios',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="chart-line" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="FerramentasTab"
            component={FerramentasDesktopScreen}
            options={{
              tabBarLabel: 'Ferramentas',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="toolbox-outline" color={color} size={size} />
              ),
            }}
          />
          {/* F6 — as 10 telas secundárias como abas do shell (mantêm a sidebar).
              Os rótulos/ícones reais vêm da SidebarNav (tabBar custom); estas
              options são só o fallback do bottom-tabs, que o desktop não usa. */}
          <Tab.Screen name="ServicosTab" component={ServicosDesktopScreen} options={{ tabBarLabel: 'Serviços', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="wrench-outline" color={color} size={size} />) }} />
          <Tab.Screen name="ProdutosTab" component={ProdutosDesktopScreen} options={{ tabBarLabel: 'Produtos', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="package-variant-closed" color={color} size={size} />) }} />
          <Tab.Screen name="EquipamentosTab" component={EquipamentosDesktopScreen} options={{ tabBarLabel: 'Equipamentos', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="air-conditioner" color={color} size={size} />) }} />
          <Tab.Screen name="RecibosTab" component={RecibosDesktopScreen} options={{ tabBarLabel: 'Recibos', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="receipt" color={color} size={size} />) }} />
          <Tab.Screen name="OrdensTab" component={OrdensDesktopScreen} options={{ tabBarLabel: 'Ordens de serviço', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="clipboard-check-outline" color={color} size={size} />) }} />
          <Tab.Screen name="PmocTab" component={PmocDesktopScreen} options={{ tabBarLabel: 'Planos PMOC', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="calendar-sync-outline" color={color} size={size} />) }} />
          <Tab.Screen name="ContratosTab" component={ContratosCentro} options={{ tabBarLabel: 'Contratos', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="file-sign" color={color} size={size} />) }} />
          <Tab.Screen name="EquipeTab" component={EquipeDesktopScreen} options={{ tabBarLabel: 'Equipe', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="account-multiple-outline" color={color} size={size} />) }} />
          <Tab.Screen name="LixeiraTab" component={LixeiraDesktopScreen} options={{ tabBarLabel: 'Lixeira', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="delete-outline" color={color} size={size} />) }} />
          <Tab.Screen name="AjudaTab" component={AjudaDesktopScreen} options={{ tabBarLabel: 'Ajuda', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="help-circle-outline" color={color} size={size} />) }} />
          <Tab.Screen name="ContaTab" component={ContaDesktopScreen} options={{ tabBarLabel: 'Conta', tabBarIcon: ({ color, size }) => (<MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />) }} />
        </>
      )}
      {/* Hoje só existe no mobile: no desktop a sidebar não a lista (o resumo
          do dia vive no dashboard) e a tela mobile esticada ficaria estranha. */}
      {!ehDesktop && (
      <Tab.Screen
        name="Hoje"
        component={HojeScreen}
        options={{
          tabBarLabel: 'Hoje',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="white-balance-sunny" color={color} size={size} />
          ),
        }}
      />
      )}
      <Tab.Screen
        name="Conta"
        component={ContaScreen}
        options={{
          tabBarLabel: 'Conta',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Transições do stack (item 2.3) — três gestos, cada um com um significado:
 * - `slide_from_right` (padrão): ir mais FUNDO (lista -> detalhe -> edição);
 * - `slide_from_bottom`: CRIAR/compor algo novo por cima do que se vê (Novo
 *   orçamento, falar com a OLLI) — some descendo, como uma folha;
 * - `fade`: trocar de CONTEXTO (capas Entrar/Onboarding/Landing, câmera).
 * Durações dos tokens (o Android usa a do sistema; o iOS respeita estas).
 * Com "Reduzir movimento" tudo vira fade: o iOS faz o mesmo nas próprias telas.
 */
type AnimacaoStack = NonNullable<NativeStackNavigationOptions['animation']>;
function opcoesTransicao(animacao: AnimacaoStack, reduzir: boolean): NativeStackNavigationOptions {
  const final: AnimacaoStack = reduzir ? 'fade' : animacao;
  return {
    animation: final,
    animationDuration: final === 'fade' ? DURACAO.slow : DURACAO.base,
  };
}

export function AppNavigator({ initialRouteName }: { initialRouteName?: keyof RootStackParamList } = {}) {
  const cores = useCores();
  const reduzir = useReduzirMovimento();
  const criar = opcoesTransicao('slide_from_bottom', reduzir);
  const capa = opcoesTransicao('fade', reduzir);
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName ?? 'Tabs'}
      screenOptions={{
        headerShown: false,
        ...opcoesTransicao('slide_from_right', reduzir),
        // iOS: o deslize segue o dedo na direção da animação (folha volta descendo).
        animationMatchesGesture: true,
        contentStyle: { backgroundColor: cores.background },
      }}
    >
      <Stack.Screen name="Tabs" component={TabsComPerfilGuard} />
      {/* Onboarding é pós-login: entra com fade (não é uma "próxima página").
          NÃO recebe wrap desktop — é capa full-bleed (centraliza por conta própria). */}
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={capa} />
      {/* Entrar é a CAPA/porta: fade e sem gesto de voltar (não há para onde).
          NÃO recebe wrap desktop — capa full-bleed. */}
      <Stack.Screen name="Entrar" component={EntrarScreen} options={{ ...capa, gestureEnabled: false }} />
      {/* Landing pública (web deslogado): capa full-bleed, sem wrap desktop e sem
          gesto de voltar. NÃO tem path no linking (a URL raiz '/' segue sendo '/'
          para preservar o canonical de SEO). */}
      <Stack.Screen
        name="Landing"
        component={LandingScreen}
        options={{
          ...capa,
          gestureEnabled: false,
          title: 'OLLI Orçamentos',
        }}
      />
      {/* As telas abaixo usam `comCentroDesktop`: mobile/APK intacto (pass-through);
          desktop centraliza a tela mobile-like sobre o shell. Referências estáveis
          criadas no módulo (ver topo do arquivo). */}
      <Stack.Screen name="NovoOrcamento" component={NovoOrcamentoCentro} options={criar} />
      <Stack.Screen name="EditarOrcamento" component={NovoOrcamentoCentro} />
      <Stack.Screen name="VisualizarOrcamento" component={VisualizarOrcamentoCentro} />
      {/* Lista de orçamentos — alcançável pela Home ("ver todos") e pela Conta. */}
      <Stack.Screen name="Orcamentos" component={OrcamentosCentro} />
      {/* Diagnóstico (OLLI Técnica) — chegável pela Home e pela Conta → Ferramentas. */}
      <Stack.Screen name="Diagnostico" component={DiagnosticoCentro} />
      <Stack.Screen name="Clientes" component={ClientesCentro} />
      <Stack.Screen name="ClienteDetalhe" component={ClienteDetalheCentro} />
      <Stack.Screen name="Servicos" component={ServicosCentro} />
      <Stack.Screen name="Produtos" component={ProdutosCentro} />
      <Stack.Screen name="EmitirRecibo" component={EmitirReciboCentro} />
      <Stack.Screen name="PrepararNota" component={PrepararNotaCentro} />
      <Stack.Screen name="Conta" component={ContaCentro} />
      <Stack.Screen name="MeuNegocio" component={MeuNegocioCentro} />
      <Stack.Screen name="ModelosDocumento" component={ModelosDocumentoCentro} />
      <Stack.Screen name="CentralDocumentos" component={CentralDocumentosCentro} />
      <Stack.Screen name="DiagnosticoIA" component={DiagnosticoIACentro} />
      {/* Fase 3 — OLLI Voz, Chat e Planos (chegáveis pela Home e pela Conta). */}
      <Stack.Screen name="OlliVoz" component={OlliVozCentro} options={criar} />
      <Stack.Screen name="OlliChat" component={OlliChatCentro} />
      <Stack.Screen name="Autopilot" component={AutopilotCentro} />
      <Stack.Screen name="Importar" component={ImportarCentro} />
      <Stack.Screen name="CalculadoraTinta" component={CalculadoraTintaCentro} />
      <Stack.Screen name="CertificadoAnvisa" component={CertificadoAnvisaCentro} />
      <Stack.Screen name="CertificadoCaixaDagua" component={CertificadoCaixaDaguaCentro} />
      <Stack.Screen name="FerramentasOficio" component={FerramentasOficioCentro} />
      <Stack.Screen name="Creditos" component={CreditosCentro} />
      <Stack.Screen name="Planos" component={PlanosCentro} />
      <Stack.Screen name="VimDeOutroApp" component={VimDeOutroAppCentro} />
      {/* Relatório do dia falado — chegável pela Home/Hoje ("Como foi seu dia?"). */}
      <Stack.Screen name="RelatorioDia" component={RelatorioDiaCentro} />
      {/* Onda I3 — confirmação de véspera e garantia que se cuida sozinha. */}
      <Stack.Screen name="ConfirmarVisitas" component={ConfirmarVisitasCentro} />
      <Stack.Screen name="Garantias" component={GarantiasCentro} />
      {/* Onda 2 — Equipe (empresa) e aceite de convite (deep link). */}
      <Stack.Screen name="Equipe" component={EquipeCentro} />
      <Stack.Screen name="EquipeAoVivo" component={EquipeAoVivoCentro} />
      <Stack.Screen name="Convite" component={ConviteCentro} />
      {/* Onda 4 — Ordens de serviço (gestão + app do técnico). */}
      <Stack.Screen name="OrdemServico" component={OrdemServicoCentro} />
      {/* PMOC Fase 1 — Equipamentos HVAC (inventário + etiqueta QR). */}
      <Stack.Screen name="Equipamento" component={EquipamentoCentro} />
      <Stack.Screen name="EscanearQr" component={EscanearQrScreen} options={capa} />
      {/* PMOC Fase 2 — planos de manutenção (/pmoc) e o detalhe (/pmoc/:id). */}
      <Stack.Screen name="Pmoc" component={PmocCentro} />
      <Stack.Screen name="PmocPlano" component={PmocPlanoCentro} />
      <Stack.Screen name="Contratos" component={ContratosCentro} />
      <Stack.Screen name="Contrato" component={ContratoCentro} />
      {/* ─── Frentes novas ──────────────────────────────────────────────────
          Lixeira e Assinatura (gestão), Ajuda/suporte e os documentos legais.
          Privacidade e Termos apontam para o MESMO LegalCentro — a tela decide
          qual doc renderizar pelo route.name. */}
      <Stack.Screen name="Lixeira" component={LixeiraCentro} />
      <Stack.Screen name="Assinatura" component={AssinaturaCentro} />
      <Stack.Screen name="Ajuda" component={AjudaCentro} />
      <Stack.Screen name="Privacidade" component={LegalCentro} />
      <Stack.Screen name="Termos" component={LegalCentro} />
    </Stack.Navigator>
  );
}

const criarEstilos = (c: Cores) => {
  // shadowColor do glow: '#34C6D9' era o ciano de acento cravado. No escuro o
  // glow é a própria cor de acento; no claro `sombrasDe` já troca para uma
  // sombra neutra (glow colorido sobre fundo claro suja o card em vez de
  // destacar — ver comentário em cores.ts). Usamos só a cor daí; offset/
  // opacity/radius/elevation seguem os valores originais deste botão.
  const glowCyan = sombrasDe(c).glowCyan;
  return StyleSheet.create({
    // Fundo liso (sem spinner): esta Home aparece por milissegundos no caso comum e
    // um indicador piscando seria mais ruidoso que a espera.
    homeCarregando: { flex: 1, backgroundColor: c.background },
    centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    centerTouch: { alignItems: 'center', justifyContent: 'center', marginTop: -28 },
    centerGrad: {
      width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center',
      borderWidth: 4, borderColor: c.background,
      shadowColor: glowCyan.shadowColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14,
      elevation: 8,
    },
    centerLabel: { fontSize: 11, fontWeight: '800', color: c.tabActive, marginTop: 3 },
  });
};

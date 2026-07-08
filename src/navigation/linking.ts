import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './AppNavigator';

/**
 * URLs reais do OLLI web (v4). Uma única função constrói o mapa de rotas do
 * React Navigation a partir do modo (desktop ou mobile), decidido UMA vez no
 * boot em App.tsx via `Dimensions.get('window').width` — nunca no render.
 *
 * Por que dual-mapping por modo?
 *   - No DESKTOP, Orçamentos/Clientes/Relatórios/Ferramentas vivem DENTRO do
 *     shell com a sidebar (são Tab.Screen: OrcamentosTab/ClientesTab/…), então
 *     `/orcamentos` e `/clientes` mapeiam para dentro das Tabs.
 *   - No MOBILE, Orçamentos/Clientes são telas de stack (cobrem a tela toda),
 *     então `/orcamentos` e `/clientes` mapeiam para o stack raiz.
 * Resize cruzando 1024px troca o LAYOUT na hora (hook), mas mantém o MAPA de URL
 * do boot — limitação aceita e documentada; um F5 realinha.
 *
 * ORDEM IMPORTA: no React Navigation, paths com segmento fixo devem vir ANTES
 * de paths com parâmetro no mesmo nível. Por isso `orcamentos/novo` é declarado
 * ANTES de `orcamentos/:orcamentoId` (senão "novo" cairia como um id).
 *
 * AUTH x LINKING: com linking, a URL inicial tem precedência sobre o
 * initialRouteName. O buraco do deep link deslogado (/orcamentos "frio") é
 * fechado no listener de auth do App.tsx (reset para 'Entrar' em
 * INITIAL_SESSION sem sessão). O retorno do OAuth (?code=) segue funcionando:
 * detectSessionInUrl consome o code em qualquer path antes de o linking agir.
 */
export function criarLinkingConfig(
  ehDesktop: boolean,
): LinkingOptions<RootStackParamList> {
  return {
    prefixes: [Linking.createURL('/')],
    config: {
      screens: {
        // ─── Tabs (shell) ────────────────────────────────────────────────
        Tabs: {
          screens: {
            Home: '',
            Agenda: 'agenda',
            // 'hoje' só no mobile — no desktop a aba Hoje não monta.
            ...(ehDesktop ? {} : { Hoje: 'hoje' }),
            Conta: 'conta',
            // 'Orcar' é um stub (botão central) — sem path próprio.
            // No desktop, as 4 telas de conteúdo são abas DENTRO do shell (com a
            // sidebar visível). Os paths visíveis ('orcamentos', 'clientes') são
            // idênticos aos do mobile; só a chave muda (aba vs. stack). No mobile
            // essas chaves de aba não existem, então o bloco é omitido.
            ...(ehDesktop
              ? {
                  OrcamentosTab: 'orcamentos',
                  ClientesTab: 'clientes',
                  RelatoriosTab: 'relatorios',
                  FerramentasTab: 'ferramentas',
                }
              : {}),
          },
        },

        // ─── Capas / porta ───────────────────────────────────────────────
        Entrar: 'entrar',
        Onboarding: 'onboarding',

        // ─── Orçamentos (stack raiz) ─────────────────────────────────────
        // ORDEM: 'novo' ANTES do path com parâmetro.
        NovoOrcamento: 'orcamentos/novo',
        EditarOrcamento: 'orcamentos/:orcamentoId/editar',
        VisualizarOrcamento: 'orcamentos/:orcamentoId',

        // No mobile, 'orcamentos'/'clientes' são telas de stack.
        // No desktop essas chaves são ignoradas (as abas já cobrem os paths;
        // React Navigation resolve o primeiro match e as abas vêm antes).
        ...(ehDesktop
          ? {}
          : {
              Orcamentos: 'orcamentos',
              Clientes: 'clientes',
            }),

        // ─── Ferramentas / telas homônimas (stack raiz, ambos os modos) ──
        Servicos: 'servicos',
        Produtos: 'produtos',
        EmitirRecibo: 'recibo',
        MeuNegocio: 'meu-negocio',
        Diagnostico: 'diagnostico',
        DiagnosticoIA: 'diagnostico-ia',
        OlliVoz: 'olli-voz',
        OlliChat: 'olli-chat',
        Planos: 'planos',
        RelatorioDia: 'relatorio-do-dia',
        // Onda 2 — Equipe (empresa) + aceite de convite por deep link.
        // 'convite/:token' casa o deep link olliorcamentos://convite/<token> e a
        // URL web /convite/<token>; o token entra em route.params.token.
        Equipe: 'equipe',
        EquipeAoVivo: 'equipe/ao-vivo',
        Convite: 'convite/:token',
        // Onda 4 — Ordens de serviço (gestão + técnico). URL real /ordens.
        OrdemServico: 'ordens',
      },
    },
  };
}

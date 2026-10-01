import { lerTipoContaAtual } from '../hooks/useTipoConta';
import { podeComPapel } from '../hooks/usePermissao';
import { getCurrentUser } from './supabase';
import { resolverEscopoAgenda, type EntradaEscopo, type EscopoAgenda } from '../utils/agendaDominio';

/**
 * Quem vê o quê na agenda, para quem roda FORA de componente React: o relatório
 * do dia (`relatorioDia.ts`) e o ritual diário (`ritualDiario.ts`, "Bom dia" e
 * aviso de saída). É a MESMA regra das telas Agenda/Hoje (`resolverEscopoAgenda`
 * + `pode('ver_agenda_equipe')`), com o papel vindo do store de `useTipoConta`
 * (cache do último login, depois a rede) e o usuário de `getCurrentUser`
 * (sessão local, sem rede).
 *
 * Técnico = só as visitas em que `responsavelId` é ele. Papel ou usuário
 * desconhecido = `erro`: quem chama não afirma nada sobre a agenda (nem "sem
 * visitas", nem as visitas da equipe). NUNCA lança.
 */
export async function escopoAgendaAtual(): Promise<EscopoAgenda> {
  try {
    const [conta, usuario] = await Promise.all([
      lerTipoContaAtual(),
      getCurrentUser()
        .then((u): EntradaEscopo['usuario'] => ({ status: 'ok', id: u?.id ?? null }))
        .catch((): EntradaEscopo['usuario'] => ({ status: 'ok', id: null })),
    ]);
    return resolverEscopoAgenda({
      papelResolvido: conta.resolvido,
      // A leitura já terminou (lerTipoContaAtual espera): sem papel aqui é erro, não espera.
      papelCarregando: false,
      podeVerEquipe: podeComPapel('ver_agenda_equipe', conta),
      usuario,
    });
  } catch {
    return { status: 'erro' };
  }
}

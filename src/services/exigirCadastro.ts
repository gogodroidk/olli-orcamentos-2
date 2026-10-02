import { getEmpresa } from '../database/database';
import { confirmar, toast } from '../components/feedback';
import { navigationRef } from '../navigation/navigationRef';
import {
  decidirEnvioComCadastro,
  estadoCadastroDaLeitura,
  juntarPendentes,
  type DecisaoEnvioDocumento,
  type EstadoCadastroNegocio,
} from './perfilOperacional';

/** O que a pessoa tentou gerar/enviar — só muda a frase do aviso. */
export type DocumentoComCadastro = 'orcamento' | 'recibo';

const NOME_DOCUMENTO: Record<DocumentoComCadastro, string> = {
  orcamento: 'O orçamento',
  recibo: 'O recibo',
};

/**
 * Lê a empresa NA HORA e decide se o documento pode sair. Sem interface: para
 * telas que mostram o motivo no próprio lugar (ex.: o passo do recibo dentro do
 * modal de encerramento, onde abrir outra folha por cima não cabe). Nunca lança.
 */
export async function conferirCadastroParaEnviar(): Promise<DecisaoEnvioDocumento> {
  let estado: EstadoCadastroNegocio;
  try {
    estado = estadoCadastroDaLeitura({ ok: true, empresa: await getEmpresa() });
  } catch {
    estado = estadoCadastroDaLeitura({ ok: false });
  }
  return decidirEnvioComCadastro(estado);
}

/** Frase curta do motivo, para quem mostra o aviso no próprio lugar. */
export function motivoEnvioSegurado(decisao: DecisaoEnvioDocumento, documento: DocumentoComCadastro): string | null {
  if (decisao.libera) return null;
  if (decisao.motivo === 'nao_sei') return 'Não consegui conferir os dados do seu negócio agora. Tente de novo em instantes.';
  return `${NOME_DOCUMENTO[documento]} sai com os dados do seu negócio. Complete em Meu Negócio: falta ${juntarPendentes(decisao.pendentes)}.`;
}

/**
 * PORTA ÚNICA do envio: gerar/compartilhar PDF, mandar no WhatsApp, gerar link
 * do cliente, emitir/reenviar recibo. Desde 02/10/2026 o cadastro incompleto
 * não fecha o app (banner no Início, ver components/AvisoCompletarNegocio.tsx);
 * o que ele segura é só o documento que sairia sem nome e contato do negócio.
 *
 * Lê a empresa NA HORA (não confia no estado do banner, que pode ser de minutos
 * atrás) e decide pela regra pura `decidirEnvioComCadastro`:
 *  - completo → `true`, segue o envio;
 *  - incompleto → aviso com o que falta e "Completar agora" (abre o Meu
 *    Negócio); `false`;
 *  - leitura falhou → "não consegui conferir"; `false`. Erro nunca libera.
 *
 * Nunca lança.
 */
export async function exigirCadastroParaEnviar(documento: DocumentoComCadastro): Promise<boolean> {
  const decisao = await conferirCadastroParaEnviar();
  if (decisao.libera) return true;

  if (decisao.motivo === 'nao_sei') {
    toast.erro('Não consegui conferir os dados do seu negócio agora. Tente de novo em instantes.', {
      titulo: 'Nada foi enviado',
    });
    return false;
  }

  try {
    const completar = await confirmar({
      titulo: 'Complete seu negócio para enviar',
      mensagem: `${NOME_DOCUMENTO[documento]} sai com os dados do seu negócio. Falta: ${juntarPendentes(decisao.pendentes)}.`,
      rotuloConfirmar: 'Completar agora',
      rotuloCancelar: 'Agora não',
    });
    if (completar && navigationRef.isReady()) navigationRef.navigate('MeuNegocio');
  } catch {
    // O aviso é a única coisa que falhou; o envio já está segurado.
  }
  return false;
}

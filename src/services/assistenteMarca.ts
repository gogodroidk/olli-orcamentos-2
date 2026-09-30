import { enviarChat } from './olliAssistente';

export interface ContextoMarca {
  nomeEmpresa?: string;
  segmento?: string;
  especialidadeAtual?: string;
  sloganAtual?: string;
  pedido: string;
}

export interface SugestaoMarca {
  especialidade: string;
  slogan: string;
  explicacao: string;
}

export type ResultadoMarca =
  | { estado: 'ok'; sugestao: SugestaoMarca }
  | { estado: 'sem_creditos'; mensagem: string }
  | { estado: 'erro'; mensagem: string };

function campoCurto(valor: unknown, limite: number): string {
  return typeof valor === 'string'
    ? valor.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, limite)
    : '';
}

/**
 * O modelo recebe uma tarefa aberta, mas sua saída nunca é aplicada diretamente.
 * Este parser aceita JSON puro ou cercado por markdown, reduz os campos a texto
 * curto e exige os dois valores que a tela sabe revisar antes de usar.
 */
export function extrairSugestaoMarca(resposta: string): SugestaoMarca | null {
  const bloco = resposta.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? resposta.match(/\{[\s\S]*\}/)?.[0];
  if (!bloco) return null;
  try {
    const objeto = JSON.parse(bloco) as Record<string, unknown>;
    const especialidade = campoCurto(objeto.especialidade, 120);
    const slogan = campoCurto(objeto.slogan, 90);
    const explicacao = campoCurto(objeto.explicacao, 240);
    if (!especialidade || !slogan) return null;
    return { especialidade, slogan, explicacao };
  } catch {
    return null;
  }
}

export async function sugerirMarcaComIA(contexto: ContextoMarca): Promise<ResultadoMarca> {
  const pedido = contexto.pedido.trim();
  if (!pedido) return { estado: 'erro', mensagem: 'Conte um pouco sobre o posicionamento que você quer para a empresa.' };

  const prompt = [
    'Você é uma especialista em posicionamento de marca para prestadores de serviço brasileiros.',
    'Crie uma especialidade clara e um slogan curto, profissional e fácil de entender.',
    'Não invente certificações, anos de experiência, garantias, liderança de mercado nem fatos que não foram informados.',
    'Responda SOMENTE com JSON válido, sem markdown, neste formato:',
    '{"especialidade":"...","slogan":"...","explicacao":"..."}',
    `Empresa: ${contexto.nomeEmpresa?.trim() || 'nome ainda não definido'}`,
    `Segmento: ${contexto.segmento?.trim() || 'segmento geral'}`,
    `Especialidade atual: ${contexto.especialidadeAtual?.trim() || 'vazia'}`,
    `Slogan atual: ${contexto.sloganAtual?.trim() || 'vazio'}`,
    `Pedido do usuário: ${pedido.slice(0, 700)}`,
  ].join('\n');

  const resposta = await enviarChat([{ role: 'user', texto: prompt }]);
  if (resposta.semCreditos) return { estado: 'sem_creditos', mensagem: resposta.resposta };
  if (!resposta.ok) return { estado: 'erro', mensagem: resposta.resposta };

  const sugestao = extrairSugestaoMarca(resposta.resposta);
  if (!sugestao) {
    return { estado: 'erro', mensagem: 'A OLLI respondeu, mas não conseguiu montar campos seguros para aplicar. Tente descrever sua empresa de outra forma.' };
  }
  return { estado: 'ok', sugestao };
}

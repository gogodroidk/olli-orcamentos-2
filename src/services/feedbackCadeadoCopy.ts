/**
 * COPY ÚNICA do popup de feedback do cadeado (app e site leem daqui; nada digitado na tela).
 * O nome do plano vem de `NOME_PLANO` (planosBase). SEM promessa de recompensa: o crédito de IA só entra no
 * texto quando existir a concessão no servidor (hoje não existe) — nunca por avaliação em loja.
 */
import { NOME_PLANO } from './planosBase.ts';

export type OpcaoMotivo = 'preco' | 'falta_recurso' | 'nao_entendi' | 'depois';

export const OPCOES_MOTIVO: ReadonlyArray<{ id: OpcaoMotivo; rotulo: string }> = [
  { id: 'preco', rotulo: 'O preço' },
  { id: 'falta_recurso', rotulo: 'Falta um recurso que eu preciso' },
  { id: 'nao_entendi', rotulo: 'Ainda não entendi o que muda' },
  { id: 'depois', rotulo: 'Vou decidir mais tarde' },
];

export const TEXTO_LIVRE_MAX = 280;

export const COPY_FEEDBACK_CADEADO = {
  pergunta: `O que faltou para você assinar o ${NOME_PLANO.pro}?`,
  aviso: 'Perguntamos para melhorar o OLLI. A resposta fica ligada à sua conta e só a nossa equipe vê.',
  campoLivre: 'Quer contar mais? (opcional)',
  enviar: 'Enviar',
  agoraNao: 'Agora não',
  naoPerguntarMais: 'Não perguntar mais',
  enviando: 'Enviando…',
  erro: 'Não consegui enviar agora, tente de novo. Sua resposta continua aqui.',
  tentarDeNovo: 'Tentar de novo',
  enviado: 'Recebi, obrigado!',
  fechar: 'Fechar',
} as const;

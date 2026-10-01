/**
 * BUSCA DE AJUSTES — a lógica pura do campo "Buscar ajuste" da tela Conta.
 *
 * Este arquivo NÃO importa `react-native` de propósito: o teste
 * (`scripts/teste-conta-ajustes.ts`) roda em Node e trava as regras da busca
 * sem emulador. A tela monta o catálogo com os MESMOS textos que desenha nas
 * linhas (título e descrição vêm de um lugar só) e pergunta aqui o que mostrar.
 *
 * Regras:
 * - sem acento e sem caixa: "notificacoes" acha "Notificações";
 * - toda palavra digitada precisa casar (começo de palavra; com 3+ letras vale
 *   também no meio, para "backup" achar "cópias de segurança/backup");
 * - o nome da SEÇÃO conta: digitar "notificações" mostra a seção inteira;
 * - sinônimos (`termos`) cobrem o jeito que a pessoa fala: "tema" acha
 *   Aparência, "logout" acha Sair.
 */

export interface ItemAjuste {
  /** Chave estável da linha (a tela usa para decidir se a desenha). */
  id: string;
  /** Título da seção onde a linha mora. Também entra na busca. */
  secao: string;
  titulo: string;
  descricao?: string;
  /** Palavras que a pessoa digitaria e que não estão no título. */
  termos?: readonly string[];
}

export interface ResultadoBusca {
  /** Há texto de busca? Sem busca, tudo aparece. */
  ativa: boolean;
  /** Ids das linhas que devem aparecer. */
  ids: ReadonlySet<string>;
  /** Títulos das seções com pelo menos uma linha visível. */
  secoes: ReadonlySet<string>;
  total: number;
}

/** Minúsculo, sem acento, só letras/números separados por um espaço. */
export function normalizarTexto(texto: string | null | undefined): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A linha casa com a consulta? Consulta vazia casa com tudo. */
export function casaConsulta(item: ItemAjuste, consulta: string): boolean {
  const tokens = normalizarTexto(consulta).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const palheiro = normalizarTexto([item.secao, item.titulo, item.descricao ?? '', ...(item.termos ?? [])].join(' '));
  const palavras = palheiro.split(' ');
  return tokens.every(t => palavras.some(p => p.startsWith(t)) || (t.length >= 3 && palheiro.includes(t)));
}

/** Filtra o catálogo. Ids repetidos contam uma vez. */
export function buscarAjustes(itens: readonly ItemAjuste[], consulta: string): ResultadoBusca {
  const ativa = normalizarTexto(consulta).length > 0;
  const achados = ativa ? itens.filter(i => casaConsulta(i, consulta)) : [...itens];
  const ids = new Set(achados.map(i => i.id));
  return {
    ativa,
    ids,
    secoes: new Set(achados.map(i => i.secao)),
    total: ids.size,
  };
}

/** Títulos das seções da tela Conta (a ordem é a da tela). */
export const SECAO_AJUSTES = {
  conta: 'Sua conta',
  ferramentas: 'Ferramentas',
  aparencia: 'Aparência',
  notificacoes: 'Notificações',
  backup: 'Backup e dados',
  ajuda: 'Ajuda',
  privacidade: 'Privacidade e termos',
  sessao: 'Sessão',
} as const;

/**
 * Sinônimos por linha. Só o que NÃO está no título/descrição desenhados: o
 * resto a busca já acha sozinha.
 */
export const TERMOS_AJUSTE: Readonly<Record<string, readonly string[]>> = {
  perfil: ['nome', 'foto', 'avatar', 'email', 'telefone', 'perfil'],
  assinatura: ['plano', 'planos', 'pro', 'assinar', 'pagamento', 'cobranca'],
  equipe: ['equipe', 'tecnicos', 'convite', 'codigo', 'membros', 'empresa'],
  aparencia: ['tema', 'claro', 'escuro', 'modo', 'cor', 'dark', 'visual'],
  notifBomDia: ['manha', 'aviso', 'lembrete', 'ritual', 'notificacao'],
  notifFecharDia: ['noite', 'relatorio', 'ritual', 'notificacao'],
  notifResumoEmail: ['email', 'resumo', 'diario'],
  notifDomingo: ['fim de semana', 'domingo', 'silencio'],
  backupStatus: ['nuvem', 'sincronizar', 'copia'],
  backupAuto: ['automatico', 'nuvem', 'diario'],
  backupAgora: ['nuvem', 'salvar', 'manual'],
  backupCopias: ['restaurar', 'historico', 'backup', 'versoes'],
  lixeira: ['excluidos', 'apagados', 'recuperar', 'restaurar'],
  ajuda: ['suporte', 'duvida', 'contato', 'tutorial', 'falar'],
  dicas: ['dicas', 'baloes', 'ajuda'],
  apresentacao: ['onboarding', 'tutorial', 'introducao'],
  privacidade: ['lgpd', 'dados', 'politica'],
  termos: ['regras', 'contrato', 'uso'],
  excluirWeb: ['apagar', 'site', 'navegador', 'deletar'],
  sessaoConta: ['login', 'email', 'conectado'],
  sair: ['logout', 'deslogar', 'trocar de conta'],
  sairApagar: ['logout', 'limpar', 'apagar', 'celular', 'aparelho'],
  excluirConta: ['apagar', 'deletar', 'encerrar', 'cancelar conta'],
};

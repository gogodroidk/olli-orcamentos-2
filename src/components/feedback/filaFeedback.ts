/**
 * FILAS DO FEEDBACK (toast e folha de confirmação) — lógica PURA.
 *
 * Este arquivo NÃO importa `react-native` de propósito: assim o teste
 * (`scripts/teste-feedback-navegacao.ts`) roda em Node e trava as regras da fila sem
 * emulador. Os hosts (ToastHost/ConfirmSheet) só DESENHAM o que estiver na frente
 * daqui; as telas falam com a API de `index.ts` (`toast.sucesso`, `confirmar`).
 *
 * Por que fila module-scoped e não Context: `toast`/`confirmar` são chamados de
 * dentro de handlers async (depois de um `await`), de serviços e de telas que não
 * estão na mesma árvore do host — um singleton com assinantes é o mesmo padrão
 * que o DialogoDesktopHost já usa e não exige Provider em volta de nada.
 */

export type TipoToast = 'sucesso' | 'erro' | 'info';

export interface AcaoToast {
  /** Verbo curto: "Desfazer", "Ver", "Tentar de novo". */
  rotulo: string;
  aoTocar: () => void;
}

export interface OpcoesToast {
  /** Linha em negrito acima da mensagem. Opcional: a maioria dos toasts é 1 linha. */
  titulo?: string;
  /** Tempo na tela. Sem isto, sai de `duracaoDoToast` (tipo + tamanho do texto). */
  duracaoMs?: number;
  /** Um botão no próprio toast (ex.: "Desfazer" depois de mandar pra Lixeira). */
  acao?: AcaoToast;
}

export interface PedidoToast {
  id: number;
  tipo: TipoToast;
  mensagem: string;
  titulo?: string;
  duracaoMs: number;
  acao?: AcaoToast;
}

/**
 * Tempo mínimo na tela por tipo (ms). Não é duração de ANIMAÇÃO (essas moram em
 * motionTokens.ts) — é tempo de LEITURA. Erro fica mais: a pessoa precisa ler o
 * que deu errado e o que fazer; toast com botão fica mais ainda, para dar tempo
 * de alcançar o "Desfazer".
 */
export const TEMPO_TOAST = {
  sucesso: 2800,
  info: 3400,
  erro: 5000,
  /** Piso de quem tem botão (ex.: "Desfazer"). */
  comAcao: 5500,
  /** Leitura extra por caractere além do curto (≈ 15 caracteres/s). */
  porCaractereExtra: 60,
  /** Até aqui a mensagem conta como "curta" (cabe de relance). */
  caracteresCurtos: 40,
  /** Teto: toast não é aviso permanente; texto maior que isso pede outra UI. */
  maximo: 9000,
} as const;

/** No máximo isto esperando atrás do toast visível; o excedente mais velho cai. */
export const MAX_TOASTS_NA_FILA = 3;

/** Quanto tempo o toast fica na tela (leitura), pelo tipo, tamanho e botão. */
export function duracaoDoToast(tipo: TipoToast, mensagem: string, temAcao = false, titulo = ''): number {
  const base = temAcao ? Math.max(TEMPO_TOAST[tipo], TEMPO_TOAST.comAcao) : TEMPO_TOAST[tipo];
  const tamanho = (titulo ? `${titulo} ` : '').length + (mensagem ?? '').length;
  const extra = Math.max(0, tamanho - TEMPO_TOAST.caracteresCurtos) * TEMPO_TOAST.porCaractereExtra;
  return Math.min(base + extra, TEMPO_TOAST.maximo);
}

/** Texto que o leitor de tela anuncia: o TIPO vai junto, porque cor não se ouve. */
export function textoAnunciado(pedido: Pick<PedidoToast, 'tipo' | 'mensagem' | 'titulo' | 'acao'>): string {
  const prefixo = pedido.tipo === 'erro' ? 'Erro' : pedido.tipo === 'sucesso' ? 'Pronto' : 'Aviso';
  const corpo = [pedido.titulo, pedido.mensagem].filter(Boolean).join('. ');
  const acao = pedido.acao ? ` Ação disponível: ${pedido.acao.rotulo}.` : '';
  return `${prefixo}: ${corpo}${acao}`;
}

type Ouvinte = () => void;

export interface FilaToast {
  /** Enfileira e devolve o id (ou o id do igual que já estava na fila). */
  mostrar(tipo: TipoToast, mensagem: string, opcoes?: OpcoesToast): number;
  /** Tira o toast `id` da fila (some da tela se for o visível). */
  dispensar(id: number): void;
  /** O toast da frente (o que está na tela), ou null. */
  atual(): PedidoToast | null;
  /** Cópia da fila inteira (frente primeiro). */
  todos(): PedidoToast[];
  assinar(ouvinte: Ouvinte): () => void;
  /** Há algum host montado ouvindo? Sem host, a API cai no alerta nativo. */
  temOuvinte(): boolean;
  limpar(): void;
}

export function criarFilaToast(): FilaToast {
  let proximoId = 1;
  let fila: PedidoToast[] = [];
  const ouvintes = new Set<Ouvinte>();
  const notificar = () => { for (const o of [...ouvintes]) o(); };

  return {
    mostrar(tipo, mensagem, opcoes = {}) {
      const texto = String(mensagem ?? '').trim();
      // Toast vazio não existe: seria um "aconteceu algo" mudo. Quem chama com
      // texto vazio recebe um genérico honesto em vez de nada.
      const mensagemFinal = texto || (tipo === 'erro' ? 'Algo deu errado. Tente de novo.' : 'Pronto.');
      // O mesmo aviso disparado 3x seguidas (toque repetido, retry em laço) não
      // vira 3 toasts: o que já está na fila vale pelos três. Toast com BOTÃO nunca
      // é fundido: dois "Movido para a Lixeira" seguidos têm dois "Desfazer"
      // diferentes, e descartar um apagaria o caminho de volta daquele item.
      const igual = opcoes.acao
        ? undefined
        : fila.find(p => !p.acao && p.tipo === tipo && p.mensagem === mensagemFinal && p.titulo === opcoes.titulo);
      if (igual) return igual.id;
      const pedido: PedidoToast = {
        id: proximoId++,
        tipo,
        mensagem: mensagemFinal,
        titulo: opcoes.titulo,
        acao: opcoes.acao,
        duracaoMs: opcoes.duracaoMs && opcoes.duracaoMs > 0
          ? opcoes.duracaoMs
          : duracaoDoToast(tipo, mensagemFinal, !!opcoes.acao, opcoes.titulo),
      };
      fila = [...fila, pedido];
      // Teto: o visível (frente) nunca é derrubado; cai o mais velho dos que esperam.
      while (fila.length > MAX_TOASTS_NA_FILA + 1) fila = [fila[0], ...fila.slice(2)];
      notificar();
      return pedido.id;
    },
    dispensar(id) {
      const antes = fila.length;
      fila = fila.filter(p => p.id !== id);
      if (fila.length !== antes) notificar();
    },
    atual: () => fila[0] ?? null,
    todos: () => [...fila],
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => { ouvintes.delete(ouvinte); };
    },
    temOuvinte: () => ouvintes.size > 0,
    limpar() {
      fila = [];
      notificar();
    },
  };
}

// ─── Folha de confirmação ────────────────────────────────────────────────────

export interface OpcoesConfirmar {
  titulo: string;
  mensagem?: string;
  /** Ação que apaga/substitui algo: botão vermelho e háptico de aviso ao abrir. */
  destrutivo?: boolean;
  /** Rótulo do botão de confirmar. Padrão: "Excluir" (destrutivo) ou "Confirmar". */
  rotuloConfirmar?: string;
  /** Rótulo do botão de cancelar. Padrão: "Cancelar". */
  rotuloCancelar?: string;
}

export interface PedidoConfirmar extends Required<Pick<OpcoesConfirmar, 'titulo' | 'rotuloConfirmar' | 'rotuloCancelar'>> {
  id: number;
  mensagem?: string;
  destrutivo: boolean;
}

/** Rótulos finais: nunca um botão sem texto, nunca "OK" genérico numa exclusão. */
export function normalizarConfirmacao(opcoes: OpcoesConfirmar, id: number): PedidoConfirmar {
  const destrutivo = !!opcoes.destrutivo;
  return {
    id,
    titulo: String(opcoes.titulo ?? '').trim() || (destrutivo ? 'Tem certeza?' : 'Confirmar?'),
    mensagem: opcoes.mensagem?.trim() || undefined,
    destrutivo,
    rotuloConfirmar: opcoes.rotuloConfirmar?.trim() || (destrutivo ? 'Excluir' : 'Confirmar'),
    rotuloCancelar: opcoes.rotuloCancelar?.trim() || 'Cancelar',
  };
}

export interface FilaConfirmacao {
  /** Abre (ou enfileira) uma confirmação; resolve `true` só no botão de confirmar. */
  pedir(opcoes: OpcoesConfirmar): Promise<boolean>;
  /** Resposta do host. Responder duas vezes o mesmo id é ignorado (toque duplo). */
  responder(id: number, valor: boolean): void;
  atual(): PedidoConfirmar | null;
  assinar(ouvinte: Ouvinte): () => void;
  temOuvinte(): boolean;
}

export function criarFilaConfirmacao(): FilaConfirmacao {
  let proximoId = 1;
  let fila: { pedido: PedidoConfirmar; resolver: (v: boolean) => void }[] = [];
  const ouvintes = new Set<Ouvinte>();
  const notificar = () => { for (const o of [...ouvintes]) o(); };

  return {
    pedir(opcoes) {
      return new Promise<boolean>((resolver) => {
        fila = [...fila, { pedido: normalizarConfirmacao(opcoes, proximoId++), resolver }];
        notificar();
      });
    },
    responder(id, valor) {
      const item = fila.find(i => i.pedido.id === id);
      if (!item) return;
      fila = fila.filter(i => i !== item);
      // `=== true`: qualquer coisa que não seja o "sim" explícito é "não".
      item.resolver(valor === true);
      notificar();
    },
    atual: () => fila[0]?.pedido ?? null,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
        // Host desmontou com pergunta aberta (ex.: app recarregou): ninguém mais
        // vai responder. Fecha como "não" em vez de deixar o `await` pendurado.
        if (ouvintes.size === 0 && fila.length) {
          const pendentes = fila;
          fila = [];
          for (const i of pendentes) i.resolver(false);
        }
      };
    },
    temOuvinte: () => ouvintes.size > 0,
  };
}

/** As duas filas do app (singletons). Telas usam a API de `index.ts`, não isto. */
export const filaToast = criarFilaToast();
export const filaConfirmacao = criarFilaConfirmacao();

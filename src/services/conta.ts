import { supabase } from './supabase';
import { PAGAMENTOS_URL } from '../config';

/**
 * Serviço de CONTA do usuário (Frente 2):
 *  - Foto de perfil (identidade do USUÁRIO, distinta da logo da empresa que vive
 *    em Meu Negócio). Guardamos a URI processada em user_metadata.avatar_url.
 *  - Exclusão de conta (requisito da Apple + LGPD): chama o worker, que apaga o
 *    usuário em auth.users com SERVICE_ROLE (o cascade das FKs limpa os dados),
 *    e então faz logout local + wipe do SQLite.
 *
 * O worker é o MESMO de pagamentos/diagnóstico (PAGAMENTOS_URL === DIAGNOSTICO_URL).
 * O id do usuário NUNCA é enviado pelo client na exclusão — o worker usa o id do
 * JWT que ele mesmo valida, então ninguém consegue excluir a conta de outra pessoa.
 */

// ─── Foto de perfil (avatar do usuário) ──────────────────────────────────────

/** Lê a URI da foto de perfil do usuário logado (user_metadata.avatar_url) ou null. */
export async function getFotoPerfil(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    return typeof meta.avatar_url === 'string' && meta.avatar_url ? meta.avatar_url : null;
  } catch {
    return null;
  }
}

/**
 * Salva a foto de perfil (URI já processada/persistida pelo pipeline de fotos).
 * Persiste em user_metadata.avatar_url via updateUser. Lança em erro para a UI
 * poder avisar.
 */
export async function salvarFotoPerfil(uri: string): Promise<void> {
  if (!supabase) throw new Error('Conecte-se à nuvem para salvar sua foto.');
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: uri } });
  if (error) throw error;
}

/** Remove a foto de perfil (volta a usar a logo/inicial como avatar). */
export async function removerFotoPerfil(): Promise<void> {
  if (!supabase) throw new Error('Conecte-se à nuvem para alterar sua foto.');
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } });
  if (error) throw error;
}

// ─── Exclusão de conta ───────────────────────────────────────────────────────

export type ResultadoExclusao =
  | { ok: true }
  | { ok: false; motivo: 'nao_configurado' | 'sem_login' | 'servidor' | 'rede' | 'falha_cancelamento' };

/**
 * Exclui a conta do usuário logado, de forma irreversível.
 *
 * Fluxo:
 *  1) POST /conta/excluir no worker (JWT). O worker cancela a assinatura Stripe
 *     ativa e SÓ ENTÃO apaga o usuário em auth.users com SERVICE_ROLE. Se o
 *     cancelamento falhar ele devolve 502 `falha_cancelamento` e NÃO apaga nada —
 *     apagar a conta com a assinatura viva deixaria o cartão sendo cobrado sem
 *     nenhuma conta pela qual cancelar. É retryável.
 *  2) Só depois de o servidor confirmar, faz logout LOCAL + wipe do SQLite deste
 *     aparelho (import dinâmico para não criar ciclo estático e não carregar o
 *     database fora de hora).
 *
 * O reset de navegação para a porta ('Entrar') vem do listener global de
 * SIGNED_OUT (App.tsx) — igual ao "Sair e apagar dados" da ContaScreen.
 */
export async function excluirConta(): Promise<ResultadoExclusao> {
  if (!PAGAMENTOS_URL) return { ok: false, motivo: 'nao_configurado' };
  if (!supabase) return { ok: false, motivo: 'sem_login' };

  let token: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  } catch {
    token = null;
  }
  if (!token) return { ok: false, motivo: 'sem_login' };

  // 1) Pede a exclusão ao servidor. Só seguimos para o wipe local se ele confirmar.
  try {
    const r = await fetch(`${PAGAMENTOS_URL}/conta/excluir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const data: any = await r.json().catch(() => null);
    if (!r.ok || !data || data.ok !== true) {
      return data?.erro === 'falha_cancelamento'
        ? { ok: false, motivo: 'falha_cancelamento' }
        : { ok: false, motivo: 'servidor' };
    }
  } catch {
    return { ok: false, motivo: 'rede' };
  }

  // 2) Servidor confirmou: limpa este aparelho e encerra a sessão local.
  try {
    const cloud = await import('./cloudSync');
    // Interrompe qualquer sync em andamento ANTES do wipe: sem isso, um pull já
    // em voo poderia regravar dados no SQLite logo após a limpeza.
    cloud.abortarSyncEmAndamento();
  } catch {
    // best-effort: se não deu para abortar, o wipe abaixo ainda limpa tudo.
  }
  try {
    const db = await import('../database/database');
    await db.clearAllLocalData();
  } catch {
    // best-effort: a conta no servidor já foi apagada; não travamos por causa
    // de uma falha no wipe local.
  }
  try {
    // Logout LOCAL (a sessão no servidor já não existe — o usuário foi apagado).
    // Emite SIGNED_OUT, e o listener global reseta a navegação para 'Entrar'.
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // best-effort.
  }

  return { ok: true };
}

/*
 * ─── PASSO A PASSO DE TESTE (exclusão de conta) ──────────────────────────────
 * Pré-requisitos: worker com SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e, para
 * cancelar assinatura, STRIPE_SECRET_KEY) configurados; rota /conta/ ligada no
 * index.js do worker (ver observações da Frente 2). App com login ativo.
 *
 * 1. Crie uma conta de teste e gere alguns dados (1 orçamento, 1 cliente).
 * 2. Conta → role até "Excluir minha conta" → abre o modal.
 * 3. Confira o texto: lista do que será apagado, aviso de irreversível e a nota
 *    sobre cancelamento de assinatura ativa.
 * 4. O botão fica desabilitado até você digitar EXCLUIR (1ª confirmação).
 * 5. Toque em "Excluir minha conta" → aparece o Alert final (2ª confirmação).
 * 6. Confirme → o app chama POST /conta/excluir, o worker apaga o usuário em
 *    auth.users (cascade limpa os dados) e cancela a assinatura Stripe se houver.
 * 7. Esperado: o app faz wipe do SQLite + logout local e cai na tela "Entrar"
 *    (via listener global de SIGNED_OUT). Tente logar de novo com o mesmo e-mail:
 *    a conta não existe mais (precisa cadastrar do zero).
 * 8. Caminhos de erro: sem internet → alerta "Sem conexão"; worker fora →
 *    alerta "Não foi possível excluir a conta agora"; e o wipe local só ocorre
 *    DEPOIS de o servidor confirmar (nada é apagado se a exclusão falhar).
 */

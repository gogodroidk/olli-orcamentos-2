/**
 * Validação do Entrar/Cadastro campo a campo (v1.3). Regra pura, sem React:
 * a tela valida ao SAIR do campo e no envio, e mostra o erro no próprio campo
 * (nada de Alert depois do envio).
 */

export type ModoAuth = 'login' | 'signup';
export type CampoAuth = 'nome' | 'email' | 'telefone' | 'senha' | 'confirmar';
export type ValoresAuth = Record<CampoAuth, string>;
export type ErrosAuth = Partial<Record<CampoAuth | 'geral', string>>;

export const SENHA_MINIMA_PADRAO = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function camposDoModo(modo: ModoAuth): CampoAuth[] {
  return modo === 'signup' ? ['nome', 'email', 'telefone', 'senha', 'confirmar'] : ['email', 'senha'];
}

/** Erro de UM campo, ou undefined se está ok. */
export function validarCampo(
  campo: CampoAuth,
  v: ValoresAuth,
  modo: ModoAuth,
  senhaMinima = SENHA_MINIMA_PADRAO,
): string | undefined {
  switch (campo) {
    case 'nome':
      return v.nome.trim().length < 2 ? 'Escreva seu nome, como vai aparecer no orçamento.' : undefined;
    case 'email': {
      const e = v.email.trim();
      if (!e) return 'Escreva seu e-mail.';
      return EMAIL_RE.test(e) ? undefined : 'Esse e-mail parece incompleto. Confira o @ e o final (.com, .com.br).';
    }
    case 'telefone':
      return v.telefone.replace(/\D/g, '').length < 10 ? 'Coloque o WhatsApp com DDD, por exemplo (11) 99999-9999.' : undefined;
    case 'senha':
      if (!v.senha) return 'Escreva sua senha.';
      if (modo === 'signup' && v.senha.length < senhaMinima) return `A senha precisa de pelo menos ${senhaMinima} caracteres.`;
      return undefined;
    case 'confirmar':
      return v.confirmar !== v.senha ? 'As duas senhas não estão iguais.' : undefined;
  }
}

/** Todos os erros do modo atual (usado no envio). Vazio = pode enviar. */
export function validarTudo(v: ValoresAuth, modo: ModoAuth, senhaMinima = SENHA_MINIMA_PADRAO): ErrosAuth {
  const erros: ErrosAuth = {};
  for (const c of camposDoModo(modo)) {
    const erro = validarCampo(c, v, modo, senhaMinima);
    if (erro) erros[c] = erro;
  }
  return erros;
}

/**
 * Erro do servidor → campo certo + texto humano. O que não é de um campo
 * vai para `geral` (linha logo acima do botão).
 */
export function erroAuthNoCampo(e: unknown, modo: ModoAuth): ErrosAuth {
  const msg: string = (e as { message?: string } | null)?.message ?? String(e ?? '');
  if (/already registered|already exists|User already/i.test(msg)) {
    return { email: 'Esse e-mail já tem conta. Toque em "Entrar" e use sua senha.' };
  }
  if (/invalid login credentials|invalid credentials/i.test(msg)) {
    return { senha: 'E-mail ou senha não conferem. Confira e tente de novo.' };
  }
  if (/invalid.*email|email.*invalid/i.test(msg)) {
    return { email: 'Esse e-mail não foi aceito. Confira se está certo.' };
  }
  if (/weak.?password|password.*(short|weak|least)/i.test(msg)) {
    return { senha: 'Essa senha é fraca. Use letras e números, com pelo menos 8 caracteres.' };
  }
  if (/rate limit|too many requests|429/i.test(msg)) {
    return {
      geral: modo === 'signup'
        ? 'Não deu para criar a conta agora. Tente em 1 minuto.'
        : 'Muitas tentativas seguidas. Tente de novo em 1 minuto.',
    };
  }
  if (/network|fetch|timeout|offline|connection/i.test(msg)) {
    return { geral: 'Sem internet agora. Confira a conexão e tente de novo.' };
  }
  if (/email not confirmed|email.*not.*confirm/i.test(msg)) {
    return { geral: 'Falta confirmar o e-mail. Abra o link que enviamos e depois entre aqui.' };
  }
  // Nunca mostrar a mensagem crua (em inglês) da biblioteca.
  return {
    geral: modo === 'signup'
      ? 'Não deu para criar a conta agora. Tente em 1 minuto.'
      : 'Não deu para entrar agora. Tente em 1 minuto.',
  };
}

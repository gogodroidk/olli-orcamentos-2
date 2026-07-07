// Tradução de erros de autenticação (Supabase Auth) para mensagens em PT-BR
// compreensíveis por um usuário leigo (eletricista/técnico em campo).
//
// O Supabase devolve mensagens cruas em inglês (ex.: "Invalid login credentials",
// "Email not confirmed", "email rate limit exceeded", "Network request failed").
// Esta função tenta reconhecer os casos mais comuns antes de cair num fallback
// genérico — nunca deve devolver a mensagem crua da lib para a tela.

export interface AuthErrorMensagem {
  titulo: string;
  texto: string;
}

/** Traduz um erro de auth (Supabase ou de rede) para título+texto amigáveis em PT-BR. */
export function traduzirErroAuth(e: unknown): AuthErrorMensagem {
  const msg: string = (e as any)?.message ?? String(e ?? '');

  if (/already registered|already exists|User already/i.test(msg)) {
    return {
      titulo: 'E-mail já cadastrado',
      texto: 'Esse e-mail já tem conta. Tente entrar (ou use "Esqueci a senha").',
    };
  }
  if (/email not confirmed|email.*not.*confirm/i.test(msg)) {
    return {
      titulo: 'E-mail ainda não confirmado',
      texto: 'Confirme seu e-mail pelo link que enviamos antes de entrar. Não achou? Toque em "Reenviar e-mail".',
    };
  }
  if (/invalid login credentials|invalid credentials/i.test(msg)) {
    return {
      titulo: 'E-mail ou senha incorretos',
      texto: 'Confira os dados. Se acabou de criar a conta, confirme o e-mail antes de entrar.',
    };
  }
  if (/invalid.*email|email.*invalid/i.test(msg)) {
    return {
      titulo: 'E-mail inválido',
      texto: 'Confira o e-mail digitado e tente de novo.',
    };
  }
  if (/rate limit|too many requests|429/i.test(msg)) {
    return {
      titulo: 'Muitas tentativas',
      texto: 'Você tentou várias vezes em pouco tempo. Aguarde alguns minutos e tente de novo.',
    };
  }
  if (/network|fetch|timeout|offline|connection/i.test(msg)) {
    return {
      titulo: 'Sem conexão',
      texto: 'Não consegui falar com o servidor. Verifique sua internet e tente de novo.',
    };
  }
  if (/weak password|password.*short|password.*least/i.test(msg)) {
    return {
      titulo: 'Senha fraca',
      texto: 'Use uma senha com pelo menos 8 caracteres.',
    };
  }

  // Contrato do módulo: nunca vazar a mensagem crua da lib para o usuário.
  if (__DEV__ && msg) console.warn('[auth] erro não mapeado:', msg);
  return {
    titulo: 'Ops',
    texto: 'Não foi possível autenticar agora. Tente novamente em instantes.',
  };
}

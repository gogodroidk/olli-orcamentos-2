/**
 * Política mínima de senha compartilhada entre o app nativo, o painel e o
 * contrato local do Supabase. A validação final continua sendo do Supabase;
 * esta constante só evita que uma tela aceite um valor que outra rejeita.
 */
export const SENHA_MINIMA = 8;

/** Contrato de consistência da política de senha entre UI e Supabase. */
import { readFileSync } from 'node:fs';

const config = readFileSync('supabase/config.toml', 'utf8');
const entrar = readFileSync('src/screens/EntrarScreen.tsx', 'utf8');
const registrar = readFileSync('webapp/src/pages/sys/login/register-form.tsx', 'utf8');
const redefinir = readFileSync('webapp/src/pages/sys/login/nova-senha.tsx', 'utf8');
const erros = readFileSync('webapp/src/store/userStore.ts', 'utf8');
let ok = 0;
let falhas = 0;

function checar(nome: string, condicao: unknown): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

console.log('\nAuth OLLI — política mínima de senha');
checar('Supabase local exige 8 caracteres', /minimum_password_length\s*=\s*8\b/i.test(config));
checar('app nativo usa a constante compartilhada', /SENHA_MINIMA/.test(entrar));
checar('cadastro web usa a constante compartilhada', /SENHA_MINIMA/.test(registrar));
checar('redefinição web usa a constante compartilhada', /SENHA_MINIMA/.test(redefinir));
checar('cadastro web não aceita mais 6', !/minLength:\s*\{\s*value:\s*6\b/.test(registrar));
checar('redefinição web não aceita mais 6', !/minLength:\s*\{\s*value:\s*6\b/.test(redefinir));
checar('mensagem de senha fraca usa o mínimo compartilhado',
  /SENHA_MINIMA/.test(erros) && !/pelo menos 6 caracteres/i.test(erros));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);

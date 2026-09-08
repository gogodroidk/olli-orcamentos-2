import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const config = ler('../webapp/src/pages/olli/configuracoes/index.tsx');
const equipe = ler('../webapp/src/pages/olli/equipe/index.tsx');
const equipeApi = ler('../webapp/src/pages/olli/equipe/api.ts');
const negocio = ler('../webapp/src/pages/olli/meu-negocio/index.tsx');
const permissao = ler('../src/hooks/usePermissao.ts');
const clientes = ler('../src/screens/ClientesScreen.tsx');

assert.match(config, /Minha conta/, 'configurações precisam expor a conta pessoal');
assert.match(config, /updateUser/, 'nome, e-mail, foto e senha devem usar a sessão Supabase');
assert.match(config, /Alterar e-mail pode exigir confirmação/, 'mudança de e-mail precisa explicar a confirmação');
assert.match(config, /Meu negócio/, 'identidade visual da empresa precisa ter atalho descobrível');
assert.match(equipe, /podeGerenciar/, 'gestão de equipe precisa respeitar papel');
assert.match(equipe, /atualizarMembro/, 'papel/ativo da equipe precisa ter mutação explícita');
assert.match(equipeApi, /Authorization: `Bearer \$\{token\}`/, 'convite precisa sair com sessão autenticada');
assert.match(negocio, /full_name/, 'nome do negócio deve sincronizar metadados de sessão');
assert.match(negocio, /telefone/, 'telefone operacional deve permanecer ligado ao perfil');
assert.match(permissao, /'gerenciar_clientes'/, 'permissões precisam separar ver e gerenciar clientes');
assert.match(clientes, /pode\('gerenciar_clientes'\)/, 'clientes precisa consultar o gate de edição/exclusão');
assert.match(clientes, /Acesso restrito ao gestor da conta/, 'cliente sem permissão precisa de explicação');

console.log('OK — conta, identidade da empresa e equipe com permissões validados.');

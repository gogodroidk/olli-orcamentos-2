import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { camposPendentesPerfil, perfilOperacionalCompleto } from '../src/services/perfilOperacional.ts';
import type { Empresa } from '../src/types/index.ts';

function empresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id: 'empresa_1',
    tipoNegocio: 'autonomo',
    nome: 'Elétrica Lima',
    nomePrestador: 'Ana Lima',
    telefone: '(11) 98888-7777',
    whatsapp: '',
    especialidade: 'Instalações elétricas residenciais',
    segmento: 'eletrica',
    verticais: ['eletrica'],
    ferramentasAtivas: [],
    slogan: '',
    cnpj: '',
    cpf: '',
    endereco: '',
    cidade: 'São Paulo',
    estado: 'SP',
    site: '',
    email: '',
    chavePix: '',
    normas: '',
    ...overrides,
  };
}

assert.equal(perfilOperacionalCompleto(empresa()), true, 'autônomo completo não deve exigir CNPJ');
assert.equal(perfilOperacionalCompleto({ dados: empresa() }), true, 'linha web aninhada deve usar o mesmo contrato');

assert.deepEqual(
  camposPendentesPerfil(empresa({ tipoNegocio: 'empresa', cnpj: '' })),
  ['cnpj'],
  'empresa declarada deve exigir CNPJ',
);

assert.deepEqual(
  camposPendentesPerfil(empresa({ telefone: '', whatsapp: '+55 11 98888-7777' })),
  [],
  'WhatsApp válido pode cumprir o contato operacional de conta legada',
);

assert.deepEqual(
  camposPendentesPerfil(empresa({ telefone: '123', whatsapp: '', verticais: [], cidade: '', estado: 'S' })),
  ['telefone', 'verticais', 'cidade', 'estado'],
  'campos inválidos devem ser enumerados numa ordem estável para a UI',
);

const onboardingMobile = readFileSync(new URL('../src/screens/OnboardingScreen.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(onboardingMobile, /accessibilityLabel="Pular configuração"/, 'onboarding móvel não pode mais ser pulado');
assert.match(onboardingMobile, /perfilOperacionalCompleto\(empresaFinal\)/, 'conclusão móvel deve validar o perfil inteiro');

const guardWeb = readFileSync(new URL('../webapp/src/routes/components/onboarding-guard.tsx', import.meta.url), 'utf8');
assert.match(guardWeb, /perfilOperacionalCompleto\(empresa\.data\)/, 'painel web deve fechar as rotas operacionais');
assert.match(guardWeb, /<Navigate to=/, 'painel web deve conduzir ao cadastro em vez de falhar silenciosamente');

console.log('OK — contrato único de perfil obrigatório validado no app e no painel web.');

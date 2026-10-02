import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const util = ler('../src/utils/imagemPortatil.ts');
const negocio = ler('../src/screens/MeuNegocioScreen.tsx');
const onboarding = ler('../src/screens/OnboardingScreen.tsx');
const web = ler('../webapp/src/pages/olli/meu-negocio/logoUpload.ts');

assert.match(util, /IMAGEM_IDENTIDADE_MAX_DIMENSAO = 512/);
assert.match(util, /IMAGEM_IDENTIDADE_MAX_DATA_URI_CHARS = 512 \* 1024/);
assert.match(util, /ImageManipulator\.manipulate\(asset\.uri\)/);
assert.doesNotMatch(util, /manipulateAsync/);
assert.match(util, /data:image\/\$\{mime\};base64/);
assert.match(util, /SaveFormat\.PNG/);
assert.match(util, /SaveFormat\.JPEG/);

// O onboarding em 4 telas (Onda I5) NÃO escolhe imagem nenhuma: logo e assinatura
// foram para Meu Negócio (checklist de ativação do Início). Garantia mais forte que
// "usa o conversor": sem seletor de imagem lá, nenhuma URI local pode vazar dali.
assert.doesNotMatch(onboarding, /ImagePicker|launchImageLibraryAsync/,
  'Onboarding não escolhe imagem (logo/assinatura ficam em Meu Negócio)');
assert.doesNotMatch(onboarding, /logoUri|assinaturaUri/,
  'Onboarding não grava logo nem assinatura');

for (const [nome, fonte] of [['Meu Negócio', negocio]] as const) {
  assert.match(fonte, /imagemEscolhidaParaDataUri/,
    `${nome} precisa usar o conversor portátil`);
  assert.doesNotMatch(fonte, /\[field\]:\s*r\.assets\[0\]\.uri/,
    `${nome} não pode sincronizar URI local`);
  assert.match(fonte, /resultado\.dataUri/,
    `${nome} precisa persistir o conteúdo convertido`);
}

// Paridade de limites com o painel web: a mesma identidade não pode ser aceita
// num lado e recusada no outro por uma diferença acidental de contrato.
assert.match(web, /LOGO_MAX_DIM = 512/);
assert.match(web, /LOGO_MAX_DATAURI_CHARS = 512 \* 1024/);

console.log('teste-identidade-portatil: 15 verificações passaram');

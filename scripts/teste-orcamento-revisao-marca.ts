import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const step3 = ler('../src/steps/Step3Detalhes.tsx');
const step4 = ler('../src/steps/Step4Personalizacao.tsx');
const pdf = ler('../src/utils/pdfGenerator.ts');
const visualizar = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
const lista = ler('../src/screens/OrcamentosScreen.tsx');
const database = ler('../src/database/database.ts');
const home = ler('../src/screens/HomeScreen.tsx');
const agenda = ler('../src/screens/AgendaScreen.tsx');
const negocio = ler('../src/screens/MeuNegocioScreen.tsx');
const assistente = ler('../src/services/assistenteMarca.ts');
const webForm = ler('../webapp/src/pages/olli/orcamentos/FormOrcamento.tsx');
const webNegocio = ler('../webapp/src/pages/olli/meu-negocio/index.tsx');
const link = ler('../worker/src/link.js');

// Orçamento não promete mais receber pagamento nem expõe uma chave Pix.
assert.doesNotMatch(step3, /habilitarPix|chavePix|valorSinal/);
assert.match(step3, /Condições comerciais/);
assert.doesNotMatch(pdf, /gerarPayloadPix|QR Code Pix|Pagar com Pix|Chave Pix/);
assert.match(pdf, /Condições comerciais/);
assert.doesNotMatch(link, /Pagar com Pix|Chave Pix|QR Code Pix/);
assert.match(link, /Condições comerciais/);

// Um documento já enviado vira revisão ligada ao original, em vez de ser sobrescrito.
assert.match(visualizar, /revisaoDeId: orc\.revisaoDeId \?\? orc\.id/);
assert.match(visualizar, /label="Criar revisão"/);
assert.match(lista, /revisaoDeId: o\.revisaoDeId \?\? o\.id/);
assert.match(webForm, /revisaoDeId: o\.revisaoDeId \?\? o\.id/);
assert.match(webForm, /Criar revisão/);
assert.match(database, /throw new OrcamentoProtegidoError\(anterior\.status\)/);
assert.doesNotMatch(database, /mudouConteudoProtegido && propostaJaEnviada/);

// Personalização visual é central; a etapa final só revisa o padrão aplicado.
assert.match(step4, /nav\.navigate\('ModelosDocumento'\)/);
assert.doesNotMatch(step4, /set\('modeloPdf'|set\('corMarca'/);

// Home e Agenda usam as novas hierarquias, sem o antigo seletor Dia/Semana/Mês.
assert.match(home, /Aprovado neste mês/);
assert.match(home, /Conversão do mês/);
assert.match(agenda, /weekStrip/);
assert.match(agenda, /calendar-month-outline/);
assert.doesNotMatch(agenda, /const MODOS/);

// CNPJ e marca por IA existem no app e na web; a IA só sugere campos curtos.
assert.match(negocio, /consultarCnpj\(digits\)/);
assert.match(webNegocio, /consultarCnpjWeb\(form\.cnpj\)/);
assert.match(assistente, /Não invente certificações/);
assert.match(assistente, /extrairSugestaoMarca/);
assert.match(negocio, /Usar estas sugestões/);
assert.match(webNegocio, /Usar estas sugestões/);

console.log('teste-orcamento-revisao-marca: 29 verificações passaram');

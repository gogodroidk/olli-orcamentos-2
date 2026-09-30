import {
  WELCOME_EMAIL_BRAND,
  WELCOME_EMAIL_RENDERER_VERSION,
  renderizarEmailBoasVindas,
} from '../worker/src/welcomeEmailTemplate.js';
import { WELCOME_TEMPLATE_VERSION } from '../worker/src/welcomeEvent.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nE-mail OLLI — template transacional de boas-vindas');

const input: any = {
  eventId: 'email-confirmed:user-001:2026-09-01',
  template: 'boas_vindas',
  templateVersion: WELCOME_TEMPLATE_VERSION,
  purpose: 'account_onboarding',
  appUrl: 'https://app.example.test/orcamentos/novo?from=email&stage=welcome',
  supportUrl: 'https://support.example.test/olli/ajuda',
  logoUrl: 'https://assets.example.test/olli/logo-88.png',
};

const email: any = renderizarEmailBoasVindas(input);
checar('versão e identidade pública são explícitas', email.rendererVersion === WELCOME_EMAIL_RENDERER_VERSION && email.brand === WELCOME_EMAIL_BRAND && email.brand === 'OLLI Orçamentos');
checar('template coincide com o evento existente', email.template === 'boas_vindas' && email.templateVersion === WELCOME_TEMPLATE_VERSION && email.purpose === 'account_onboarding');
checar('classificação é estritamente transacional', email.kind === 'transactional');
checar('subject é específico e não genérico', email.subject.includes('OLLI Orçamentos') && email.subject.includes('primeiro orçamento') && !/ação requerida/i.test(email.subject));
checar('preview reforça a ação e fica abaixo de 90 caracteres', email.preview.length > 20 && email.preview.length < 90 && email.preview.includes('conta está pronta'));
checar('HTML declara idioma e direção na raiz', /<html lang="pt-BR" dir="ltr">/.test(email.html));
checar('filho direto do body repete idioma e direção', /<body[^>]*>\s*<div lang="pt-BR" dir="ltr">/.test(email.html));
checar('title descreve o e-mail', email.html.includes(`<title>${email.subject}</title>`));
checar('há exatamente um h1', (email.html.match(/<h1\b/g) || []).length === 1 && (email.html.match(/<\/h1>/g) || []).length === 1);
checar('todas as tabelas de layout são presentation', (email.html.match(/<table\b/g) || []).length > 0 && (email.html.match(/<table role="presentation"/g) || []).length === (email.html.match(/<table\b/g) || []).length);
checar('logo tem dimensões e alt significativo', /<img[^>]+width="88"[^>]+height="88"[^>]+alt="OLLI Orçamentos"/.test(email.html));
checar('CTA tem texto descritivo e alvo mínimo de 44 px', email.html.includes('Criar meu primeiro orçamento</a>') && email.html.includes('min-height:44px') && email.html.includes('line-height:44px'));
checar('link de suporte tem destino discernível', email.html.includes('Falar com o suporte da OLLI Orçamentos</a>') && !/clique aqui|saiba mais|read more/i.test(email.html));
checar('links escapam ampersand no atributo HTML', email.html.includes('from=email&amp;stage=welcome'));
checar('texto plano acompanha as mesmas duas ações', email.text.includes(input.appUrl) && email.text.includes(input.supportUrl) && email.text.includes('Criar meu primeiro orçamento'));
checar('conteúdo explica expectativa de notificações', email.html.includes('avisos essenciais da conta') && email.html.includes('preferências'));
checar('welcome não contém preço, trial, desconto ou urgência falsa', !/(R\$|trial|desconto|oferta limitada|última chance)/i.test(`${email.subject}\n${email.preview}\n${email.html}\n${email.text}`));
checar('output não contém destinatário, token, segredo ou provider', !/(recipient|destinatario|token|secret|providerId|api[_-]?key)/i.test(JSON.stringify(email)));
checar('output e strings são determinísticos', JSON.stringify(renderizarEmailBoasVindas(input)) === JSON.stringify(email));
checar('output é imutável', Object.isFrozen(email));
checar('input original não é mutado', input.appUrl.endsWith('from=email&stage=welcome') && Object.keys(input).length === 7);

checar('HTTP é rejeitado no app', erroCodigo(() => renderizarEmailBoasVindas({ ...input, appUrl: 'http://app.example.test' })) === 'app_url_invalida');
checar('URL com credencial é rejeitada', erroCodigo(() => renderizarEmailBoasVindas({ ...input, supportUrl: 'https://usuario:senha@support.example.test' })) === 'support_url_invalida');
checar('data URI é rejeitada para logo', erroCodigo(() => renderizarEmailBoasVindas({ ...input, logoUrl: 'data:image/png;base64,abc' })) === 'logo_url_invalida');
checar('template divergente falha fechado', erroCodigo(() => renderizarEmailBoasVindas({ ...input, template: 'marketing' })) === 'template_invalido');
checar('versão divergente falha fechado', erroCodigo(() => renderizarEmailBoasVindas({ ...input, templateVersion: 'boas_vindas.v999' })) === 'template_version_divergente');
checar('purpose promocional falha fechado', erroCodigo(() => renderizarEmailBoasVindas({ ...input, purpose: 'marketing' })) === 'purpose_invalido');
checar('eventId inseguro falha fechado', erroCodigo(() => renderizarEmailBoasVindas({ ...input, eventId: '<script>' })) === 'event_id_invalido');
checar('campo extra com PII falha fechado', erroCodigo(() => renderizarEmailBoasVindas({ ...input, email: 'pessoa@exemplo.com' })) === 'input_template_invalido');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);


import { enviarBoasVindas, enviarConvite, enviarEmail, emailLigado } from '../src/email.js';

let ok = 0;
let falhas = 0;

function checar(nome, atual, esperado) {
  const passou = JSON.stringify(atual) === JSON.stringify(esperado);
  if (passou) ok += 1;
  else {
    falhas += 1;
    console.error(`FALHOU: ${nome}`, { atual, esperado });
  }
}

const envDesligado = {};
checar('Resend desligado por padrão', emailLigado(envDesligado), false);
checar(
  'welcome sem chave não envia e não falha',
  await enviarBoasVindas(envDesligado, { para: 'teste@example.com', nome: 'Ana' }),
  { ok: false, motivo: 'desligado' },
);

const chamadas = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  chamadas.push({ url, init });
  return new Response(JSON.stringify({ id: 'email-local-1' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  const env = {
    RESEND_API_KEY: 'sandbox-only',
    RESEND_FROM: 'OLLI Orçamentos <nao-responda@olliorcamentos.online>',
  };

  const resultado = await enviarBoasVindas(env, {
    para: 'ana@example.com',
    nome: '<Ana>\n',
    appLink: 'https://olliorcamentos.online/inicio?origem=welcome',
    logoUrl: 'https://olliorcamentos.online/logo.png',
  });
  checar('welcome sandbox retorna sucesso', resultado, { ok: true });
  checar('uma chamada foi feita ao endpoint do Resend', chamadas.length, 1);

  const payload = JSON.parse(chamadas[0].init.body);
  checar('destinatário do welcome', payload.to, ['ana@example.com']);
  checar('assunto fixo da marca', payload.subject, 'Bem-vindo ao OLLI Orçamentos');
  checar('idempotência padrão do welcome', chamadas[0].init.headers['Idempotency-Key'], 'boas-vindas:ana-example.com:v1');
  checar('nome é escapado no HTML', payload.html.includes('&lt;Ana&gt;'), true);
  checar('quebra de linha não entra no assunto', payload.subject.includes('\n'), false);
  checar('logo remoto só é aceito em HTTPS', payload.html.includes('src="https://olliorcamentos.online/logo.png"'), true);
  checar('texto alternativo existe', payload.text.includes('Para começar:'), true);

  chamadas.length = 0;
  await enviarConvite(env, {
    para: 'tecnico@example.com',
    empresa: 'Clima & Filhos',
    papel: 'técnico',
    link: 'https://olliorcamentos.online/equipe/convite/abc',
  });
  checar('convite mantém idempotência', chamadas[0].init.headers['Idempotency-Key'], 'convite:tecnico-example.com:https:--olliorcamentos.online-equipe-convite-abc');

  chamadas.length = 0;
  await enviarEmail(env, {
    para: 'teste@example.com',
    assunto: 'Assunto\nforjado',
    html: '<p>ok</p>',
    texto: 'ok',
    idempotencyKey: 'custom key / com espaços',
  });
  const payloadGenerico = JSON.parse(chamadas[0].init.body);
  checar('assunto genérico remove CRLF', payloadGenerico.subject, 'Assunto forjado');
  checar('chave customizada é normalizada', chamadas[0].init.headers['Idempotency-Key'], 'custom-key---com-espa-os');
} finally {
  globalThis.fetch = fetchOriginal;
}

console.log(`\nE-mail transacional: ${ok} ok, ${falhas} falha(s).`);
if (falhas) process.exit(1);

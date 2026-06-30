import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

const fileEnv = readEnvFile(envPath);
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? fileEnv.EXPO_PUBLIC_SUPABASE_URL ?? '';
const projectRef = process.env.SUPABASE_PROJECT_REF
  ?? supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1];

if (!accessToken || !projectRef) {
  console.error([
    'Missing Supabase Management API credentials.',
    'Set SUPABASE_ACCESS_TOKEN and optionally SUPABASE_PROJECT_REF, then run:',
    '  npm run supabase:auth:emails',
  ].join('\n'));
  process.exit(2);
}

const button = (href, label) => `
  <p style="margin:24px 0">
    <a href="${href}" style="background:#0B6FCE;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:700;display:inline-block">${label}</a>
  </p>`;

const base = (title, body, actionHtml) => `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#16202E;line-height:1.55">
  <h1 style="color:#0A2547;font-size:24px;margin:0 0 12px">OLLI Orçamentos</h1>
  <h2 style="font-size:20px;margin:0 0 12px">${title}</h2>
  <p>${body}</p>
  ${actionHtml}
  <p style="font-size:13px;color:#64748B">Se você não pediu isso, ignore este e-mail.</p>
</div>`.trim();

const payload = {
  external_email_enabled: true,
  mailer_autoconfirm: false,
  mailer_secure_email_change_enabled: true,

  mailer_subjects_confirmation: 'Confirme seu e-mail no OLLI',
  mailer_templates_confirmation_content: base(
    'Confirme seu cadastro',
    'Clique no botão abaixo para confirmar seu e-mail e terminar o cadastro no OLLI.',
    button('{{ .ConfirmationURL }}', 'Confirmar e-mail'),
  ),

  mailer_subjects_recovery: 'Redefina sua senha do OLLI',
  mailer_templates_recovery_content: base(
    'Redefinir senha',
    'Recebemos uma solicitação para redefinir a senha da sua conta.',
    button('{{ .ConfirmationURL }}', 'Redefinir senha'),
  ),

  mailer_subjects_magic_link: 'Seu link de acesso ao OLLI',
  mailer_templates_magic_link_content: base(
    'Entrar no OLLI',
    'Use o botão abaixo para entrar com segurança. O link expira em breve e só pode ser usado uma vez.',
    button('{{ .ConfirmationURL }}', 'Entrar no OLLI'),
  ),

  mailer_subjects_invite: 'Você foi convidado para o OLLI',
  mailer_templates_invite_content: base(
    'Convite recebido',
    'Você recebeu um convite para criar sua conta no OLLI.',
    button('{{ .ConfirmationURL }}', 'Aceitar convite'),
  ),

  mailer_subjects_reauthentication: '{{ .Token }} é seu código OLLI',
  mailer_templates_reauthentication_content: base(
    'Código de verificação',
    'Use o código abaixo para confirmar sua identidade.',
    '<p style="font-size:28px;font-weight:800;letter-spacing:4px;color:#0A2547">{{ .Token }}</p>',
  ),

  mailer_subjects_email_change: 'Confirme o novo e-mail do OLLI',
  mailer_templates_email_change_content: base(
    'Confirmar novo e-mail',
    'Clique no botão abaixo para confirmar a alteração de e-mail da sua conta.',
    button('{{ .ConfirmationURL }}', 'Confirmar novo e-mail'),
  ),

  mailer_notifications_password_changed_enabled: true,
  mailer_subjects_password_changed_notification: 'Sua senha do OLLI foi alterada',
  mailer_templates_password_changed_notification_content: base(
    'Senha alterada',
    'A senha da sua conta OLLI foi alterada recentemente.',
    '',
  ),

  mailer_notifications_email_changed_enabled: true,
  mailer_subjects_email_changed_notification: 'Seu e-mail do OLLI foi alterado',
  mailer_templates_email_changed_notification_content: base(
    'E-mail alterado',
    'O e-mail da sua conta OLLI foi alterado.',
    '',
  ),

  mailer_notifications_identity_linked_enabled: true,
  mailer_subjects_identity_linked_notification: 'Novo método de login conectado ao OLLI',
  mailer_templates_identity_linked_notification_content: base(
    'Método de login conectado',
    'Um método de login foi vinculado à sua conta OLLI.',
    '',
  ),

  mailer_notifications_identity_unlinked_enabled: true,
  mailer_subjects_identity_unlinked_notification: 'Método de login removido do OLLI',
  mailer_templates_identity_unlinked_notification_content: base(
    'Método de login removido',
    'Um método de login foi removido da sua conta OLLI.',
    '',
  ),
};

const smtp = {
  smtp_admin_email: process.env.SUPABASE_SMTP_ADMIN_EMAIL,
  smtp_host: process.env.SUPABASE_SMTP_HOST,
  smtp_port: process.env.SUPABASE_SMTP_PORT ? Number(process.env.SUPABASE_SMTP_PORT) : undefined,
  smtp_user: process.env.SUPABASE_SMTP_USER,
  smtp_pass: process.env.SUPABASE_SMTP_PASS,
  smtp_sender_name: process.env.SUPABASE_SMTP_SENDER_NAME ?? 'OLLI Orçamentos',
};

if (smtp.smtp_admin_email && smtp.smtp_host && smtp.smtp_port && smtp.smtp_user && smtp.smtp_pass) {
  Object.assign(payload, smtp);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
if (!response.ok) {
  console.error(`Supabase config update failed: ${response.status} ${response.statusText}`);
  console.error(text);
  process.exit(1);
}

console.log(`Supabase Auth email templates updated for project ${projectRef}.`);
console.log(smtp.smtp_host ? 'Custom SMTP settings were included.' : 'Custom SMTP settings were not included; set SUPABASE_SMTP_* env vars to enable them.');

/**
 * Processador: Email Follow-up de Indicação (24h pós-aprovação)
 * Roda via cron minuto a minuto (mesmo consumidor da outbox)
 * Busca emails agendados tipo 'referral_followup' e envia via Resend
 * 
 * Benchmark: Multi-channel (SMS + Email) = 11% → 47% conversão (4x) (AnovaGrowth 2026)
 * Resend to unopens (subject line B, 2-3d): +15-20% open rate
 */

import { createClient } from '@supabase/supabase-js';
import { referralFollowupEmailTemplate, referralFollowupEmailAssuntoB } from './referralFollowupTemplate.ts';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.WELCOME_FROM || 'OLLI Orçamentos <nao-responda@olliorcamentos.online>';
const EMAIL_REPLY_TO = process.env.WELCOME_REPLY_TO || 'contato@olliorcamentos.online';

/**
 * Processa emails de follow-up de indicação pendentes
 * Chamado pelo cron job (emailLembretesJob ou consumer dedicado)
 */
export async function processarReferralFollowup(): Promise<{
  processados: number;
  enviados: number;
  erros: number;
}> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não configurado — follow-up referral não enviado');
    return { processados: 0, enviados: 0, erros: 0 };
  }

  const agora = new Date().toISOString();

  // Buscar emails agendados para agora (tipo referral_followup)
  const { data: emails, error } = await supabase
    .from('email_outbox')
    .select('*')
    .eq('tipo', 'referral_followup')
    .eq('status', 'pendente')
    .lte('agendado_para', agora)
    .limit(50); // processa em lotes

  if (error) {
    console.error('Erro ao buscar emails referral_followup:', error);
    return { processados: 0, enviados: 0, erros: 1 };
  }

  if (!emails || emails.length === 0) {
    return { processados: 0, enviados: 0, erros: 0 };
  }

  let enviados = 0;
  let erros = 0;

  for (const email of emails) {
    try {
      const payload = JSON.parse(email.payload);
      const { codigoIndicacao } = payload;

      // Buscar dados do prestador
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo, nome_fantasia, email')
        .eq('id', email.user_id)
        .maybeSingle();

      if (!profile?.email) {
        console.warn(`Prestador ${email.user_id} sem email — follow-up não enviado`);
        await marcarErro(email.id, 'sem_email');
        erros++;
        continue;
      }

      const nome = profile.nome_fantasia || profile.nome_completo || 'Prestador';
      const linkIndicacao = `https://olli.app/indicar/${codigoIndicacao}`;
      const creditosGanhos = 10; // valor padrão, Igor ajusta em creditos.ts

      // Enviar email (assunto A - primeira tentativa)
      const resultado = await enviarEmailResend({
        to: profile.email,
        assunto: referralFollowupEmailTemplate.assunto,
        html: referralFollowupEmailTemplate.html({
          nomePrestador: nome,
          codigoIndicacao,
          linkIndicacao,
          creditosGanhos,
        }),
        texto: referralFollowupEmailTemplate.texto({
          nomePrestador: nome,
          codigoIndicacao,
          linkIndicacao,
          creditosGanhos,
        }),
      });

      if (resultado.ok) {
        await supabase
          .from('email_outbox')
          .update({
            status: 'enviado',
            enviado_em: new Date().toISOString(),
            message_id: resultado.messageId,
          })
          .eq('id', email.id);

        // Registrar evento para dashboard
        await supabase.from('auth_funil_eventos').insert({
          evento: 'email_referral_followup_enviado',
          motivo: JSON.stringify({
            user_id: email.user_id,
            codigo_indicacao: codigoIndicacao,
            message_id: resultado.messageId,
            assunto: 'A',
          }),
          criado_em: new Date().toISOString(),
        });

        enviados++;
      } else {
        await marcarErro(email.id, resultado.erro);
        erros++;
      }
    } catch (error) {
      console.error('Erro ao processar email referral_followup:', error);
      await marcarErro(email.id, 'excecao_processo');
      erros++;
    }
  }

  return { processados: emails.length, enviados, erros };
}

/**
 * Envia email via Resend
 */
async function enviarEmailResend(params: {
  to: string;
  assunto: string;
  html: string;
  texto: string;
}): Promise<{ ok: boolean; messageId?: string; erro?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [params.to],
        subject: params.assunto,
        html: params.html,
        text: params.texto,
        reply_to: EMAIL_REPLY_TO,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, erro: data.message || 'resend_erro' };
    }

    return { ok: true, messageId: data.id };
  } catch (error) {
    return { ok: false, erro: 'excecao_envio' };
  }
}

/**
 * Marca email como erro (para retry posterior ou dead letter)
 */
async function marcarErro(emailId: string, erro: string): Promise<void> {
  await supabase
    .from('email_outbox')
    .update({
      status: 'erro',
      erro: erro,
      tentativas: (await supabase.from('email_outbox').select('tentativas').eq('id', emailId).single()).data?.tentativas + 1 || 1,
    })
    .eq('id', emailId);
}

/**
 * Reenvia para não-abertos (subject line B) - roda em cron separado D+2/D+3
 * Benchmark: +15-20% open rate (Encharge)
 */
export async function reenviarReferralFollowupNaoAbertos(): Promise<{
  reenviados: number;
  erros: number;
}> {
  if (!RESEND_API_KEY) return { reenviados: 0, erros: 0 };

  // Buscar emails referral_followup enviados há 2-3 dias que não foram abertos
  // (precisa de tracking de open - assumindo que email_outbox tem campo 'aberto_em')
  const tresDiasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: emails } = await supabase
    .from('email_outbox')
    .select('*')
    .eq('tipo', 'referral_followup')
    .eq('status', 'enviado')
    .is('aberto_em', null) // não abertos
    .gte('enviado_em', tresDiasAtras)
    .lte('enviado_em', doisDiasAtras)
    .limit(20);

  if (!emails || emails.length === 0) {
    return { reenviados: 0, erros: 0 };
  }

  let reenviados = 0;
  let erros = 0;

  for (const email of emails) {
    try {
      const payload = JSON.parse(email.payload);
      const { codigoIndicacao } = payload;

      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo, nome_fantasia, email')
        .eq('id', email.user_id)
        .maybeSingle();

      if (!profile?.email) continue;

      const nome = profile.nome_fantasia || profile.nome_completo || 'Prestador';
      const linkIndicacao = `https://olli.app/indicar/${codigoIndicacao}`;
      const creditosGanhos = 10;

      // Assunto B (diferente do original)
      const assuntoB = `Seu link ${codigoIndicacao} expira em 5 dias — créditos IA esperando`;

      const resultado = await enviarEmailResend({
        to: profile.email,
        assunto: assuntoB,
        html: referralFollowupEmailTemplate.html({
          nomePrestador: nome,
          codigoIndicacao,
          linkIndicacao,
          creditosGanhos,
        }),
        texto: referralFollowupEmailTemplate.texto({
          nomePrestador: nome,
          codigoIndicacao,
          linkIndicacao,
          creditosGanhos,
        }),
      });

      if (resultado.ok) {
        await supabase
          .from('email_outbox')
          .update({
            reenviado_em: new Date().toISOString(),
            assunto_reenvio: assuntoB,
            message_id_reenvio: resultado.messageId,
          })
          .eq('id', email.id);

        await supabase.from('auth_funil_eventos').insert({
          evento: 'email_referral_followup_reenviado',
          motivo: JSON.stringify({
            user_id: email.user_id,
            codigo_indicacao: codigoIndicacao,
            message_id: resultado.messageId,
            assunto: 'B',
          }),
          criado_em: new Date().toISOString(),
        });

        reenviados++;
      } else {
        erros++;
      }
    } catch (error) {
      console.error('Erro no reenvio referral_followup:', error);
      erros++;
    }
  }

  return { reenviados, erros };
}
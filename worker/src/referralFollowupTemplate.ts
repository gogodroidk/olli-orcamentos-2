/**
 * Template: Email Follow-up de Indicação (24h pós-aprovação)
 * Enviado via email_outbox consumer (cron minuto a minuto)
 * 
 * Benchmark: Resend to unopens (subject line B, 2-3d): +15-20% open rate
 * "Votam contra subject, não body" (Encharge)
 * Multi-channel (email + SMS): 11% → 47% conversão (4x) (AnovaGrowth 2026)
 */

export const referralFollowupEmailTemplate = {
  assunto: 'Ainda dá tempo: seu link de indicação expira em 7 dias',
  
  html: (params: { 
    nomePrestador: string; 
    codigoIndicacao: string; 
    linkIndicacao: string;
    creditosGanhos: number;
  }) => {
    const { nomePrestador, codigoIndicacao, linkIndicacao, creditosGanhos } = params;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
    <tr>
      <td style="background:#ffffff;border-radius:12px;padding:32px;">
        <!-- Header -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;padding-bottom:24px;border-bottom:1px solid #eee;">
              <img src="https://olliorcamentos.online/icon-192.png" alt="OLLI" width="48" height="48" style="border-radius:12px;">
              <h1 style="margin:16px 0 0;color:#1a1a1a;font-size:24px;font-weight:600;">Seu orçamento foi aprovado, ${nomePrestador}!</h1>
            </td>
          </tr>
        </table>

        <!-- Main Content -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
          <tr>
            <td style="color:#333;font-size:16px;line-height:1.6;">
              <p style="margin:0 0 16px;">O cliente aprovou seu orçamento — esse é o momento que todo técnico espera. 🎉</p>
              
              <p style="margin:0 0 16px;">Agora que você fechou o trabalho, que tal ajudar um colega a fazer o mesmo?</p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="text-align:center;">
                    <a href="${linkIndicacao}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:8px;font-weight:600;font-size:16px;">
                      Compartilhar meu link: ${codigoIndicacao}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:16px 0 0;color:#666;font-size:14px;">
                <strong>O que vocês dois ganham:</strong><br>
                ✅ ${creditosGanhos} créditos IA cada (diagnósticos por voz, autopilot)<br>
                ✅ Fiador OLLI grátis no 1º orçamento dele (garantia de recebimento)<br>
                ✅ Créditos caem na hora — sem esperar fim do mês
              </p>
            </td>
          </tr>
        </table>

        <!-- Benefícios -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;padding-top:24px;">
          <tr>
            <td>
              <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px;">Por que indicar agora?</h2>
              <ul style="margin:0;padding:0 0 0 20px;color:#333;line-height:2;">
                <li>Seu link expira em 7 dias — depois precisa gerar outro</li>
                <li>Colega ganha Fiador grátis (diferencial que só OLLI tem)</li>
                <li>Você acumula créditos IA: 5 indicações = 50 créditos = ~15 diagnósticos por voz</li>
                <li>Indicação técnica→técnica converte 3x mais que anúncio (benchmark do setor)</li>
              </ul>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;padding-top:24px;margin-top:24px;">
          <tr>
            <td style="color:#999;font-size:12px;text-align:center;">
              <p style="margin:0 0 8px;">OLLI Orçamentos — O app do técnico que resolve</p>
              <p style="margin:0;">
                <a href="https://olliorcamentos.online/ajuda" style="color:#2563eb;text-decoration:none;">Ajuda</a> •
                <a href="https://olliorcamentos.online/privacidade" style="color:#2563eb;text-decoration:none;">Privacidade</a> •
                <a href="https://diagnostico.olliorcamentos.online/email/descadastrar" style="color:#2563eb;text-decoration:none;">Descadastrar</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  },

  texto: (params: { 
    nomePrestador: string; 
    codigoIndicacao: string; 
    linkIndicacao: string;
    creditosGanhos: number;
  }) => {
    const { nomePrestador, codigoIndicacao, linkIndicacao, creditosGanhos } = params;
    
    return `
Olá ${nomePrestador},

Seu orçamento foi aprovado — esse é o momento que todo técnico espera! 🎉

Agora que você fechou o trabalho, que tal ajudar um colega a fazer o mesmo?

Seu link de indicação: ${linkIndicacao}
Código: ${codigoIndicacao}

O que vocês dois ganham:
✅ ${creditosGanhos} créditos IA cada (diagnósticos por voz, autopilot)
✅ Fiador OLLI grátis no 1º orçamento dele (garantia de recebimento)
✅ Créditos caem na hora — sem esperar fim do mês

Por que indicar agora?
- Seu link expira em 7 dias
- Colega ganha Fiador grátis (só OLLI tem)
- Você acumula créditos: 5 indicações = 50 créditos = ~15 diagnósticos por voz
- Indicação técnico→técnico converte 3x mais que anúncio

OLLI Orçamentos — O app do técnico que resolve
Ajuda: https://olliorcamentos.online/ajuda
Descadastrar: https://diagnostico.olliorcamentos.online/email/descadastrar
    `.trim();
  },
};

/**
 * Assunto alternativo para reenvio aos não-abertos (2-3 dias depois)
 * Benchmark: +15-20% open rate (Encharge, WebFX)
 */
export const referralFollowupEmailAssuntoB = [
  `${nomePrestador}, seu link de indicação expira em 5 dias`,
  `Créditos IA esperando: ${codigoIndicacao} ainda válido`,
  `Fechou o orçamento? Ajude um colega a fechar o dele também`,
];
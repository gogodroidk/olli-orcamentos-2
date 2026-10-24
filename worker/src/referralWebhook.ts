/**
 * Webhook: Orçamento Aprovado → Gatilho de Indicação (SMS + Email Follow-up)
 * 
 * Fluxo:
 * 1. App chama POST /referral/orcamento-aprovado quando orçamento vai para status "aprovado"
 * 2. Worker verifica feature flag indicação_embutida
 * 3. Se ativa: busca código de indicação do prestador
 * 4. Dispara SMS imediato (timing 2h = 3.2x lift, imediato captura "aha!")
 * 5. Agenda email follow-up 24h depois via email_outbox
 * 6. Retorna status para auditoria
 * 
 * Benchmarks aplicados:
 * - SMS 45% response rate vs Email 12% (SaaSHero Field Service)
 * - Timing 2h pós-job = 3.2x lift (RazorSync, SaaSHero) 
 * - Payout instantâneo (créditos IA) = 3.2x repeat referral (SaaSHero)
 * - Dual-sided = 2.3x mais que single-sided (ReferPro)
 */

import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { criarOuBuscarIndicacao } from './indicacoes.ts';
import { dispararGatilhoIndicacaoAprovacao, indicacaoEmbutidaAtiva } from './referralSms.ts';

const app = new Hono();

/**
 * POST /referral/orcamento-aprovado
 * Body: { orcamento_id, prestador_id, valor_total }
 * Auth: Bearer token do prestador (JWT Supabase)
 */
app.post('/referral/orcamento-aprovado', async (c) => {
  try {
    const body = await c.req.json();
    const { orcamento_id, prestador_id, valor_total } = body;

    // Validações básicas
    if (!orcamento_id || !prestador_id) {
      return c.json({ ok: false, erro: 'orcamento_id_e_prestador_id_obrigatorios' }, 400);
    }

    if (valor_total <= 0) {
      return c.json({ ok: false, erro: 'valor_zero_ou_negativo' }, 400);
    }

    // Verificar feature flag
    const flagAtiva = await indicacaoEmbutidaAtiva(prestador_id);
    if (!flagAtiva) {
      return c.json({ 
        ok: true, 
        processado: false, 
        motivo: 'flag_indicacao_embutida_inativa' 
      });
    }

    // Buscar ou criar código de indicação do prestador
    const indicacao = await criarOuBuscarIndicacao(prestador_id);
    const codigoIndicacao = indicacao.codigo;

    // Disparar gatilho: SMS imediato + email follow-up 24h
    const resultado = await dispararGatilhoIndicacaoAprovacao(prestador_id, codigoIndicacao);

    // Registrar evento para dashboard K-Factor
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await supabase.from('auth_funil_eventos').insert({
      evento: 'gatilho_indicacao_aprovacao',
      motivo: JSON.stringify({
        orcamento_id,
        prestador_id,
        codigo_indicacao: codigoIndicacao,
        sms_enviado: resultado.sms.ok,
        sms_message_id: resultado.sms.messageId,
        sms_erro: resultado.sms.erro,
        email_agendado: resultado.emailAgendado,
        valor_total,
      }),
      criado_em: new Date().toISOString(),
    });

    return c.json({
      ok: true,
      processado: true,
      codigo_indicacao: codigoIndicacao,
      sms: resultado.sms,
      email_agendado: resultado.emailAgendado,
    });
  } catch (error) {
    console.error('Erro no webhook orcamento-aprovado:', error);
    return c.json({ ok: false, erro: 'erro_interno' }, 500);
  }
});

/**
 * GET /referral/status/:prestador_id
 * Retorna status da indicação do prestador (para dashboard no painel)
 */
app.get('/referral/status/:prestador_id', async (c) => {
  try {
    const prestador_id = c.req.param('prestador_id');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Buscar indicações do prestador
    const { data: indicacoes } = await supabase
      .from('indicacoes')
      .select('*')
      .eq('indicador_id', prestador_id)
      .order('criado_em', { ascending: false });

    // Buscar créditos IA creditados por referral
    const { data: creditos } = await supabase
      .from('credit_ledger')
      .select('quantidade, criado_em, ref')
      .eq('user_id', prestador_id)
      .eq('origem', 'referral')
      .order('criado_em', { ascending: false });

    // Buscar eventos de funil para métricas
    const { data: eventos } = await supabase
      .from('auth_funil_eventos')
      .select('evento, motivo, criado_em')
      .eq('motivo->>indicador_id', prestador_id)
      .in('evento', ['cadastro_por_indicacao', 'indicado_primeiro_orcamento', 'recompensa_creditada', 'gatilho_indicacao_aprovacao'])
      .order('criado_em', { ascending: false })
      .limit(100);

    return c.json({
      ok: true,
      prestador_id,
      indicacoes: indicacoes || [],
      creditos_referral: creditos || [],
      eventos_recentes: eventos || [],
    });
  } catch (error) {
    console.error('Erro ao buscar status indicação:', error);
    return c.json({ ok: false, erro: 'erro_interno' }, 500);
  }
});

/**
 * POST /referral/test-sms
 * Endpoint de teste para Igor validar SMS (apenas em staging/dev)
 * Body: { prestador_id, telefone_teste }
 */
app.post('/referral/test-sms', async (c) => {
  try {
    const body = await c.req.json();
    const { prestador_id, telefone_teste } = body;

    if (!prestador_id) {
      return c.json({ ok: false, erro: 'prestador_id_obrigatorio' }, 400);
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Buscar ou criar indicação
    const indicacao = await criarOuBuscarIndicacao(prestador_id);
    
    // Buscar nome
    const { data: profile } = await supabase
      .from('profiles')
      .select('nome_completo, nome_fantasia')
      .eq('id', prestador_id)
      .maybeSingle();
    
    const nome = profile?.nome_fantasia || profile?.nome_completo || 'Prestador Teste';
    const telefone = telefone_teste || profile?.telefone;

    if (!telefone) {
      return c.json({ ok: false, erro: 'telefone_nao_encontrado' }, 400);
    }

    // Enviar SMS de teste
    const { enviarSmsIndicacao } = await import('./referralSms.ts');
    const resultado = await enviarSmsIndicacao(telefone, indicacao.codigo, nome);

    return c.json({
      ok: true,
      codigo_indicacao: indicacao.codigo,
      telefone: telefone.slice(-4),
      resultado,
    });
  } catch (error) {
    console.error('Erro no teste SMS:', error);
    return c.json({ ok: false, erro: 'erro_interno' }, 500);
  }
});

export default app;
WITH reviewed_documents(id, document, priority, signature, gate_text) AS (
  VALUES
    (1, 'Intake/qualificação', 'P0', 'não; aceite separado', 'LGPD e revisão humana'),
    (2, 'Cadastro + aviso/base LGPD', 'P0', 'aceite quando consentimento', 'jurídico/privacidade'),
    (3, 'Ficha de ativo/equipamento', 'P0', 'confirmação auditável', 'origem dos dados'),
    (4, 'Visita/diagnóstico', 'P0', 'condicional', 'segurança e offline'),
    (5, 'Orçamento/proposta', 'P0', 'aceite/avançada', 'custos e versão'),
    (6, 'Aceite/autorização', 'P0', 'aceite/avançada', 'link seguro e evidência'),
    (7, 'Contrato de serviço/manutenção/PMOC', 'P0', 'avançada/qualificada', 'jurídico; ART externa'),
    (8, 'Ordem de serviço', 'P0', 'técnico + cliente', 'outbox e conflitos'),
    (9, 'Instalação/comissionamento', 'P1', 'condicional', 'RT/norma licenciada'),
    (10, 'PMOC mestre', 'P0', 'RT/qualificada quando exigida', 'norma, versão e jurisdição'),
    (11, 'Preventiva por equipamento', 'P0', 'técnico/cliente/RT', 'execução real'),
    (12, 'Laudo/relatório corretivo', 'P1', 'técnico/RT', 'competência e ART'),
    (13, 'Qualidade do ar interior', 'P2', 'RT/laboratório', 'norma licenciada e método'),
    (14, 'Registro/checklist ART/RT', 'P1', 'externa/CREA', 'não emitir nem validar'),
    (15, 'APR/PT/NR-35/energia', 'P2', 'responsáveis/equipe', 'SST e versão da NR'),
    (16, 'Entrega/aceite/evidências', 'P0', 'aceite/avançada', 'imutabilidade e cópia'),
    (17, 'Garantia/retorno', 'P1', 'aceite contratual', 'CDC/jurídico'),
    (18, 'NFS-e/recibo fiscal', 'P1', 'externa/oficial', 'contador e município'),
    (19, 'Fatura/cobrança/conciliação', 'P1', 'condições contratuais', 'sandbox/webhook/idempotência'),
    (20, 'Relatório mensal B2B/SLA/PMOC', 'P1', 'gestor/RT conforme contrato', 'definições e fontes')
)
SELECT id, document, priority, signature, gate_text AS gate
FROM reviewed_documents
ORDER BY id;


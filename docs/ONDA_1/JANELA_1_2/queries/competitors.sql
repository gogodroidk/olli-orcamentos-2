WITH reviewed_competitors(product, focus, offline, pmoc, contract, finance, opportunity) AS (
  VALUES
    ('Auvo', 'field service BR', 'não confirmado', 'confirmado', 'parcial', 'confirmado', 'offline e assinatura auditável'),
    ('Field Control', 'field service BR', 'confirmado', 'confirmado', 'parcial', 'parcial', 'contrato/cobrança/governança IA'),
    ('Produttivo', 'field service/AVAC BR', 'confirmado', 'confirmado', 'parcial', 'confirmado', 'aprovação e permissões'),
    ('Jobber', 'SMB global', 'divulgado', 'não BR', 'quote/portal', 'confirmado', 'localização PMOC/ART/Pix/NF'),
    ('Housecall Pro', 'residencial global', 'consulta; sem edição', 'não', 'service plans', 'confirmado', 'offline de escrita e HVAC BR'),
    ('ServiceTitan', 'enterprise HVAC', 'confirmado', 'não BR', 'forte/e-sign', 'confirmado', 'leve, SMB e regras BR'),
    ('Simpro', 'enterprise trades', 'confirmado', 'ativos; não BR', 'forte/e-sign', 'confirmado', 'simplicidade e conformidade BR'),
    ('Infraspeak', 'CAFM/CMMS', 'confirmado', 'ativos; não detalhado', 'fornecedor/parcial', 'procurement', 'comercial SMB'),
    ('Relatório PMOC', 'HVAC BR', 'divulgado', 'central', 'aprovação WhatsApp', 'divulgado', 'validar profundidade/RBAC'),
    ('Klimatta', 'HVAC BR', 'não confirmado', 'central', 'divulgado', 'divulgado', 'offline, e-sign e API')
)
SELECT product, focus, offline, pmoc, contract, finance, opportunity
FROM reviewed_competitors;


WITH reviewed_journey(stage, job, pain, opportunity, measure) AS (
  VALUES
    ('Entrada', 'capturar pedido e urgência', 'áudio/texto sem cadastro', 'chamado assistido e revisável', 'tempo e completude'),
    ('Diagnóstico', 'entender ativo, causa e risco', 'histórico/evidência dispersos', 'QR, ativo e captura offline', 'tempo e retornos'),
    ('Preço', 'cobrir custo e defender valor', 'preço por memória', 'custos, margem e alternativas explicados', 'tempo, margem e edição'),
    ('Proposta', 'comunicar escopo e opções', 'PDF genérico/inconsistente', 'modelos por serviço e versões', 'tempo e dúvidas'),
    ('Aceite/contrato', 'congelar a decisão', 'ok sem versão/prova', 'link seguro, hash e cópia', 'tempo e disputas'),
    ('Agenda', 'alocar pessoa certa', 'conflito/rota manual', 'habilidade, SLA e notificação', 'atraso/reagendamento'),
    ('Execução', 'fazer e registrar uma vez', 'sinal ruim/formulário longo', 'OS offline e checklist adaptativo', 'sync e retrabalho'),
    ('Fechamento', 'provar e entregar', 'aceite/anexo ausente', 'documento imutável por papel', 'tempo e contestação'),
    ('Recebimento', 'faturar e conciliar', 'cobrança tardia', 'cobrança da versão aceita e NFS-e externa', 'dias até receber'),
    ('Recorrência', 'cumprir PMOC por ativo', 'calendário/planilha manual', 'plano versionado e OS idempotente', 'preventivas no prazo'),
    ('Inteligência', 'aprender sem vazar', 'dashboard/IA opacos', 'métricas próprias e agregado opt-in', 'adoção e impacto')
)
SELECT stage, job, pain, opportunity, measure
FROM reviewed_journey;


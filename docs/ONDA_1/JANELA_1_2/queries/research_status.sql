WITH reviewed_research(workstream, target, completed, status, next_step) AS (
  VALUES
    ('Regulação oficial', 'PMOC, RT, assinatura, LGPD, CDC', 'sim', 'documental concluído', 'revalidar no release'),
    ('Concorrentes', '10 jornadas', '10', 'público/oficial', 'trials controlados'),
    ('Documentos', '20 modelos', '20', 'arquitetura', 'redação e revisão'),
    ('Dores públicas', 'sinais exploratórios', '8', 'não representativo', 'confirmar em campo'),
    ('Sessões do proprietário', '2', '0', 'pendente', 'casos sanitizados'),
    ('Amostra externa', '11–13', '0', 'aguarda autorização de contato', 'recrutar com consentimento'),
    ('ABNT NBR 17037', 'edição aplicável licenciada', '0', 'não acessada', 'adquirir/licenciar + RT')
)
SELECT workstream, target, completed, status, next_step AS next
FROM reviewed_research;


WITH reviewed_regulatory(theme, verified, product_gate, owner) AS (
  VALUES
    ('PMOC', 'Lei 13.589 vigente; 5 TR é gatilho de RT na Portaria, não dispensa geral', 'classificar uso/capacidade e pedir confirmação', 'RT/Vigilância'),
    ('RE 9/RDC 886', 'RE 9 revogada; RDC 886 não criou novos limites', 'histórico + referência versionada', 'RT/jurídico'),
    ('ABNT', 'referência atual apontada; conteúdo protegido', 'licença antes de parâmetro/checklist', 'produto/RT/jurídico'),
    ('ART', 'registro externo no CREA', 'anexar/referenciar; nunca emitir', 'RT/CREA'),
    ('Assinatura', 'nível depende de partes, risco e destinatário', 'matriz e dossiê de evidência', 'jurídico/órgão'),
    ('LGPD', 'cliente, equipe, localização, foto, voz, assinatura e IA podem conter dados pessoais', 'RoPA, base, RBAC, retenção, direitos e fornecedores', 'privacidade/segurança'),
    ('IA', 'leis existentes já se aplicam', 'rascunho, explicação, revisão e contestação', 'produto/jurídico/RT')
)
SELECT theme, verified, product_gate, owner
FROM reviewed_regulatory;


-- Grants explícitos para o ledger. A tabela é acessível ao usuário autenticado
-- somente pelas policies owner/visíveis; anon e PUBLIC ficam sem Data API.
REVOKE ALL ON TABLE public.pagamentos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pagamentos TO authenticated;
GRANT ALL ON TABLE public.pagamentos TO service_role;

REVOKE ALL ON FUNCTION public.registrar_pagamento_financeiro(text,text,numeric,text,timestamptz,text,text,text,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_financeiro(text,text,numeric,text,timestamptz,text,text,text,text,text,integer) TO authenticated;

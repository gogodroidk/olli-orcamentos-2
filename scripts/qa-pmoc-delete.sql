BEGIN;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-4000-8000-000000000353', 'authenticated', 'authenticated', 'qa-pmoc-owner@invalid.test', '', '{}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('00000000-0000-4000-8000-000000000354', 'authenticated', 'authenticated', 'qa-pmoc-tech@invalid.test', '', '{}'::jsonb, '{}'::jsonb, now(), now(), false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizacoes (id, owner_user_id, nome)
VALUES ('00000000-0000-4000-8000-000000000355', '00000000-0000-4000-8000-000000000353', 'QA PMOC')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizacao_membros (org_id, user_id, papel, ativo)
VALUES
  ('00000000-0000-4000-8000-000000000355', '00000000-0000-4000-8000-000000000353', 'owner', true),
  ('00000000-0000-4000-8000-000000000355', '00000000-0000-4000-8000-000000000354', 'tecnico', true)
ON CONFLICT (org_id, user_id) DO NOTHING;
INSERT INTO public.assets (id, user_id, criado_por, categoria, situacao)
VALUES ('qa-pmoc-delete-20260911', '00000000-0000-4000-8000-000000000353', '00000000-0000-4000-8000-000000000353', 'split', 'ativo')
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000354', true);

DO $$
DECLARE
  removidos integer;
  ainda_existe integer;
BEGIN
  DELETE FROM public.assets WHERE id = 'qa-pmoc-delete-20260911';
  GET DIAGNOSTICS removidos = ROW_COUNT;
  IF removidos <> 0 THEN RAISE EXCEPTION 'qa_tecnico_conseguiu_apagar_ativo'; END IF;
  SELECT count(*) INTO ainda_existe FROM public.assets WHERE id = 'qa-pmoc-delete-20260911';
  IF ainda_existe <> 1 THEN RAISE EXCEPTION 'qa_ativo_sumiu'; END IF;
END;
$$;

ROLLBACK;

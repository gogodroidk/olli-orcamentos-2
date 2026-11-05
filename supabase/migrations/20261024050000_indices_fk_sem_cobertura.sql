-- Cobre os 14 FKs sem índice apontados pelo advisor (unindexed_foreign_keys, 24/10/2026).
-- Só índices; sem mudança de dado, policy ou função. Tabelas pequenas: create index normal é seguro.
create index if not exists contrato_visitas_contrato_mesmo_tenant_fk_idx on public.contrato_visitas (contrato_id, user_id);
create index if not exists documento_versoes_criado_por_fkey_idx on public.documento_versoes (criado_por);
create index if not exists documentos_criado_por_fkey_idx on public.documentos (criado_por);
create index if not exists funil_exclusoes_criado_por_fkey_idx on public.funil_exclusoes (criado_por);
create index if not exists ia_action_drafts_org_id_fkey_idx on public.ia_action_drafts (org_id);
create index if not exists ia_action_events_actor_user_id_fkey_idx on public.ia_action_events (actor_user_id);
create index if not exists notas_preparadas_criado_por_fkey_idx on public.notas_preparadas (criado_por);
create index if not exists orcamento_envios_gratis_criado_por_fkey_idx on public.orcamento_envios_gratis (criado_por);
create index if not exists pagamentos_criado_por_fkey_idx on public.pagamentos (criado_por);
create index if not exists pagamentos_estornado_por_fkey_idx on public.pagamentos (estornado_por);
create index if not exists pagamentos_orcamento_id_fkey_idx on public.pagamentos (orcamento_id);
create index if not exists trials_comerciais_criado_por_fkey_idx on public.trials_comerciais (criado_por);
create index if not exists trials_comerciais_owner_user_id_fkey_idx on public.trials_comerciais (owner_user_id);
create index if not exists wa_numeros_empresa_user_id_fkey_idx on public.wa_numeros (empresa_user_id);

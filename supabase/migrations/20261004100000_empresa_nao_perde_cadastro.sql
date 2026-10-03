-- Cadastro da empresa nunca regride para vazio por causa de uma cópia velha do aparelho.
--
-- Por quê: o sync (src/services/cloudSync.ts) decide enviar a empresa local comparando um
-- carimbo feito com o relógio do APARELHO. Aparelho com relógio adiantado (o revisor da Google
-- Play estava +21 dias) envia a cópia local vazia por cima do cadastro completo da nuvem, e o
-- app volta a travar em "Complete seu negócio". Isso derrubou a revisão da Play em 02/10/2026.
--
-- Regra: num UPDATE, cada campo essencial que já estava preenchido e chega vazio mantém o valor
-- anterior. Campo preenchido com outro valor é aceito normalmente (edição legítima). O app não
-- deixa salvar o cadastro com esses campos vazios (MeuNegocioScreen), então "apagar de propósito"
-- não é um fluxo que exista.

create or replace function public.empresa_preserva_cadastro()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
  campos constant text[] := array[
    'tipoNegocio', 'nome', 'nomePrestador', 'telefone', 'whatsapp', 'especialidade',
    'segmento', 'cidade', 'estado', 'cnpj', 'cpf', 'email', 'endereco'
  ];
  velho jsonb;
  novo jsonb;
begin
  if old.dados is null or new.dados is null then
    return new;
  end if;
  foreach k in array campos loop
    velho := old.dados -> k;
    novo := new.dados -> k;
    if velho is not null
       and jsonb_typeof(velho) = 'string' and btrim(velho #>> '{}') <> ''
       and (novo is null or (jsonb_typeof(novo) = 'string' and btrim(novo #>> '{}') = '')) then
      new.dados := jsonb_set(new.dados, array[k], velho, true);
    end if;
  end loop;
  -- verticais é array: só preserva quando o antigo tinha itens e o novo chega vazio/ausente.
  velho := old.dados -> 'verticais';
  novo := new.dados -> 'verticais';
  if velho is not null and jsonb_typeof(velho) = 'array' and jsonb_array_length(velho) > 0
     and (novo is null or (jsonb_typeof(novo) = 'array' and jsonb_array_length(novo) = 0)) then
    new.dados := jsonb_set(new.dados, '{verticais}', velho, true);
  end if;
  return new;
end;
$$;

drop trigger if exists empresa_preserva_cadastro on public.empresa;
create trigger empresa_preserva_cadastro
  before update on public.empresa
  for each row execute function public.empresa_preserva_cadastro();

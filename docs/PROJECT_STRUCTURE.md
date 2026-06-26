# Estrutura do Projeto

Este app está organizado por camada funcional:

- `src/components`: peças reutilizáveis de interface, como cards, inputs, botões, header e logo.
- `src/screens`: telas completas conectadas à navegação.
- `src/steps`: etapas internas do fluxo de criação/edição de orçamento.
- `src/database`: persistência SQLite local, seed inicial, exportação/importação e métricas.
- `src/services`: integrações externas, hoje Supabase/Auth/backup.
- `src/theme`: tokens visuais e tema do React Native Paper.
- `src/types`: contratos de domínio compartilhados.
- `src/utils`: funções puras e utilitários de PDF, moeda, data, máscara e ID.
- `supabase/migrations`: histórico SQL para reproduzir o estado do backend.
- `docs`: notas operacionais para GitHub, deploy e manutenção.
- `docs/archive`: evidencias historicas, logs e capturas preservados fora da raiz.
- `qa-artifacts`: saidas locais ignoradas de QA visual.
- `preview`: templates ativos de preview, como o iPhone Lab.

## Convenções

- Prefira componentes pequenos em `src/components` quando algo for usado em mais de uma tela.
- Fluxos de orçamento com estado específico devem ficar em `src/steps`.
- Funções que tocam SQLite ficam em `src/database/database.ts`.
- Integrações externas não devem ser chamadas direto das telas quando puderem ficar em `src/services`.
- Chaves públicas de runtime ficam em `.env.local`; o repositório deve versionar somente `.env.example`.
- Arquivos gerados por ferramentas devem ficar ignorados ou arquivados com README/manifesto.
- Nao mova `assets`, `preview`, `scripts`, `worker/src` ou `supabase/migrations` sem atualizar referencias de build/import no mesmo commit.

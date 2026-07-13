# Estrutura do Projeto

> Resumo. A seção **"Estrutura"** do `README.md` é mais completa e mais nova — em caso de divergência,
> o README manda. Além das camadas abaixo, o repo tem `src/hooks` (usePermissao/useTipoConta/usePlano/
> useEhDesktop), `src/navigation` (AppNavigator + navigationRef), `src/screens/desktop` (telas web, com
> barril `index.web.ts` real e `index.ts` stub para o Metro não empacotar no APK), `worker/` (Cloudflare)
> e `site/` (worker de assets da landing).

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

## Convenções

- Prefira componentes pequenos em `src/components` quando algo for usado em mais de uma tela.
- Fluxos de orçamento com estado específico devem ficar em `src/steps`.
- Funções que tocam SQLite ficam em `src/database/database.ts`.
- Integrações externas não devem ser chamadas direto das telas quando puderem ficar em `src/services`.
- Chaves públicas de runtime ficam em `.env.local`; o repositório deve versionar somente `.env.example`.

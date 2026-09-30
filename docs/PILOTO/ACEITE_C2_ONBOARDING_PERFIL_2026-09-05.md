# Aceite local C2 — onboarding e perfil obrigatório

Data: **2026-09-05**  
Escopo: app Expo + painel web  
Estado: **DONE_LOCAL**

## Contrato operacional único

O arquivo `src/services/perfilOperacional.ts` é a fonte de verdade compartilhada.
Antes de liberar o uso operacional, exige:

- forma de atuação (`autonomo` ou `empresa`);
- nome do negócio e do responsável;
- telefone com DDD;
- especialidade e pelo menos uma vertical de serviço;
- cidade e UF;
- CNPJ apenas quando a forma declarada é `empresa`.

O telefone serve a contato e preenchimento do negócio. Ele não é apresentado como
verificado por SMS. Marketing continua exigindo consentimento separado.

## Painel web

- cadastro por e-mail coleta nome e telefone e os guarda nos metadados do usuário;
- login social continua rápido e coleta os campos faltantes no primeiro acesso;
- `OnboardingGuard` falha fechado se não consegue consultar a empresa;
- qualquer rota operacional redireciona para `/meu-negocio` enquanto faltar dado;
- a tela apresenta pendências, forma de atuação, verticais e campos obrigatórios;
- o salvamento preserva as chaves desconhecidas do blob e mantém a guarda de
  conflito por `atualizado_em`;
- retorno pós-onboarding aceita somente caminho relativo interno seguro;
- nome/telefone de sessão são sincronizados como metadados, sem virar regra de
  autorização ou RLS.

## App Expo

- o botão `Pular` foi removido;
- cada etapa valida seus campos antes de avançar;
- a conclusão revalida o contrato inteiro imediatamente antes da escrita;
- escolher segmento também grava vertical e ferramentas sugeridas;
- contas antigas incompletas veem uma barreira nas abas até corrigirem o cadastro;
- a tela `Meu negócio` recusa salvar perfil operacional incompleto.

## Evidência executada

```text
npm run test:perfil-operacional
OK — contrato único de perfil obrigatório validado no app e no painel web.

npm run typecheck
tsc --noEmit — exit 0

cd webapp && npm run build
tsc && vite build — exit 0
```

## Gate externo preservado

Verificação real do telefone por OTP não foi ativada. Ela depende de provedor SMS,
configuração do Supabase Auth, CAPTCHA/rate limit, custo e teste em dispositivo. O
produto coleta o número e declara corretamente que ele ainda não foi verificado.

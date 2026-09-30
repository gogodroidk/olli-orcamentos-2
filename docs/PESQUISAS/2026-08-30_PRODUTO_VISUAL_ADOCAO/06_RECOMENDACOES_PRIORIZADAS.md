# Recomendações priorizadas

## Princípio

Melhorar primeiro o que reduz erro, medo e tempo até o primeiro valor. Adicionar efeito somente quando ele explica estado ou produto. A landing existente é preservada; mudanças visuais são incrementais.

## Requisito transversal — sucesso do usuário

O produto deve ensinar enquanto a pessoa trabalha. A ajuda não é uma tela isolada nem uma tentativa de compensar uma interface confusa. Ela combina:

- interface autoexplicativa, com rótulos claros e uma ação principal;
- primeira conquista guiada, concluída com ações reais no produto;
- ajuda curta ao lado de conceitos novos;
- Central de Ajuda pesquisável por tarefa;
- possibilidade de rever dicas e tutoriais;
- assistente da OLLI baseado no conteúdo oficial de ajuda;
- educação progressiva conforme o usuário desbloqueia novas necessidades;
- suporte humano visível quando a autoajuda não resolver.

A especificação completa, o inventário do que já existe e as fases de implantação estão em `08_SUCESSO_DO_USUARIO_E_AJUDA_PROGRESSIVA.md`.

## P0 — confiança e jornada essencial

### 1. Orçamento editável e versionado

- botão `Editar orçamento` no app e web;
- aviso ao editar documento já enviado/aprovado;
- nova versão imutável, histórico preservado;
- badge `Versão atualizada — reenviar`;
- preview da versão corrente;
- CTA `Enviar versão atualizada`;
- impedir aceite novo de versão substituída;
- diferenciar claramente “salvo” de “enviado”.

### 2. Sistema de botões inclusivo

- corrigir `OlliButton`, `OlliPressable` e botão web;
- 48 dp no app e 44/48 px no web;
- press no primeiro frame;
- loading com rótulo estável;
- impedir duplo envio;
- remover háptico de navegação/card;
- reduced motion e contraste testados.

### 3. Recuperação de senha

- validar dashboard publicado;
- completar callback/tela nativa;
- mensagem de que os dados permanecem seguros;
- tratar link expirado;
- suporte visível;
- teste real em Android e web no ambiente correto.

### 4. Home orientada a ação

- reduzir competição entre KPIs;
- mostrar aguardando resposta, editados a reenviar, aprovados a agendar e agenda de hoje;
- manter resultados financeiros em nível secundário;
- uma ação primária evidente.

## P1 — adoção e produtividade

### 5. Agenda compreensível

- faixa de dias + Hoje + lista cronológica no app;
- semana + lista no web;
- ações textuais;
- lembretes e conversão orçamento aprovado → agendamento;
- alternativa a drag/hover.

### 6. Personalização centralizada

- logo, cores, slogan, especialidades, observações e modelo padrão em `Meu negócio`;
- orçamento apenas consome a configuração;
- preview antes de salvar;
- CNPJ pode preencher dados via fonte/API após definição de fonte, custo, termos, qualidade e fallback;
- IA pode sugerir texto, sempre com revisão.

### 7. Onboarding e aprendizado até o primeiro valor

- permitir criar o primeiro orçamento antes de configurar tudo;
- checklist curto de primeira conquista, com progresso simples;
- dados não repetidos;
- teste sem cartão;
- gatilho de upgrade depois de valor percebido, não antes;
- ajuda/chat na mesma posição, sem cobrir CTA.
- explicar o que fazer, por que isso importa e qual será o resultado;
- ensinar dentro da tarefa real, sem tour longo ou bloqueante;
- manter `Pular`, `Entendi` e `Rever dicas` sempre respeitados;
- sincronizar o progresso por conta quando a arquitetura de dados estiver pronta;
- medir conclusão da tarefa após a abertura da ajuda, e não apenas o clique na ajuda.

### 8. E-mail transacional

- templates de orçamento, recibo, boas-vindas e convite;
- Resend/servidor com chaves fora do app;
- status confirmado pelo provider;
- fallback manual;
- DNS e produção com gate humano.

## P2 — apresentação e diferenciação

### 9. Landing com produto real

- manter estrutura e conteúdo aprovados;
- capturar dados sintéticos sanitizados;
- substituir mockup principal por tela real;
- aplicar 2.5D CSS leve;
- faixa curta de telas abaixo da dobra;
- narrativa pedido → orçamento → aprovação → OS;
- medir antes/depois.

### 10. Assistência por IA e voz

- gerar rascunho de orçamento, slogan e especialidades;
- mostrar campos preenchidos;
- permitir editar;
- nunca decidir preço, enviar ou cobrar;
- voz com transcrição editável e confirmação.

### 11. WhatsApp OTP

- somente depois do e-mail funcionar;
- somente plataforma oficial;
- telefone verificado, rate limit, custo, consentimento e fallback;
- piloto controlado antes de tornar padrão.

### 12. 3D real

Não priorizar. Só reabrir se existir tarefa espacial real de equipamento/instalação. Para marketing, 2.5D é suficiente.

## O que o usuário verá visualmente

- botões maiores e mais claros;
- um botão principal por tela;
- `Salvar e revisar`, `Enviar ao cliente`, `Enviar versão atualizada`;
- loading sem sumir o texto;
- status mais compreensíveis;
- alerta visível quando orçamento editado ainda não foi reenviado;
- Home com pendências e próxima ação;
- agenda por faixa de dias e lista;
- personalização em um único lugar;
- recuperação de senha com estados completos;
- landing com capturas reais e profundidade leve;
- motion curto e funcional, menos vibração e menos efeitos contínuos;
- ajuda consistente e acessível;
- checklist de primeira conquista;
- explicações curtas em termos e ferramentas novas;
- estados vazios que mostram o próximo passo;
- artigos por tarefa com ação `Fazer agora`;
- assistente contextual que aponta a instrução oficial e permite falar com suporte.

## Dependências humanas

- entrevistas/contato com prestadores;
- acesso a grupos fechados;
- DNS e domínio de e-mail;
- API keys e contas de providers;
- Meta/WhatsApp Business;
- testes com dados ou produção;
- publicação/deploy;
- decisão comercial final de plano/preço.

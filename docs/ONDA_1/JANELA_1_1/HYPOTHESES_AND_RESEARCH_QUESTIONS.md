# Hipóteses, perguntas e dados sintéticos

Data: 2026-08-26

Objetivo: orientar as Janelas 1.2, 1.3 e 1.4 sem transformar opinião em requisito.

## 1. Princípio de pesquisa

O foco inicial é ar-condicionado e PMOC, porque esse é o problema vivido pelo fundador. A expansão para outros prestadores deve ocorrer por capacidades comuns, não por uma tela genérica que tenta atender todos os setores ao mesmo tempo.

Capacidades comuns candidatas:

- empresa, equipe, papéis e permissões;
- clientes, locais e equipamentos;
- catálogo, custo, margem e precificação;
- orçamento, aprovação, contrato, ordem, laudo, recibo e cobrança;
- agenda, lembretes e recorrência;
- evidências, fotos, assinatura e trilha;
- IA contextual com confirmação humana;
- indicadores anônimos e agregados, com governança.

A amostra de campo planejada é exploratória e de conveniência. Ela pode revelar padrões e riscos, mas não representa estatisticamente toda a comunidade.

## 2. Hipóteses prioritárias

| ID | Hipótese | Evidência necessária | Critério de avanço | Critério de descarte ou revisão |
|---|---|---|---|---|
| H01 | Precificação é uma das três maiores dores do prestador | entrevistas, tarefas observadas, histórico sintético/piloto | recorrência clara e impacto em margem/aceite | problema raro ou resolvido fora da plataforma |
| H02 | Um preço recomendado precisa mostrar custo, margem, faixa e confiança | teste de compreensão com prestadores | maioria explica por que a faixa mudou | recomendação vira número mágico ou induz confiança excessiva |
| H03 | Benchmark agregado aumenta qualidade da proposta | consentimento, volume mínimo e segmentação | melhora erro/margem sem revelar empresa | amostra pequena, enviesada ou reidentificável |
| H04 | Orçamento precisa de modelos por tipo de serviço e não apenas aparência | inventário de tarefas e documentos | campos mudam por atividade e reduzem retrabalho | apenas tema visual resolve a necessidade |
| H05 | Contrato, OS, laudo e recibo formam uma cadeia documental | observação de fluxo real | dados reaproveitados sem redigitação | documentos são independentes na maioria dos casos |
| H06 | PMOC exige objetos próprios: local, ativo, plano, periodicidade e responsável | fonte oficial + profissionais | campos e responsabilidades confirmados | regras forem setoriais demais para o núcleo |
| H07 | Assinatura com trilha é mais importante que imagem de assinatura | análise jurídica/técnica e testes | usuário entende autoria, versão e evidência | imagem simples for requisito suficiente no piloto |
| H08 | Funcionários precisam de capacidades por papel, não só acesso sim/não | entrevistas owner/técnico | matriz de ações se repete | cada empresa exige configuração totalmente livre desde o início |
| H09 | Um usuário pode atuar em mais de uma empresa | pesquisa com terceirizados/parceiros | casos legítimos aparecem | caso é excepcional e pode ficar fora do MVP |
| H10 | Offline é crítico no atendimento em campo | observação de conectividade | tarefas essenciais precisam funcionar sem rede | usuários sempre operam conectados |
| H11 | Agenda bidirecional reduz faltas, mas conflitos precisam ser explícitos | teste com calendário | menos retrabalho sem duplicação | integração cria mais inconsistência que valor |
| H12 | IA deve sugerir e explicar, não aprovar silenciosamente | testes de confiança e erro | usuário confirma ações sensíveis | automação cega causa erro ou risco |
| H13 | IA de voz/foto reduz digitação em campo | teste de tarefa cronometrado | menor tempo com taxa de correção aceitável | revisão consome o ganho |
| H14 | Templates por setor devem ser pacotes configuráveis sobre um núcleo comum | comparação HVAC e outros setores | 70% ou mais do fluxo reutilizável no piloto | cada setor requer domínio completamente distinto |
| H15 | Personalização da marca é necessária, mas não é o principal motivo de compra | entrevistas e teste de escolha | marca ajuda fechamento após fluxo funcionar | personalização supera dores operacionais |
| H16 | Um histórico imutável de versões é necessário para documentos assinados | análise de incidentes e requisitos | alterações exigem nova versão | fluxo não precisa de evidência formal |
| H17 | Dados agregados podem ser úteis sem compartilhar dados brutos entre empresas | avaliação de privacidade e produto | k-anonimato/limiar e segmentos viáveis | base insuficiente ou risco de reidentificação |
| H18 | O painel e o app precisam do mesmo contrato de domínio | análise de conflitos | uma operação gera o mesmo resultado nos dois | superfícies têm domínios independentes |

## 3. Perguntas para prestadores

### Trabalho e dinheiro

- Como você calcula mão de obra, deslocamento, material, imposto, risco, garantia e margem?
- Em quais serviços você erra mais o preço?
- O que faz um cliente aceitar ou rejeitar?
- Você registra motivo de perda ou apenas sabe que perdeu?
- Qual informação histórica ajudaria sem expor dados de outra empresa?

### Documentos

- Quais documentos você cria do primeiro contato ao pós-serviço?
- Quais campos repete em orçamento, contrato, OS, laudo e recibo?
- O que precisa ser assinado e por quem?
- O que muda depois da assinatura?
- Qual documento você mais teme fazer errado?
- Onde guarda foto, anexo e versão final?

### Campo e equipe

- O que precisa funcionar sem internet?
- O técnico pode ver preço, margem e cadastro completo do cliente?
- Quem pode excluir, conceder desconto, aprovar contrato e exportar dados?
- Um funcionário trabalha para mais de uma empresa?
- Como você prova horário, local, execução e aceite?

### IA

- Em que tarefa você aceitaria uma sugestão automática?
- Em que tarefa a IA nunca deveria agir sem confirmação?
- Você prefere texto, voz, foto ou formulário?
- O que faria você desconfiar de uma recomendação de preço?
- Quais dados a IA pode aprender e quais devem ficar privados?

## 4. Perguntas específicas de HVAC/PMOC

- Como equipamentos, ambientes, capacidades e criticidade são cadastrados hoje?
- Quem define periodicidade e plano?
- Como identifica cada equipamento em campo?
- Que evidência é necessária por visita?
- Como controla pendência, não conformidade e recomendação?
- Como liga orçamento, contrato, plano, ordem e laudo?
- Como acompanha renovação e reajuste contratual?
- Quais campos variam por tipo de sistema?
- Quais referências normativas são realmente consultadas no trabalho?
- Quem assume responsabilidade técnica e como isso aparece no documento?

Essas respostas não substituem pesquisa oficial nem revisão profissional.

## 5. Perguntas para clientes finais

- O orçamento deixa claro escopo, exclusões, prazo, garantia e pagamento?
- Você entende por que o preço foi calculado?
- Que evidência aumenta confiança?
- Você prefere aprovar por link, assinatura ou mensagem?
- O que precisa comparar entre propostas?
- Você percebe quando um documento mudou depois de aprovado?

## 6. Tarefas observáveis

Medir tempo, erros, dúvidas e retrabalho nas tarefas:

1. cadastrar cliente, local e equipamento;
2. montar preço com custo, margem e deslocamento;
3. gerar orçamento a partir de um modelo;
4. transformar orçamento aprovado em contrato/OS;
5. registrar visita com fotos e observação offline;
6. coletar aceite;
7. emitir laudo/recibo;
8. reagendar e sincronizar calendário;
9. conceder e revogar acesso de funcionário;
10. explicar uma sugestão de IA.

## 7. Amostra exploratória

Meta inicial sugerida:

| Grupo | Quantidade |
|---|---:|
| Empresas HVAC pequenas | 4–5 |
| Técnicos HVAC de campo | 3–4 |
| Prestadores de outros setores | 3–4 |
| Clientes/compradores de serviço | 3 |

Total esperado: 13–16 participantes, dependendo da sobreposição de papéis.

Regras:

- consentimento claro;
- não pedir credenciais, banco completo ou documento real desnecessário;
- anonimizar notas;
- separar fala, observação e inferência;
- registrar data, contexto e nível de confiança;
- permitir retirada;
- não vender o resultado como pesquisa estatística.

## 8. Registro de fontes e modelos

Para cada lei, norma, guia, contrato, laudo ou PDF encontrado:

| Campo | Obrigatório |
|---|---|
| título | sim |
| órgão/autor | sim |
| URL original | sim |
| data de publicação e coleta | sim |
| versão/vigência | sim |
| tipo de fonte | primária, secundária ou exemplo comunitário |
| licença/termos | sim |
| uso permitido | referência de campo, adaptação, redistribuição ou proibido |
| dados pessoais no arquivo | sim/não |
| campos úteis | sim |
| riscos/limitações | sim |
| revisão profissional necessária | sim/não |

Não baixar e redistribuir um PDF apenas por estar publicamente acessível. Preferir fontes oficiais e criar templates próprios a partir de requisitos e campos permitidos.

## 9. Dados sintéticos para o harness

### Identidades

| Código | Papel |
|---|---|
| OWNER_A | dono da Clima Alfa |
| TECH_A | técnico ativo da Clima Alfa |
| MANAGER_A | gestor ativo da Clima Alfa |
| OWNER_B | dono da Elétrica Beta |
| MULTI_AB | membro legítimo das duas empresas |
| REVOKED_A | ex-membro da Clima Alfa |
| OUTSIDER | usuário sem relação |
| PUBLIC | sessão anônima de link/QR |

### Organizações

- ORG_A: Clima Alfa Serviços;
- ORG_B: Elétrica Beta Serviços.

Nomes, documentos, e-mails e telefones devem ser obviamente fictícios e reservados para teste.

### Objetos mínimos por organização

- 2 clientes;
- 2 locais;
- 3 equipamentos/ativos;
- 2 serviços e 2 produtos;
- 2 orçamentos, um rascunho e um aprovado;
- 1 contrato com duas versões;
- 1 plano PMOC;
- 2 ordens, uma concluída e uma pendente;
- 1 laudo;
- 1 link público ativo e 1 revogado;
- 1 arquivo privado;
- 3 comandos de outbox, incluindo duplicata;
- 1 conflito concorrente.

### Cenários especiais

- TECH_A cria visita offline e é revogado antes da reconexão;
- MULTI_AB troca de organização ativa;
- OUTSIDER tenta referenciar asset da ORG_A;
- Worker recebe idempotency key repetida;
- duas superfícies alteram a mesma versão esperada;
- URL assinada expira;
- documento assinado recebe tentativa de edição;
- benchmark tem amostra abaixo do limiar e precisa ocultar a recomendação.

## 10. Critérios de aceite da pesquisa

A Onda 1 só transforma hipótese em requisito quando houver:

1. evidência identificável;
2. risco e limite documentados;
3. persona e tarefa afetadas;
4. métrica de sucesso;
5. critério de descarte;
6. dependência jurídica/técnica marcada;
7. impacto em privacidade e autorização;
8. decisão no Gate 1.4.

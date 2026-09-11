# Gates regulatórios e de confiança — OLLI V2

Verificação documental: 2026-08-26.  
Natureza: arquitetura de produto baseada em fontes oficiais; **não é parecer jurídico, sanitário ou de engenharia**.

## 1. Resumo executivo

O produto pode organizar contratos, PMOC, execução, evidências e assinaturas. Ele não pode prometer conformidade automática, emitir ART, certificar habilitação profissional, substituir laboratório/RT ou transformar saída de IA em laudo final.

Os gates abaixo são bloqueadores de implementação e publicação, não avisos decorativos.

| Tema | Estado oficial confirmado | Regra de produto |
|---|---|---|
| Abrangência do PMOC | A Lei 13.589/2018 exige PMOC em edifícios de uso público e coletivo com ambientes climatizados; usos restritos seguem também regras específicas. | Não usar “abaixo de 60.000 BTU/h” como dispensa automática de PMOC. Classificar uso do ambiente e solicitar confirmação do RT quando houver dúvida. |
| Gatilho de RT | A Portaria GM/MS 3.523/1998 exige RT habilitado para sistemas acima de 5 TR, equivalentes a 60.000 BTU/h. | Somar capacidade de forma explícita, guardar unidade e fonte, alertar o gatilho sem declarar que o software validou o enquadramento. |
| RE 9/2003 | A RDC Anvisa 886/2024 revogou expressamente a RE 9/2003 e não publicou novos limites. | Marcar RE 9 como histórica. Não congelar seus limites nem apresentá-los como vigentes. |
| Referência pós-revogação | Fontes oficiais posteriores da Anvisa e do Confea apontam a ABNT NBR 17037 como referência técnica atual. A Lei 13.589 ainda contém remissão textual à RE 9. | Guardar norma, edição, errata, data de confirmação, RT e jurisdição como dados versionados. Não afirmar que a RDC 886 “substituiu” a RE por novos números. |
| ABNT | As normas são protegidas e comercializadas/licenciadas. | Não copiar texto, tabelas ou checklists proprietários. Comprar/licenciar o exemplar aplicável e submeter qualquer derivação a RT/jurídico. |
| ART | A Lei 6.496/1977 sujeita contratos de serviços profissionais cobertos à ART; o registro ocorre no CREA. | A OLLI anexa e referencia a ART externa. Nunca cria, valida ou vende uma “ART OLLI”. |
| Assinatura | A MP 2.200-2 reconhece ICP-Brasil e admite outros meios de autoria/integridade aceitos pelas partes. A Lei 14.063 classifica simples, avançada e qualificada, especialmente nas interações com entes públicos. | Usar matriz documento × risco × destinatário. Não chamar rubrica de tela de assinatura digital ICP-Brasil. Confirmar exigência de órgãos/CREA/Vigilância. |
| LGPD | Dados de pessoas, localização, fotos identificáveis, assinatura, dispositivo, voz, prompts e decisões automatizadas podem ser dados pessoais. | Finalidade, base legal, minimização, RBAC, retenção, exportação/eliminação, incidentes, fornecedores e transferência internacional são parte do kernel, não pós-lançamento. |
| IA | LGPD, CDC, contrato, segurança e responsabilidade técnica já se aplicam; eventual lei geral futura não suspende esses deveres. | Rascunho com revisão humana, proveniência, logs seguros, contestação e desligamento. Sem decisão final de conformidade, preço discriminatório ou sanção trabalhista. |

## 2. PMOC como dados versionados

O plano precisa guardar, no mínimo:

- estabelecimento, unidade, ambiente, classificação de uso, município e UF;
- sistemas e equipamentos, capacidade por ativo e total, unidade original e conversão;
- proprietário, locatário/preposto, contato e responsável operacional;
- atividades, procedimentos, periodicidades, responsável e contingência;
- execução por ativo: data/hora, técnico, antes/depois, materiais, medição, foto, descarte, achado e próxima ação;
- RT de manutenção, RT de QAI/laboratório quando aplicável, CREA/UF, escopo e ART externa;
- base normativa/técnica adotada, edição, errata, origem, data e responsável pela confirmação;
- não conformidades, ação corretiva, reteste, versão e trilha de alterações;
- pacote de inspeção exportável e registro de disponibilização quando aplicável.

Campos jurídicos/operacionais não podem compartilhar significado. `vigente`, por exemplo, deve significar versão operacional vigente, nunca “legalmente conforme”.

## 3. Regra RE 9/2003 × RDC 886/2024

### O que pode ser dito

- a Lei 13.589/2018 continua vigente;
- a RDC 886/2024 revogou expressamente a RE 9/2003;
- a RDC 886/2024 não contém novos parâmetros de qualidade do ar;
- orientação oficial posterior aponta a NBR 17037 como referência técnica;
- a aplicação concreta pode depender de versão licenciada, RT, contrato, setor e autoridade local.

### O que não pode ser dito

- “a RE 9/2003 continua vigente”;
- “a RDC 886/2024 substituiu os limites antigos pelos seguintes números”;
- “a OLLI garante atendimento à NBR 17037”;
- “um PDF gerado pela OLLI é laudo válido”;
- “qualquer profissional pode assinar PMOC/QAI”.

### Gate encontrado no repositório

O arquivo `web/src/content/blog/pmoc-quem-e-obrigado-lei-13589.md`, linhas 55–61, reproduz uma tabela de parâmetros atribuídos à ABNT NBR 17037; as linhas 65 e 69 fazem conclusões técnicas derivadas. Antes de publicar ou republicar esse conteúdo:

1. bloquear a tabela;
2. confirmar licença de reprodução/derivação;
3. validar edição/errata e números com RT;
4. revisar as afirmações comerciais/jurídicas;
5. substituir, se necessário, por explicação original sem reproduzir conteúdo protegido.

Este checkpoint registra o gate; não alterou o conteúdo porque a Janela 1.2 é documental e a correção deve entrar na execução com revisão apropriada.

## 4. Matriz prudente de assinatura

| Documento/cenário | Trilha mínima de produto | Revisão/gate |
|---|---|---|
| Aprovação de orçamento privado | ação afirmativa, versão, hash, data/hora, identidade/autenticação, cópia entregue e cláusula de aceite | jurídico define suficiência e CDC aplicável |
| Contrato privado B2B/B2C | assinatura avançada ou integração equivalente, dossiê de evidências e anexos imutáveis | jurídico valida modalidade, arrependimento, cancelamento e prova |
| Fechamento de OS | identidade do técnico e cliente, ressalvas, evidências, hash e vínculo ao escopo aprovado | contrato define aceite; não reutilizar assinatura em outro documento |
| PMOC/laudo/QAI | assinatura de RT/laboratório compatível; ICP-Brasil disponível para maior força e quando exigida | confirmar destinatário, conselho e autoridade local |
| Documento dirigido a ente público | nível exigido pelo órgão; em dúvida/conflito, oferecer qualificada | regra do órgão prevalece |
| ART | somente anexo/referência da ART registrada no CREA | validação externa, nunca emissão OLLI |

Evidência recomendada: documento final imutável, identificador, versão, hash, fuso, método de autenticação, ação afirmativa, termos aceitos, anexos, IP/dispositivo quando proporcional, certificado quando houver, cópia entregue, revogação/retificação e retenção definida.

## 5. LGPD por fluxo

| Fluxo | Dados possíveis | Gate antes de ativar |
|---|---|---|
| Cadastro/CRM | pessoa de contato, CPF, e-mail, telefone, endereço | finalidade/base, minimização, aviso e direitos |
| Equipe/agenda | funcionário, escala, rota, localização, produtividade | revisão trabalhista, janela de coleta, RBAC e transparência |
| OS/fotos/voz | imagem, endereço privado, pessoas, voz, documentos e metadados | instrução de captura, redaction/blur, retenção e acesso |
| Assinatura | nome, assinatura, IP, dispositivo, certificado | prova separada, criptografia, acesso mínimo e retenção |
| IA/OCR | prompts, anexos, fotos, voz e saída inferida | pseudonimização, contrato do fornecedor, região, no-training e revisão humana |
| Benchmark de preço | orçamento, aceitação, segmento, região e comportamento comercial | base/opt-in revisado, agregação, limiar de grupo, anti-reidentificação e exclusão |
| Analytics/cookies | identificadores online e uso | necessários por padrão; demais somente conforme base/consentimento e rejeição clara |
| Exportação/portal | dados de cliente, ativo, documento e evidência | autorização por recurso, expiração, revogação, rate limit e log seguro |

### Benchmark futuro de preços

O benchmark não pode consultar dados brutos de outro tenant. Requisitos mínimos:

- coortes comparáveis por ofício, serviço, região, capacidade, complexidade, tipo de cliente e período;
- limiar mínimo de empresas e orçamentos antes de exibir qualquer faixa;
- winsorization/regras contra outliers e manipulação;
- valores agregados e arredondados, sem nomes, documentos ou exemplos reidentificáveis;
- opt-out e transparência;
- separação entre recomendação de margem da própria empresa e inteligência coletiva;
- explicação do intervalo, tamanho da amostra e data de atualização;
- decisão final do prestador, sem preço imposto por IA.

## 6. IA: ações permitidas e proibidas

### Permitidas com revisão humana

- extrair campos de orçamento, OS, nota e laudo;
- sugerir categoria, checklist, texto, escopo, preço e follow-up;
- apontar campo ausente, inconsistência, prazo, risco ou possível duplicidade;
- resumir histórico do ativo e preparar rascunho de relatório;
- comparar o preço com custos próprios e, futuramente, faixas agregadas governadas;
- explicar o porquê da sugestão e permitir edição/recusa.

### Proibidas como decisão autônoma

- declarar conformidade legal, sanitária, técnica ou com ABNT;
- assinar PMOC, ART, contrato ou laudo;
- inventar medição, material, visita, foto ou evidência;
- reprovar profissional, punir funcionário ou monitorar ocultamente;
- discriminar preço por atributo pessoal ou perfil opaco;
- enviar documento, mensagem, cobrança ou dado a terceiro sem ação/autorização adequada;
- treinar fornecedor com dados do tenant sem base, contrato e transparência específicos.

## 7. CDC e contratação digital

Quando houver relação de consumo, o fluxo precisa oferecer antes do aceite:

- identidade e contato do fornecedor;
- descrição clara, escopo, inclusões/exclusões, riscos e restrições;
- preço total, adicionais, impostos/deslocamento e pagamento;
- prazo, validade, execução, garantia, cancelamento e eventual arrependimento;
- correção de erros antes de concluir;
- resumo contratual e destaque de cláusulas limitativas;
- confirmação imediata e cópia conservável/reproduzível;
- canal eficaz de suporte/cancelamento;
- segurança de pagamento e dados.

Não presumir que todo B2B é relação de consumo; o jurídico define o enquadramento do caso.

## 8. Gates para criação e execução

| Gate | Dono da decisão | Evidência de saída |
|---|---|---|
| edição/licença ABNT | produto + RT + jurídico | comprovante/licença, edição e parecer de uso |
| modelo PMOC e QAI | RT/Vigilância quando necessário | checklist assinado de campos, parâmetros e jurisdição |
| contratos e assinatura | jurídico | matriz documento × nível × destinatário e cláusulas aprovadas |
| LGPD/RoPA/DPA | privacidade/jurídico + segurança | inventário, bases, fornecedores, retenção e direitos |
| dados de funcionários | jurídico trabalhista + empresa | finalidade, política, RBAC e transparência |
| IA com dados reais | privacidade + segurança + produto | DPIA/RIPD quando aplicável, fornecedor, no-training, testes e rollback |
| benchmark coletivo | privacidade + dados + produto | coortes, limiar, opt-out, anti-reidentificação e teste de abuso |
| alegações públicas | jurídico + RT + marketing | revisão de cada claim e fonte datada |

## 9. Fontes oficiais principais

- Lei 13.589/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm
- Portaria GM/MS 3.523/1998: https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/prt3523_28_08_1998.html
- RDC Anvisa 886/2024 e consolidação: https://www.gov.br/anvisa/pt-br/assuntos/regulamentacao/gestao-do-estoque/consolidacao/resultados-da-avaliacao-e-consolidacao
- Confea, referência atual: https://www.confea.org.br/pela-devida-seguranca-na-manutencao-e-controle-do-ar-interno
- Lei 6.496/1977 (ART): https://www.planalto.gov.br/ccivil_03/leis/l6496.htm
- MP 2.200-2/2001: https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm
- Lei 14.063/2020: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm
- LGPD compilada: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD, pequeno porte: https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022
- CDC: https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- Decreto 7.962/2013: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm


# Ledger de fontes, origem, licença e validação

Data de corte: 2026-08-26.  
Escopo: Janela 1.2 da Onda 1.  
Regra: este ledger autoriza **consulta e síntese**, não a cópia de layouts, tabelas, marcas ou documentos protegidos.

## 1. Classificação de uso

| Código | Classe | Uso permitido nesta pesquisa | Uso futuro no produto |
|---|---|---|---|
| NORM | lei, portaria, resolução, NR ou ato oficial | citar, extrair obrigação/campo e registrar vigência | redigir implementação própria; jurídico/RT valida a aplicação |
| INST | guia/página institucional | sintetizar orientação com atribuição | derivar requisito próprio; respeitar licença e não sugerir endosso |
| REF | exemplo contratual/técnico | identificar campos e práticas | criar template original; não copiar texto/layout |
| PROP | norma ou material proprietário | referência bibliográfica/escopo | somente com licença e revisão expressa |
| COMP | site/ajuda de fornecedor | mapear capacidade alegada pelo próprio fornecedor | nenhuma cópia de conteúdo, marca, UI ou material |
| QUAL | relato público/comunidade | gerar hipótese exploratória | validar em campo; não generalizar nem copiar conteúdo |
| INT | evidência do repositório | localizar risco/decisão interna | corrigir em janela de execução com teste/revisão |

## 2. Fontes normativas e institucionais

| ID | Fonte | Classe | Verificado em | Uso na Janela 1.2 | Licença/restrição | Confiança/gate |
|---|---|---|---|---|---|---|
| R01 | [Lei 13.589/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm) | NORM | 2026-08-26 | abrangência e objetivo do PMOC | ato oficial; não copiar identidade visual | alta; texto compilado oficial |
| R02 | [Portaria GM/MS 3.523/1998](https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/prt3523_28_08_1998.html) | NORM | 2026-08-26 | operação, 5 TR/RT, registros e fiscalização | ato oficial no acervo BVS | alta; aplicação local/RT ainda deve ser confirmada |
| R03 | [Anexo I da Portaria 3.523/1998](https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/anexo/anexo_prt3523_28_08_1998.pdf) | NORM | 2026-08-26 | campos mínimos do PMOC | PDF de ato oficial; criar formulário próprio | alta; inspeção textual/visual, sem incorporar PDF |
| R04 | [RE Anvisa 9/2003 — cópia oficial anotada](https://antigo.anvisa.gov.br/documents/10181/2718376/RE_09_2003_COMP.pdf/2142ffe5-88bd-4f94-910f-48d6c8a3b23a?version=1.0) | NORM histórica | 2026-08-26 | confirmar histórico e anotação de revogação | manter somente como referência histórica | alta para histórico; não usar limites como vigentes |
| R05 | [RDC Anvisa 886/2024](https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=9431&cod_modulo=310&link=S&numeroAto=00000886&orgao=RDC%2FDC%2FANVISA%2FMS&seqAto=000&tipo=RDC&valorAno=2024) | NORM | 2026-08-26 | revogação expressa da RE 9; ausência de novos limites | ato oficial | alta; texto deve ser rechecado antes de release regulatório |
| R06 | [Anvisa — resultados da consolidação](https://www.gov.br/anvisa/pt-br/assuntos/regulamentacao/gestao-do-estoque/consolidacao/resultados-da-avaliacao-e-consolidacao) | INST | 2026-08-26 | contexto da RDC 886 e 62 atos revogados | portal declara CC BY-ND 3.0; fatos/paráfrase, sem adaptação do guia | alta |
| R07 | [Guia Anvisa 73/2025 v2](https://bibliotecadigital.anvisa.gov.br/jspui/bitstream/anvisa/17752/1/Guia%20n%C2%BA%2073%2C%20de%2003%20de%20abril%20de%202025%20-%20vers%C3%A3o%202.pdf) | INST | 2026-08-26 | orientação pós-revogação para NBR 17037 | guia institucional; não reproduzir integralmente | alta para orientação; não altera o texto da Lei 13.589 |
| R08 | [Confea — segurança e controle do ar interno](https://www.confea.org.br/pela-devida-seguranca-na-manutencao-e-controle-do-ar-interno) | INST | 2026-08-26 | confirmação institucional atual da referência NBR 17037 desde 2023 | conteúdo institucional; síntese e link | alta; atualização 11/08/2026 |
| R09 | [Lei 6.496/1977](https://www.planalto.gov.br/ccivil_03/leis/l6496.htm) | NORM | 2026-08-26 | natureza e obrigação de ART em serviços abrangidos | ato oficial | alta; atribuição concreta depende do CREA |
| R10 | [Confea — ART](https://www.confea.org.br/servicos-prestados/anotacao-de-responsabilidade-tecnica-art) | INST | 2026-08-26 | emissão/registro antes do início e conservação | conteúdo institucional | alta; OLLI não emite nem valida ART |
| R11 | [Nota técnica Confea sobre fiscalização PMOC](https://www.confea.org.br/nota-tecnica-do-confea-orienta-quanto-fiscalizacao-em-sistemas-de-climatizacao) | INST | 2026-08-26 | responsabilidades e distinção CREA/Vigilância | conteúdo institucional | alta; confirmar atribuições no conselho competente |
| R12 | [MP 2.200-2/2001](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm) | NORM | 2026-08-26 | ICP-Brasil e outros meios aceitos pelas partes | ato oficial | alta |
| R13 | [Lei 14.063/2020](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm) | NORM | 2026-08-26 | níveis simples, avançado e qualificado; âmbito público | ato oficial | alta; não extrapolar como mandato universal privado |
| R14 | [ITI — conceitos/validador](https://validar.iti.gov.br/conceitos.html) | INST | 2026-08-26 | validação e conceitos ICP-Brasil/Gov.br | conteúdo institucional | alta; usar integração oficial quando aplicável |
| R15 | [LGPD compilada](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) | NORM | 2026-08-26 | princípios, bases, papéis, direitos, registros, segurança e retenção | ato oficial | alta; consultar sempre versão compilada atual |
| R16 | [ANPD — agentes de pequeno porte, Resolução 2/2022](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022) | NORM/INST | 2026-08-26 | simplificações e deveres que permanecem | portal CC BY-ND 3.0 | alta; pequeno porte não equivale a isenção |
| R17 | [ANPD — guia de agentes e encarregado](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_de_agente_de_tratamento_e_encarregado_da_anpd_novo.pdf) | INST | 2026-08-26 | controlador, operador e papéis reais | guia institucional; não adaptar/redistribuir sem observar licença | alta |
| R18 | [ANPD — incidentes](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis) | NORM/INST | 2026-08-26 | resposta, avaliação e comunicação de incidentes | conteúdo institucional | alta; prazo/regra deve ser revalidado no release |
| R19 | [ANPD — transferência internacional](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados) | NORM/INST | 2026-08-26 | fornecedores de nuvem/IA fora do Brasil | conteúdo institucional | alta; exige contrato/mecanismo aplicável |
| R20 | [CDC compilado](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm) | NORM | 2026-08-26 | oferta, informação, contrato e garantias | ato oficial | alta; enquadramento B2B é caso a caso |
| R21 | [Decreto 7.962/2013](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm) | NORM | 2026-08-26 | contratação eletrônica, resumo, confirmação e cópia | ato oficial | alta quando houver relação de consumo |
| R22 | [NR-35](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/arquivos/normas-regulamentadoras/nr-35.pdf) | NORM | 2026-08-26 | análise de risco e PT para trabalho em altura | ato oficial | alta; aplicar conforme tarefa/risco |
| R23 | [NR-10](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/normas-regulamentadoras/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10) | NORM | 2026-08-26 | segurança elétrica e transição de redação | ato oficial | alta; versão vigente deve ser selecionada por data da atividade |
| R24 | [NFS-e padrão nacional](https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica) | NORM/INST | 2026-08-26 | integração e campos fiscais | sistema oficial; documento fiscal não pode ser simulado | alta; regras municipais/tributárias exigem contador |
| R25 | [Lei 9.610/1998](https://www.planalto.gov.br/ccivil_03/leis/l9610.htm) | NORM | 2026-08-26 | limites de direito autoral, atos oficiais e formulários em branco | ato oficial | alta; não autoriza cópia de obra/layout de terceiro |

## 3. Referências de campos e padrões protegidos

| ID | Fonte | Classe | Uso | Restrição/gate |
|---|---|---|---|---|
| F01 | [Compras.gov — IN 5/2017 e Anexo V-A](https://www.gov.br/compras/pt-br/acesso-a-informacao/legislacao/instrucoes-normativas/instrucao-normativa-no-5-de-26-de-maio-de-2017-atualizada) | REF | identificação, escopo, quantidades, preço, critérios, local e data de OS | referência administrativa, não modelo universal privado |
| F02 | [Polícia Federal — modelo de OS](https://www.gov.br/pf/pt-br/assuntos/licitacoes/2019/distrito-federal/superintendencia-no-distrito-federal/pregoes/pregao-eletronico-no-01-2019-sr-pf-df/8-1-2-anexo-i-b-modelo-de-ordem-de-servico-os.pdf/view) | REF | observar campos de OS | página declara CC BY-ND; original somente sem adaptação; produto terá texto/layout próprios |
| F03 | [Ministério dos Transportes — modelos de contratação](https://www.gov.br/transportes/pt-br/assuntos/conjur/contratacao-direta) | REF | identificar blocos de TR/contrato/recebimento | CC BY-ND no portal; não copiar branding/layout |
| F04 | [GRA-SC — TR com PMOC](https://www.gov.br/gestao/pt-br/acesso-a-informacao/licitacoes-e-contratos/licitacoes-e-contratacoes-diretas/licitacoes-modalidades/pregoes/2022/pregao-eletronico-no-08-2022-gra-sc/anexo-i.pdf) | REF | campos de sistema, ambiente, RT, equipamentos e registros | exemplo contratual público; não é lei/template universal |
| F05 | [ENERGY STAR — checklist HVAC](https://www1.eere.energy.gov/buildings/publications/pdfs/building_america/es_v3_%20rev4_checklists.pdf) | REF internacional | hipóteses de comissionamento | confirmar termos; não copiar; não substitui regra BR |
| F06 | [DOE/Better Buildings — inspeção/manutenção HVAC](https://betterbuildingssolutioncenter.energy.gov/sites/default/files/attachments/Standard%20Practice%20for%20Inspection%20%26%20Maintenance%20of%20Commercial%20HVAC%20Systems.pdf) | REF internacional | hipóteses de checklist preventivo | copyright; não copiar; não substitui RT/norma BR |
| F07 | [EPA Section 608 — registros](https://www.epa.gov/section608/recordkeeping-and-reporting-requirements-stationary-refrigeration) | REF internacional | hipótese de rastreio de refrigerante | regra EUA; não afirmar obrigação brasileira |
| F08 | [ABNT Catálogo](https://www.abntcatalogo.com.br/pav.aspx) | PROP | identificação bibliográfica da NBR 17037 e correlatas | todos os direitos reservados; compra/licença antes de usar conteúdo |
| F09 | [ASHRAE 180 — preview](https://www.ashrae.org/File%20Library/Technical%20Resources/Bookstore/previews_2016639_pre.pdf) | PROP | escopo comparativo de manutenção | padrão protegido; referência bibliográfica apenas |
| F10 | [ACCA — software aprovado](https://www.acca.org/standards/approved-software) | PROP | mapear ecossistema de cálculo | manuais J/D/N protegidos; não reproduzir fórmulas/tabelas sem licença |

## 4. Concorrentes

Detalhes e múltiplas fontes oficiais estão em `COMPETITOR_JOURNEY_MATRIX.md`.

| ID | Produto/fonte canônica | Classe | Uso | Restrição |
|---|---|---|---|---|
| C01 | [Auvo](https://www.auvo.com/modulos-auvo) | COMP | field service BR, orçamento, agenda, ativo, PMOC e financeiro | claims do fornecedor; validar em trial; sem copiar UI/conteúdo |
| C02 | [Field Control](https://fieldcontrol.com.br/gerenciamento-os-e-formularios.html) | COMP | offline, OS, dispatch, recorrência, PMOC e RBAC | claims do fornecedor; validar profundidade |
| C03 | [Produttivo](https://www.produttivo.com.br/software-de-manutencao/) | COMP | offline, documentos, PMOC, API, IA e cobrança | claims do fornecedor; validar aprovação/assinatura |
| C04 | [Jobber](https://www.getjobber.com/llm-info/) | COMP | SMB, quote, Client Hub, pagamento e IA | documento do fornecedor; sem PMOC BR |
| C05 | [Housecall Pro](https://www.housecallpro.com/features/) | COMP | residencial, planos, portal, pagamento e IA | offline de escrita não suportado segundo help |
| C06 | [ServiceTitan](https://www.servicetitan.com/features/service-agreement-software) | COMP | enterprise HVAC, agreements, e-sign, recorrência e billing | claims de marketing; testar; preço não público |
| C07 | [Simpro](https://www.simprogroup.com/features) | COMP | trades enterprise, quote, contrato, manutenção e invoice | claims do fornecedor; implantação/preço a validar |
| C08 | [Infraspeak](https://infraspeak.com/en/platform/overview) | COMP | ativos, work orders, fornecedores, SLA e IA | foco CAFM/enterprise |
| C09 | [Relatório PMOC](https://relatoriopmoc.com.br/) | COMP | vertical HVAC BR e preço público | snapshot mutável; testar profundidade |
| C10 | [Klimatta](https://klimatta.com.br/) | COMP | vertical HVAC BR, contrato, PMOC e financeiro | snapshot mutável; offline/API/e-sign a validar |

## 5. Sinais públicos de dor

Estes relatos são amostra de conveniência, sujeitos a viés, edição, remoção e auto-seleção. Servem apenas para formar hipóteses.

| ID | Fonte | Classe | Sinal usado | Confiança | Restrição |
|---|---|---|---|---|---|
| P01 | [r/hvacpeople — scheduling mistakes](https://www.reddit.com/r/hvacpeople/comments/1uhsjej/scheduling_mistakes_as_you_grow/) | QUAL | fragmentação de agenda/texto/planilha conforme equipe cresce | média | um fio; não inferir prevalência |
| P02 | [r/hvacadvice — divergência escritório/técnico](https://www.reddit.com/r/hvacadvice/comments/1slimki/removed/) | QUAL | preço/informação divergente e janela de atendimento | média-baixa | conteúdo removido/instável; usar só como hipótese |
| P03 | [r/hvac — trabalho não registrado](https://www.reddit.com/r/hvac/comments/1pq2fao/removed/) | QUAL | tempo de acesso/trabalho não lançado não é faturado | média-baixa | caso único/removido |
| P04 | [r/HVAC — sobrecarga solo](https://www.reddit.com/r/HVAC/comments/1ks2awa/why_am_i_doing_this_still/) | QUAL | técnico acumula campo, atendimento, vendas e papelada | média-baixa | desabafo individual |
| P05 | [r/ProHVACR — cobrar visita](https://www.reddit.com/r/ProHVACR/comments/1sle6zk/charge_a_service_call/) | QUAL | conflito sobre fee de visita/orçamento | baixa-média | contexto EUA; validar no Brasil |
| P06 | [Reclame Aqui — prazo/comunicação](https://www.reclameaqui.com.br/porto-seguro/atraso-e-falta-de-comunicacao-na-instalacao-de-ar-condicionado-multiplos-prazos-nao-cumpridos_uiazl6FvlQGbc1yE/) | QUAL | quatro prazos e falta de comunicação em um caso | média para o sinal | não representa taxa do mercado |
| P07 | [r/empreendedorismo — orçamento por áudio/bloco](https://www.reddit.com/r/empreendedorismo/comments/1s546fd/sistema_gratuito_pra_aut%C3%B4nomos_mandarem/) | QUAL | perda de preço/histórico em processo informal | média-baixa | post de validação de produto; viés explícito |
| P08 | [WebArCondicionado — PMOC/RT](https://www.webarcondicionado.com.br/forum/forum/profissionais/engenheiros-e-arquitetos/5820-pmoc) | QUAL histórica | desconhecimento e tensão de responsabilidade | baixa | discussão antiga; não usar como regra atual |

## 6. Evidência interna

| ID | Evidência | Classe | Achado | Ação |
|---|---|---|---|---|
| I01 | `web/src/content/blog/pmoc-quem-e-obrigado-lei-13589.md` | INT | tabela reproduz parâmetros atribuídos à NBR 17037 e deriva conclusões técnicas | bloquear/revisar antes de publicação; licença + RT + jurídico |
| I02 | `docs/PMOC_MODULE.md` | INT | já contém caveat correto sobre RE 9 revogada, dados versionados e IA sem conformidade automática | preservar como baseline e alinhar implementação futura |
| I03 | `docs/ONDA_1/JANELA_1_1/*` | INT | tenancy, outbox, V1/V2 e gates de segurança já definidos | respeitar nos spikes e na criação |

## 7. Regras de manutenção do ledger

- cada modelo deve registrar os IDs de fonte usados;
- cada requisito regulatório deve guardar data de verificação e jurisdição;
- preço e feature de concorrente expiram em 90 dias para decisão comercial;
- regra/guia oficial deve ser revalidado antes de release que dependa dela;
- fonte removida não é apagada: ganha status `indisponível`, data e substituta;
- conteúdo proprietário nunca é anexado ao repositório sem licença explícita;
- relatos públicos nunca entram como “percentual da comunidade” sem pesquisa amostral adequada.


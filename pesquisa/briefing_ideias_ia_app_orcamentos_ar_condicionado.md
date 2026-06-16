# Briefing de Ideias — IA para App de Orçamentos e Diagnóstico de Ar-Condicionado

## Objetivo deste documento

Este documento serve para orientar o desenvolvimento do app de orçamentos para prestadores de serviço de ar-condicionado, com foco em uma IA que ajude o técnico em campo a diagnosticar falhas, entender códigos de erro, montar orçamentos e explicar o problema para o cliente.

A prioridade aqui não é parte técnica de programação. A prioridade é **produto, experiência, lógica de uso e dor real do instalador**.

O app não deve ser apenas uma tabela de códigos de erro. Ele deve funcionar como um **copiloto de campo para técnico de ar-condicionado**.

---

# 1. Visão do produto

## Ideia central

Criar um app onde o técnico consiga:

1. Consultar código de erro.
2. Diagnosticar por sintoma quando não sabe o código.
3. Entender LED piscando.
4. Receber um passo a passo de teste.
5. Saber o que verificar antes de condenar placa, compressor ou sensor.
6. Criar orçamento profissional.
7. Gerar explicação simples para o cliente.
8. Salvar histórico da máquina.
9. Usar IA para transformar bagunça técnica em decisão prática.

O produto precisa parecer feito por quem já subiu em laje quente, abriu evaporadora amarelada de gordura e ouviu cliente falar: “mas ontem estava funcionando”.

---

# 2. Regra de ouro

## O técnico não quer estudar manual. Ele quer resolver o atendimento.

A IA precisa entregar respostas práticas, curtas e orientadas à ação.

Evitar:

- Textão técnico sem conclusão.
- Explicação genérica.
- Diagnóstico certeiro sem evidência.
- Mandar trocar placa de primeira.
- Tratar todos os códigos como se fossem iguais em todas as marcas.
- Falar com o técnico como se ele fosse engenheiro de laboratório.

Priorizar:

- Próximo teste.
- Provável causa.
- Nível de confiança.
- Peça suspeita.
- Risco de erro.
- Como explicar ao cliente.
- Como transformar em orçamento.

---

# 3. Personas principais

## 3.1 Técnico autônomo

Dor:

- Atende sozinho.
- Precisa diagnosticar rápido.
- Nem sempre sabe o modelo exato.
- Não tem manual na mão.
- Precisa cobrar sem parecer enrolado.
- Perde tempo pesquisando erro no Google, YouTube e fórum.

O app deve ajudar esse técnico a parecer mais profissional.

---

## 3.2 Instalador que também faz manutenção

Dor:

- Sabe instalar, mas sofre com eletrônica.
- Fica inseguro com inverter, VRF, sensor, placa e comunicação.
- Quer um guia simples para não trocar peça errada.

O app deve funcionar como uma segunda opinião técnica.

---

## 3.3 Pequena assistência técnica

Dor:

- Tem equipe na rua.
- Cada técnico diagnostica de um jeito.
- Orçamentos saem despadronizados.
- Falta histórico dos aparelhos.
- Falta padrão de atendimento.

O app deve criar processo, histórico e padrão.

---

## 3.4 Técnico iniciante

Dor:

- Não sabe por onde começar.
- Não entende diferença entre erro de sensor, comunicação, IPM, pressão e compressor.
- Tem medo de mexer em máquina inverter.

O app deve educar sem humilhar.

---

# 4. Grandes dores dos técnicos

## Dor 1 — Código de erro confuso

Problema:

- O mesmo código pode significar coisas diferentes por marca, família ou modelo.
- Exemplo: E1 em uma marca pode ser sensor, em outra pode ser comunicação, em outra pode ser proteção.

Solução no app:

- Sempre pedir marca e modelo.
- Mostrar confiança do resultado.
- Exibir aviso quando o código for genérico.
- Sugerir manuais e famílias parecidas.
- Nunca afirmar com certeza quando o modelo não foi confirmado.

---

## Dor 2 — Fujitsu e LEDs piscando

Problema:

Fujitsu, Gree, Samsung e outras marcas podem usar combinações de LEDs, flashes e códigos difíceis de interpretar.

Solução no app:

Criar um fluxo chamado:

**“LED piscando”**

Perguntas:

- Qual LED está piscando?
- Operation pisca quantas vezes?
- Timer pisca quantas vezes?
- Economy pisca quantas vezes?
- Piscam juntos ou alternados?
- Existe LED na condensadora?
- Quantos flashes na placa externa?
- O controle mostra E:EE?
- O erro aparece depois de quanto tempo?

Resultado esperado:

- Código provável.
- Família provável.
- Testes iniciais.
- Fontes para consulta.
- Aviso para confirmar modelo.

---

## Dor 3 — Técnico troca placa cedo demais

Problema:

Quando aparece erro eletrônico, muita gente condena a placa sem testar o básico.

Solução no app:

Criar bloco obrigatório:

**“Antes de trocar placa”**

Checklist:

- Confirmar tensão de alimentação.
- Conferir disjuntor.
- Verificar cabo de interligação.
- Conferir fase, neutro e aterramento.
- Medir continuidade dos cabos.
- Procurar bornes frouxos.
- Verificar oxidação.
- Conferir fusível da placa.
- Verificar varistor estourado.
- Conferir sensor aberto ou em curto.
- Testar comunicação entre evaporadora e condensadora.
- Verificar histórico de raio, queda de energia ou oscilação.

Mensagem interna:

> Placa só deve ser condenada depois de eliminar alimentação, comunicação, sensor, cabo e mau contato.

---

## Dor 4 — Cliente não entende o problema

Problema:

O técnico até sabe o que aconteceu, mas explica mal. Cliente acha que está sendo enrolado.

Solução no app:

Criar botão:

**“Explicar para cliente”**

A IA transforma diagnóstico técnico em mensagem simples.

Exemplo técnico:

> Erro de comunicação entre evaporadora e condensadora. Possível falha em cabo de interligação, placa interna ou placa externa.

Mensagem para cliente:

> O aparelho está com falha de comunicação entre as duas partes do sistema. Precisamos testar a parte elétrica e eletrônica para identificar se o problema está no cabeamento ou em alguma placa. Só depois do teste é possível confirmar a peça com segurança.

Isso ajuda o técnico a vender diagnóstico, não chute.

---

## Dor 5 — Orçamento bagunçado

Problema:

Muito orçamento é mandado em texto no WhatsApp, sem padrão:

> arrumar ar 450

Isso derruba valor percebido.

Solução no app:

A partir do diagnóstico, gerar orçamento com:

- Serviço.
- Peça provável.
- Mão de obra.
- Deslocamento.
- Diagnóstico técnico.
- Garantia.
- Observações.
- O que está incluso.
- O que não está incluso.
- Riscos de falha secundária.

Exemplo:

> Diagnóstico inicial indica possível falha no sensor de serpentina. O orçamento contempla teste elétrico, substituição do sensor se confirmado o defeito e validação de funcionamento. Caso seja identificada falha adicional na placa eletrônica, será apresentado orçamento complementar.

---

# 5. Módulos de produto recomendados

## Módulo 1 — Busca de código de erro

Campos:

- Marca.
- Modelo.
- Tipo de equipamento.
- Código no display.
- LED piscando.
- Sintoma.
- Foto da etiqueta.
- Foto do erro.

Resultado:

- Significado provável.
- Causa provável.
- Testes recomendados.
- Severidade.
- Confiança.
- Fontes.
- Ação sugerida.
- Mensagem para cliente.
- Sugestão de orçamento.

---

## Módulo 2 — Diagnóstico por sintoma

Criar opção:

**“Não sei o código”**

Perguntas:

- O aparelho liga?
- A condensadora parte?
- O compressor parte?
- O ventilador interno funciona?
- O ventilador externo funciona?
- Gela pouco ou não gela nada?
- Desarma em quanto tempo?
- Congela?
- Faz barulho?
- Pisca luz?
- Aparece código?
- Instalação é nova ou antiga?
- Teve manutenção recente?
- Teve queda de energia?

Resultado:

- Caminho provável.
- Testes por ordem.
- Possíveis causas.
- O que não deve ser feito ainda.
- Próxima ação.

---

## Módulo 3 — Modo Fujitsu

Criar uma área específica para Fujitsu.

Nome sugerido:

**“Fujitsu Sem Sofrimento”**

Funções:

- Leitura de E:EE.
- Leitura de Operation/Timer/Economy.
- Códigos por família.
- VRF/Airstage.
- Multi-split.
- Split antigo.
- Split inverter.
- Combinação de LED.
- Guia de controle remoto.
- Guia de placa externa.

Aviso importante:

> Fujitsu exige confirmação de família/modelo. Não use código genérico sem validar a etiqueta.

---

## Módulo 4 — Modo marcas complicadas

Criar atalhos para marcas com maior volume em campo:

- Fujitsu.
- Carrier.
- Springer.
- Midea.
- Gree.
- Samsung.
- LG.
- Philco.
- Consul.
- TCL.
- Elgin.
- Agratto.
- Electrolux.
- Daikin.
- Mitsubishi.

Cada marca deve ter:

- Onde fica o código.
- Como ler LED.
- Códigos comuns.
- Erros que enganam.
- Links de manuais.
- Dicas de campo.
- Alertas.

---

## Módulo 5 — Assistente de orçamento

A IA deve transformar diagnóstico em proposta comercial.

Fluxo:

1. Técnico informa defeito.
2. IA sugere serviço.
3. Técnico ajusta valores.
4. App gera orçamento.
5. App gera versão para WhatsApp.
6. App gera versão mais formal em PDF.
7. App salva no histórico.

O orçamento deve ter linguagem profissional, mas simples.

---

## Módulo 6 — Histórico do equipamento

Cada aparelho precisa virar uma ficha.

Campos:

- Cliente.
- Endereço.
- Marca.
- Modelo evaporadora.
- Modelo condensadora.
- Número de série.
- Capacidade BTU.
- Gás refrigerante.
- Tensão.
- Data de instalação.
- Fotos.
- Erros anteriores.
- Serviços realizados.
- Peças trocadas.
- Garantia.
- Próxima manutenção.

Objetivo:

Quando o técnico voltar no mesmo cliente, ele não começa do zero.

---

## Módulo 7 — Relatório técnico com fotos

Depois do atendimento, gerar relatório:

- Fotos antes.
- Fotos depois.
- Código de erro.
- Diagnóstico.
- Testes feitos.
- Peças avaliadas.
- Serviço executado.
- Recomendações.
- Garantia.
- Assinatura do cliente.

Esse relatório protege o técnico e melhora a imagem profissional.

---

## Módulo 8 — IA como segunda opinião

A IA não deve mandar. Ela deve orientar.

Ela deve falar assim:

- “Possível causa principal.”
- “Antes de condenar, teste isso.”
- “Confiança alta/média/baixa.”
- “Erro pode variar por modelo.”
- “Esse sintoma também pode indicar...”
- “Não recomendo trocar peça antes destes testes.”

A IA deve evitar:

- Diagnóstico absoluto sem dados.
- Troca direta de placa.
- Respostas longas demais.
- Linguagem de manual traduzido ruim.

---

# 6. Comportamento ideal da IA

## 6.1 Tom da IA para o técnico

Tom:

- Direto.
- Técnico.
- Prático.
- Sem enrolação.
- Sem parecer professor chato.
- Sem tratar o técnico como burro.

Exemplo:

> Provável falha de comunicação entre evaporadora e condensadora. Antes de condenar placa, confira cabo de interligação, tensão nos bornes, continuidade dos cabos e oxidação nos conectores. Se tudo estiver correto, avance para teste de placa interna e externa.

---

## 6.2 Resposta padrão para código de erro

Quando o técnico pesquisar um código, a IA deve responder neste formato:

```text
Código: [código]
Marca: [marca]
Família/modelo: [se disponível]

Significado provável:
[...]

Causas mais comuns:
1. [...]
2. [...]
3. [...]

Teste antes de trocar peça:
1. [...]
2. [...]
3. [...]

Peças suspeitas:
- [...]

Nível de confiança:
Alta / Média / Baixa

Atenção:
Esse código pode variar conforme a família/modelo. Confirme pela etiqueta.

Mensagem para cliente:
[...]

Sugestão de orçamento:
[...]
```

---

## 6.3 Resposta quando não achar o código

Se a IA não encontrar o erro:

```text
Não encontrei esse código com segurança para este modelo.

Para avançar, faça este caminho:

1. Tire foto da etiqueta da evaporadora.
2. Tire foto da etiqueta da condensadora.
3. Informe se o erro aparece no display, no controle ou por LED.
4. Informe quantas vezes cada LED pisca.
5. Verifique se há código na placa externa.
6. Consulte os manuais sugeridos abaixo.

Possíveis caminhos:
- Código pode pertencer a outra família da marca.
- Código pode ser de placa universal.
- Código pode aparecer apenas no manual de serviço, não no manual do usuário.
- Código pode ser combinação de LED, não código de display.
```

Também deve salvar esse caso como:

**“erro não encontrado”**

Para enriquecer a base depois.

---

# 7. Guias rápidos que o app deve ter

## 7.1 Guia de comunicação evaporadora/condensadora

Sintomas:

- Erro E1, EC, CH05, U4, E6, dependendo da marca.
- Condensadora não parte.
- Máquina liga e desarma.
- LED piscando.
- Falha intermitente.

Testes:

- Conferir cabo de interligação.
- Conferir ordem dos fios.
- Medir tensão.
- Conferir bornes.
- Verificar emenda mal feita.
- Procurar cabo rompido.
- Verificar oxidação.
- Verificar aterramento.
- Confirmar compatibilidade entre evaporadora e condensadora.

---

## 7.2 Guia de sensor NTC

Sintomas:

- Erro de sensor ambiente.
- Erro de sensor de serpentina.
- Máquina gela demais.
- Máquina não gela.
- Condensadora não parte.
- Desarme rápido.

Testes:

- Desconectar sensor.
- Medir resistência.
- Comparar com temperatura ambiente.
- Conferir se está aberto.
- Conferir se está em curto.
- Verificar conector na placa.
- Verificar oxidação.

---

## 7.3 Guia de falta de gás ou vazamento

Sintomas:

- Gela pouco.
- Tubo fino congela.
- Evaporadora congela.
- Pressão baixa.
- Compressor trabalha direto.
- Baixo delta T.

Testes:

- Medir pressão.
- Medir temperatura de insuflamento e retorno.
- Procurar óleo nas conexões.
- Conferir flange.
- Testar estanqueidade.
- Fazer vácuo correto.
- Corrigir vazamento antes de completar gás.

Alerta:

> Não transformar carga de gás em “dipirona do ar-condicionado”. Se tem vazamento, completar gás sem corrigir é serviço ruim.

---

## 7.4 Guia de alta pressão

Sintomas:

- Desarme por alta.
- Condensadora muito quente.
- Ventilador externo parado.
- Serpentina suja.
- Máquina desarma em dias quentes.

Testes:

- Limpeza da condensadora.
- Verificar ventilador externo.
- Conferir capacitor, se aplicável.
- Conferir obstrução de ar.
- Verificar distância da parede.
- Conferir excesso de gás.
- Medir pressão e temperatura.

---

## 7.5 Guia de compressor inverter/IPM

Sintomas:

- Compressor tenta partir e para.
- Erro IPM.
- Erro de sobrecorrente.
- Erro de compressor travado.
- Condensadora faz tentativa de partida.

Testes:

- Verificar tensão de alimentação.
- Verificar cabos do compressor.
- Medir enrolamentos.
- Verificar aterramento do compressor.
- Conferir módulo inverter/IPM.
- Verificar ventilação da placa.
- Procurar curto ou oxidação.

Alerta:

> Não condenar compressor inverter sem testar módulo, alimentação e aterramento.

---

# 8. Ideias de telas

## Tela inicial

Botões grandes:

- Buscar código de erro.
- Não sei o código.
- LED piscando.
- Criar orçamento.
- Histórico de equipamentos.
- Guia rápido.
- Me ajuda com esse caso.

---

## Tela “Me ajuda com esse caso”

Campo livre para o técnico escrever ou falar:

> “Samsung inverter 12 mil, liga evaporadora, condensadora tenta partir e desarma depois de 3 minutos, aparece erro E458.”

A IA responde com:

- Diagnóstico provável.
- Perguntas que faltam.
- Testes recomendados.
- Orçamento sugerido.
- Explicação para cliente.

---

## Tela de resultado do erro

Blocos:

1. Resumo.
2. Causa provável.
3. Testes em ordem.
4. Peças suspeitas.
5. Não faça ainda.
6. Mensagem para cliente.
7. Criar orçamento.
8. Salvar no histórico.
9. Fontes e manuais.

---

## Tela “não faça ainda”

Essa tela é importante.

Exemplos:

- Não complete gás antes de procurar vazamento.
- Não troque placa antes de testar sensor e cabo.
- Não condene compressor antes de medir enrolamento e aterramento.
- Não diga ao cliente que é placa sem diagnóstico.
- Não faça reset e vá embora se erro voltar.

Isso aumenta a qualidade do serviço.

---

# 9. Diferenciais fortes para vender o app

## Diferencial 1 — Base de erro + IA

Não é só código. É interpretação.

## Diferencial 2 — Orçamento automático

O técnico consulta o erro e já transforma em dinheiro.

## Diferencial 3 — Explicação para cliente

Ajuda a vender serviço sem parecer chute.

## Diferencial 4 — Histórico da máquina

Organiza manutenção e fideliza cliente.

## Diferencial 5 — Modo LED/Fujitsu

Resolve uma dor específica e real.

## Diferencial 6 — Checklist antes de trocar placa

Economiza prejuízo.

## Diferencial 7 — Relatório técnico

Aumenta confiança e reduz discussão.

---

# 10. Ideias de monetização

## Plano grátis

- Consulta limitada de códigos.
- Alguns diagnósticos por mês.
- Orçamentos simples.

## Plano Pro

- Consultas ilimitadas.
- IA de diagnóstico.
- Orçamentos profissionais.
- Relatórios com fotos.
- Histórico de clientes.
- PDF com marca do técnico.

## Plano Empresa

- Vários técnicos.
- Painel de equipe.
- Histórico compartilhado.
- Padronização de orçamento.
- Controle de atendimentos.
- Biblioteca própria de soluções.

## Plano Premium futuro

- IA por voz.
- Leitura de foto da etiqueta.
- Comparação de peça.
- Marketplace de peças.
- Integração com WhatsApp.
- Agenda.
- CRM.
- Gestão de garantia.

---

# 11. O que evitar no MVP

Não começar com coisas grandes demais:

- Marketplace completo.
- Integração complexa com fornecedores.
- IA perfeita para todos os modelos.
- Diagnóstico automático 100% garantido.
- Sistema de gestão gigante.
- ERP para assistência.
- Aplicativo pesado demais.

O MVP precisa resolver o atendimento de campo.

Prioridade:

1. Código de erro.
2. Diagnóstico guiado.
3. Orçamento.
4. Explicação para cliente.
5. Histórico básico.
6. Fontes e links.

---

# 12. MVP recomendado

## Versão 1

Funcionalidades obrigatórias:

- Busca por marca + código.
- Busca por sintoma.
- Guia LED piscando.
- Base inicial das marcas mais comuns.
- Resultado com causa provável e testes.
- Nível de confiança.
- Fontes/manual.
- Botão gerar mensagem para cliente.
- Botão gerar orçamento.
- Histórico simples do equipamento.
- Botão “não achei meu erro”.

Marcas prioritárias:

- Fujitsu.
- Carrier.
- Springer.
- Midea.
- Gree.
- Samsung.
- LG.
- Philco.
- Consul.
- TCL.
- Elgin.
- Electrolux.
- Agratto.
- Daikin.
- Mitsubishi.

---

# 13. Função “aprendizado da base”

Quando um técnico procurar algo que não existe:

- Salvar marca.
- Salvar modelo.
- Salvar código.
- Salvar sintoma.
- Salvar foto, se houver.
- Marcar como pendente de validação.
- Permitir que admin adicione solução depois.
- Depois disponibilizar para outros técnicos com fonte e nível de confiança.

Isso transforma o uso real em crescimento da base.

---

# 14. Biblioteca de frases úteis para cliente

A IA deve gerar frases simples.

## Diagnóstico eletrônico

> O equipamento apresentou falha eletrônica e será necessário fazer testes na alimentação, comunicação e sensores antes de confirmar a peça defeituosa.

## Falha de comunicação

> O aparelho não está conseguindo comunicar corretamente a unidade interna com a unidade externa. Isso pode estar relacionado a cabeamento, conexão ou placa eletrônica.

## Possível sensor

> O sistema identificou leitura incorreta de temperatura. Vamos testar o sensor e os conectores para confirmar se será necessário substituir a peça.

## Possível vazamento

> O equipamento apresenta sinais de baixa carga de fluido refrigerante. Antes de completar o gás, é necessário verificar se há vazamento, porque apenas completar pode fazer o problema voltar.

## Condensadora suja

> A unidade externa está com dificuldade de trocar calor. Isso força o sistema e pode causar desarme ou perda de rendimento.

## Placa suspeita

> Existe suspeita de falha na placa eletrônica, mas antes de substituir a peça precisamos eliminar problemas de alimentação, cabo, sensor e conexão.

---

# 15. Biblioteca de alertas internos para técnico

## Alerta 1

> Código de erro não é sentença. É pista.

## Alerta 2

> Se o erro for comunicação, comece pelo cabo antes da placa.

## Alerta 3

> Se for sensor, meça resistência antes de trocar.

## Alerta 4

> Se for falta de gás, procure vazamento antes de completar.

## Alerta 5

> Se for alta pressão, olhe sujeira, ventilação e ventilador externo.

## Alerta 6

> Se for compressor inverter, teste módulo e alimentação antes de condenar compressor.

## Alerta 7

> Se for Fujitsu, confirme família e padrão de LED. Fujitsu não perdoa chute.

---

# 16. Prompt interno sugerido para a IA do app

Use esta orientação para o comportamento da IA:

```text
Você é um assistente técnico para prestadores de serviço de ar-condicionado.

Seu objetivo é ajudar o técnico em campo a interpretar códigos de erro, sintomas, LEDs piscando e falhas comuns em equipamentos split, inverter, piso-teto, cassete, multi-split e VRF.

Responda sempre de forma prática, objetiva e orientada à ação.

Nunca afirme diagnóstico definitivo sem dados suficientes.
Sempre informe o nível de confiança.
Sempre peça marca, modelo e foto da etiqueta quando necessário.
Sempre diferencie código oficial de manual, código de família parecida e informação de baixa confiança.
Sempre sugira testes antes de troca de placa, compressor, sensor ou módulo inverter.
Sempre inclua uma versão simples para o técnico explicar ao cliente.
Sempre que possível, sugira uma estrutura de orçamento.

Formato preferido da resposta:

1. Resumo do problema.
2. Significado provável.
3. Causas mais comuns.
4. Testes em ordem.
5. Peças suspeitas.
6. O que não fazer ainda.
7. Nível de confiança.
8. Mensagem para cliente.
9. Sugestão de orçamento.
10. Fontes ou caminhos de consulta.

Evite respostas longas demais.
Evite linguagem excessivamente acadêmica.
Evite condenar peça sem teste.
Evite tratar códigos genéricos como verdade absoluta.
```

---

# 17. Prompt para o Cloud Code entender a direção de produto

```text
Quero que você desenvolva este produto com foco em dor real de técnico de ar-condicionado em campo.

Não quero apenas uma tabela de códigos de erro. Quero um copiloto de diagnóstico e orçamento.

O app deve ajudar o técnico a:
- encontrar código de erro por marca/modelo;
- diagnosticar por sintoma quando não souber o código;
- interpretar LED piscando, principalmente em marcas difíceis como Fujitsu;
- saber quais testes fazer antes de trocar peça;
- gerar explicação simples para o cliente;
- gerar orçamento profissional;
- salvar histórico do equipamento;
- registrar erros não encontrados para enriquecer a base depois.

A experiência precisa ser rápida, prática e pensada para uso em campo.

O técnico deve conseguir usar o app em poucos toques, com botões grandes, linguagem direta e respostas acionáveis.

Priorize estes módulos no MVP:
1. Busca de código de erro.
2. Diagnóstico por sintoma.
3. Modo LED piscando.
4. Resultado com testes recomendados.
5. Mensagem para cliente.
6. Orçamento automático.
7. Histórico básico do equipamento.
8. Botão “não achei meu erro”.
9. Fontes e links dos manuais.

A IA deve sempre trabalhar com nível de confiança:
- Alta: manual oficial do modelo.
- Média: manual da família ou marca.
- Baixa: comunidade, agregador ou caso parecido.

A IA nunca deve mandar trocar placa, compressor ou módulo sem antes sugerir testes básicos.

O produto precisa vender profissionalismo para o técnico e segurança para o cliente.
```

---

# 18. Ordem de prioridade

## Prioridade máxima

- Campo de busca simples.
- Seleção por marca.
- Código de erro.
- Sintoma.
- Resultado prático.
- Fontes.
- Orçamento.
- Mensagem para cliente.

## Prioridade alta

- Foto da etiqueta.
- LED piscando.
- Histórico da máquina.
- Relatório técnico.
- Botão “não achei”.

## Prioridade média

- Biblioteca de sensores.
- Calculadoras técnicas.
- Superaquecimento.
- Sub-resfriamento.
- Delta T.
- Checklist de instalação.

## Prioridade futura

- Marketplace de peças.
- Integração WhatsApp.
- Agenda.
- Equipe.
- Painel para empresa.
- IA por voz.
- Leitura automática de foto.
- Comunidade validada de técnicos.

---

# 19. Frase de posicionamento do produto

Sugestões:

## Opção 1

> O app que transforma código de erro em diagnóstico, orçamento e serviço fechado.

## Opção 2

> Diagnóstico de ar-condicionado com IA para técnico resolver mais rápido e cobrar melhor.

## Opção 3

> Seu copiloto técnico para códigos de erro, manutenção e orçamento de ar-condicionado.

## Opção 4

> Pare de caçar erro no Google. Diagnostique, explique e orçamento em minutos.

---

# 20. Conclusão

O produto deve ser construído em cima de uma ideia simples:

**O técnico não paga por uma tabela. Ele paga por clareza, velocidade e confiança na hora do atendimento.**

A IA deve entrar como ferramenta de decisão, não como enfeite.

O app precisa ajudar o instalador a:

- errar menos;
- parecer mais profissional;
- cobrar melhor;
- explicar melhor;
- organizar histórico;
- economizar tempo;
- reduzir troca desnecessária de peça;
- transformar diagnóstico em orçamento.

Esse é o caminho para o produto deixar de ser apenas um app e virar uma ferramenta diária de trabalho.

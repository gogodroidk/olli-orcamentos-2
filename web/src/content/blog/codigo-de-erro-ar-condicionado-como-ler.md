---
titulo: "Código de erro do ar-condicionado: como ler antes de subir"
descricao: "O mesmo E4 significa oito coisas diferentes conforme a marca. As famílias de código, o que checar em cada uma e por que resetar antes de achar a causa custa caro."
categoria: tecnico
oficio: refrigeracao
publicadoEm: 2026-07-18
---

O cliente manda a foto do display: **E4**. Você já está no carro. A pergunta certa não é "o que é E4" — é "E4 de qual marca, de qual família de produto".

Nós mantemos uma base de **698 códigos de erro** de 23 fabricantes de climatização, montada a partir de manuais de serviço e boletins técnicos. Ela é usada dentro do aplicativo da OLLI, e serve bem para mostrar o problema. Veja o que "E4" significa, dependendo de quem fabricou o aparelho:

| Marca / família | O que E4 indica |
|---|---|
| Daikin (VRV/SkyAir) | Atuação de baixa pressão |
| Gree (Cassete/Piso-teto Inverter) | Alta temperatura de descarga do compressor |
| Midea / Springer (Liva, Xtreme, AG) | Sensor de temperatura ambiente interno (T1) |
| Carrier (40MAQ) | Sensor de temperatura ambiente interno aberto ou em curto |
| Consul (Hi Wall Inverter) | Motor da unidade interna com problema |
| Trane (U-Match Inverter) | Erro de EEPROM interna |
| Philco (Inverter M9 e equivalentes) | Falha de partida do compressor |
| TCL (Split / Piso-teto Inverter) | Falha de comunicação entre a placa de potência externa e o módulo IPM |
| York (Wall Mounted) | Erro no sensor da serpentina externa |
| Agratto (ICS HW Inverter Neo) | Ventilador interno |

Dez fabricantes, oito problemas completamente diferentes — de sensor barato a compressor. Quem sai de casa com uma peça na mão porque "E4 é sensor" acerta às vezes, e nas outras volta.

O mesmo vale para o E1: na Gree é **proteção de alta pressão**; na York e na linha Midea/Springer/Carrier é **falha de comunicação**; na Trane, na TCL e na Agratto é **sensor de temperatura ambiente**; na Daikin é **falha na placa da unidade externa**. Quatro caminhos de diagnóstico, um código só.

## O que um código de erro é de verdade

Um código não é um diagnóstico. É o registro de que **uma proteção atuou** ou de que **uma leitura saiu da faixa esperada**. Ele diz onde a máquina percebeu o problema, não onde o problema nasceu.

Isso muda tudo na ordem do atendimento. "Proteção de alta pressão" não significa "trocar o pressostato" — significa que a pressão de alta chegou ao limite, e as causas possíveis são condensadora suja, ventilador externo parado, excesso de carga, obstrução no circuito ou sensor mentindo. O pressostato é o que **avisou**; ele costuma ser o único componente inocente da lista.

Trocar o componente que o código nomeia é o erro mais caro do ramo, porque ele resolve na primeira semana e volta na terceira.

## As seis famílias de código

Classificados por natureza, os 698 códigos da nossa base se distribuem quase todos em seis famílias. Reconhecer a família antes de sair de casa já define quais ferramentas você leva.

### 1. Sensor / termistor — a maior família de todas

Quase 200 dos 698 códigos são sensor: ambiente interno (T1), serpentina do evaporador (T2), serpentina do condensador (T3), descarga do compressor, sucção. O código costuma distinguir **aberto** de **em curto**, e isso é informação, não detalhe.

O que checar, nesta ordem: conector e chicote (é onde está a maioria dos casos — mau contato, oxidação, cabo roído, sensor fora da posição), depois a resistência do termistor comparada à tabela do manual naquela temperatura, e só então a placa.

Leve o multímetro e a tabela de resistência. É a família mais barata de resolver e a que mais gera troca desnecessária de placa.

### 2. Comunicação / controle — cerca de 90 códigos

Evaporadora e condensadora não estão se falando; ou o controle cabeado não fala com a interna; ou, em VRF, há endereço duplicado.

Ordem de verificação: alimentação nas duas unidades, aperto dos bornes, continuidade do cabo de comunicação, polaridade e inversão de fios, aterramento, e — em sistemas multi — endereçamento. Em instalação recente, comunicação quase sempre é **serviço de instalação mal feito**, não peça defeituosa. Em instalação antiga, costuma ser cabo com emenda ruim, umidade no borne ou roedor.

### 3. Circuito frigorífico — cerca de 100 códigos

Alta pressão, baixa pressão, anticongelamento, alta temperatura de descarga, sobrecarga do compressor. É a família em que o código está mais longe da causa.

Aqui não se avança no olho: precisa de manifold, termômetro de contato e a leitura de **superaquecimento e subresfriamento**. São essas duas contas que separam falta de carga de restrição no circuito, de sujeira de troca, de válvula de expansão com problema. Sem elas, completar gás é chute — e completar gás num sistema com vazamento é jogar dinheiro no telhado do cliente, duas vezes: o gás e a segunda visita.

### 4. Ventilação / motor — cerca de 70 códigos

Motor travado, velocidade fora da faixa, tacômetro sem sinal, alta temperatura no motor interno.

Cheque o óbvio primeiro: turbina travada por sujeira ou objeto, rolamento, folga. Depois capacitor (em motores que usam), conector, tensão de alimentação. Motor de ventilador interno em split moderno é DC com realimentação — o "erro de velocidade" pode ser o motor, o conector do tacômetro ou a placa, e nessa ordem de probabilidade.

### 5. Proteção elétrica / inverter / compressor — cerca de 110 códigos

Sobrecorrente no IPM, falha de partida do compressor, proteção do módulo, subtensão e sobretensão.

Antes de condenar módulo ou compressor: meça a tensão da rede **com o aparelho tentando partir**, não em repouso. Muita "falha de inverter" em periferia urbana é queda de tensão da instalação do cliente. Depois, isolamento do compressor contra a carcaça e resistência entre os enrolamentos. Módulo IPM é caro; compressor é mais caro ainda. Nenhum dos dois se troca por eliminação.

### 6. Placa / EEPROM / configuração — cerca de 40 códigos

Dados corrompidos, EEPROM, jumper ou capacidade configurada errada, combinação incorreta entre unidades.

Erro de configuração é comum depois de troca de placa e em instalação nova de multi-split: capacidade, endereço e jumper precisam bater. Vale conferir antes de pedir peça.

Sobram algumas dezenas de códigos de **dreno e condensado** — sensor de nível de bandeja em cassete e piso-teto — que costumam ser simplesmente dreno obstruído ou bomba de condensado com problema. Barato, comum, e frequentemente confundido com vazamento de gás pelo cliente.

## O reset: o erro que transforma uma visita em três

Resetar apaga o código. Não apaga a causa.

Existe um uso legítimo do reset: **depois** de identificar e corrigir a causa, para confirmar que o sistema volta a operar e que o erro não retorna. O manual da Fujitsu para VRF, por exemplo, documenta procedimento específico de reset de código — e ele vem no fim do fluxograma, não no começo.

O uso ilegítimo é chegar, resetar, ver o aparelho ligar, cobrar a visita e ir embora. O código volta em dias, o cliente conclui que você não resolveu, e a segunda visita sai do seu bolso.

Regra prática: **antes de resetar, registre**. Foto do display com o código, foto da etiqueta com modelo e número de série, e as leituras que você já fez. Se o código voltar, você começa a segunda visita do ponto onde parou, e não do zero.

## O procedimento que evita a segunda visita

1. **Peça a foto da etiqueta**, não só a do display. Modelo exato e número de série. O código depende da família de produto, não só da marca — a mesma Gree tem tabelas diferentes entre a linha U-Match e a G-Prime Inverter Compact.
2. **Confirme o código no manual daquele modelo.** Tabela genérica de internet serve para se preparar, não para decidir troca de peça.
3. **Identifique a família** (as seis acima) e separe as ferramentas dessa família antes de sair.
4. **Pergunte o histórico ao cliente**: quando começou, acontece em que horário, com que temperatura externa, é intermitente ou fixo, houve queda de energia, houve serviço recente de outro técnico. Código intermitente que aparece só à tarde, no calor, tem sinônimo: troca térmica.
5. **Meça antes de trocar.** Termistor com multímetro, circuito com manifold e superaquecimento/subresfriamento, elétrica com o aparelho sob carga.
6. **Corrija, aí resete, e observe operando** por tempo suficiente para o erro ter chance de voltar.
7. **Registre na ordem de serviço** o código, a causa encontrada e o que foi feito. Se o cliente chamar de novo em dois meses, esse registro é a diferença entre garantia e prejuízo.

## Uma palavra sobre a confiabilidade das tabelas

Ninguém deveria confiar cegamente numa tabela de códigos, inclusive na nossa. Fabricantes reaproveitam código entre linhas, mudam significado entre gerações e publicam manuais regionais diferentes. Por isso a nossa base guarda, para cada código, **a fonte de onde ele veio e um grau de confiança** — e por que a orientação, em todos os casos de alta severidade, termina em "confirme no manual do modelo instalado".

Uma tabela de códigos é um atalho para chegar na hipótese certa mais rápido. Ela não substitui o manual e não substitui a medição.

## Onde a OLLI entra

Dentro do aplicativo da OLLI, a consulta a esses 698 códigos fica na mão do técnico, com marca, família, causa provável e ação sugerida — e existe também um diagnóstico com IA **por sintoma**, para o caso muito mais comum em que o cliente não tem código nenhum, só um "não gela" ou "está pingando".

E há o motivo prático de isso viver no mesmo lugar que o resto: identificado o defeito, o item já vira orçamento, o orçamento vira ordem de serviço e recibo, e o histórico fica preso ao equipamento — de modo que a próxima visita àquela máquina começa sabendo o que aconteceu na anterior.

O que a OLLI não faz: não lê o aparelho, não conecta em gateway de fabricante e não substitui o manual de serviço.

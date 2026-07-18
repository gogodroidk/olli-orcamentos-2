# SCREENSHOTS — roteiro de captura (Google Play, celular)

> **Eu não capturei estas telas.** Capturar exige o app rodando com uma conta povoada, e isso não
> cabia nesta leva. O que está aqui é o roteiro executável: quais telas, em que ordem, com que dado
> de exemplo, o comando exato de captura e o script que transforma o print cru na imagem que a Play
> aceita. A próxima leva executa sem precisar decidir nada.

---

## 0. A regra que reprova o upload antes de qualquer coisa

Requisitos oficiais (Play Console Help, jul/2026):

| Item | Regra |
| --- | --- |
| Quantidade | mínimo **2**, máximo **8** por tipo de aparelho |
| Formato | **JPEG ou PNG 24-bit, SEM alpha** |
| Dimensão | menor lado ≥ **320px**, maior lado ≤ **3840px** |
| Regra do dobro | o maior lado **não pode passar do dobro** do menor |
| Proporção | entre **16:9** e **9:16** |
| Para destaque | **≥ 4** capturas com ≥ 1080px — abaixo disso o app perde elegibilidade a formatos de recomendação da Play |

### ⚠️ O emulador deste projeto REPROVA se você subir o print cru

`olli_phone` é **1080x2400** (medido em `~/.android/avd/olli_phone.avd/config.ini`). Esse PNG quebra
**duas** regras de uma vez — conferido com conta, não de cabeça:

```
proporção 1080/2400 = 0,4500   →  mais alto que 9:16 (0,5625)   ✗
maior ≤ 2x menor?   2400 > 2160 (2 x 1080)                      ✗
```

Por isso **não suba o print cru**. O `montar-screenshots.js` (passo 3) resolve os dois de uma vez
montando a captura numa tela **1080x1920** — 9:16 exato, e 1920 ≤ 2160. Ele não corta a captura
(cortar comeria a barra de status e o print deixaria de ser o app real): reduz e monta sobre o fundo
de marca, com a legenda em cima.

---

## 1. Antes de capturar: a conta de exemplo

**Nunca capture com dado real de cliente.** Além de LGPD, um nome real numa screenshot pública é
constrangimento garantido. Use a conta demo que já existe (`demo@grtech.com.br`, ver memória
`olli-conta-demo-grtech`) **ou** cadastre estes dados fictícios — pensados para parecerem reais
(nome comum, valor plausível, endereço genérico), porque cliente "João Teste / R$ 1,00" faz a loja
parecer abandonada:

| Campo | Valor sugerido |
| --- | --- |
| Empresa | `Clima Norte Refrigeração` · logo e cor da empresa configuradas (é o que prova o white-label) |
| Cliente 1 | `Marcos Ribeiro` — Rua das Acácias, 128 — (62) 9xxxx-xxxx |
| Cliente 2 | `Padaria Pão de Ouro` — Av. Central, 940 |
| Cliente 3 | `Condomínio Vila Real` |
| Serviço 1 | `Limpeza completa de split 12.000 BTU` — R$ 180,00 |
| Serviço 2 | `Recarga de gás R410A` — R$ 320,00 |
| Serviço 3 | `Instalação de split 9.000 BTU` — R$ 450,00 |
| Orçamento aberto | 3 itens, total **R$ 950,00** |
| Orçamento aprovado e não pago | **R$ 800,00**, parado há **12 dias** (alimenta a tela 07) |
| Equipamento | `Split Springer 12.000 — Sala` com etiqueta QR |

> Telefone com `9xxxx` de propósito: número completo em screenshot pública vira ligação de verdade
> para um estranho.

**Tema:** use o **tema escuro**, que é o padrão do app (`userInterfaceStyle: "dark"` no `app.json`).
Screenshot que não bate com o app instalado é motivo clássico de avaliação ruim.

---

## 2. As 8 telas, na ordem da loja

A ordem importa: a Play mostra as 2~3 primeiras na listagem de busca, e a maioria das pessoas nunca
rola. Por isso as três primeiras contam a promessa inteira (monta → dita → envia) e o resto
aprofunda.

| # | Tela (arquivo) | Como chegar | O que precisa estar visível | Legenda (já no script) |
| --- | --- | --- | --- | --- |
| 01 | `HomeScreen.tsx` | abrir o app logado | Saudação + o painel do dinheiro parado com **R$ 800** e "há 12 dias" | Orçamento pronto / ainda na casa do cliente |
| 02 | `OlliVozScreen.tsx` | aba Orçar → ditar por voz | Estado de escuta + o texto já virando itens | Fale o serviço. / A Olli monta o orçamento |
| 03 | `VisualizarOrcamentoScreen.tsx` | abrir o orçamento de R$ 950 → pré-visualizar PDF | PDF **com a logo e a cor** da Clima Norte | PDF com a sua marca, / enviado pelo WhatsApp |
| 04 | `AssinaturaClienteModal.tsx` | orçamento → colher assinatura | Área de assinatura **com um rabisco já feito** | O cliente assina / no seu celular |
| 05 | `EmitirReciboScreen.tsx` | orçamento aprovado → emitir recibo | Recibo preenchido, valor legível | Recibo e ordem de serviço / em um toque |
| 06 | `CodigosErroScreen.tsx` | Ferramentas → códigos de erro | Busca com resultado aberto (ex.: `E5`), causa provável visível | Quase 700 códigos de erro / que abrem sem internet |
| 07 | `HomeScreen.tsx` (painel) ou `OrcamentosScreen.tsx` | Home, painel do dinheiro parado | Valor + dias parados + botão de cobrar no WhatsApp | O que já foi aprovado / e ainda não foi pago |
| 08 | `ContaScreen.tsx` → Ferramentas / `FerramentasOficioScreen.tsx` | Conta → ferramentas do ofício | Grade de ferramentas do ofício (BTU, carga de gás, PMOC, QR) | As ferramentas / do seu ofício |

**Se der para capturar só 4** (mínimo recomendado para os formatos de destaque): 01, 03, 04, 06 —
promessa, entrega com marca, diferencial da assinatura, e o offline.

> As legendas acima **já estão no `montar-screenshots.js`**, casadas pelo prefixo `01`…`08`. Para
> mudar o texto, edite a constante `LEGENDAS` lá, não o nome do arquivo.

---

## 3. Como capturar — comandos exatos

`adb` não está no PATH desta máquina (verificado); está no SDK. Defina uma vez por terminal:

```bash
export ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
export EMU="$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe"
```

### 3.1 Subir o emulador e instalar o app

```bash
"$EMU" -list-avds                 # confirma que "olli_phone" está lá
"$EMU" -avd olli_phone &          # sobe o emulador
"$ADB" wait-for-device
"$ADB" install -r caminho/para/olli.apk
```

> ⚠️ O APK de `preview`/`production` do EAS é o que deve ser capturado — é o que o usuário instala.
> Não capture do `expo start` em modo dev: a barra de debug e as fontes de dev aparecem no print.

### 3.2 Capturar cada tela

Navegue até a tela no emulador e rode, uma por vez:

```bash
"$ADB" exec-out screencap -p > assets/loja/screenshots/brutas/01-home.png
"$ADB" exec-out screencap -p > assets/loja/screenshots/brutas/02-voz.png
# ... e assim por diante, até 08
```

O nome depois do número é livre — o script casa só pelo **prefixo de 2 dígitos**.

> `exec-out` e não `shell`: no Windows, `adb shell screencap` corrompe o PNG (o shell converte
> `\n` em `\r\n` no meio do binário). `exec-out` passa o binário intacto.

**Esconda a barra de notificação bagunçada** (relógio aleatório, ícones de debug) com o demo mode do
Android — deixa 100% de bateria, sinal cheio e 12:00 fixo, que é o que apps profissionais fazem:

```bash
"$ADB" shell settings put global sysui_demo_allowed 1
"$ADB" shell am broadcast -a com.android.systemui.demo -e command enter
"$ADB" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1200
"$ADB" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
"$ADB" shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
# ao terminar:
"$ADB" shell am broadcast -a com.android.systemui.demo -e command exit
```

### 3.3 Montar as finais

```bash
node assets/loja/montar-screenshots.js
```

Saída em `assets/loja/screenshots/NN-*.png`, já **1080x1920, 24-bit, sem alpha**. O script confere
cada arquivo e imprime `OK` ou `X` por linha — se aparecer `X`, **não suba**, o arquivo está fora de
especificação.

### 3.4 Alternativa sem emulador (web)

O app roda em react-native-web (`npm run web`). Dá para capturar pelo navegador em viewport de
celular — e já existe `scripts/qa-web.mjs` (Playwright) navegando as telas. **Mas confira antes se a
tela capturada é idêntica à do APK**: algumas superfícies têm caminho `.web.tsx` próprio
(ex.: `LandingScreen.web.tsx`), e print de uma tela que só existe na web é propaganda enganosa.
O emulador é o caminho seguro.

---

## 4. Conferência final antes de subir

- [ ] Entre 2 e 8 arquivos (o ideal é 4 a 8)
- [ ] Todos `1080x1920`, sem alpha — o script imprime isso; leia a saída
- [ ] **Nenhum dado real de cliente** em nenhuma imagem (nome, telefone completo, endereço, CPF/CNPJ)
- [ ] Nenhum valor absurdo ou texto de placeholder tipo "asdasd" / "Teste 123"
- [ ] Tema escuro, coerente com o app instalado
- [ ] Barra de status limpa (demo mode)
- [ ] As legendas dizem a verdade sobre o que a tela mostra
- [ ] Nada de moldura de iPhone num app Android, e nada de "baixe agora" escrito na imagem

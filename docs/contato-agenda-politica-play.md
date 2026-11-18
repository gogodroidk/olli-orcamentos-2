# Contato da agenda em 1 toque — política Play e LGPD (I-0045 / I-0053, D-2030)

## ATUALIZAÇÃO D-2245 (18/11/2026) — a importação da agenda declara `READ_CONTACTS`
Decisão do CTO: o botão **"Importar dos contatos"** (Clientes > Importar) lê nome e telefone da agenda inteira para o
prestador marcar quem vira cliente. Por isso, a partir deste PR:
- **`READ_CONTACTS` entra no app** (plugin `expo-contacts` em `app.json`, texto do iOS `NSContactsUsageDescription`
  em português). A permissão é pedida **só ao tocar em "Ler meus contatos"**, depois de 1 frase na tela.
- **`WRITE_CONTACTS` continua bloqueada** (`blockedPermissions`): o app só lê. Teste `test:contatos-celular` reprova se voltar.
- O seletor de 1 contato (abaixo) segue sem listar a agenda; com `READ_CONTACTS` concedida o risco aberto abaixo some
  (a leitura do contato escolhido passa a ter permissão). Quem negar a agenda cai nesse seletor, no .vcf e no cadastro à mão.
- **Para o Play Console (TECH):** declarar `READ_CONTACTS` no formulário de permissões restritas (função principal:
  trazer clientes da agenda do celular) e atualizar "Segurança dos dados" (contatos escolhidos pelo usuário viram clientes;
  nada sobe sem o usuário marcar e confirmar) e a política de privacidade. Aviso da Play: apps com alvo Android 17 (API 37)
  só mantêm `READ_CONTACTS` se o Contact Picker não bastar — a importação em lote é o argumento.

## O que o app faz
Botão **"Escolher da agenda"** no cadastro de cliente (novo orçamento e Clientes). Abre o **seletor nativo do sistema**
(`Contact.presentPicker()` do expo-contacts); o usuário toca em UM contato; o app lê **nome, telefone e e-mail** só
desse contato e preenche o formulário. O usuário revisa e salva (ou não).

- Não lista, não varre e não importa a agenda (sem `getAll`, `getContactsAsync`, `hasAny`).
- Não pede permissão de contatos em tempo de execução (sem `requestPermissionsAsync`).
- `READ_CONTACTS` e `WRITE_CONTACTS` ficam em `blockedPermissions` no `app.json`; o plugin do expo-contacts
  **não** entra em `plugins` (ele as injetaria no manifesto).
- Nada é enviado a servidor por esse fluxo. Só vai à nuvem (sync) o que o usuário **salvar** no cliente, como
  qualquer outro cadastro dele.

## Política Google Play (fontes oficiais, conferidas em 13/11/2026)
- Central de Ajuda Play, "Understanding restricted permissions with minimum scope alternatives" (Contacts permission):
  https://support.google.com/googleplay/android-developer/answer/16935362 — desde abril/2026, apps com alvo Android 17
  (API 37+) só podem pedir `READ_CONTACTS` se o **Contact Picker** não bastar para a função principal; apps com a
  permissão recebem em setembro/2026 o formulário de declaração no Play Console (explicar por que o picker não basta).
- Android Developers, Contact Picker (Android 17), alternativa sem a permissão ampla:
  https://developer.android.com/about/versions/17/features/contact-picker
- Blog Android Developers, "A more reliable way to add and edit contacts on Android":
  https://developer.android.com/blog/posts/reliable-way-to-add-and-edit-contacts-android — "Pick a contact: use the Contact Picker… needs no permission".

**Leitura:** o OLLI só precisa de UM contato escolhido pelo usuário = caso do picker. Por isso o app **não declara**
`READ_CONTACTS`, não cai na declaração do Play Console e não muda a seção "Segurança dos dados" além de e-mail/telefone
do cliente, que o app já coleta.

## RISCO ABERTO (precisa de prova no aparelho)
O `presentPicker` do expo-contacts 57 usa `ACTION_PICK`, mas depois lê o contato por consulta à tabela de dados.
Em Android sem `READ_CONTACTS` essa leitura pode ser recusada pelo sistema (o grant temporário do picker cobre a URI
devolvida, não a consulta). O código trata isso: mostra aviso e o usuário digita (nenhum crash, nenhum dado perdido).
**Teste obrigatório antes de publicar:** build de desenvolvimento num Android real, tocar em "Escolher da agenda" e
confirmar que nome/telefone aparecem. Se falhar, caminhos (decisão do Igor):
1. módulo nativo mínimo com `ACTION_PICK` em `Phone.CONTENT_URI` (grant temporário cobre a linha escolhida; sem permissão);
2. no Android 17+, `ACTION_PICK_CONTACTS` (Contact Picker novo);
3. último caso: declarar `READ_CONTACTS` + formulário de declaração no Play Console (aceita risco de revisão).

## LGPD
- Base: consentimento do próprio usuário por ato inequívoco (tocar e escolher). Finalidade única: cadastrar o cliente.
- Minimização: só nome, telefone e e-mail do contato escolhido; endereço, foto, aniversário, notas etc. nunca são lidos.
- O prestador é quem decide salvar; o e-mail é opcional (campo novo `clientes.email`, migration
  `20261113120000_clientes_email.sql`, escrita e **não aplicada**).

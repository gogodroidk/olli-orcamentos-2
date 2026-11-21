# Ligar para a OLLI

Página de voz ao vivo para o Igor falar com a assistente de IA da OLLI e enviar recados aos líderes pelo Gemini Live. A assistente identifica que é IA e se dirige ao Igor.

O navegador abre a ligação em `/ligar/`. O servidor entrega um token efêmero de uso único com a persona, a voz e as duas ferramentas travadas.

- `estado_empresa()` consulta contagens internas de fila, decisões e mensagens. As contagens vão entre marcas de dado não confiável. Os textos e rótulos livres ficam no servidor para impedir que uma mensagem copiada vire recado.
- `mandar_recado(destino, texto)` prepara um recado para Salomão, Maquiavel, Camila, Bruno, Diego, Rafael, Helena ou Marina. O servidor resolve os nomes falados para os terminais da lista fechada.

## Confirmação e resposta

A assistente lê “Recado para a Camila: … Confirma?”. O cartão mostra o mesmo destinatário e texto. A confirmação é por voz ou pelo botão **Confirmar envio**. O servidor vincula o token de três minutos à identidade da sessão, à ligação, ao texto e ao destino. Um novo recado substitui o anterior. Alterar o destino invalida o token antigo. A leitura precisa repetir a frase completa. A espera de 700 ms começa ao terminar a reprodução. Se a leitura sair diferente, peça para repetir ou confirme pela tela.

Quando o servidor valida a identidade do Igor no Access, o recado recebe o rótulo `via Access` e a confirmação atribuída ao Igor. Em loopback, o envio é informativo e recebe o rótulo `via local, não verificado`. Para executar um pedido recebido por essa via, o líder precisa confirmar com Igor pelo canal autorizado.

O servidor entrega o recado confirmado com `hibernar.mjs ask`. Igor pode conversar enquanto espera. A resposta é lida pela linha `R-Lnnnnnnnn: ...` do retorno ou pelo arquivo da ligação `~/.olli-ligar/respostas/Lnnnnnnnn.txt`. A assistente anuncia o líder e pode ler frases operacionais da lista apresentada no próprio recado. Se chegar texto livre, ela informa que o líder respondeu e aponta para o terminal. Os detalhes ficam no canal em que o líder respondeu.

## Acesso, privacidade e limite de cota

- O acesso remoto a `/ligar/` exige o JWT do Cloudflare Access do Igor. O servidor revalida o token e a identidade da ligação para preparar, confirmar e consultar cada recado. O processo escuta em loopback.
- O servidor lê a chave somente de `GEMINI_API_KEY_TTS`. O subprocesso de entrega recebe os argumentos fixos do `ask` e as variáveis mínimas de funcionamento. A confirmação e a resposta usam o servidor da ligação e os terminais da equipe.
- O microfone envia áudio diretamente ao Gemini durante a ligação. Use somente assuntos internos e deixe nome, telefone, documento e valor de cliente no canal interno. O servidor envia contagens no estado e restringe a fala de respostas de líderes a frases operacionais predefinidas.
- Quando o Gemini sinaliza limite de uso, o usuário vê uma mensagem e pode tocar em **Ligar** novamente mais tarde. A tentativa encerra ao receber 429.
- O botão de pânico é o arquivo `~/.olli-ligar/desligado`. Os registros da ligação guardam eventos e métricas, como tempo de chamada e uso estimado, sem gravar o áudio ou o texto do recado.

## Testes locais

Com as dependências da raiz instaladas e o Chromium do Playwright presente:

```bash
node --test ops/ligar-salomao/teste.mjs
node ops/ligar-salomao/teste-navegador.mjs
bash scripts/ci-local.sh
```

Os testes usam a aplicação em loopback com Gemini, Access e Maestri simulados. O ensaio de 30 segundos com a versão candidata no Access fica para depois da revisão do LIVRE e do rollout autorizado. Guarde o horário, o resultado e a duração, sem registrar áudio, conteúdo do recado ou credenciais.

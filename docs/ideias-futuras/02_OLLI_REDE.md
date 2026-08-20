# Olli Rede

## Problema

Prestadores frequentemente precisam de outros prestadores.

Exemplos:

- empresa de ar-condicionado precisa de eletricista;
- pintor precisa de gesseiro;
- pedreiro precisa de encanador;
- instalador precisa de ajudante;
- prestador recebe serviço fora de sua região;
- profissional está lotado e quer repassar o cliente.

Hoje isso acontece em grupos de WhatsApp, indicações informais e tentativa e erro.

## Solução

Criar uma rede operacional entre usuários Olli.

### Funções

- procurar prestadores por profissão;
- filtrar por raio;
- disponibilidade;
- atendimento residencial/comercial;
- especialidades;
- reputação;
- trabalhos verificados;
- parceiros favoritos;
- solicitação urgente;
- repasse de serviço;
- pedido de ajudante;
- indicação;
- convite para entrar no Olli.

## Fluxo: preciso de profissional

1. usuário descreve a necessidade;
2. IA classifica profissão e urgência;
3. PostGIS encontra profissionais próximos;
4. sistema ranqueia;
5. envia push/WhatsApp apenas aos elegíveis;
6. profissionais demonstram interesse;
7. solicitante escolhe;
8. serviço pode virar OS;
9. ambos se avaliam.

## Fluxo: passar serviço

1. prestador recebe demanda;
2. não consegue atender;
3. toca em `Passar serviço`;
4. define local, categoria, urgência e observações;
5. Olli encontra parceiros;
6. interessado aceita;
7. origem da indicação fica registrada.

## Diferencial

Não ser apenas um marketplace de consumidor.

O Olli Rede começa **prestador → prestador**, aproveitando a base que já usa o sistema para trabalhar.

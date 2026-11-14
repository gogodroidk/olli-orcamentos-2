# Visões do menu da Central. Idempotente. Não imprime conversa nem segredo.
# Roda dentro do container: rails runner visoes.rb
acc = Account.find(2)
visoes = [
  {
    name: 'Precisa de você',
    payload: [
      { 'attribute_key' => 'status', 'filter_operator' => 'equal_to', 'values' => ['open'], 'query_operator' => 'AND' },
      { 'attribute_key' => 'inbox_id', 'filter_operator' => 'equal_to', 'values' => %w[2 3 4], 'query_operator' => nil }
    ]
  },
  {
    name: 'Leads quentes',
    payload: [
      { 'attribute_key' => 'labels', 'filter_operator' => 'equal_to', 'values' => ['lead-quente'], 'query_operator' => 'AND' },
      { 'attribute_key' => 'status', 'filter_operator' => 'not_equal_to', 'values' => ['resolved'], 'query_operator' => nil }
    ]
  },
  {
    name: 'Clientes antigos GR Tech',
    payload: [
      { 'attribute_key' => 'labels', 'filter_operator' => 'equal_to', 'values' => ['cliente-antigo'], 'query_operator' => 'AND' },
      { 'attribute_key' => 'inbox_id', 'filter_operator' => 'equal_to', 'values' => ['2'], 'query_operator' => nil }
    ]
  },
  {
    name: 'Ativação do app',
    payload: [
      { 'attribute_key' => 'labels', 'filter_operator' => 'equal_to', 'values' => ['ativacao'], 'query_operator' => nil }
    ]
  }
]
[
  ['Funil: Novo', 'funil-novo'],
  ['Funil: Em conversa', 'funil-em-conversa'],
  ['Funil: Orçamento enviado', 'funil-orcamento-enviado'],
  ['Funil: Fechado', 'funil-fechado'],
  ['Funil: Perdido', 'funil-perdido']
].each do |nome, etapa|
  visoes << {
    name: nome,
    payload: [
      { 'attribute_key' => 'labels', 'filter_operator' => 'equal_to', 'values' => [etapa], 'query_operator' => nil }
    ]
  }
end

usuarios = acc.account_users.where(role: :administrator).pluck(:user_id)
usuarios.each do |uid|
  visoes.each do |v|
    filtro = CustomFilter.find_or_initialize_by(account_id: acc.id, user_id: uid, name: v[:name], filter_type: :conversation)
    filtro.query = { 'payload' => v[:payload] }
    filtro.save!
  end
end
puts({ usuarios: usuarios.size, visoes: CustomFilter.where(account_id: acc.id).count }.to_json)

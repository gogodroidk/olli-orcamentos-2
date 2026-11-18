# Roda dentro do contêiner rails do Chatwoot: cria/atualiza os usuários-agente (confirmados) na conta e devolve id + token.
# Entrada: env SPECS (JSON). Saída: uma linha "JSON>{...}". Senha aleatória descartada (agente entra só por token).
require 'json'
require 'securerandom'
specs = JSON.parse(ENV.fetch('SPECS'))
conta = Account.find(Integer(ENV.fetch('CONTA')))
out = {}
specs.each do |s|
  u = User.find_by(email: s['email'])
  if u.nil?
    senha = "Ag#{SecureRandom.base58(24)}9!"
    u = User.new(name: s['nome'], display_name: s['display'], email: s['email'], password: senha, password_confirmation: senha)
    u.skip_confirmation!
    u.save!
  end
  u.update!(name: s['nome'], display_name: s['display']) if u.name != s['nome'] || u.display_name != s['display']
  au = AccountUser.find_by(account_id: conta.id, user_id: u.id)
  AccountUser.create!(account_id: conta.id, user_id: u.id, role: :agent) if au.nil?
  out[s['chave']] = { 'id' => u.id, 'token' => u.access_token.token }
end
puts "JSON>#{out.to_json}"

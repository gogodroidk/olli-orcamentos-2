import { useState } from 'react';
import { Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OlliButton } from './OlliButton';
import { useCores } from '../theme';
import { escolherContatoDaAgenda, seletorDeContatoDisponivel } from '../services/contatoAgenda';
import type { ContatoEscolhido } from '../utils/contatoAgenda';

interface Props {
  /** Chamado só com um contato que tem nome E telefone aproveitável. */
  onEscolher: (contato: ContatoEscolhido) => void;
}

/**
 * "Escolher da agenda" (I-0045): abre o seletor NATIVO do celular, o usuário toca
 * em UM contato e nome/telefone/e-mail caem no cadastro. Não lê a agenda inteira.
 */
export function BotaoContatoAgenda({ onEscolher }: Props) {
  const cores = useCores();
  const [abrindo, setAbrindo] = useState(false);
  if (!seletorDeContatoDisponivel()) return null;

  async function abrir() {
    if (abrindo) return;
    setAbrindo(true);
    try {
      const r = await escolherContatoDaAgenda();
      switch (r.tipo) {
        case 'ok':
          onEscolher(r.contato);
          break;
        case 'sem_dados':
          // Preenche o que veio (o nome) e avisa do resto: nunca deixa o usuário no escuro.
          if (r.contato) onEscolher(r.contato);
          Alert.alert(
            'Contato sem telefone',
            r.contato
              ? 'Esse contato não tem um telefone com DDD. Preenchi o nome — digite o telefone.'
              : 'Não consegui ler o nome desse contato. Digite os dados do cliente.',
          );
          break;
        case 'negado':
          Alert.alert(
            'Não consegui ler o contato',
            'O celular não liberou a leitura desse contato. Digite o nome e o telefone do cliente — ou importe seus clientes por arquivo em Clientes > Importar.',
          );
          break;
        case 'cancelado':
          break;
        default:
          Alert.alert('Agenda indisponível', 'Não consegui abrir a agenda agora. Digite os dados do cliente.');
      }
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <OlliButton
      label="Escolher da agenda"
      variant="outline"
      onPress={abrir}
      loading={abrindo}
      fullWidth
      accessibilityLabel="Escolher cliente da agenda do celular"
      icon={<MaterialCommunityIcons name="contacts" size={20} color={cores.primary} />}
      style={{ marginBottom: 16 }}
    />
  );
}

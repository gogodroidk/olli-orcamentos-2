import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';
import { OlliInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
import { PressableWebState } from '../../components/web/pressableWebState';
import { saveCliente, deleteCliente } from '../../database/database';
import { useCepLookup } from '../../services/cep';
import { isValidCPF, isValidCNPJ } from '../../utils/masks';
import { generateId } from '../../utils/id';
import { nowISO } from '../../utils/date';
import { Cliente } from '../../types';
import { avisar, confirmar } from './dialogo';

interface Props {
  cliente: Cliente | null;
  visivel: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}

type Erros = { cpf?: string; cnpj?: string; telefone?: string };

/**
 * Painel lateral direito (420px) de criação/edição de cliente — usado pela
 * ClientesDesktopScreen. Mesma regra de validação/persistência da
 * ClientesScreen mobile (saveCliente/deleteCliente), só a casca de UI muda
 * (modal lateral em vez de bottom-sheet + tela cheia).
 */
export function PainelCliente({ cliente, visivel, aoFechar, aoSalvar }: Props) {
  const [form, setForm] = useState<Partial<Cliente>>({});
  const [erros, setErros] = useState<Erros>({});
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { cepLoading, onCepChange } = useCepLookup((r) => {
    setForm((p) => ({
      ...p,
      endereco: p.endereco?.trim() ? p.endereco : r.logradouro,
      cidade: r.cidade || p.cidade,
      estado: r.uf || p.estado,
    }));
  });

  const ehNovo = !cliente;

  useEffect(() => {
    if (visivel) {
      setForm(cliente ? { ...cliente } : {});
      setErros({});
    }
  }, [visivel, cliente]);

  async function handleSalvar() {
    if (!form.nome?.trim()) return;

    const proximosErros: Erros = {};
    const cpfDigits = (form.cpf ?? '').replace(/\D/g, '');
    const cnpjDigits = (form.cnpj ?? '').replace(/\D/g, '');
    const telDigits = (form.telefone ?? '').replace(/\D/g, '');
    if (cpfDigits.length > 0 && !isValidCPF(form.cpf!)) proximosErros.cpf = 'CPF inválido';
    if (cnpjDigits.length > 0 && !isValidCNPJ(form.cnpj!)) proximosErros.cnpj = 'CNPJ inválido';
    if (telDigits.length > 0 && telDigits.length < 10) proximosErros.telefone = 'Telefone incompleto (informe DDD + número)';
    if (proximosErros.cpf || proximosErros.cnpj || proximosErros.telefone) {
      setErros(proximosErros);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setErros({});

    const c: Cliente = {
      id: form.id ?? generateId(),
      nome: form.nome!,
      telefone: form.telefone ?? '',
      cpf: form.cpf, cnpj: form.cnpj,
      endereco: form.endereco, complemento: form.complemento,
      cidade: form.cidade, estado: form.estado, cep: form.cep,
      criadoEm: form.criadoEm ?? nowISO(),
    };
    setSalvando(true);
    try {
      await saveCliente(c);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      aoSalvar();
      aoFechar();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      avisar('Erro', 'Não foi possível salvar o cliente agora. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir() {
    if (!cliente) return;
    if (!confirmar('Excluir cliente', `Excluir "${cliente.nome}"? Essa ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    try {
      await deleteCliente(cliente.id);
      aoSalvar();
      aoFechar();
    } catch {
      avisar('Erro', 'Não foi possível excluir o cliente agora. Tente novamente.');
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={styles.raiz}>
        <Pressable style={styles.fundoClicavel} onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={styles.painel}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>{ehNovo ? 'Novo cliente' : 'Editar cliente'}</Text>
            <Pressable
              onPress={aoFechar}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ hovered, focused }: PressableWebState) => [styles.botaoFechar, hovered && styles.botaoFecharHover, focused && styles.focoVisivel]}
            >
              <MaterialCommunityIcons name="close" size={22} color={Colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
            <OlliInput
              label="Nome completo"
              required
              autoFocus={ehNovo}
              value={form.nome ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, nome: v }))}
              placeholder="Ex: João da Silva"
              leftIcon="account"
            />
            <OlliInput
              label="Telefone / WhatsApp"
              mask="phone"
              value={form.telefone ?? ''}
              onChangeText={(v) => { setForm((p) => ({ ...p, telefone: v })); setErros((e) => (e.telefone ? { ...e, telefone: undefined } : e)); }}
              placeholder="(11) 99999-9999"
              leftIcon="phone"
              error={erros.telefone}
            />
            <OlliInput
              label="CPF"
              mask="cpf"
              value={form.cpf ?? ''}
              onChangeText={(v) => { setForm((p) => ({ ...p, cpf: v })); setErros((e) => (e.cpf ? { ...e, cpf: undefined } : e)); }}
              placeholder="000.000.000-00"
              leftIcon="card-account-details"
              error={erros.cpf}
            />
            <OlliInput
              label="CNPJ"
              mask="cnpj"
              value={form.cnpj ?? ''}
              onChangeText={(v) => { setForm((p) => ({ ...p, cnpj: v })); setErros((e) => (e.cnpj ? { ...e, cnpj: undefined } : e)); }}
              placeholder="00.000.000/0001-00"
              leftIcon="domain"
              error={erros.cnpj}
            />
            <OlliInput
              label="Endereço"
              value={form.endereco ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, endereco: v }))}
              placeholder="Rua, número"
              leftIcon="map-marker"
            />
            <OlliInput
              label="Complemento"
              value={form.complemento ?? ''}
              onChangeText={(v) => setForm((p) => ({ ...p, complemento: v }))}
              placeholder="Apto, bloco, referência"
            />
            <View style={styles.linhaCampos}>
              <OlliInput
                label="Cidade"
                value={form.cidade ?? ''}
                onChangeText={(v) => setForm((p) => ({ ...p, cidade: v }))}
                placeholder="São Paulo"
                containerStyle={{ flex: 2, marginRight: 10 }}
              />
              <OlliInput
                label="UF"
                value={form.estado ?? ''}
                onChangeText={(v) => setForm((p) => ({ ...p, estado: v.toUpperCase().slice(0, 2) }))}
                placeholder="SP"
                autoCapitalize="characters"
                maxLength={2}
                containerStyle={{ flex: 1 }}
              />
            </View>
            <View style={styles.linhaCep}>
              <OlliInput
                label="CEP"
                mask="cep"
                value={form.cep ?? ''}
                onChangeText={(v) => onCepChange(v, (masked) => setForm((p) => ({ ...p, cep: masked })))}
                placeholder="00000-000"
                leftIcon="mailbox"
                containerStyle={{ flex: 1, marginBottom: 0 }}
              />
              {cepLoading && <ActivityIndicator size="small" color={Colors.primary} style={styles.cepSpinner} />}
            </View>
          </ScrollView>

          <View style={styles.rodape}>
            {!ehNovo && (
              <Pressable
                onPress={handleExcluir}
                disabled={excluindo}
                accessibilityRole="button"
                accessibilityLabel="Excluir cliente"
                style={({ hovered, focused }: PressableWebState) => [styles.botaoExcluir, hovered && styles.botaoExcluirHover, focused && styles.focoVisivel]}
              >
                {excluindo ? (
                  <ActivityIndicator size="small" color={Colors.danger} />
                ) : (
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.danger} />
                )}
              </Pressable>
            )}
            <OlliButton
              label="Salvar cliente"
              variant="gradient"
              size="lg"
              fullWidth
              loading={salvando}
              onPress={handleSalvar}
              disabled={!form.nome?.trim() || salvando}
              icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />}
              style={styles.botaoSalvar}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: Colors.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  raiz: {
    flex: 1,
    flexDirection: 'row',
  },
  fundoClicavel: {
    flex: 1,
    backgroundColor: 'rgba(5,12,22,0.60)',
  },
  painel: {
    width: 420,
    height: '100%',
    backgroundColor: Colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: Colors.outline,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outline,
  },
  titulo: {
    ...Typography.h3,
    color: Colors.onSurface,
  },
  botaoFechar: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoFecharHover: {
    backgroundColor: Colors.surfacePressed,
  },
  conteudo: {
    padding: Spacing.xl,
  },
  linhaCampos: {
    flexDirection: 'row',
  },
  linhaCep: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  cepSpinner: {
    marginLeft: 10,
    marginBottom: 14,
  },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.outline,
  },
  botaoExcluir: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoExcluirHover: {
    backgroundColor: Colors.dangerLight,
    borderColor: Colors.danger,
  },
  botaoSalvar: {
    flex: 1,
  },
});

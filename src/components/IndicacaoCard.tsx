/**
 * Cartão "Indique Colegas" - Spec Mínima CPO 07/10
 * 2 Momentos: (A) pós-envio orçamento, (B) pós-aprovação/pagamento via link /o/
 * Reaproveita: Celebracao, Share API, olli_attr cookie
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, Alert, Share, Clipboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCores, useEstilos, Spacing, BorderRadius } from '../theme';
import { supabase } from '../services/supabase';
import { useAuth } from '../hooks/useAuth';

interface Props {
  momento: 'apos_envio' | 'apos_aprovacao';
  onFechar: () => void;
}

export function IndicacaoCard({ momento, onFechar }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { user } = useAuth();
  const navigation = useNavigation();
  
  const [codigo, setCodigo] = useState<string>('');
  const [carregando, setCarregando] = useState(true);
  const [compartilhando, setCompartilhando] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    buscarOuGerarCodigo(user.id);
  }, [user?.id]);

  async function buscarOuGerarCodigo(indicadorId: string) {
    try {
      // Chamar worker endpoint ou RPC para criar/buscar indicação
      const { data, error } = await supabase.functions.invoke('indicacoes-criar-ou-buscar', {
        body: { indicador_id: indicadorId },
      });
      
      if (error) throw error;
      if (data?.codigo) setCodigo(data.codigo);
    } catch (e) {
      console.error('Erro ao buscar código indicação:', e);
    } finally {
      setCarregando(false);
    }
  }

  const linkIndicacao = `https://olliorcamentos.online/?ref=${codigo}`;
  
  const msgWhatsApp = `Oi! Uso o OLLI pra fazer orçamento rápido no celular. Se você também orça, testa aí: ${linkIndicacao} (ganho crédito quando você faz o 1º orçamento).`;

  const msgGenerica = `Conhece o OLLI? Faço orçamento em 2 min no celular: ${linkIndicacao} (ganho crédito quando você faz o 1º).`;

  async function compartilharWhatsApp() {
    if (!codigo) return;
    setCompartilhando(true);
    try {
      await Share.share({ message: msgWhatsApp });
      registrarEvento('indicacao_compartilhada', { canal: 'whatsapp' });
    } catch (e) {
      console.error('Erro ao compartilhar:', e);
    } finally {
      setCompartilhando(false);
    }
  }

  async function copiarLink() {
    if (!codigo) return;
    await Clipboard.setString(linkIndicacao);
    Alert.alert('Copiado!', 'Link de indicação copiado para a área de transferência.');
    registrarEvento('indicacao_compartilhada', { canal: 'copiar_link' });
  }

  async function mostrarQR() {
    if (!codigo) return;
    navigation.navigate('QRCodeIndicacao', { link: linkIndicacao, codigo });
    registrarEvento('indicacao_compartilhada', { canal: 'qr_code' });
  }

  function registrarEvento(evento: string, props: Record<string, unknown>) {
    supabase
      .from('auth_funil_eventos')
      .insert({
        evento,
        motivo: JSON.stringify({ ...props, momento, indicador_id: user?.id }),
        criado_em: new Date().toISOString(),
      })
      .then(({ error }) => { if (error) console.error('Erro evento:', error); });
  }

  // Registrar "cartão visto" no mount
  useEffect(() => {
    registrarEvento('indicacao_cartao_visto', {});
  }, [momento]);

  if (carregando) {
    return (
      <View style={styles.card}>
        <View style={styles.skeleton} />
      </View>
    );
  }

  if (!codigo) return null;

  const titulo = momento === 'apos_envio' 
    ? 'Colega que orça igual a você?' 
    : 'Cliente aprovou! Indique um colega';

  const subtitulo = momento === 'apos_envio'
    ? 'Mande seu link: quando ele fizer o 1º orçamento, você ganha créditos de IA.'
    : 'Seu cliente aprovou o orçamento. Aproveita e indica um colega — vocês dois ganham créditos.';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="account-group-outline" size={24} color={cores.primary} />
        <Text style={styles.titulo}>{titulo}</Text>
      </View>
      
      <Text style={styles.subtitulo}>{subtitulo}</Text>

      <View style={styles.linkContainer}>
        <Text style={styles.codigo}>{codigo}</Text>
        <Button 
          title="Copiar" 
          onPress={copiarLink}
          color={cores.primary}
          style={styles.botaoCopiar}
        />
      </View>

      <Text style={styles.botoesLabel}>Compartilhar:</Text>
      <View style={styles.botoes}>
        <Button
          title="WhatsApp"
          onPress={compartilharWhatsApp}
          disabled={compartilhando}
          color={cores.success}
          icon={<MaterialCommunityIcons name="whatsapp" size={18} color="#fff" />}
        />
        <Button
          title="Copiar Link"
          onPress={copiarLink}
          color={cores.primary}
          icon={<MaterialCommunityIcons name="link-variant" size={18} color="#fff" />}
        />
        <Button
          title="QR Code"
          onPress={mostrarQR}
          color={cores.accent}
          variant="outline"
          icon={<MaterialCommunityIcons name="qrcode" size={18} color={cores.accent} />}
        />
      </View>

      <Button
        title="Fechar"
        onPress={onFechar}
        variant="ghost"
        style={styles.botaoFechar}
      />
    </View>
  );
}

const criarEstilos = (cores: any) => StyleSheet.create({
  card: {
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    backgroundColor: cores.surface,
    borderWidth: 1,
    borderColor: cores.primary + '33',
  },
  skeleton: {
    height: 120,
    borderRadius: BorderRadius.md,
    backgroundColor: cores.outline + '20',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  titulo: {
    fontSize: 16,
    fontWeight: '700',
    color: cores.onSurface,
  },
  subtitulo: {
    fontSize: 13,
    color: cores.onSurfaceVariant,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: cores.surfaceVariant,
    marginBottom: Spacing.md,
  },
  codigo: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: cores.primary,
    fontFamily: 'monospace',
  },
  botaoCopiar: {
    paddingHorizontal: Spacing.md,
  },
  botoesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: cores.onSurfaceMuted,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  botoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  botaoFechar: {
    marginTop: Spacing.sm,
  },
});
/**
 * Campos da agenda por TÉCNICO e RECORRÊNCIA — usados pelo formulário do celular
 * (AgendaScreen) e do desktop (AgendaDesktopScreen), e o seletor de técnico também
 * pelo contrato recorrente. Um componente só para os dois lados não divergirem.
 *
 * Equipe em 3 estados (`useEquipeResponsaveis`): carregando → "Carregando equipe…";
 * erro → aviso + "Tentar de novo" (NUNCA "você não tem equipe"); conta pessoal → o
 * seletor some (não há de quem escolher).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../../theme';
import { OlliInput } from '../OlliInput';
import { useEquipeResponsaveis, type EstadoEquipe } from '../../hooks/useEquipeResponsaveis';
import { RECORRENCIAS_AGENDAMENTO, type RecorrenciaAgendamento } from '../../types';

const PAPEL_ROTULO: Record<string, string> = { owner: 'Dono', admin: 'Admin', gestor: 'Gestor', tecnico: 'Técnico' };

interface SeletorProps {
  responsavelId?: string;
  responsavelNome?: string;
  onChange: (r: { responsavelId?: string; responsavelNome?: string }) => void;
  /** Estado já carregado por quem chama (evita duas leituras na mesma tela). */
  equipe?: { estado: EstadoEquipe; recarregar: () => void };
  rotulo?: string;
}

export function SeletorResponsavel({ responsavelId, responsavelNome, onChange, equipe, rotulo = 'Responsável' }: SeletorProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const proprio = useEquipeResponsaveis();
  const { estado, recarregar } = equipe ?? proprio;

  if (estado.status === 'ok' && estado.semEquipe && !responsavelId) return null;

  return (
    <View style={{ marginTop: Spacing.base }}>
      <Text style={styles.label}>{rotulo}</Text>
      {estado.status === 'carregando' ? (
        <Text style={styles.ajuda}>Carregando equipe…</Text>
      ) : estado.status === 'erro' ? (
        <View style={styles.erroLinha}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={cores.warning} />
          <Text style={[styles.ajuda, { flex: 1 }]}>
            Não consegui carregar a equipe.{responsavelNome ? ` Responsável atual: ${responsavelNome}.` : ''}
          </Text>
          <TouchableOpacity onPress={recarregar} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.link}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chips}>
          <Chip ativo={!responsavelId} rotulo="Ninguém ainda" onPress={() => onChange({ responsavelId: undefined, responsavelNome: undefined })} />
          {estado.membros.map((m) => (
            <Chip
              key={m.userId}
              ativo={responsavelId === m.userId}
              rotulo={`${m.nome} · ${PAPEL_ROTULO[m.papel] ?? m.papel}`}
              onPress={() => onChange({ responsavelId: m.userId, responsavelNome: m.nome })}
            />
          ))}
          {/* Responsável que saiu da equipe continua visível (não some em silêncio). */}
          {responsavelId && !estado.membros.some((m) => m.userId === responsavelId) ? (
            <Chip ativo rotulo={`${responsavelNome || 'Membro'} · fora da equipe`} onPress={() => {}} />
          ) : null}
        </View>
      )}
    </View>
  );
}

interface RecorrenciaProps {
  recorrencia?: RecorrenciaAgendamento;
  /** 'dd/mm/aaaa' (o que o usuário digita) ou ''. */
  recorrenciaAteBR: string;
  onChange: (r: { recorrencia?: RecorrenciaAgendamento; recorrenciaAteBR?: string }) => void;
}

export function CamposRecorrencia({ recorrencia, recorrenciaAteBR, onChange }: RecorrenciaProps) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={{ marginTop: Spacing.base }}>
      <Text style={styles.label}>Repetir</Text>
      <View style={styles.chips}>
        <Chip ativo={!recorrencia} rotulo="Não repete" onPress={() => onChange({ recorrencia: undefined, recorrenciaAteBR: '' })} />
        {RECORRENCIAS_AGENDAMENTO.map((r) => (
          <Chip key={r.id} ativo={recorrencia === r.id} rotulo={r.label} onPress={() => onChange({ recorrencia: r.id })} />
        ))}
      </View>
      {recorrencia ? (
        <View style={{ marginTop: Spacing.sm }}>
          <OlliInput
            label="Repetir até (opcional)"
            value={recorrenciaAteBR}
            onChangeText={(v) => onChange({ recorrenciaAteBR: v })}
            mask="date"
            placeholder="dd/mm/aaaa"
            leftIcon="calendar-end"
            helper="Em branco = repete até você mudar. Editar ou excluir muda a série inteira."
          />
        </View>
      ) : null}
    </View>
  );
}

function Chip({ ativo, rotulo, onPress }: { ativo: boolean; rotulo: string; onPress: () => void }) {
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity
      style={[styles.chip, ativo && styles.chipAtivo]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      accessibilityLabel={rotulo}
    >
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    label: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginBottom: 8 },
    ajuda: { fontSize: 13, color: c.onSurfaceMuted },
    erroLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    link: { fontSize: 13, fontWeight: '700', color: c.accentLight },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.outline,
      backgroundColor: c.surface,
      maxWidth: '100%',
    },
    chipAtivo: { borderColor: c.accentLight, backgroundColor: c.accentLight + '1F' },
    chipTexto: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant },
    chipTextoAtivo: { color: c.accentLight },
  });

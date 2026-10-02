/**
 * Campo "Serviço externo?" da visita (Onda I1 — chuva na visita). Componente
 * ISOLADO, pronto para encaixar no formulário da Agenda (celular e desktop) e no
 * Painel da Rua. Encaixado na Agenda (celular e desktop): o valor vai para
 * `Agendamento.externa` e liga o "Remarcar por chuva" do `ClimaDaVisita`.
 *
 * TRÊS estados, de propósito: "Não sei" (undefined), "Externa" (true) e "Interna"
 * (false). "Não sei" NÃO é "interna": sem resposta, o app não pode afirmar que a
 * chuva não atrapalha — e é por isso que o padrão é "Não sei", não "Interna".
 *
 * A sugestão vem do ofício/título (`sugerirVisitaExterna` em verticais.ts) e só
 * aparece como dica com um toque para aceitar: o prestador confirma, nada é
 * marcado sozinho.
 *
 * Uso:
 *   const sugestao = sugerirVisitaExterna({ tipoVisitaId, titulo, observacao });
 *   <CampoVisitaExterna valor={form.externa} sugestao={sugestao}
 *     onChange={(externa) => setForm({ ...form, externa })} />
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { FieldLabel } from '../FieldLabel';

export interface CampoVisitaExternaProps {
  /** `undefined` = não informado (o padrão). */
  valor: boolean | undefined;
  /** Resultado de `sugerirVisitaExterna` — `true` mostra a dica; `undefined` não sugere nada. */
  sugestao?: true;
  onChange: (externa: boolean | undefined) => void;
  rotulo?: string;
}

export function CampoVisitaExterna({ valor, sugestao, onChange, rotulo = 'Serviço externo?' }: CampoVisitaExternaProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const mostrarDica = sugestao === true && valor === undefined;

  return (
    <View style={{ marginTop: Spacing.base }}>
      <FieldLabel>{rotulo}</FieldLabel>
      <View style={styles.chips} accessibilityRole="radiogroup">
        <Chip ativo={valor === undefined} rotulo="Não sei" onPress={() => onChange(undefined)} />
        <Chip ativo={valor === true} rotulo="Externa (pega chuva)" icone="weather-pouring" onPress={() => onChange(true)} />
        <Chip ativo={valor === false} rotulo="Interna" icone="home-outline" onPress={() => onChange(false)} />
      </View>
      {mostrarDica ? (
        <View style={styles.dica}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color={cores.accentLight} />
          <Text style={[styles.ajuda, { flex: 1 }]}>Pelo tipo de serviço, parece trabalho ao ar livre.</Text>
          <TouchableOpacity
            onPress={() => onChange(true)}
            accessibilityRole="button"
            accessibilityLabel="Marcar como externa"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.link}>Marcar externa</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.ajuda, { marginTop: Spacing.xs }]}>
          {/* Copy honesta: o aviso só existe quando o cliente tem localização
              (o chip de clima diz quando não tem) e a previsão sai 12h antes. */}
          {valor === true
            ? 'Com chuva forte prevista no horário (e o endereço do cliente localizado), o OLLI sugere avisar e remarcar.'
            : valor === false
              ? 'A chuva não muda esta visita.'
              : 'Sem resposta, o OLLI não sabe se a chuva atrapalha esta visita.'}
        </Text>
      )}
    </View>
  );
}

function Chip({ ativo, rotulo, icone, onPress }: { ativo: boolean; rotulo: string; icone?: React.ComponentProps<typeof MaterialCommunityIcons>['name']; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <TouchableOpacity
      style={[styles.chip, ativo && styles.chipAtivo]}
      onPress={onPress}
      activeOpacity={0.85}
      // Chip tem ~34 dp de altura: o hitSlop leva o alvo de toque a 48 dp (Android).
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
      accessibilityRole="radio"
      accessibilityState={{ selected: ativo, checked: ativo }}
      accessibilityLabel={rotulo}
    >
      {icone ? <MaterialCommunityIcons name={icone} size={14} color={ativo ? cores.accentLight : cores.onSurfaceVariant} /> : null}
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    ajuda: { fontSize: 13, color: c.onSurfaceMuted },
    link: { fontSize: 13, fontWeight: '700', color: c.accentLight },
    dica: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.xs },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
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

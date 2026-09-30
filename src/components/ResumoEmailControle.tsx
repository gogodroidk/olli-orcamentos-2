/**
 * Peças do botão "Receber resumo diário por e-mail" que o celular (ContaScreen,
 * seção Notificações) e o desktop (ContaDesktopScreen) desenham cada um na sua
 * linha: o texto de apoio e o controle da direita. A regra dos textos mora em
 * `services/resumoEmailPreferencia.ts` (a MESMA do painel); o estado, em
 * `hooks/useResumoEmail.ts`.
 */
import React from 'react';
import { ActivityIndicator, Switch, Text, TouchableOpacity } from 'react-native';
import { useCores, comAlfa } from '../theme';
import type { SituacaoResumoEmail } from '../hooks/useResumoEmail';
import { linhaResumoEmail } from '../services/resumoEmailPreferencia';

/** Texto de apoio da linha para cada estado (erro nunca vira "desligado"). */
export function descricaoResumoEmail(situacao: SituacaoResumoEmail, erroAoSalvar: boolean): string {
  if (situacao.tipo === 'carregando') return 'Conferindo sua preferência…';
  if (situacao.tipo === 'erro') return 'Não consegui ver sua preferência agora. Nada foi alterado.';
  if (situacao.tipo === 'indisponivel') return 'Disponível quando você entra com sua conta.';
  const base = linhaResumoEmail(situacao.estado).descricao;
  return erroAoSalvar ? `Não consegui salvar agora — continua como estava. ${base}` : base;
}

export function ResumoEmailControle({
  situacao,
  salvando,
  alternar,
  recarregar,
}: {
  situacao: SituacaoResumoEmail;
  salvando: boolean;
  alternar: (ligar: boolean) => void;
  recarregar: () => void;
}) {
  const cores = useCores();
  if (situacao.tipo === 'carregando') return <ActivityIndicator size="small" color={cores.primary} />;
  if (situacao.tipo === 'erro') {
    return (
      <TouchableOpacity onPress={recarregar} accessibilityRole="button" accessibilityLabel="Tentar de novo" hitSlop={8}>
        <Text style={{ color: cores.primary, fontWeight: '700', fontSize: 13 }}>Tentar de novo</Text>
      </TouchableOpacity>
    );
  }
  if (situacao.tipo === 'indisponivel') return null;
  const linha = linhaResumoEmail(situacao.estado);
  return (
    <Switch
      value={linha.ligado}
      onValueChange={(v) => alternar(v)}
      disabled={!linha.podeAlternar || salvando}
      accessibilityLabel={linha.rotulo}
      trackColor={{ false: cores.outline, true: comAlfa(cores.primary, 0.55) }}
      thumbColor={linha.ligado ? cores.primary : cores.surface}
    />
  );
}

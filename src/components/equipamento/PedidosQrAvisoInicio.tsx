import React, { useCallback, useEffect, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import type { Equipamento } from '../../types';
import { getEquipamentos } from '../../services/equipamentos';
import { nomeDoEquipamento } from '../../services/atendimentoEquipamento';
import { PedidosQrBloco } from './PedidosQrBloco';

/**
 * Os pedidos NOVOS de orçamento pela etiqueta QR, no Início — o encaixe sugerido
 * em docs/QR_EQUIPAMENTO.md. É o mesmo `PedidosQrBloco modo="aviso"` da tela de
 * Equipamentos, com o que a Home não tem à mão: o nome de cada equipamento e o
 * token do QR, para "tocar no pedido" abrir a ficha certa.
 *
 * É AVISO, não lista: some quando não há pedido novo, quando a leitura falha ou
 * quando o servidor ainda não tem a migration (regra do próprio bloco). Se a
 * leitura LOCAL dos equipamentos falhar, o aviso continua — só o rótulo vira
 * "equipamento" e o toque abre a lista de Equipamentos (nada é afirmado a mais).
 *
 * `versao` remonta o bloco (relê os pedidos): a Home sobe o número no
 * puxar-para-atualizar, sem piscar o aviso a cada foco.
 */
export function PedidosQrAvisoInicio({
  nomeEmpresa,
  versao = 0,
  style,
}: {
  nomeEmpresa?: string;
  versao?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `versao` é o disparo de propósito (relê no puxar-para-atualizar).
  useEffect(() => {
    let vivo = true;
    getEquipamentos()
      .then((lista) => { if (vivo) setEquipamentos(lista); })
      .catch(() => { /* só o rótulo/atalho perdem precisão; o aviso continua */ });
    return () => { vivo = false; };
  }, [versao]);

  const nomePorId = useCallback((id: string) => {
    const e = equipamentos.find((x) => x.id === id);
    return e ? nomeDoEquipamento(e) : 'equipamento';
  }, [equipamentos]);

  const abrir = useCallback((id: string) => {
    const e = equipamentos.find((x) => x.id === id && !x.excluidoEm);
    if (e?.qrToken) nav.navigate('Equipamento', { abrirToken: e.qrToken });
    else nav.navigate('Equipamento');
  }, [equipamentos, nav]);

  return (
    <PedidosQrBloco
      key={versao}
      modo="aviso"
      nomeEquipamento={nomePorId}
      nomeEmpresa={nomeEmpresa}
      onAbrirEquipamento={abrir}
      style={style}
    />
  );
}

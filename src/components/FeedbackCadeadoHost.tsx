import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FeedbackCadeadoModal, type EstadoEnvioFeedback } from './FeedbackCadeadoModal';
import { usePlano } from '../hooks/usePlano';
import { getOrcamentos } from '../database/database';
import { navigationRef } from '../navigation/navigationRef';
import { statusFoiEnviado } from '../services/ativacao';
import { track, Eventos } from '../services/analytics';
import { aoCadeadoFechado, enviarMotivoCadeado, gravarEstadoFeedback, lerEstadoFeedback } from '../services/feedbackCadeado';
import { aposAgoraNao, aposMostrar, aposNaoPerguntarMais, aposResposta, decidirPopup, type EstadoFeedbackCadeado } from '../services/feedbackCadeadoRegra';
import type { OpcaoMotivo } from '../services/feedbackCadeadoCopy';
import type { Recurso } from '../services/entitlements';

/**
 * Hospeda o popup "O que faltou para você assinar o Pro?" (D-2267, spec do CPO seção A). Montado UMA vez no App.
 * Escuta "fechou o cadeado sem assinar" (tela RecursoTrancado), espera a navegação assentar e pergunta à regra pura
 * (`decidirPopup`) se pode mostrar. Nunca durante criar/enviar/pagar, antes do 1º envio ou com o plano não confirmado.
 */
const ESPERA_NAVEGACAO_MS = 700;

export function FeedbackCadeadoHost() {
  const plano = usePlano();
  const planoRef = useRef(plano);
  planoRef.current = plano;
  const [visivel, setVisivel] = useState(false);
  const [envio, setEnvio] = useState<EstadoEnvioFeedback>('ocioso');
  const recursoRef = useRef<Recurso | null>(null);
  const estadoRef = useRef<EstadoFeedbackCadeado>({});
  const ocupadoRef = useRef(false);

  const talvezMostrar = useCallback(async (recurso: Recurso) => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    try {
      const estado = await lerEstadoFeedback();
      let jaEnviou: boolean | null = null;
      try { jaEnviou = (await getOrcamentos()).some((o) => statusFoiEnviado(o.status)); } catch { jaEnviou = null; }
      const p = planoRef.current;
      const decisao = decidirPopup(estado, {
        agora: Date.now(),
        jaEnviouOrcamento: jaEnviou,
        rotaAtual: navigationRef.isReady() ? (navigationRef.getCurrentRoute()?.name ?? null) : null,
        planoConfirmadoGratis: p.confirmado && p.plano === 'gratis',
      });
      if (!decisao.mostrar) return;
      estadoRef.current = aposMostrar(estado, Date.now());
      await gravarEstadoFeedback(estadoRef.current);
      recursoRef.current = recurso;
      setEnvio('ocioso');
      setVisivel(true);
      track(Eventos.feedbackCadeadoMostrado, { recurso });
    } finally {
      ocupadoRef.current = false;
    }
  }, []);

  useEffect(() => aoCadeadoFechado((recurso) => { setTimeout(() => { void talvezMostrar(recurso); }, ESPERA_NAVEGACAO_MS); }), [talvezMostrar]);

  const fechar = useCallback(() => setVisivel(false), []);

  const enviar = useCallback(async (opcao: OpcaoMotivo, texto: string) => {
    const recurso = recursoRef.current;
    if (!recurso) return;
    setEnvio('enviando');
    const r = await enviarMotivoCadeado({ recurso, opcao, texto, plano: planoRef.current.plano });
    if (r === 'ok') {
      estadoRef.current = aposResposta(estadoRef.current, Date.now());
      await gravarEstadoFeedback(estadoRef.current);
      track(Eventos.feedbackCadeadoRespondido, { recurso, opcao });
      setEnvio('enviado');
    } else {
      setEnvio('erro'); // a resposta fica na tela; nunca vira "obrigado"
    }
  }, []);

  const agoraNao = useCallback(async () => {
    estadoRef.current = aposAgoraNao(estadoRef.current, Date.now());
    await gravarEstadoFeedback(estadoRef.current);
    track(Eventos.feedbackCadeadoDispensado, { recurso: recursoRef.current ?? undefined, tipo: 'agora_nao' });
    setVisivel(false);
  }, []);

  const naoPerguntarMais = useCallback(async () => {
    estadoRef.current = aposNaoPerguntarMais(estadoRef.current);
    await gravarEstadoFeedback(estadoRef.current);
    track(Eventos.feedbackCadeadoDispensado, { recurso: recursoRef.current ?? undefined, tipo: 'nunca_mais' });
    setVisivel(false);
  }, []);

  return <FeedbackCadeadoModal visivel={visivel} estado={envio} onEnviar={(o, t) => { void enviar(o, t); }} onAgoraNao={() => { void agoraNao(); }} onNaoPerguntarMais={() => { void naoPerguntarMais(); }} onFechar={fechar} />;
}

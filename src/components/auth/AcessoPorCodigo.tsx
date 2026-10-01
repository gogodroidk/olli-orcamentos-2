import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../../utils/haptico';
import { OlliInput } from '../OlliInput';
import { OlliButton } from '../OlliButton';
import { CampoCodigo } from './CampoCodigo';
import { Spacing, useCores, useEstilos, useGradientes, type Cores } from '../../theme';
import {
  avaliarSenha,
  classificarFalhaAcesso,
  deveVerificar,
  liberaReenvioEm,
  mensagemAguarde,
  mensagemFalhaCodigo,
  mensagemFalhaEnvio,
  resultadoDoEnvio,
  rotuloReenvio,
  ROTULO_NIVEL_SENHA,
  segundosParaReenviar,
  TAMANHO_CODIGO,
  TEXTO_CODIGO_ENVIADO,
  TEXTO_CONTA_GOOGLE,
  TEXTO_RECUPERACAO_ENVIADA,
  type EstadoCampoCodigo,
} from '../../services/acessoCodigo';
import {
  confirmarCodigoEmail,
  definirNovaSenha,
  enviarCodigoLogin,
  pedirRecuperacaoSenha,
} from '../../services/supabase';
import { SENHA_MINIMA } from '../../services/authPolicy';
import { traduzirErroAuth } from '../../utils/authErrors';

export type FluxoCodigo = 'entrar' | 'recuperar';
type Etapa = 'email' | 'codigo' | 'senha';

interface Props {
  fluxo: FluxoCodigo;
  emailInicial: string;
  /** Sessão criada (e, na recuperação, senha nova salva): segue para o app. */
  onEntrou: () => Promise<void>;
  onVoltar: () => void;
  onCriarConta: () => void;
}

/** Contagem regressiva do reenvio: re-renderiza 1x por segundo só enquanto trava. */
function useSegundosParaReenviar(liberaEm: number | null): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    setAgora(Date.now());
    if (liberaEm === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setAgora(t);
      if (t >= liberaEm) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [liberaEm]);
  return segundosParaReenviar(liberaEm, agora);
}

/**
 * "Entrar com código por e-mail" e "Esqueci a senha" no app — o mesmo trilho:
 * e-mail → código de 6 dígitos → (recuperação) senha nova. O código chega no
 * mesmo e-mail do link, então funciona mesmo se o e-mail for aberto no computador.
 *
 * Nenhuma tela aqui diz se o e-mail tem conta (ver `resultadoDoEnvio`), e todo
 * limite de envio aparece como "aguarde Xs".
 */
export function AcessoPorCodigo({ fluxo, emailInicial, onEntrou, onVoltar, onCriarConta }: Props) {
  const cores = useCores();
  const gradientes = useGradientes();
  const styles = useEstilos(criarEstilos);

  const [etapa, setEtapa] = useState<Etapa>('email');
  const [email, setEmail] = useState(emailInicial.trim());
  const [enviando, setEnviando] = useState(false);
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);
  const [liberaEm, setLiberaEm] = useState<number | null>(null);
  const segundos = useSegundosParaReenviar(liberaEm);

  const [codigo, setCodigo] = useState('');
  const [estadoCodigo, setEstadoCodigo] = useState<EstadoCampoCodigo>('digitando');
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);

  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const avaliacao = avaliarSenha(senha, SENHA_MINIMA);

  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const recuperar = fluxo === 'recuperar';
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  async function enviar() {
    if (enviando || segundos > 0) return;
    if (!emailOk) { setAvisoEnvio('Digite um e-mail válido.'); return; }
    vibrar('selecao');
    setEnviando(true);
    setAvisoEnvio(null);
    let erro: unknown = null;
    try {
      erro = (recuperar ? await pedirRecuperacaoSenha(email) : await enviarCodigoLogin(email)).error;
    } catch (e) {
      erro = e;
    }
    if (!vivo.current) return;
    const r = resultadoDoEnvio(erro);
    setLiberaEm(liberaReenvioEm(r, Date.now()));
    setEnviando(false);
    if (r.tipo === 'enviado') {
      setEtapa('codigo');
      setCodigo('');
      setEstadoCodigo('digitando');
      setErroCodigo(null);
      setAvisoEnvio(recuperar ? TEXTO_RECUPERACAO_ENVIADA : TEXTO_CODIGO_ENVIADO);
    } else if (r.tipo === 'aguarde') {
      setAvisoEnvio(mensagemAguarde(r.segundos));
    } else {
      setAvisoEnvio(mensagemFalhaEnvio(r.motivo));
    }
  }

  // Confere sozinho quando o 6º dígito entra (digitado, colado ou autopreenchido).
  // Só `codigo`/`etapa` disparam: incluir o estado reverificaria o mesmo código
  // logo depois do erro, sem a pessoa ter mexido em nada.
  // biome-ignore lint/correctness/useExhaustiveDependencies: disparo só por código/etapa (ver acima).
  useEffect(() => {
    if (etapa !== 'codigo' || !deveVerificar(codigo, estadoCodigo)) return;
    if (estadoCodigo === 'erro') return; // depois do erro, espera a pessoa mexer no código
    void verificar(codigo);
  }, [codigo, etapa]);

  function mudarCodigo(novo: string) {
    setCodigo(novo);
    if (estadoCodigo === 'erro') { setEstadoCodigo('digitando'); setErroCodigo(null); }
  }

  async function verificar(c: string) {
    setEstadoCodigo('verificando');
    setErroCodigo(null);
    let res: { ok: boolean; error: unknown };
    try {
      res = await confirmarCodigoEmail(email, c, recuperar ? 'recovery' : 'email');
    } catch (e) {
      res = { ok: false, error: e };
    }
    if (!vivo.current) return;
    if (!res.ok) {
      setEstadoCodigo('erro');
      setErroCodigo(mensagemFalhaCodigo(classificarFalhaAcesso(res.error)));
      return;
    }
    setEstadoCodigo('sucesso');
    if (recuperar) {
      setEtapa('senha');
      return;
    }
    await onEntrou();
  }

  async function salvarSenha() {
    if (salvando) return;
    if (!avaliacao.valida) { setErroSenha(avaliacao.faltas[0] ?? 'Senha inválida.'); return; }
    if (senha !== confirmar) { setErroSenha('A senha e a confirmação não são iguais.'); return; }
    setSalvando(true);
    setErroSenha(null);
    try {
      await definirNovaSenha(senha);
      vibrar('sucesso');
      await onEntrou();
    } catch (e) {
      if (!vivo.current) return;
      const { texto } = traduzirErroAuth(e);
      setErroSenha(texto);
      vibrar('erro');
    }
    if (vivo.current) setSalvando(false);
  }

  const titulo =
    etapa === 'senha' ? 'Crie sua nova senha'
    : recuperar ? 'Recuperar acesso'
    : 'Entrar com código por e-mail';

  return (
    <View>
      <TouchableOpacity
        onPress={onVoltar}
        disabled={enviando || salvando || estadoCodigo === 'verificando'}
        style={styles.voltar}
        accessibilityRole="button"
        accessibilityLabel="Voltar para entrar com senha"
      >
        <MaterialCommunityIcons name="arrow-left" size={18} color={cores.accentLight} />
        <Text style={styles.voltarTexto}>Voltar</Text>
      </TouchableOpacity>
      <Text style={styles.titulo} accessibilityRole="header">{titulo}</Text>

      {etapa === 'email' && (
        <>
          <Text style={styles.texto}>
            {recuperar
              ? `Enviamos um link e um código de ${TAMANHO_CODIGO} dígitos. Use o que for mais fácil, em qualquer aparelho.`
              : `Sem senha: enviamos um código de ${TAMANHO_CODIGO} dígitos para o seu e-mail.`}
          </Text>
          <OlliInput
            label="E-mail"
            value={email}
            onChangeText={(t) => { setEmail(t); setAvisoEnvio(null); }}
            placeholder="voce@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            leftIcon="email"
            onSubmitEditing={enviar}
          />
          <OlliButton
            label={segundos > 0 ? rotuloReenvio(segundos, recuperar ? 'Enviar' : 'Enviar código') : recuperar ? 'Enviar link e código' : 'Enviar código'}
            variant="gradient" size="lg" fullWidth loading={enviando} disabled={segundos > 0} onPress={enviar}
            icon={<MaterialCommunityIcons name="email-fast" size={20} color={gradientes.sobreBrand} />}
          />
          {!recuperar && <Text style={styles.dica}>{TEXTO_CONTA_GOOGLE}</Text>}
        </>
      )}

      {etapa === 'codigo' && (
        <>
          <Text style={styles.texto}>{avisoEnvio ?? TEXTO_CODIGO_ENVIADO}</Text>
          <Text style={styles.emailAlvo} numberOfLines={1}>{email.trim()}</Text>
          <CampoCodigo valor={codigo} onMudar={mudarCodigo} estado={estadoCodigo} erro={erroCodigo} />
          {estadoCodigo === 'erro' && (
            <OlliButton
              label="Tentar de novo" variant="outline" size="md" fullWidth
              disabled={codigo.length !== TAMANHO_CODIGO}
              onPress={() => { void verificar(codigo); }}
            />
          )}
          <View style={styles.acoes}>
            <TouchableOpacity
              onPress={enviar}
              disabled={segundos > 0 || enviando}
              accessibilityRole="button"
              accessibilityState={{ disabled: segundos > 0 || enviando }}
            >
              <Text style={[styles.link, (segundos > 0 || enviando) && styles.linkDesligado]}>
                {enviando ? 'Enviando…' : rotuloReenvio(segundos)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEtapa('email'); setCodigo(''); setEstadoCodigo('digitando'); }} accessibilityRole="button">
              <Text style={styles.link}>Trocar e-mail</Text>
            </TouchableOpacity>
          </View>
          {avisoEnvio && avisoEnvio !== TEXTO_CODIGO_ENVIADO && avisoEnvio !== TEXTO_RECUPERACAO_ENVIADA && (
            <Text style={styles.aviso} accessibilityLiveRegion="polite">{avisoEnvio}</Text>
          )}
          {!recuperar && (
            <TouchableOpacity onPress={onCriarConta} style={styles.criarConta} accessibilityRole="button">
              <Text style={styles.textoSuave}>
                Não chegou e você ainda não tem conta? <Text style={styles.link}>Criar conta</Text>
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {etapa === 'email' && avisoEnvio && (
        <Text style={styles.aviso} accessibilityLiveRegion="polite">{avisoEnvio}</Text>
      )}

      {etapa === 'senha' && (
        <>
          <Text style={styles.texto}>Código confirmado. Agora escolha a senha nova.</Text>
          <OlliInput
            label="Nova senha"
            value={senha}
            onChangeText={(t) => { setSenha(t); setErroSenha(null); }}
            placeholder={`mínimo ${SENHA_MINIMA} caracteres, com letra e número`}
            secureTextEntry={!verSenha}
            autoComplete="new-password"
            textContentType="newPassword"
            leftIcon="lock"
            rightIcon={verSenha ? 'eye-off' : 'eye'}
            onRightIconPress={() => setVerSenha((v) => !v)}
            rightIconLabel={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
          />
          {!!senha && (
            <View accessibilityLiveRegion="polite">
              <Text style={[styles.nivel, { color: avaliacao.nivel === 'forte' ? cores.success : avaliacao.nivel === 'media' ? cores.warning : cores.danger }]}>
                {ROTULO_NIVEL_SENHA[avaliacao.nivel]}
              </Text>
              {avaliacao.faltas.map((f) => <Text key={f} style={styles.falta}>• {f}</Text>)}
            </View>
          )}
          <OlliInput
            label="Confirmar nova senha"
            value={confirmar}
            onChangeText={(t) => { setConfirmar(t); setErroSenha(null); }}
            placeholder="repita a senha"
            secureTextEntry={!verSenha}
            autoComplete="new-password"
            textContentType="newPassword"
            leftIcon="lock-check"
            error={confirmar && confirmar !== senha ? 'As senhas não são iguais.' : undefined}
          />
          {erroSenha && <Text style={styles.aviso} accessibilityRole="alert">{erroSenha}</Text>}
          <OlliButton
            label="Salvar nova senha e entrar"
            variant="gradient" size="lg" fullWidth loading={salvando}
            disabled={!avaliacao.valida || senha !== confirmar}
            onPress={salvarSenha}
            icon={<MaterialCommunityIcons name="lock-reset" size={20} color={gradientes.sobreBrand} />}
          />
        </>
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
  voltarTexto: { fontSize: 14, fontWeight: '700', color: c.accentLight },
  titulo: { fontSize: 18, fontWeight: '800', color: c.onBackground, marginBottom: Spacing.sm },
  texto: { fontSize: 14, color: c.onSurfaceVariant, lineHeight: 20, marginBottom: Spacing.md },
  emailAlvo: { fontSize: 14, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
  dica: { fontSize: 12.5, color: c.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.md },
  acoes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  link: { fontSize: 14, fontWeight: '800', color: c.accentLight },
  linkDesligado: { color: c.onSurfaceMuted },
  aviso: { fontSize: 13, fontWeight: '700', color: c.onSurface, textAlign: 'center', marginTop: Spacing.md },
  criarConta: { paddingVertical: Spacing.base, alignItems: 'center' },
  textoSuave: { fontSize: 13, color: c.onSurfaceVariant, textAlign: 'center' },
  nivel: { fontSize: 13, fontWeight: '800', marginTop: -6, marginBottom: 4 },
  falta: { fontSize: 12.5, color: c.onSurfaceVariant, marginBottom: 2 },
});

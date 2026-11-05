import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vibrar } from '../utils/haptico';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import { OlliButton } from '../components/OlliButton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { aceitarConvite, buscarResumoConvite, extrairToken, rotuloPapel } from '../services/equipe';
import { recarregarTipoConta } from '../hooks/useTipoConta';
import { getCurrentUser, signInWithGoogle } from '../services/supabase';
import {
  mascararEmailConvite,
  mensagemAceiteConvite,
  podeAceitarConvite,
  type ResumoConvite,
  sessaoTemGoogle,
} from '../services/conviteGoogle';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rota = RouteProp<RootStackParamList, 'Convite'>;

type Estado =
  | { fase: 'processando' }
  | { fase: 'confirmar'; token: string }
  | { fase: 'sucesso'; nomeOrg: string; papel: string }
  | { fase: 'precisa_login'; mascarado: string }
  | { fase: 'erro'; mensagem: string };

/**
 * ConviteScreen — aceite de convite de equipe (Onda 2).
 *
 * Alcançada por deep link (olliorcamentos://convite/<token>) ou pela ContaScreen
 * (colar o código). O token vem em route.params.token. Se não houver sessão, orienta
 * o login — o token fica preservado no param para o usuário reabrir depois de logar.
 *
 * ACEITE EXPLÍCITO (auditoria de segurança 02/10, S5): abrir o link NÃO entra na
 * equipe. Um deep link `olliorcamentos://convite/<token>` pode ser tocado por engano
 * (ou plantado por quem criou um convite aberto); entrar numa equipe leva os dados
 * que a pessoa cadastrar para a empresa de outro. Por isso a tela só chama
 * `aceitar_convite(token)` (SECURITY DEFINER) no toque em "Aceitar convite"; "Recusar"
 * sai sem gravar nada em organizacao_membros.
 */
export default function ConviteScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rota>();
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const tokenParam = route.params?.token ?? '';

  const [estado, setEstado] = useState<Estado>({ fase: 'processando' });
  const [googleBusy, setGoogleBusy] = useState(false);
  const [avisoGoogle, setAvisoGoogle] = useState('');
  const resumoRef = useRef<ResumoConvite | null>(null);
  const hintRef = useRef('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const token = extrairToken(tokenParam);
      if (!token) {
        if (vivo) setEstado({ fase: 'erro', mensagem: 'Este código de convite não parece válido. Confira o link que você recebeu.' });
        return;
      }
      const resumo = await buscarResumoConvite(token);
      if (!vivo) return;
      resumoRef.current = resumo.ok ? resumo : null;
      if (!resumo.ok && resumo.erro !== 'indisponivel') {
        const codigo = resumo.erro === 'invalido' ? 'invalido' : resumo.erro;
        setEstado({ fase: 'erro', mensagem: mensagemAceiteConvite(codigo) });
        return;
      }
      const hint = resumo.ok && resumo.temEmail ? resumo.email : '';
      hintRef.current = hint;
      const user = await getCurrentUser();
      if (!vivo) return;
      if (!user) {
        setEstado({ fase: 'precisa_login', mascarado: hint ? mascararEmailConvite(hint) : '' });
        return;
      }
      // Só pergunta. Nada é gravado até o toque em "Aceitar convite".
      if (vivo) setEstado({ fase: 'confirmar', token });
    })();
    return () => { vivo = false; };
  }, [tokenParam]);

  // Trava síncrona contra toque duplo (o estado só muda no próximo render).
  const aceitandoRef = useRef(false);
  // A tela pode sair (voltar) enquanto o aceite está no servidor: nada de setState depois.
  const montadoRef = useRef(true);
  useEffect(() => () => { montadoRef.current = false; }, []);

  async function aceitar(token: string) {
    if (aceitandoRef.current) return;
    aceitandoRef.current = true;
    vibrar('selecao');
    setEstado({ fase: 'processando' });
    try {
      const resumo = resumoRef.current;
      if (resumo?.ok) {
        const user = await getCurrentUser();
        const gate = podeAceitarConvite({
          sabeEmail: true,
          temEmail: resumo.temEmail,
          emailConvite: resumo.email,
          emailConta: user?.email,
          temGoogle: sessaoTemGoogle(user),
        });
        if (!gate.ok) {
          vibrar('erro');
          if (montadoRef.current) {
            if (gate.codigo === 'outro_email' || gate.codigo === 'exige_google') {
              setAvisoGoogle(mensagemAceiteConvite(gate.codigo));
              setEstado({
                fase: 'precisa_login',
                mascarado: resumo.temEmail ? mascararEmailConvite(resumo.email) : '',
              });
            } else {
              setEstado({ fase: 'erro', mensagem: mensagemAceiteConvite(gate.codigo) });
            }
          }
          return;
        }
      }
      const org = await aceitarConvite(token);
      await recarregarTipoConta();
      if (!montadoRef.current) return;
      vibrar('sucesso');
      setEstado({ fase: 'sucesso', nomeOrg: org.nome, papel: rotuloPapel(org.papel) });
    } catch (e: any) {
      if (!montadoRef.current) return;
      vibrar('erro');
      setEstado({ fase: 'erro', mensagem: e?.message ?? 'Não consegui aceitar o convite agora.' });
    } finally {
      aceitandoRef.current = false;
    }
  }

  function recusar() {
    // irParaApp já vibra: uma vibração por toque.
    irParaApp();
  }

  function irParaApp() {
    vibrar('selecao');
    nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }

  function irParaEntrar() {
    vibrar('selecao');
    nav.reset({ index: 0, routes: [{ name: 'Entrar' }] });
  }

  async function entrarComGoogle() {
    if (googleBusy) return;
    vibrar('selecao');
    setAvisoGoogle('');
    setGoogleBusy(true);
    try {
      const res = await signInWithGoogle({ loginHint: hintRef.current });
      if (res === 'em_andamento') return;
      if (res === 'cancelado') {
        setAvisoGoogle('O login com o Google não foi concluído. Tente de novo para aceitar o convite.');
        return;
      }
      if (res !== 'ok') return;
      const token = extrairToken(tokenParam);
      const user = await getCurrentUser();
      if (!token || !user) {
        setAvisoGoogle('Não consegui confirmar a entrada. Tente de novo.');
        return;
      }
      const resumo = resumoRef.current;
      if (resumo?.ok) {
        const gate = podeAceitarConvite({
          sabeEmail: true,
          temEmail: resumo.temEmail,
          emailConvite: resumo.email,
          emailConta: user.email,
          temGoogle: sessaoTemGoogle(user),
        });
        if (!gate.ok) {
          setAvisoGoogle(mensagemAceiteConvite(gate.codigo));
          setEstado({ fase: 'precisa_login', mascarado: hintRef.current ? mascararEmailConvite(hintRef.current) : '' });
          return;
        }
      }
      setEstado({ fase: 'confirmar', token });
    } catch (e: any) {
      setAvisoGoogle(e?.message ?? 'Não foi possível entrar com o Google. Tente de novo.');
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.inner}>
        {estado.fase === 'processando' && (
          <>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="account-multiple-plus-outline" size={44} color={cores.accentLight} />
            </View>
            <Text style={styles.titulo}>Verificando o convite…</Text>
            <ActivityIndicator color={cores.accentLight} style={{ marginTop: Spacing.lg }} />
          </>
        )}

        {estado.fase === 'confirmar' && (
          <>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="account-multiple-plus-outline" size={44} color={cores.accentLight} />
            </View>
            <Text style={styles.titulo}>Entrar em uma equipe?</Text>
            <Text style={styles.sub}>
              Você recebeu um convite para fazer parte de uma equipe no OLLI. Ao aceitar, você passa a trabalhar na empresa de quem convidou e os dados que você cadastrar passam a ficar nessa equipe.
            </Text>
            <Text style={styles.sub}>Só aceite se você conhece quem enviou o convite.</Text>
            <OlliButton
              label="Aceitar convite"
              variant="gradient"
              size="lg"
              fullWidth
              onPress={() => { void aceitar(estado.token); }}
              icon={<MaterialCommunityIcons name="check" size={20} color="#fff" />}
              style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }}
            />
            <OlliButton
              label="Recusar"
              variant="outline"
              size="lg"
              fullWidth
              onPress={recusar}
              style={{ marginTop: Spacing.md, alignSelf: 'stretch' }}
            />
          </>
        )}

        {estado.fase === 'sucesso' && (
          <>
            <View style={[styles.iconWrap, styles.iconOk]}>
              <MaterialCommunityIcons name="check-circle-outline" size={48} color={cores.success} />
            </View>
            <Text style={styles.titulo}>Bem-vindo à equipe!</Text>
            <Text style={styles.sub}>
              Você agora faz parte de <Text style={styles.forte}>{estado.nomeOrg}</Text> como{' '}
              <Text style={styles.forte}>{estado.papel}</Text>.
            </Text>
            <OlliButton
              label="Começar"
              variant="gradient"
              size="lg"
              fullWidth
              onPress={irParaApp}
              icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />}
              style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }}
            />
          </>
        )}

        {estado.fase === 'precisa_login' && (
          <>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="login" size={44} color={cores.accentLight} />
            </View>
            <Text style={styles.titulo}>Entre com o Google</Text>
            <Text style={styles.sub}>
              {estado.mascarado
                ? `Use o Google da conta ${estado.mascarado}, o e-mail que recebeu este convite. Outra conta não entra na equipe.`
                : 'Entre com o Google do e-mail que recebeu o convite. Se o convite não tiver e-mail, qualquer conta sua serve.'}
            </Text>
            <OlliButton
              label="Continuar com o Google"
              variant="gradient"
              size="lg"
              fullWidth
              haptic={false}
              loading={googleBusy}
              onPress={() => { void entrarComGoogle(); }}
              icon={<MaterialCommunityIcons name="google" size={20} color="#fff" />}
              style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }}
            />
            {!estado.mascarado ? (
              <OlliButton
                label="Entrar com e-mail"
                variant="outline"
                size="lg"
                fullWidth
                disabled={googleBusy}
                onPress={irParaEntrar}
                style={{ marginTop: Spacing.md, alignSelf: 'stretch' }}
              />
            ) : null}
            {avisoGoogle ? <Text style={styles.sub}>{avisoGoogle}</Text> : null}
          </>
        )}

        {estado.fase === 'erro' && (
          <>
            <View style={[styles.iconWrap, styles.iconErro]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={44} color={cores.danger} />
            </View>
            <Text style={styles.titulo}>Convite não aceito</Text>
            <Text style={styles.sub}>{estado.mensagem}</Text>
            <OlliButton
              label="Ir para o app"
              variant="outline"
              size="lg"
              fullWidth
              onPress={irParaApp}
              style={{ marginTop: Spacing.xl, alignSelf: 'stretch' }}
            />
          </>
        )}
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  inner: { width: '100%', maxWidth: 420, alignItems: 'center' },
  iconWrap: { width: 88, height: 88, borderRadius: 28, backgroundColor: c.accentContainer, alignItems: 'center', justifyContent: 'center' },
  // Tons fixos de sucesso/erro do handoff cockpit; próximos de `successLight`/`dangerLight`
  // mas alfa/hex não batem exatamente — deixados como estão (ver rule 7 da migração).
  iconOk: { backgroundColor: 'rgba(43,215,135,0.14)' },
  iconErro: { backgroundColor: 'rgba(255,107,107,0.14)' },
  titulo: { fontSize: 24, fontWeight: '800', color: c.onBackground, marginTop: Spacing.lg, textAlign: 'center' },
  sub: { fontSize: 15, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 22, marginTop: Spacing.sm },
  forte: { color: c.accentLight, fontWeight: '800' },
});

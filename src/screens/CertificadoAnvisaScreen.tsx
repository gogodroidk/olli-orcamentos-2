import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Fonts, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliInput } from '../components/OlliInput';
import { CampoComVoz } from '../components/CampoComVoz';
import { OlliButton } from '../components/OlliButton';
import { OlliCard } from '../components/OlliCard';
import { OverlayProgresso } from '../components/OverlayProgresso';
import { getEmpresa, saveEmpresa } from '../database/database';
import { Empresa } from '../types';
import { montarHtmlCertificadoAnvisa } from '../utils/certificadoAnvisaPdf';
import { usePlano } from '../hooks/usePlano';
import { RECURSO_REMOVE_MARCA } from '../services/planos';
import { exportarHtmlComoPdf } from '../utils/exportarDocumento';
import { todayISO } from '../utils/date';
import { isoToBR } from '../utils/masks';
import { generateId } from '../utils/id';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Certificado ANVISA (dedetização) — ferramenta ÚNICA da vertical `dedetizacao`.
 * Coleta os campos da RDC 52/2009 art. 19 e gera o PDF (utils/certificadoAnvisaPdf).
 * Os dados de compliance da imunizadora (licenças + responsável técnico) são
 * salvos na empresa e reaproveitados nas próximas emissões.
 */
export default function CertificadoAnvisaScreen() {
  // D-07: Pro/Empresa não levam a marca OLLI em NENHUM documento — nem no certificado.
  const { temAcesso } = usePlano();
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [gerando, setGerando] = useState(false);

  // Compliance da imunizadora (pré-preenchido da empresa, salvo de volta).
  const [licencaSanitaria, setLicencaSanitaria] = useState('');
  const [licencaAmbiental, setLicencaAmbiental] = useState('');
  const [responsavelTecnico, setResponsavelTecnico] = useState('');
  const [rtRegistro, setRtRegistro] = useState('');

  // Serviço.
  const [clienteNome, setClienteNome] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');
  const [pragaAlvo, setPragaAlvo] = useState('');
  const [metodo, setMetodo] = useState('');
  const [dataServico, setDataServico] = useState(isoToBR(todayISO()));
  const [garantiaDias, setGarantiaDias] = useState('90');

  // Produto (composição química — exigência RDC 52).
  const [prodNome, setProdNome] = useState('');
  const [prodPrincipio, setProdPrincipio] = useState('');
  const [prodRegistro, setProdRegistro] = useState('');
  const [prodGrupo, setProdGrupo] = useState('');

  const [observacoes, setObservacoes] = useState('');

  useEffect(() => {
    getEmpresa().then((e) => {
      if (!e) return;
      setEmpresa(e);
      setLicencaSanitaria(e.licencaSanitaria ?? '');
      setLicencaAmbiental(e.licencaAmbiental ?? '');
      setResponsavelTecnico(e.responsavelTecnico ?? e.nomePrestador ?? '');
      setRtRegistro(e.responsavelTecnicoRegistro ?? '');
    });
  }, []);

  async function gerar() {
    if (!empresa) {
      Alert.alert('Cadastro incompleto', 'Cadastre sua empresa em "Meu negócio" antes de emitir o certificado.');
      return;
    }
    if (!clienteNome.trim() || !pragaAlvo.trim() || !prodNome.trim()) {
      Alert.alert('Faltam dados', 'Preencha ao menos o cliente, a praga-alvo e o produto aplicado.');
      return;
    }
    setGerando(true);
    try {
      // Persiste os dados de compliance na empresa (reaproveita na próxima emissão).
      const empAtualizada: Empresa = {
        ...empresa,
        licencaSanitaria: licencaSanitaria.trim() || undefined,
        licencaAmbiental: licencaAmbiental.trim() || undefined,
        responsavelTecnico: responsavelTecnico.trim() || undefined,
        responsavelTecnicoRegistro: rtRegistro.trim() || undefined,
      };
      await saveEmpresa(empAtualizada);
      setEmpresa(empAtualizada);

      const numero = generateId().slice(0, 8).toUpperCase();
      const html = await montarHtmlCertificadoAnvisa(
        {
          numero,
          clienteNome: clienteNome.trim(),
          clienteEndereco: clienteEndereco.trim(),
          pragaAlvo: pragaAlvo.trim(),
          metodo: metodo.trim(),
          dataServico,
          garantiaDias: Math.max(0, parseInt(garantiaDias, 10) || 0),
          produtos: [
            {
              nome: prodNome.trim(),
              principioAtivo: prodPrincipio.trim(),
              registroAnvisa: prodRegistro.trim(),
              grupoQuimico: prodGrupo.trim() || undefined,
            },
          ],
          observacoes: observacoes.trim() || undefined,
        },
        empAtualizada,
        { removerMarca: temAcesso(RECURSO_REMOVE_MARCA) },
      );
      await exportarHtmlComoPdf(html, `Certificado-${numero}`, { dialogTitle: `Certificado ${numero}` });
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não consegui gerar o certificado.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <GradientHeader
        title="Certificado ANVISA"
        subtitle="Controle de pragas · RDC 52"
        onBack={() => goBackOrHome(nav)}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.secao}>Imunizadora (salvo p/ reusar)</Text>
          <OlliCard style={styles.card}>
            <OlliInput label="Licença sanitária (nº · validade)" value={licencaSanitaria} onChangeText={setLicencaSanitaria} leftIcon="file-certificate-outline" />
            <OlliInput label="Licença ambiental (nº · validade)" value={licencaAmbiental} onChangeText={setLicencaAmbiental} leftIcon="leaf" />
            <OlliInput label="Responsável técnico" value={responsavelTecnico} onChangeText={setResponsavelTecnico} leftIcon="account-tie" />
            <OlliInput label="Registro do RT (CRQ/CRBio/CREA)" value={rtRegistro} onChangeText={setRtRegistro} leftIcon="card-account-details-outline" />
          </OlliCard>

          <Text style={styles.secao}>Serviço</Text>
          <OlliCard style={styles.card}>
            <OlliInput label="Cliente / contratante" value={clienteNome} onChangeText={setClienteNome} leftIcon="account-outline" required />
            <OlliInput label="Local tratado (endereço)" value={clienteEndereco} onChangeText={setClienteEndereco} leftIcon="map-marker-outline" />
            <OlliInput label="Pragas-alvo" value={pragaAlvo} onChangeText={setPragaAlvo} leftIcon="bug-outline" placeholder="Baratas, formigas, ratos…" required />
            <OlliInput label="Método aplicado" value={metodo} onChangeText={setMetodo} leftIcon="spray" placeholder="Pulverização, iscagem…" />
            <OlliInput label="Data da execução" value={dataServico} onChangeText={setDataServico} mask="date" leftIcon="calendar" />
            <OlliInput label="Garantia (dias)" value={garantiaDias} onChangeText={setGarantiaDias} keyboardType="numeric" leftIcon="shield-check-outline" helper="Validade da garantia a partir da data." />
          </OlliCard>

          <Text style={styles.secao}>Produto saneante</Text>
          <OlliCard style={styles.card}>
            <OlliInput label="Produto (nome comercial)" value={prodNome} onChangeText={setProdNome} leftIcon="flask-outline" required />
            <OlliInput label="Princípio ativo" value={prodPrincipio} onChangeText={setProdPrincipio} leftIcon="molecule" />
            <OlliInput label="Registro na ANVISA/MS" value={prodRegistro} onChangeText={setProdRegistro} leftIcon="barcode" />
            <OlliInput label="Grupo químico (opcional)" value={prodGrupo} onChangeText={setProdGrupo} leftIcon="atom" />
          </OlliCard>

          <Text style={styles.secao}>Orientações ao cliente</Text>
          <OlliCard style={styles.card}>
            <CampoComVoz label="Observações" value={observacoes} onChangeText={setObservacoes} multiline placeholder="Prazo de reentrada, cuidados… (toque no microfone para ditar)" />
          </OlliCard>

          <OlliButton label="Gerar certificado (PDF)" icon={<MaterialCommunityIcons name="file-document-outline" size={18} color="#fff" />} variant="gradient" fullWidth onPress={gerar} loading={gerando} style={styles.cta} />
          <Text style={styles.aviso}>
            A validade legal depende das licenças e do responsável técnico reais. O OLLI só organiza os dados da RDC 52 no documento.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <OverlayProgresso visible={gerando} titulo="Gerando certificado" subtitulo="Montando o PDF…" />
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    scroll: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxxl },
    secao: { fontSize: 12, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm, marginBottom: 2 },
    card: { gap: Spacing.md },
    cta: { marginTop: Spacing.base, alignSelf: 'stretch' },
    aviso: { fontSize: 11.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 16 },
  });

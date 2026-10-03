import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
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
import { getEmpresa } from '../database/database';
import { Empresa } from '../types';
import { montarHtmlCertificadoCaixaDagua } from '../utils/certificadoCaixaDaguaPdf';
import {
  AVISO_REVISAO_TECNICA,
  VALIDADE_MAXIMA_SP_DIAS,
  pendenciasCertificadoCaixaDagua,
  proximaLimpeza,
  type DadosCertificadoCaixaDagua,
} from '../services/documentosOficio';
import { usePlano } from '../hooks/usePlano';
import { RECURSO_REMOVE_MARCA } from '../services/planos';
import { exportarHtmlComoPdf } from '../utils/exportarDocumento';
import { exigirCadastroParaEnviar } from '../services/exigirCadastro';
import { todayISO } from '../utils/date';
import { isoToBR } from '../utils/masks';
import { generateId } from '../utils/id';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Linha do formulário, com chave estável (a lista permite remover do meio). */
type ReservatorioForm = { chave: string; descricao: string; capacidade: string };
const novoReservatorio = (): ReservatorioForm => ({ chave: generateId(), descricao: '', capacidade: '' });
type Leitura = { estado: 'carregando' } | { estado: 'erro' } | { estado: 'pronto'; empresa: Empresa | null };

/**
 * Certificado de limpeza e desinfecção de caixa d'água — ferramenta da vertical
 * `caixa_dagua`. Campos, origem de cada um e validação em services/documentosOficio.ts;
 * o PDF em utils/certificadoCaixaDaguaPdf.ts. Só gera com todos os campos preenchidos.
 */
export default function CertificadoCaixaDaguaScreen() {
  // D-07: Pro/Empresa não levam a marca OLLI em NENHUM documento.
  const { temAcesso } = usePlano();
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [leitura, setLeitura] = useState<Leitura>({ estado: 'carregando' });
  const [gerando, setGerando] = useState(false);

  const [clienteNome, setClienteNome] = useState('');
  const [enderecoImovel, setEnderecoImovel] = useState('');
  const [dataExecucao, setDataExecucao] = useState(isoToBR(todayISO()));
  const [reservatorios, setReservatorios] = useState<ReservatorioForm[]>(() => [novoReservatorio()]);
  const [produto, setProduto] = useState('');
  const [concentracao, setConcentracao] = useState('');
  const [lacre, setLacre] = useState('');
  const [validadeDias, setValidadeDias] = useState('180');
  const [responsavel, setResponsavel] = useState('');
  const [orientacoes, setOrientacoes] = useState('');

  const carregar = useCallback(async () => {
    setLeitura({ estado: 'carregando' });
    try {
      const e = await getEmpresa();
      if (e) setResponsavel((atual) => atual || e.responsavelTecnico || e.nomePrestador || '');
      setLeitura({ estado: 'pronto', empresa: e });
    } catch {
      setLeitura({ estado: 'erro' });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function alterarReservatorio(indice: number, campo: Exclude<keyof ReservatorioForm, 'chave'>, valor: string) {
    setReservatorios((atual) => atual.map((r, i) => (i === indice ? { ...r, [campo]: valor } : r)));
  }

  const dias = parseInt(validadeDias, 10);
  const validadeNumero = Number.isFinite(dias) ? dias : 0;
  const proxima = proximaLimpeza({ dataExecucao, validadeDias: validadeNumero });

  async function gerar() {
    if (leitura.estado !== 'pronto') return;
    const empresa = leitura.empresa;
    if (!empresa) {
      Alert.alert('Cadastro incompleto', 'Cadastre sua empresa em "Meu negócio" antes de emitir o certificado.');
      return;
    }
    const dados: DadosCertificadoCaixaDagua = {
      clienteNome: clienteNome.trim(),
      enderecoImovel: enderecoImovel.trim(),
      dataExecucao,
      reservatorios: reservatorios.map((r) => ({
        descricao: r.descricao.trim(),
        capacidadeLitros: Number(r.capacidade.replace(/\./g, '').replace(',', '.')),
      })),
      produtoDesinfeccao: produto.trim(),
      concentracaoDesinfeccao: concentracao.trim(),
      numeroLacre: lacre.trim(),
      validadeDias: validadeNumero,
      responsavel: responsavel.trim(),
      empresaRazaoSocial: empresa.nome?.trim() ?? '',
      empresaDocumento: (empresa.cnpj || empresa.cpf || '').trim(),
      empresaTelefone: (empresa.telefone || empresa.whatsapp || '').trim(),
      orientacoes: orientacoes.trim() || undefined,
    };
    const faltando = pendenciasCertificadoCaixaDagua(dados);
    if (faltando.length > 0) {
      Alert.alert(
        'Faltam dados do certificado',
        faltando.map((c) => `• ${c.rotulo}`).join('\n') +
          (faltando.some((c) => c.id === 'empresa') ? '\n\nNome, CNPJ/CPF e telefone da empresa vêm de "Meu negócio".' : ''),
      );
      return;
    }
    // Porta única do envio: o certificado sai com os dados do negócio.
    if (!(await exigirCadastroParaEnviar('documento'))) return;
    setGerando(true);
    try {
      const numero = generateId().slice(0, 8).toUpperCase();
      const html = await montarHtmlCertificadoCaixaDagua(dados, empresa, {
        numero,
        removerMarca: temAcesso(RECURSO_REMOVE_MARCA),
      });
      await exportarHtmlComoPdf(html, `Certificado-caixa-dagua-${numero}`, { dialogTitle: `Certificado ${numero}` });
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não consegui gerar o certificado.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <GradientHeader
        title="Certificado de caixa d'água"
        subtitle="Limpeza e desinfecção do reservatório"
        onBack={() => goBackOrHome(nav)}
      />
      {leitura.estado === 'carregando' ? (
        <View style={styles.centro}>
          <Text style={styles.aviso}>Carregando os dados da empresa…</Text>
        </View>
      ) : leitura.estado === 'erro' ? (
        <View style={styles.centro}>
          <Text style={styles.aviso}>Não consegui ler o cadastro da empresa. Nome, CNPJ e telefone do certificado vêm dele.</Text>
          <OlliButton label="Tentar de novo" variant="outline" onPress={() => { void carregar(); }} style={styles.cta} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <OlliCard style={styles.revisao}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.warning} />
              <Text style={styles.revisaoTexto}>{AVISO_REVISAO_TECNICA}</Text>
            </OlliCard>

            <Text style={styles.secao}>Cliente e serviço</Text>
            <OlliCard style={styles.card}>
              <OlliInput label="Cliente (estabelecimento ou condomínio)" value={clienteNome} onChangeText={setClienteNome} leftIcon="account-outline" required />
              <OlliInput label="Endereço do imóvel" value={enderecoImovel} onChangeText={setEnderecoImovel} leftIcon="map-marker-outline" required />
              <OlliInput label="Data da limpeza" value={dataExecucao} onChangeText={setDataExecucao} mask="date" leftIcon="calendar" required />
              <OlliInput label="Responsável pela execução" value={responsavel} onChangeText={setResponsavel} leftIcon="account-hard-hat" required />
            </OlliCard>

            <Text style={styles.secao}>Reservatórios</Text>
            {reservatorios.map((r, i) => (
              <OlliCard key={r.chave} style={styles.card}>
                <View style={styles.itemTopo}>
                  <Text style={styles.itemTitulo}>Reservatório {i + 1}</Text>
                  {reservatorios.length > 1 ? (
                    <TouchableOpacity
                      onPress={() => setReservatorios((atual) => atual.filter((_, j) => j !== i))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover reservatório ${i + 1}`}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.remover}>Remover</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <OlliInput label="Descrição" value={r.descricao} onChangeText={(v) => alterarReservatorio(i, 'descricao', v)} leftIcon="storage-tank-outline" placeholder="Ex.: caixa superior, cisterna" required />
                <OlliInput label="Capacidade (litros)" value={r.capacidade} onChangeText={(v) => alterarReservatorio(i, 'capacidade', v)} keyboardType="numeric" leftIcon="water-outline" required />
              </OlliCard>
            ))}
            <OlliButton label="Adicionar reservatório" variant="outline" onPress={() => setReservatorios((atual) => [...atual, novoReservatorio()])} />

            <Text style={styles.secao}>Desinfecção e lacre</Text>
            <OlliCard style={styles.card}>
              <OlliInput label="Produto usado na desinfecção" value={produto} onChangeText={setProduto} leftIcon="flask-outline" placeholder="Ex.: hipoclorito de sódio" required />
              <OlliInput label="Concentração usada" value={concentracao} onChangeText={setConcentracao} leftIcon="beaker-outline" placeholder="Conforme o rótulo do produto" required />
              <OlliInput label="Número do lacre" value={lacre} onChangeText={setLacre} leftIcon="lock-outline" required />
              <OlliInput
                label="Validade (dias até a próxima limpeza)"
                value={validadeDias}
                onChangeText={setValidadeDias}
                keyboardType="numeric"
                leftIcon="calendar-refresh-outline"
                helper={
                  proxima
                    ? `Próxima limpeza até ${proxima}.${validadeNumero > VALIDADE_MAXIMA_SP_DIAS ? ` Em São Paulo a lei pede no máximo ${VALIDADE_MAXIMA_SP_DIAS} dias.` : ''}`
                    : 'Informe a data e um número de dias.'
                }
                required
              />
            </OlliCard>

            <Text style={styles.secao}>Orientações (opcional)</Text>
            <OlliCard style={styles.card}>
              <CampoComVoz label="Orientações" value={orientacoes} onChangeText={setOrientacoes} multiline placeholder="Manter a tampa fechada, verificar a boia… (toque no microfone para ditar)" />
            </OlliCard>

            <OlliButton label="Gerar certificado (PDF)" icon={<MaterialCommunityIcons name="file-document-outline" size={18} color="#fff" />} variant="gradient" fullWidth onPress={gerar} loading={gerando} style={styles.cta} />
            <Text style={styles.aviso}>
              O certificado atesta a limpeza, não a potabilidade da água. Em São Paulo vale a Lei 10.770/1989; em outras cidades, confira a regra do município.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <OverlayProgresso visible={gerando} titulo="Gerando certificado" subtitulo="Montando o PDF…" />
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.md },
    scroll: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxxl },
    secao: { fontSize: 12, fontFamily: Fonts.semiBold, color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm, marginBottom: 2 },
    card: { gap: Spacing.md },
    revisao: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
    revisaoTexto: { flex: 1, fontSize: 12.5, fontFamily: Fonts.regular, color: c.onSurface, lineHeight: 18 },
    itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    itemTitulo: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurface },
    remover: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.danger },
    cta: { marginTop: Spacing.base, alignSelf: 'stretch' },
    aviso: { fontSize: 11.5, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 16 },
  });

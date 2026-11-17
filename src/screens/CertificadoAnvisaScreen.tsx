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
import { getEmpresa, saveEmpresa } from '../database/database';
import { Empresa } from '../types';
import { montarHtmlCertificadoAnvisa } from '../utils/certificadoAnvisaPdf';
import {
  AVISO_REVISAO_TECNICA,
  BASE_LEGAL_COMPROVANTE_PRAGAS,
  pendenciasComprovantePragas,
  pragasDoTexto,
  prazoPorExtenso,
  type DadosComprovantePragas,
  type ProdutoAplicado,
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

/** Linha do formulário: o produto + uma chave estável (a lista permite remover do meio). */
type ProdutoForm = ProdutoAplicado & { chave: string };
const novoProduto = (): ProdutoForm => ({ chave: generateId(), nome: '', concentracao: '', grupoQuimico: '', principioAtivo: '', registroAnvisa: '' });

type Leitura = { estado: 'carregando' } | { estado: 'erro' } | { estado: 'pronto'; empresa: Empresa | null };

/**
 * Comprovante de execução de serviço de controle de pragas (dedetização) — ferramenta
 * da vertical `dedetizacao`. Coleta os onze incisos do art. 19 da RDC ANVISA 622/2022
 * (lista e validação em services/documentosOficio.ts) e só gera o PDF quando nenhum
 * falta. Licenças, RT e telefone do CIT são salvos na empresa e reaproveitados.
 */
export default function CertificadoAnvisaScreen() {
  // D-07: Pro/Empresa não levam a marca OLLI em NENHUM documento — nem no comprovante.
  const { temAcesso } = usePlano();
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const [leitura, setLeitura] = useState<Leitura>({ estado: 'carregando' });
  const [gerando, setGerando] = useState(false);

  // Dados da empresa (pré-preenchidos do cadastro, salvos de volta).
  const [licencaSanitaria, setLicencaSanitaria] = useState('');
  const [licencaSanitariaValidade, setLicencaSanitariaValidade] = useState('');
  const [licencaAmbiental, setLicencaAmbiental] = useState('');
  const [licencaAmbientalValidade, setLicencaAmbientalValidade] = useState('');
  const [responsavelTecnico, setResponsavelTecnico] = useState('');
  const [rtRegistro, setRtRegistro] = useState('');
  const [telefoneCit, setTelefoneCit] = useState('');

  // Serviço.
  const [clienteNome, setClienteNome] = useState('');
  const [enderecoImovel, setEnderecoImovel] = useState('');
  const [pragas, setPragas] = useState('');
  const [prazoDias, setPrazoDias] = useState('90');
  const [dataExecucao, setDataExecucao] = useState(isoToBR(todayISO()));
  const [produtos, setProdutos] = useState<ProdutoForm[]>(() => [novoProduto()]);
  const [orientacoes, setOrientacoes] = useState('');

  const carregar = useCallback(async () => {
    setLeitura({ estado: 'carregando' });
    try {
      const e = await getEmpresa();
      if (e) {
        setLicencaSanitaria(e.licencaSanitaria ?? '');
        setLicencaSanitariaValidade(e.licencaSanitariaValidade ?? '');
        setLicencaAmbiental(e.licencaAmbiental ?? '');
        setLicencaAmbientalValidade(e.licencaAmbientalValidade ?? '');
        setResponsavelTecnico(e.responsavelTecnico ?? e.nomePrestador ?? '');
        setRtRegistro(e.responsavelTecnicoRegistro ?? '');
        setTelefoneCit(e.telefoneCit ?? '');
      }
      setLeitura({ estado: 'pronto', empresa: e });
    } catch {
      setLeitura({ estado: 'erro' });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function alterarProduto(indice: number, campo: Exclude<keyof ProdutoForm, 'chave'>, valor: string) {
    setProdutos((atual) => atual.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)));
  }

  const dias = parseInt(prazoDias, 10);
  const prazoExtenso = prazoPorExtenso(Number.isFinite(dias) ? dias : 0);

  async function gerar() {
    if (leitura.estado !== 'pronto') return;
    const empresa = leitura.empresa;
    if (!empresa) {
      Alert.alert('Cadastro incompleto', 'Cadastre sua empresa em "Meu negócio" antes de emitir o comprovante.');
      return;
    }
    const enderecoEmpresa = [empresa.endereco, [empresa.cidade, empresa.estado].filter(Boolean).join('/')]
      .filter(Boolean)
      .join(' · ');
    const dados: DadosComprovantePragas = {
      clienteNome: clienteNome.trim(),
      enderecoImovel: enderecoImovel.trim(),
      pragas: pragasDoTexto(pragas, Number.isFinite(dias) ? dias : 0),
      dataExecucao,
      produtos: produtos.map((p) => ({
        nome: p.nome.trim(),
        concentracao: p.concentracao.trim(),
        grupoQuimico: p.grupoQuimico.trim(),
        principioAtivo: p.principioAtivo?.trim() || undefined,
        registroAnvisa: p.registroAnvisa?.trim() || undefined,
      })),
      orientacoes: orientacoes.trim(),
      responsavelTecnico: responsavelTecnico.trim(),
      registroResponsavelTecnico: rtRegistro.trim(),
      telefoneCit: telefoneCit.trim(),
      empresaRazaoSocial: empresa.nome?.trim() ?? '',
      empresaEndereco: enderecoEmpresa,
      empresaTelefone: (empresa.telefone || empresa.whatsapp || '').trim(),
      licencaSanitaria: licencaSanitaria.trim(),
      licencaSanitariaValidade: licencaSanitariaValidade.trim(),
      licencaAmbiental: licencaAmbiental.trim(),
      licencaAmbientalValidade: licencaAmbientalValidade.trim(),
    };
    // Fail-closed: documento sem o conteúdo mínimo da norma não sai.
    const faltando = pendenciasComprovantePragas(dados);
    if (faltando.length > 0) {
      Alert.alert(
        'Faltam dados exigidos pela RDC 622',
        faltando.map((c) => `• ${c.rotulo} (${c.base})`).join('\n') +
          (faltando.some((c) => c.id === 'empresa') ? '\n\nNome, endereço e telefone da empresa vêm de "Meu negócio".' : ''),
      );
      return;
    }
    // Porta única do envio: o comprovante sai com os dados do negócio.
    if (!(await exigirCadastroParaEnviar('documento'))) return;
    setGerando(true);
    try {
      // Persiste os dados de compliance na empresa (reaproveita na próxima emissão).
      const empAtualizada: Empresa = {
        ...empresa,
        licencaSanitaria: dados.licencaSanitaria,
        licencaSanitariaValidade: dados.licencaSanitariaValidade,
        licencaAmbiental: dados.licencaAmbiental,
        licencaAmbientalValidade: dados.licencaAmbientalValidade,
        responsavelTecnico: dados.responsavelTecnico,
        responsavelTecnicoRegistro: dados.registroResponsavelTecnico,
        telefoneCit: dados.telefoneCit,
      };
      await saveEmpresa(empAtualizada);
      setLeitura({ estado: 'pronto', empresa: empAtualizada });

      const numero = generateId().slice(0, 8).toUpperCase();
      const html = await montarHtmlCertificadoAnvisa(dados, empAtualizada, {
        numero,
        removerMarca: temAcesso(RECURSO_REMOVE_MARCA),
      });
      await exportarHtmlComoPdf(html, `Comprovante-pragas-${numero}`, { dialogTitle: `Comprovante ${numero}` });
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não consegui gerar o comprovante.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <GradientHeader
        title="Comprovante de controle de pragas"
        subtitle={`Dedetização · ${BASE_LEGAL_COMPROVANTE_PRAGAS}`}
        onBack={() => goBackOrHome(nav)}
      />
      {leitura.estado === 'carregando' ? (
        <View style={styles.centro}>
          <Text style={styles.aviso}>Carregando os dados da empresa…</Text>
        </View>
      ) : leitura.estado === 'erro' ? (
        <View style={styles.centro}>
          <Text style={styles.aviso}>Não consegui ler o cadastro da empresa. Os dados de licença e do responsável técnico vêm dele.</Text>
          <OlliButton label="Tentar de novo" variant="outline" onPress={() => { void carregar(); }} style={styles.cta} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <OlliCard style={styles.revisao}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.warning} />
              <Text style={styles.revisaoTexto}>{AVISO_REVISAO_TECNICA}</Text>
            </OlliCard>

            <Text style={styles.secao}>Empresa (salvo para reusar)</Text>
            <OlliCard style={styles.card}>
              <OlliInput label="Licença sanitária (número)" value={licencaSanitaria} onChangeText={setLicencaSanitaria} leftIcon="file-certificate-outline" required />
              <OlliInput label="Validade da licença sanitária" value={licencaSanitariaValidade} onChangeText={setLicencaSanitariaValidade} mask="date" leftIcon="calendar" required />
              <OlliInput label="Licença ambiental (número)" value={licencaAmbiental} onChangeText={setLicencaAmbiental} leftIcon="leaf" required />
              <OlliInput label="Validade da licença ambiental" value={licencaAmbientalValidade} onChangeText={setLicencaAmbientalValidade} mask="date" leftIcon="calendar" required />
              <OlliInput label="Responsável técnico" value={responsavelTecnico} onChangeText={setResponsavelTecnico} leftIcon="account-tie" required />
              <OlliInput label="Registro profissional do RT (conselho e número)" value={rtRegistro} onChangeText={setRtRegistro} leftIcon="card-account-details-outline" required />
              <OlliInput
                label="Telefone do Centro de Informação Toxicológica"
                value={telefoneCit}
                onChangeText={setTelefoneCit}
                leftIcon="phone-alert-outline"
                helper="O CIT que atende a sua região. Confira o número com o responsável técnico."
                required
              />
            </OlliCard>

            <Text style={styles.secao}>Serviço</Text>
            <OlliCard style={styles.card}>
              <OlliInput label="Nome do cliente" value={clienteNome} onChangeText={setClienteNome} leftIcon="account-outline" required />
              <OlliInput label="Endereço do imóvel" value={enderecoImovel} onChangeText={setEnderecoImovel} leftIcon="map-marker-outline" required />
              <OlliInput label="Pragas-alvo" value={pragas} onChangeText={setPragas} leftIcon="bug-outline" placeholder="Baratas, formigas, ratos" helper="Separe por vírgula. Cada praga sai com o prazo abaixo." required />
              <OlliInput
                label="Prazo de assistência técnica (dias)"
                value={prazoDias}
                onChangeText={setPrazoDias}
                keyboardType="numeric"
                leftIcon="shield-check-outline"
                helper={prazoExtenso ? `No documento: ${prazoExtenso}` : 'Informe um número de dias (1 a 9999).'}
                required
              />
              <OlliInput label="Data de execução" value={dataExecucao} onChangeText={setDataExecucao} mask="date" leftIcon="calendar" required />
            </OlliCard>

            <Text style={styles.secao}>Produtos aplicados</Text>
            {produtos.map((p, i) => (
              <OlliCard key={p.chave} style={styles.card}>
                <View style={styles.produtoTopo}>
                  <Text style={styles.produtoTitulo}>Produto {i + 1}</Text>
                  {produtos.length > 1 ? (
                    <TouchableOpacity
                      onPress={() => setProdutos((atual) => atual.filter((_, j) => j !== i))}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover produto ${i + 1}`}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.remover}>Remover</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <OlliInput label="Nome do produto" value={p.nome} onChangeText={(v) => alterarProduto(i, 'nome', v)} leftIcon="flask-outline" required />
                <OlliInput label="Concentração" value={p.concentracao} onChangeText={(v) => alterarProduto(i, 'concentracao', v)} leftIcon="beaker-outline" placeholder="Ex.: 2,5% (diluição usada)" required />
                <OlliInput label="Grupo químico" value={p.grupoQuimico} onChangeText={(v) => alterarProduto(i, 'grupoQuimico', v)} leftIcon="atom" placeholder="Ex.: piretroide" required />
                <OlliInput label="Princípio ativo (opcional)" value={p.principioAtivo ?? ''} onChangeText={(v) => alterarProduto(i, 'principioAtivo', v)} leftIcon="molecule" />
                <OlliInput label="Registro do produto (opcional)" value={p.registroAnvisa ?? ''} onChangeText={(v) => alterarProduto(i, 'registroAnvisa', v)} leftIcon="barcode" />
              </OlliCard>
            ))}
            <OlliButton label="Adicionar produto" variant="outline" onPress={() => setProdutos((atual) => [...atual, novoProduto()])} />

            <Text style={styles.secao}>Orientações ao cliente</Text>
            <OlliCard style={styles.card}>
              <CampoComVoz label="Orientações *" value={orientacoes} onChangeText={setOrientacoes} multiline placeholder="Prazo de reentrada, cuidados com crianças e animais… (toque no microfone para ditar)" />
            </OlliCard>

            <OlliButton label="Gerar comprovante (PDF)" icon={<MaterialCommunityIcons name="file-document-outline" size={18} color="#fff" />} variant="gradient" fullWidth onPress={gerar} loading={gerando} style={styles.cta} />
            <Text style={styles.aviso}>
              O PDF só é gerado com todos os campos do art. 19 da RDC 622/2022. A validade legal depende das licenças e do responsável técnico reais.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <OverlayProgresso visible={gerando} titulo="Gerando comprovante" subtitulo="Montando o PDF…" />
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
    produtoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    produtoTitulo: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.onSurface },
    remover: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.danger },
    cta: { marginTop: Spacing.base, alignSelf: 'stretch' },
    aviso: { fontSize: 13, fontFamily: Fonts.regular, color: c.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 17 },
  });

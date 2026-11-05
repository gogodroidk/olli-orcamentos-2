import React, { useEffect, useState } from 'react';
import {
  View, Text, Platform, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Spacing, BorderRadius, useCores, useEstilos, type Cores } from '../../theme';
import { OlliInput, OlliMoneyInput } from '../OlliInput';
import { OlliButton } from '../OlliButton';
import { useRascunhoCampo } from '../../hooks/useRascunhoCampo';
import { chaveRascunho } from '../../services/rascunhoCampo';
import { getClientes } from '../../database/database';
import { dataBrParaIsoSeguro } from '../../utils/date';
import {
  ERRO_HORA_INVALIDA,
  LIMITE_CLIENTE,
  LIMITE_DESCRICAO,
  LIMITE_OBSERVACOES,
  LIMITE_TITULO,
  partesDaDataAgendada,
  validarDadosOS,
  type PatchDadosOS,
} from '../../utils/ordemServicoEdicao';
import type { Cliente } from '../../types';

export interface DadosIniciaisOS {
  clienteId?: string;
  clienteNome?: string;
  titulo?: string;
  descricao?: string;
  observacoes?: string;
  dataAgendada?: string;
  valor?: number;
}

interface Props {
  /** Semente da edição. Na criação (`rascunhoEscopo`) o rascunho do aparelho manda. */
  iniciais?: DadosIniciaisOS;
  /**
   * Quando definido, cada campo digitado sobrevive ao app ser morto.
   * A criação manual usa `"os-nova"`.
   */
  rascunhoEscopo?: string;
  rotuloSalvar: string;
  salvando?: boolean;
  aoCancelar?: () => void;
  /** `limpar` só deve ser chamado depois que o save deu certo. */
  onSalvar: (patch: PatchDadosOS, limpar: () => void) => void;
}

function valorInicial(v: number | undefined): string {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return String(v);
  return '';
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Só insere os dois-pontos. Não trava a hora enquanto a pessoa digita. */
function maskHora(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

function diaIsoDoCampo(data: string): string {
  const t = data.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return '';
  const iso = dataBrParaIsoSeguro(t);
  return iso ? iso.slice(0, 10) : '';
}

function horaParaInput(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return '';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${m[2]}`;
}

const AJUDA_HORA = 'Sem hora, a ordem fica marcada só no dia.';
const AJUDA_VINCULO = 'Se mudar o nome, o vínculo com o cadastro sai. Escolha o cliente de novo para Ligar e WhatsApp.';

/**
 * Cliente, título, descrição, dia, hora, valor e observações — o que faltava
 * na OS manual e o que a edição reabre. Não mexe em checklist, foto nem status.
 */
export function FormularioDadosOS({
  iniciais, rascunhoEscopo, rotuloSalvar, salvando, aoCancelar, onSalvar,
}: Props) {
  const styles = useEstilos(criarEstilos);
  const escopo = rascunhoEscopo ?? null;
  const seed = escopo ? null : (iniciais ?? null);
  const partesSeed = seed ? partesDaDataAgendada(seed.dataAgendada) : { data: '', hora: '' };

  const [clienteR, setClienteR, rascCliente] = useRascunhoCampo(escopo ? chaveRascunho(escopo, 'cliente') : null);
  const [tituloR, setTituloR, rascTitulo] = useRascunhoCampo(escopo ? chaveRascunho(escopo, 'titulo') : null);
  const [descricaoR, setDescricaoR, rascDescricao] = useRascunhoCampo(escopo ? chaveRascunho(escopo, 'descricao') : null);
  const [observacoesR, setObservacoesR, rascObservacoes] = useRascunhoCampo(escopo ? chaveRascunho(escopo, 'observacoes') : null);
  const [dataR, setDataR, rascData] = useRascunhoCampo(escopo ? chaveRascunho(escopo, 'data') : null);
  const [horaR, setHoraR, rascHora] = useRascunhoCampo(escopo ? chaveRascunho(escopo, 'hora') : null);
  const [valorR, setValorR, rascValor] = useRascunhoCampo(escopo ? chaveRascunho(escopo, 'valor') : null);

  const [clienteS, setClienteS] = useState(seed?.clienteNome ?? '');
  const [tituloS, setTituloS] = useState(seed?.titulo ?? '');
  const [descricaoS, setDescricaoS] = useState(seed?.descricao ?? '');
  const [observacoesS, setObservacoesS] = useState(seed?.observacoes ?? '');
  const [dataS, setDataS] = useState(partesSeed.data);
  const [horaS, setHoraS] = useState(partesSeed.hora);
  const [valorS, setValorS] = useState(valorInicial(seed?.valor));
  const [clienteId, setClienteId] = useState(seed?.clienteId ?? '');

  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [clientesErro, setClientesErro] = useState(false);
  const [erros, setErros] = useState<Partial<Record<'cliente' | 'titulo' | 'descricao' | 'observacoes' | 'data' | 'valor', string>>>({});

  useEffect(() => {
    let ativo = true;
    getClientes()
      .then((lista) => {
        if (!ativo) return;
        setClientes(lista);
        setClientesErro(false);
      })
      .catch(() => {
        if (ativo) setClientesErro(true);
      });
    return () => { ativo = false; };
  }, []);

  const clienteNome = escopo ? clienteR : clienteS;
  const titulo = escopo ? tituloR : tituloS;
  const descricao = escopo ? descricaoR : descricaoS;
  const observacoes = escopo ? observacoesR : observacoesS;
  const data = escopo ? dataR : dataS;
  const hora = escopo ? horaR : horaS;
  const valor = escopo ? valorR : valorS;

  function setClienteNome(v: string) { if (escopo) setClienteR(v); else setClienteS(v); }
  function setTitulo(v: string) { if (escopo) setTituloR(v); else setTituloS(v); }
  function setDescricao(v: string) { if (escopo) setDescricaoR(v); else setDescricaoS(v); }
  function setObservacoes(v: string) { if (escopo) setObservacoesR(v); else setObservacoesS(v); }
  function setData(v: string) { if (escopo) setDataR(v); else setDataS(v); }
  function setHora(v: string) { if (escopo) setHoraR(v); else setHoraS(v); }
  function setValor(v: string) { if (escopo) setValorR(v); else setValorS(v); }

  function limpar() {
    rascCliente.limpar();
    rascTitulo.limpar();
    rascDescricao.limpar();
    rascObservacoes.limpar();
    rascData.limpar();
    rascHora.limpar();
    rascValor.limpar();
  }

  function aoDigitarCliente(texto: string) {
    setClienteNome(texto);
    setErros((e) => ({ ...e, cliente: undefined }));
    if (!clienteId) return;
    const ligado = clientes?.find((c) => c.id === clienteId);
    if (!ligado || ligado.nome.trim() !== texto.trim()) setClienteId('');
  }

  function escolherCliente(c: Cliente) {
    setClienteId(c.id);
    setClienteNome(c.nome);
    setErros((e) => ({ ...e, cliente: undefined }));
  }

  const q = semAcento(clienteNome.trim());
  const sugestoes = clientes && q.length >= 2
    ? clientes.filter((c) => c.id !== clienteId && semAcento(c.nome).includes(q)).slice(0, 6)
    : [];

  function tentarSalvar() {
    if (salvando) return;
    const resultado = validarDadosOS({
      clienteId,
      clienteNome,
      titulo,
      descricao,
      observacoes,
      data,
      hora,
      valor: valor.trim() === '' ? '' : Number(valor),
    });
    if (!resultado.ok) {
      setErros(resultado.erros);
      return;
    }
    setErros({});
    onSalvar(resultado.patch, limpar);
  }

  const erroHora = erros.data === ERRO_HORA_INVALIDA ? erros.data : undefined;
  const erroData = erros.data && erros.data !== ERRO_HORA_INVALIDA ? erros.data : undefined;
  const travado = !!salvando;

  return (
    <View style={{ gap: Spacing.sm }}>
      <View pointerEvents={travado ? 'none' : 'auto'} style={travado ? { opacity: 0.72 } : undefined}>
        <OlliInput
          label="Cliente"
          required
          value={clienteNome}
          onChangeText={aoDigitarCliente}
          placeholder="Nome do cliente"
          leftIcon="account-outline"
          maxLength={LIMITE_CLIENTE}
          editable={!travado}
          error={erros.cliente}
          helper={clientes === null && !clientesErro ? 'Buscando clientes…' : AJUDA_VINCULO}
        />
        {clientesErro ? (
          <Text style={styles.aviso} accessibilityRole="alert">
            Não deu para carregar a lista de clientes. O nome ainda pode ser digitado.
          </Text>
        ) : null}
        {sugestoes.length > 0 ? (
          <View style={styles.caixaSugestoes}>
            {sugestoes.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => escolherCliente(c)}
                accessibilityRole="button"
                accessibilityLabel={`Usar o cliente ${c.nome}`}
                style={styles.sugestao}
              >
                <Text style={styles.sugestaoTexto} numberOfLines={1}>{c.nome}</Text>
                {c.telefone?.trim() ? (
                  <Text style={styles.sugestaoMeta} numberOfLines={1}>{c.telefone}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <OlliInput
          label="Título do serviço"
          required
          value={titulo}
          onChangeText={(v) => { setTitulo(v); setErros((e) => ({ ...e, titulo: undefined })); }}
          placeholder="Ex.: Manutenção do ar-condicionado"
          leftIcon="clipboard-text-outline"
          maxLength={LIMITE_TITULO}
          editable={!travado}
          error={erros.titulo}
        />
        <OlliInput
          label="Descrição (opcional)"
          value={descricao}
          onChangeText={(v) => { setDescricao(v); setErros((e) => ({ ...e, descricao: undefined })); }}
          placeholder="O que precisa ser feito"
          leftIcon="text-box-outline"
          multiline
          numberOfLines={4}
          maxLength={LIMITE_DESCRICAO}
          editable={!travado}
          error={erros.descricao}
        />

        <CamposQuando
          data={data}
          hora={hora}
          setData={(v) => { setData(v); setErros((e) => ({ ...e, data: undefined })); }}
          setHora={(v) => { setHora(v); setErros((e) => ({ ...e, data: undefined })); }}
          erroData={erroData}
          erroHora={erroHora}
          travado={travado}
        />

        <OlliMoneyInput
          label="Valor (opcional)"
          value={Number(valor) > 0 ? Number(valor) : 0}
          onChangeValue={(n) => {
            setValor(n > 0 ? String(n) : '');
            setErros((e) => ({ ...e, valor: undefined }));
          }}
          error={erros.valor}
          helper="Deixe em branco se ainda não souber."
        />
        <OlliInput
          label="Observações (opcional)"
          value={observacoes}
          onChangeText={(v) => { setObservacoes(v); setErros((e) => ({ ...e, observacoes: undefined })); }}
          placeholder="Ex.: chave com o zelador"
          leftIcon="note-text-outline"
          multiline
          numberOfLines={3}
          maxLength={LIMITE_OBSERVACOES}
          editable={!travado}
          error={erros.observacoes}
        />
      </View>

      <View style={styles.acoes}>
        {aoCancelar ? (
          <OlliButton label="Cancelar" variant="ghost" size="md" onPress={aoCancelar} disabled={travado} />
        ) : null}
        <OlliButton
          label={rotuloSalvar}
          variant="gradient"
          size="lg"
          fullWidth
          loading={travado}
          onPress={tentarSalvar}
          style={aoCancelar ? styles.botaoSalvar : undefined}
        />
      </View>
    </View>
  );
}

function CamposQuando({
  data, hora, setData, setHora, erroData, erroHora, travado,
}: {
  data: string;
  hora: string;
  setData: (v: string) => void;
  setHora: (v: string) => void;
  erroData?: string;
  erroHora?: string;
  travado: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  if (Platform.OS === 'web') {
    const estilo = {
      fontFamily: 'inherit',
      fontSize: 15,
      color: cores.onSurface,
      backgroundColor: cores.surfaceVariant,
      border: `1px solid ${erroData || erroHora ? cores.danger : cores.outline}`,
      borderRadius: BorderRadius.lg,
      padding: '12px 14px',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box' as const,
    };
    return (
      <View style={{ gap: 8, marginBottom: Spacing.base }}>
        <Text style={styles.labelCampo}>Dia da visita</Text>
        {React.createElement('input', {
          type: 'date',
          value: diaIsoDoCampo(data),
          disabled: travado,
          'aria-label': 'Dia da visita',
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const v = e.target.value;
            if (!v) { setData(''); return; }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
            const [y, m, d] = v.split('-');
            setData(`${d}/${m}/${y}`);
          },
          style: estilo,
        })}
        <Text style={styles.labelCampo}>Hora (opcional)</Text>
        {React.createElement('input', {
          type: 'time',
          value: horaParaInput(hora),
          disabled: travado,
          'aria-label': 'Hora da visita',
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setHora(e.target.value),
          style: estilo,
        })}
        {erroData || erroHora ? (
          <Text style={styles.erro} accessibilityRole="alert">{erroData || erroHora}</Text>
        ) : (
          <Text style={styles.ajuda}>{AJUDA_HORA}</Text>
        )}
      </View>
    );
  }

  return (
    <View>
      <OlliInput
        label="Dia da visita"
        value={data}
        onChangeText={setData}
        mask="date"
        placeholder="DD/MM/AAAA"
        leftIcon="calendar-clock"
        editable={!travado}
        error={erroData}
      />
      <OlliInput
        label="Hora (opcional)"
        value={hora}
        onChangeText={(t) => setHora(maskHora(t))}
        placeholder="14:30"
        leftIcon="clock-outline"
        keyboardType="numeric"
        maxLength={5}
        editable={!travado}
        error={erroHora}
        helper={AJUDA_HORA}
      />
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  aviso: { fontSize: 12, color: c.danger, marginTop: -8, marginBottom: Spacing.sm },
  caixaSugestoes: {
    borderWidth: 1, borderColor: c.outline, borderRadius: BorderRadius.md,
    backgroundColor: c.surface, marginTop: -8, marginBottom: Spacing.sm, overflow: 'hidden',
  },
  sugestao: {
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.outline,
  },
  sugestaoTexto: { fontSize: 14, fontWeight: '700', color: c.onSurface },
  sugestaoMeta: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  labelCampo: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant },
  ajuda: { fontSize: 12, color: c.onSurfaceMuted },
  erro: { fontSize: 12, color: c.danger },
  acoes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.sm },
  botaoSalvar: { flex: 1 },
});

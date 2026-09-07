import fs from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');
const existe = (rel: string) => fs.existsSync(path.join(raiz, rel));
let falhas = 0;

function checar(nome: string, ok: boolean) {
  if (ok) console.log(`✓ ${nome}`);
  else {
    falhas += 1;
    console.error(`✗ ${nome}`);
  }
}

const tipos = ler('src/types/index.ts');
const servico = ler('src/services/pmoc.ts');
const detalhe = ler('src/screens/PmocPlanoScreen.tsx');
const planos = ler('src/screens/PmocPlanosScreen.tsx');
const ativos = ler('webapp/src/pages/olli/equipamentos/index.tsx');
const formAtivo = ler('webapp/src/pages/olli/equipamentos/FormEquipamento.tsx');
const formOs = ler('webapp/src/pages/olli/ordens-servico/FormOs.tsx');
const artigo = ler('web/src/content/blog/pmoc-quem-e-obrigado-lei-13589.md');

checar('inventário HVAC tem identidade QR opaca e fotos preservadas',
  /qrToken:\s*string/.test(tipos) && /fotos:\s*string\[\]/.test(tipos) && /QR opaco/.test(tipos));
checar('estado do ativo não é tratado como conformidade legal',
  /NUNCA uma\s*\n?\s*\*? declaração de conformidade legal/.test(tipos) && /não avalia nem declara/.test(detalhe));
checar('plano tem periodicidade, escopo por equipamento e referência versionada',
  /interface PmocPeriodicidade/.test(tipos) && /equipamentoIds\?: string\[\]/.test(tipos) && /referencia\?: string/.test(tipos));
checar('versão aprovada é append-only e registra responsável/documento',
  /APPEND-ONLY/.test(tipos) && /responsavelTecnico\?: string/.test(tipos) && /docResponsabilidade\?: string/.test(tipos));
checar('geração de ordens é idempotente e usa chave lógica',
  /idempotent/i.test(servico) && /registrarOrdemGerada/.test(servico) && /nunca repete/i.test(detalhe));
checar('frequência desconhecida falha fechado sem inventar período',
  /frequência desconhecida é ignorada/.test(servico) && /return \[\]/.test(servico));
checar('tela lista histórico de versões e deixa claro o que está em vigor',
  /Histórico de versões/.test(detalhe) && /Em vigor/.test(detalhe) && /versão em revisão/.test(detalhe));
checar('tela de planos comunica responsabilidade técnica',
  /Aguardando responsável técnico/.test(planos) && /responsável técnico habilitado/.test(detalhe));
checar('inventário web oferece QR e preserva vínculo/fotos ao editar',
  /etiqueta QR/.test(ativos) && /preserva fotos/.test(formAtivo));
checar('ordem preserva checklist marcado e fotos anexadas em campo',
  /checklistMesclado/.test(formOs) && /fotos tiradas em campo/.test(formOs) && /continua(m)? intactas/.test(formOs));
checar('conteúdo público não vende PMOC como laudo, certificado ou substituto técnico',
  /Não é um laudo, não é um certificado/i.test(artigo) && /não\*\*\s+substitui o responsável técnico habilitado/i.test(artigo));
checar('evidência C10 está registrada', existe('docs/PILOTO/ACEITE_C10_HVAC_PMOC_2026-09-05.md'));

if (falhas) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nC10 HVAC/PMOC: contrato local validado.');

/**
 * Cupom na tela — checagem de fonte (sem renderizar): o que o CDC e a regra de produto exigem.
 *     node scripts/teste-cupom-tela.ts
 * Prende: campo só com recurso ligado; aviso "não se somam" e "só 1ª cobrança" ANTES de conferir; desconto
 * escrito (de/por) no Pix antes de pagar; recusa de cupom nunca cai em cobrança cheia; Play fica sem cupom;
 * o percentual nunca é digitado no app (vem do servidor).
 */
import { readFileSync } from 'node:fs';

let ok = 0; let falhas = 0;
function checar(nome: string, c: unknown, d = ''): void { if (c) { console.log(`  ok   ${nome}`); ok++; } else { console.error(`  FALHA ${nome}${d ? `\n        ${d}` : ''}`); falhas++; } }
const ler = (p: string): string => readFileSync(p, 'utf8');

const campo = ler('src/components/CupomCampo.tsx');
const modal = ler('src/components/PixPlanoModal.tsx');
const planos = ler('src/screens/PlanosScreen.tsx');
const pix = ler('src/services/pixPlano.ts');
const textos = ler('src/utils/cupomTexto.ts');

checar('campo some com o recurso desligado', /if \(!ativo\) return null/.test(campo) && /cupomAtivo\(\)/.test(campo));
const iAviso = campo.indexOf('AVISO_CUPOM_E_INDICACAO}</Text>');
const iInput = campo.indexOf('<TextInput');
checar('aviso "não se somam" e "só 1ª cobrança" aparecem ANTES do campo de digitar', iAviso > 0 && iInput > iAviso && /AVISO_CUPOM_NAO_RETROATIVO\}<\/Text>/.test(campo) && campo.indexOf('AVISO_CUPOM_NAO_RETROATIVO}</Text>') < iInput);
checar('o aviso diz que não acumula e que vale o primeiro uso', /não se somam/.test(textos) && /o que você usar primeiro/.test(textos));
checar('o aviso diz que vale só na 1ª cobrança e não é retroativo', /só na 1ª cobrança/.test(textos) && /já pagou/.test(textos));
checar('conferir mostra o texto do servidor (desconto escrito ou motivo)', /resultado\.texto/.test(campo));
checar('modal do Pix escreve o desconto e mostra o valor COBRADO', /cobranca\.desconto\.texto/.test(modal) && /cobranca\.desconto \? cobranca\.desconto\.por/.test(modal));
checar('cupom recusado: serviço devolve null (nenhum Pix) e entrega o motivo', /r\.status === 409/.test(pix) && /aoRecusa\?\.\(e\.texto\)/.test(pix));
checar('PlanosScreen: recusa no checkout de cartão avisa e NÃO abre checkout', /Cupom não aplicado/.test(planos) && /cupom_recusado/.test(planos));
const svc = ler('src/services/cupom.ts');
checar('cupom só onde o pagamento NÃO é pela loja (mesma regra do Pix): iOS e Play ficam sem cupom', /CUPOM_PERMITIDO_NA_PLATAFORMA = COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA/.test(svc) && /CUPOM_PERMITIDO_NA_PLATAFORMA \? \(\s*<CupomCampo/.test(planos));
checar('loja: cupomAtivo() devolve false ANTES de qualquer chamada de rede (nem pergunta ao servidor)', /if \(!CUPOM_PERMITIDO_NA_PLATAFORMA \|\| !PAGAMENTOS_URL\) return false;\s*try/.test(svc));
const card = ler('src/components/IndicacaoCard.tsx');
checar('loja: o cartão da indicação só cita cupom via cupomAtivo() (que é false na loja)', /cupomAtivo\(\)/.test(card) && /cupomLigado/.test(card));
checar('Pix Automático some com cupom aplicado (botão e cartão do plano)', /!pixAutoLigado \|\| cupom \|\|/.test(planos) && /pixAutoLigado && !cupom && /.test(planos));
checar('a tela diz, antes de aplicar, que o desconto não vale na assinatura recorrente', /AVISO_CUPOM_SO_AVULSO\}<\/Text>/.test(campo) && /Não vale na assinatura recorrente/.test(textos) && campo.indexOf('AVISO_CUPOM_SO_AVULSO}</Text>') < campo.indexOf('<TextInput'));
checar('novo Pix (expirou) mantém o cupom da cobrança anterior', /atual\.desconto\?\.codigo/.test(planos));
checar('percentual nunca digitado no app', !/\b10\s*%/.test(campo + modal + textos + ler('src/services/cupom.ts')));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

/**
 * Página do painel admin (HTML + CSS + JS sem framework), servida por /admin.
 *
 * Desenho:
 *  - Navegação lateral por seções (Visão geral, Usuários, Funil, Crédito de
 *    troca, Suporte, Auditoria, Administradores, Segurança), com rota por #hash.
 *  - Ficha do usuário em gaveta lateral, com abas e uma aba "Ferramentas" que
 *    explica cada ação antes do botão.
 *  - Toda ação pede motivo num formulário (nada de prompt()/confirm()).
 *  - Sessão: access token só em memória; refresh token em cookie HttpOnly
 *    gerenciado pelo Worker (ver adminSessao.js). Nada de token em storage.
 *  - Três estados em toda leitura: carregando | erro (diz que não sabe) | valor.
 *
 * O CSS e o JS são String.raw para não precisar escapar barras; por isso não
 * há `${...}` dentro deles — a configuração entra por um objeto CFG.
 */

import { FONTES_CSS } from './fontesProprias.js';

const SYM = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><defs><linearGradient id="og" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FD8EA"/><stop offset="1" stop-color="#0B6FCE"/></linearGradient></defs><path d="M22 49 L12 59.5 L30 50 Z" fill="url(#og)"/><rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#og)"/><rect x="13" y="11.5" width="38" height="15" rx="9" fill="#fff" opacity="0.1"/><rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><path d="M19 41 l6.6 6.9 l16 -15" fill="none" stroke="#EAFEFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CSS = String.raw`
*{box-sizing:border-box;margin:0;padding:0}
:root{
 --brand:#0B6FCE;--brand2:#34C6D9;--brandInk:#fff;
 --bg:#FBF7F1;--surf:#FFFCF8;--surf2:#F3EBE0;--line:#E6D8C6;--line2:#D4C4AE;
 --ink:#2A241C;--mut:#5C5146;--mut2:#65584C;
 --ok:#087A52;--okbg:#E5F4EA;--warn:#8A5A08;--warnbg:#F8EED9;--dng:#B42318;--dngbg:#FDECEC;--info:#0B6FCE;--infobg:#E7F1FB;
 --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;
 --r1:12px;--r2:18px;--r3:24px;
 --sh1:0 1px 2px rgba(62,44,28,.04),0 10px 28px rgba(62,44,28,.06);--sh2:0 24px 48px rgba(62,44,28,.12);
 --dur1:140ms;--dur2:200ms;--dur3:240ms;--ease:cubic-bezier(0.23,1,0.32,1);
 --side:240px;
 color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --bg:#161310;--surf:#241F1A;--surf2:#1E1A16;--line:#3A332C;--line2:#4A4036;
 --ink:#F7F2EA;--mut:#E4D5C4;--mut2:#CDBBA6;
 --ok:#3DDBA0;--okbg:#143028;--warn:#F0C36A;--warnbg:#2E2616;--dng:#FF9B9B;--dngbg:#3A2222;--info:#7EB6F0;--infobg:#1C2A3A;
 --sh1:0 1px 2px rgba(0,0,0,.2),0 10px 28px rgba(0,0,0,.18);--sh2:0 24px 48px rgba(0,0,0,.4);color-scheme:dark}}
:root[data-theme="dark"]{
 --bg:#161310;--surf:#241F1A;--surf2:#1E1A16;--line:#3A332C;--line2:#4A4036;
 --ink:#F7F2EA;--mut:#E4D5C4;--mut2:#CDBBA6;
 --ok:#3DDBA0;--okbg:#143028;--warn:#F0C36A;--warnbg:#2E2616;--dng:#FF9B9B;--dngbg:#3A2222;--info:#7EB6F0;--infobg:#1C2A3A;
 --sh1:0 1px 2px rgba(0,0,0,.2),0 10px 28px rgba(0,0,0,.18);--sh2:0 24px 48px rgba(0,0,0,.4);color-scheme:dark}
html,body{background:var(--bg)}
body{font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh}
button,input,select,textarea{font:inherit;color:inherit}
a{color:var(--info)}
.hidden{display:none!important}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ico{display:inline-flex;width:18px;height:18px;flex-shrink:0}
.ico svg{width:100%;height:100%}
.sym{width:32px;height:32px;flex-shrink:0}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:var(--r1)}

/* Botões */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);min-height:36px;padding:0 var(--s4);border-radius:var(--r1);border:1px solid transparent;background:var(--brand);color:var(--brandInk);font-weight:700;font-size:13.5px;cursor:pointer;transition:filter var(--dur1) var(--ease),transform var(--dur1) var(--ease);white-space:nowrap}
.btn:hover{filter:brightness(1.06)}
a.btn{text-decoration:none}.btn:active{transform:scale(.97)}
.btn:disabled{opacity:.55;cursor:not-allowed;filter:none;transform:none}
.btn.sec{background:var(--surf);border-color:var(--line2);color:var(--ink)}
.btn.sec:hover{background:var(--surf2);filter:none}
.btn.ghost{background:transparent;color:var(--mut)}
.btn.ghost:hover{background:var(--surf2);color:var(--ink);filter:none}
.btn.danger{background:var(--dng);color:#fff}
.btn.dangerSec{background:var(--surf);border-color:var(--dng);color:var(--dng)}
.btn.lg{min-height:44px;font-size:15px;width:100%}
.btn.icon{width:36px;padding:0}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 var(--s3);border-radius:999px;border:1px solid var(--line2);background:var(--surf);color:var(--mut);font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap}
.chip[aria-pressed="true"]{background:var(--infobg);border-color:var(--info);color:var(--info)}
.chip .n{font-variant-numeric:tabular-nums;opacity:.8}

/* Campos */
.campo{display:flex;flex-direction:column;gap:6px;margin-bottom:var(--s4)}
.campo label,.lbl{font-size:12.5px;font-weight:700;color:var(--mut)}
.inp{width:100%;min-height:40px;padding:var(--s2) var(--s3);border-radius:var(--r1);border:1px solid var(--line2);background:var(--surf);transition:border-color var(--dur1)}
.inp:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--infobg)}
textarea.inp{min-height:84px;resize:vertical}
.ajuda{font-size:12px;color:var(--mut2)}
.erroCampo{font-size:12.5px;color:var(--dng)}
.check{display:flex;gap:var(--s2);align-items:flex-start;font-size:13px;color:var(--mut);cursor:pointer}
.check input{margin-top:3px;width:16px;height:16px;accent-color:var(--brand)}

/* Login */
.loginWrap{min-height:100vh;display:grid;place-items:center;padding:var(--s5) var(--s4)}
.login{width:100%;max-width:400px;background:var(--surf);border:1px solid var(--line);border-radius:var(--r3);padding:var(--s6);box-shadow:var(--sh2)}
.login .sym{width:48px;height:48px;margin-bottom:var(--s4)}
.login h1{font-size:20px;font-weight:800;margin-bottom:var(--s1)}
.login p.sub{color:var(--mut);font-size:13.5px;margin-bottom:var(--s5)}
.login .rodape{margin-top:var(--s4);font-size:12.5px;color:var(--mut2);display:flex;gap:var(--s2);align-items:flex-start}
.msgErro{color:var(--dng);font-size:13px;min-height:20px;margin-top:var(--s3)}

/* Shell */
.app{display:grid;grid-template-columns:var(--side) minmax(0,1fr);min-height:100vh}
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:var(--s4) var(--s3);background:var(--surf);border-right:1px solid var(--line);overflow-y:auto}
.marca{display:flex;align-items:center;gap:var(--s3);padding:var(--s1) var(--s2) var(--s5)}
.marca b{font-size:15px;font-weight:800;letter-spacing:.04em;display:block}
.marca span{font-size:12px;color:var(--mut2)}
.nav{display:flex;flex-direction:column;gap:2px}
.nav button{display:flex;align-items:center;gap:var(--s3);width:100%;min-height:40px;padding:0 var(--s3);border:none;border-radius:var(--r1);background:transparent;color:var(--mut);font-weight:600;font-size:14px;cursor:pointer;text-align:left;transition:background var(--dur1) var(--ease),color var(--dur1) var(--ease)}
.nav button:hover{background:var(--surf2);color:var(--ink)}
.nav button[aria-current="page"]{background:var(--infobg);color:var(--info)}
.nav .badgeN{margin-left:auto;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--warnbg);color:var(--warn);font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.side .fim{margin-top:auto;padding-top:var(--s4);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:var(--s2)}
.quem{padding:var(--s2);font-size:12.5px;color:var(--mut);overflow-wrap:anywhere}
.quem b{display:block;color:var(--ink);font-size:13px}
.fimAcoes{display:flex;gap:var(--s1)}
.main{min-width:0;padding:var(--s6) var(--s6) var(--s7)}
.mtop{display:none;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4);background:var(--surf);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.mtop b{font-size:15px}
.scrim{position:fixed;inset:0;background:rgba(42,36,28,.45);z-index:25;opacity:0;pointer-events:none;transition:opacity var(--dur2)}
.scrim.on{opacity:1;pointer-events:auto}
.cab{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s4);flex-wrap:wrap;margin-bottom:var(--s5)}
.cab h1{font-size:24px;font-weight:800;letter-spacing:-.01em}
.cab p{color:var(--mut);margin-top:2px}
.cabAcoes{display:flex;gap:var(--s2);flex-wrap:wrap}
.view{animation:entra var(--dur3) var(--ease) both}
@keyframes entra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* Blocos */
.secTit{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:var(--s1) var(--s3);margin:var(--s6) 0 var(--s3)}
.secTit:first-child{margin-top:0}
.secTit h2{font-size:15px;letter-spacing:-.01em;text-transform:none;color:var(--ink);font-weight:800;display:flex;align-items:center;gap:8px}
.secTit h2::before{content:"";width:8px;height:8px;border-radius:99px;background:var(--brand);flex:none}
.secTit .extra{font-size:12.5px;color:var(--mut2)}
.card{background:var(--surf);border:1px solid var(--line);border-radius:var(--r2);box-shadow:var(--sh1)}
.pad{padding:var(--s4) var(--s5)}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:var(--s3)}
.kpi{background:var(--surf);border:1px solid var(--line);border-radius:var(--r2);padding:var(--s4);box-shadow:var(--sh1);display:flex;flex-direction:column;gap:var(--s1);text-align:left;min-height:112px;animation:surge var(--dur2) var(--ease) both}
@keyframes surge{from{opacity:0}to{opacity:1}}
.kpis .kpi:nth-child(2){animation-delay:25ms}.kpis .kpi:nth-child(3){animation-delay:50ms}.kpis .kpi:nth-child(4){animation-delay:75ms}.kpis .kpi:nth-child(5){animation-delay:100ms}
button.kpi{cursor:pointer;transition:border-color var(--dur1) var(--ease),transform var(--dur1) var(--ease)}
button.kpi:hover{border-color:var(--line2)}
button.kpi:active{transform:scale(.98)}
.kpi .l{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mut)}
.kpi .l .ico{width:15px;height:15px;color:var(--mut2)}
.kpi .v{font-size:26px;font-weight:800;line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.kpi .h{font-size:12.5px;color:var(--mut2);margin-top:auto;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.delta{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;background:var(--okbg);color:var(--ok);font-weight:800;font-size:11.5px;font-variant-numeric:tabular-nums}
.kpi.tom-ok .v{color:var(--ok)}.kpi.tom-warn .v{color:var(--warn)}.kpi.tom-dng .v{color:var(--dng)}
.spark{display:flex;align-items:flex-end;gap:3px;height:44px;margin-top:var(--s2)}
.spark i{flex:1;background:var(--brand);border-radius:4px 4px 2px 2px;min-height:3px;opacity:.88;transform-origin:center bottom;animation:sobe var(--dur1) var(--ease) both}
@keyframes sobe{from{transform:scaleY(.2)}to{transform:none}}
.atencao{display:flex;flex-direction:column}
.atencao button{display:flex;align-items:center;gap:var(--s3);width:100%;padding:var(--s3) var(--s5);background:transparent;border:none;border-bottom:1px solid var(--line);text-align:left;cursor:pointer;font-size:14px}
.atencao button:last-child{border-bottom:none}
.atencao button:hover{background:var(--surf2)}
.atencao .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;background:var(--info)}
.atencao .dot.warn{background:var(--warn)}.atencao .dot.dng{background:var(--dng)}.atencao .dot.ok{background:var(--ok)}
.atencao .vai{margin-left:auto;color:var(--mut2);font-size:13px;white-space:nowrap}
.glossario{padding:var(--s4) var(--s5)}
.glossario summary{cursor:pointer;font-weight:700;color:var(--mut)}
.glossario dl{display:grid;grid-template-columns:minmax(140px,220px) 1fr;gap:var(--s2) var(--s4);margin-top:var(--s4);font-size:13px}
.glossario dt{font-weight:700}.glossario dd{color:var(--mut)}

/* Tabelas */
.barra{display:flex;gap:var(--s2);flex-wrap:wrap;align-items:center;margin-bottom:var(--s3)}
.barra .busca{position:relative;flex:1 1 280px;max-width:440px}
.barra .busca .ico{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--mut2)}
.barra .busca input{padding-left:36px}
.chips{display:flex;gap:var(--s2);flex-wrap:wrap;margin-bottom:var(--s4)}
.tblWrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:var(--s3) var(--s4);border-bottom:1px solid var(--line);vertical-align:middle}
th{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut2);font-weight:800;background:var(--surf2);white-space:nowrap}
tr:last-child td{border-bottom:none}
tbody tr.clic{cursor:pointer;transition:background var(--dur1)}
tbody tr.clic:hover{background:var(--surf2)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.conta{display:flex;align-items:center;gap:var(--s3);min-width:220px}
.av{width:34px;height:34px;border-radius:10px;background:linear-gradient(140deg,var(--brand),var(--brand2));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0}
.conta b{display:block;font-weight:700;overflow-wrap:anywhere}
.conta span{font-size:12.5px;color:var(--mut2)}
.pill{display:inline-flex;align-items:center;gap:4px;padding:2px var(--s2);border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;background:var(--surf2);color:var(--mut)}
.pill.ok{background:var(--okbg);color:var(--ok)}.pill.warn{background:var(--warnbg);color:var(--warn)}.pill.dng{background:var(--dngbg);color:var(--dng)}.pill.info{background:var(--infobg);color:var(--info)}
.mut{color:var(--mut2)}
.pag{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);padding:var(--s3) var(--s4);border-top:1px solid var(--line);font-size:13px;color:var(--mut)}
.estado{padding:var(--s7) var(--s5);text-align:center;color:var(--mut);font-size:14px;display:flex;flex-direction:column;align-items:center;gap:var(--s1)}
.estado .ico{width:28px;height:28px;color:var(--mut2);margin-bottom:var(--s2);padding:10px;box-sizing:content-box;border-radius:var(--r2);background:var(--surf2)}
.estado b{display:block;color:var(--ink);margin-bottom:0}
.estado.erro b{color:var(--dng)}
.skel{height:14px;border-radius:6px;background:linear-gradient(90deg,var(--surf2),var(--line),var(--surf2));background-size:200% 100%;animation:sh 1.2s linear infinite}
@keyframes sh{from{background-position:200% 0}to{background-position:-200% 0}}
.nota{font-size:12.5px;color:var(--mut2);margin-top:var(--s3);line-height:1.55}

/* Funil */
.funil th,.funil td{text-align:right;white-space:nowrap}
.funil th:first-child,.funil td:first-child{text-align:left}
.funil td b{font-size:15px;font-variant-numeric:tabular-nums}
.funil td small{display:block;font-size:11.5px;color:var(--mut2)}
.funil td small.bom{color:var(--ok)}.funil td small.fraco{color:var(--warn)}
.funil tr.tot td{background:var(--infobg)}

/* Suporte */
.fb{padding:var(--s4) var(--s5);border-bottom:1px solid var(--line)}
.fb:last-child{border-bottom:none}
.fb.resolvido{opacity:.55}
.fb.denuncia{background:var(--dngbg)}
.fbCab{display:flex;align-items:center;gap:var(--s2);flex-wrap:wrap;margin-bottom:var(--s2);font-size:12.5px;color:var(--mut2)}
.fbMsg{white-space:pre-wrap;overflow-wrap:anywhere}
.fbPe{display:flex;align-items:center;gap:var(--s2);margin-top:var(--s3);font-size:12.5px;color:var(--mut2);flex-wrap:wrap}
.fbPe .esp{flex:1}
details.erros{margin-top:var(--s5)}
details.erros>summary{cursor:pointer;padding:var(--s4) var(--s5);font-weight:700;color:var(--mut);list-style:none;display:flex;align-items:center;gap:var(--s2)}
details.erros>summary::-webkit-details-marker{display:none}
pre.stack{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:var(--surf2);border:1px solid var(--line);border-radius:var(--r1);padding:var(--s3);max-height:50vh;overflow:auto}

/* Gaveta (ficha do usuário) */
.gaveta{position:fixed;top:0;right:0;height:100dvh;width:min(760px,100vw);background:var(--bg);border-left:1px solid var(--line);box-shadow:var(--sh2);z-index:40;display:flex;flex-direction:column;transform:translateX(102%);transition:transform var(--dur3) var(--ease);visibility:hidden}
.gaveta.on{transform:none;visibility:visible}
.gavCab{padding:var(--s5) var(--s5) 0;background:var(--surf);border-bottom:1px solid var(--line)}
.gavTopo{display:flex;align-items:flex-start;gap:var(--s3)}
.gavTopo .av{width:48px;height:48px;border-radius:14px;font-size:19px}
.gavTopo h2{font-size:18px;font-weight:800;overflow-wrap:anywhere;line-height:1.3}
.gavTopo .sub{color:var(--mut);font-size:13px}
.gavTopo .x{margin-left:auto}
.gavPills{display:flex;gap:var(--s2);flex-wrap:wrap;margin-top:var(--s3)}
.gavRapido{display:flex;gap:var(--s2);flex-wrap:wrap;margin-top:var(--s4)}
.abas{display:flex;gap:var(--s1);margin-top:var(--s4);overflow-x:auto;scrollbar-width:none}
.abas button{min-height:40px;padding:0 var(--s3);border:none;background:transparent;color:var(--mut);font-weight:700;font-size:13.5px;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;transition:color var(--dur2) var(--ease),border-color var(--dur2) var(--ease)}
.abas button[aria-selected="true"]{color:var(--info);border-bottom-color:var(--info)}
.gavCorpo{flex:1;overflow-y:auto;padding:var(--s5)}
.mini{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:var(--s3);margin-bottom:var(--s5)}
.mc{background:var(--surf);border:1px solid var(--line);border-radius:var(--r2);padding:var(--s3) var(--s4)}
.mc .l{font-size:12px;color:var(--mut2);font-weight:600}
.mc .v{font-size:17px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.lista .li{display:flex;justify-content:space-between;gap:var(--s4);padding:var(--s3) var(--s4);border-bottom:1px solid var(--line);font-size:13.5px}
.lista .li:last-child{border-bottom:none}
.lista .li .d{color:var(--mut2);text-align:right;flex-shrink:0;max-width:55%;overflow-wrap:anywhere}
.kv{display:grid;grid-template-columns:minmax(120px,200px) 1fr;gap:var(--s2) var(--s4);padding:var(--s4) var(--s5);font-size:13.5px}
.kv dt{color:var(--mut2);font-weight:600}.kv dd{overflow-wrap:anywhere}
.ferr{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:var(--s3);margin-bottom:var(--s5)}
.fc{background:var(--surf);border:1px solid var(--line);border-radius:var(--r2);padding:var(--s4);display:flex;flex-direction:column;gap:var(--s2)}
.fc b{font-size:14px}.fc p{font-size:12.5px;color:var(--mut);flex:1}
.fc .btn{align-self:flex-start}
.fc.perigo{border-color:var(--dng);background:var(--dngbg)}
.linhaTempo .it{display:flex;gap:var(--s3);padding:var(--s3) var(--s4);border-bottom:1px solid var(--line);font-size:13.5px}
.linhaTempo .it:last-child{border-bottom:none}
.linhaTempo .q{color:var(--mut2);width:120px;flex-shrink:0;font-size:12.5px}
.notaItem{padding:var(--s3) var(--s4);border-bottom:1px solid var(--line)}
.notaItem:last-child{border-bottom:none}
.notaItem .q{font-size:12px;color:var(--mut2);margin-bottom:2px}

/* Diálogo */
.dlgOv{position:fixed;inset:0;background:rgba(42,36,28,.5);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:max(var(--s4),8vh) var(--s4) var(--s4);overflow-y:auto}
.dlg{width:100%;max-width:480px;background:var(--surf);border:1px solid var(--line);border-radius:var(--r3);padding:var(--s5);box-shadow:var(--sh2);animation:pop var(--dur2) var(--ease) both}
.dlg.largo{max-width:640px}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
.dlg h3{font-size:18px;font-weight:800;margin-bottom:var(--s2)}
.dlg .txt{color:var(--mut);font-size:13.5px;margin-bottom:var(--s4)}
.dlg .acoes{display:flex;justify-content:flex-end;gap:var(--s2);margin-top:var(--s5);flex-wrap:wrap}
.qr{display:block;width:200px;height:200px;margin:var(--s3) auto;background:#fff;padding:var(--s2);border-radius:var(--r2)}
.codigo{font-size:22px;letter-spacing:.3em;text-align:center;font-variant-numeric:tabular-nums}

/* Toast */
.toast{position:fixed;left:50%;bottom:var(--s5);transform:translate(-50%,12px);opacity:0;background:var(--surf);color:var(--ink);border:1px solid var(--line2);box-shadow:var(--sh1);padding:var(--s3) var(--s4);border-radius:var(--r2);font-weight:600;font-size:13.5px;z-index:80;max-width:min(560px,calc(100vw - 32px));transition:opacity var(--dur2),transform var(--dur2) var(--ease);pointer-events:none}
.toast.on{opacity:1;transform:translate(-50%,0)}
.toast.err{background:var(--dngbg);color:var(--dng);border-color:transparent}
.paleta .dlg{max-width:520px}
.palLista{display:flex;flex-direction:column;gap:2px;margin-top:var(--s3);max-height:min(50vh,420px);overflow:auto}
.palItem{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;min-height:44px;text-align:left;background:transparent;border:none;border-radius:var(--r1);padding:var(--s2) var(--s3);cursor:pointer}
.palItem b{color:var(--ink);font-size:14px}.palItem span{color:var(--mut);font-size:12.5px}
.palItem.on,.palItem:hover,.palItem:focus-visible{background:var(--surf2)}

@media (max-width:960px){
 .app{grid-template-columns:minmax(0,1fr)}
 .side{position:fixed;inset:0 auto 0 0;width:min(280px,86vw);z-index:30;transform:translateX(-102%);transition:transform var(--dur3) var(--ease);visibility:hidden}
 .side.on{transform:none;visibility:visible}
 .mtop{display:flex}
 .main{padding:var(--s5) var(--s4) var(--s7)}
 .cab h1{font-size:20px}
 .hideSm{display:none}
 .glossario dl,.kv{grid-template-columns:1fr}
 .kv dt{margin-top:var(--s2)}
}
@media (max-width:520px){
 .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
 .kpi{min-height:100px;padding:var(--s3)}
 .kpi .v{font-size:21px}
 .gavCab{padding:var(--s4) var(--s4) 0}.gavCorpo{padding:var(--s4)}
 .login{padding:var(--s5)}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}button.kpi:active{transform:none}}
`;

const BODY = String.raw`
<div id="telaLogin" class="loginWrap hidden">
 <form class="login" id="formLogin" novalidate>
  <div class="sym">__SYM__</div>
  <h1>Painel administrativo OLLI</h1>
  <p class="sub">Acesso restrito à equipe da OLLI.</p>
  <div class="campo"><label for="email">E-mail</label><input class="inp" id="email" type="email" autocomplete="username" required></div>
  <div class="campo"><label for="senha">Senha</label><input class="inp" id="senha" type="password" autocomplete="current-password" required></div>
  <button class="btn lg" id="loginBtn" type="submit">Entrar</button>
  <div class="msgErro" id="loginErr" role="alert"></div>
  <div class="rodape"><span class="ico" data-ico="shield"></span><span>O código do autenticador só é pedido em aparelho novo. Depois de confirmado, este aparelho fica lembrado por 30 dias e a sessão continua aberta.</span></div>
 </form>
</div>

<div id="telaApp" class="hidden">
 <div class="mtop"><button class="btn ghost icon" id="menuBtn" aria-label="Abrir menu"><span class="ico" data-ico="menu"></span></button><div class="sym">__SYM__</div><b id="mtopTit">Painel</b></div>
 <div class="scrim" id="scrim"></div>
 <div class="app">
  <aside class="side" id="side" aria-label="Seções do painel">
   <div class="marca"><div class="sym">__SYM__</div><div><b>OLLI</b><span>Painel administrativo</span></div></div>
   <nav class="nav" id="nav"></nav>
   <div class="fim">
    <div class="quem" id="quem"></div>
    <div class="fimAcoes">
     <button class="btn ghost" id="temaBtn" title="Alternar tema claro/escuro"><span class="ico" data-ico="moon"></span><span>Tema</span></button>
     <button class="btn ghost" id="sairBtn"><span class="ico" data-ico="logout"></span><span>Sair</span></button>
    </div>
   </div>
  </aside>
  <main class="main" id="main">
   <div class="cab"><div><h1 id="titulo">Visão geral</h1><p id="subtitulo"></p></div><div class="cabAcoes" id="cabAcoes"></div></div>
   <div id="gateMfa" class="hidden"></div>
   <section class="view" id="v-geral" data-view="geral"></section>
   <section class="view hidden" id="v-usuarios" data-view="usuarios"></section>
   <section class="view hidden" id="v-organizacoes" data-view="organizacoes"></section>
   <section class="view hidden" id="v-funil" data-view="funil"></section>
   <section class="view hidden" id="v-emails" data-view="emails"></section>
   <section class="view hidden" id="v-troca" data-view="troca"></section>
   <section class="view hidden" id="v-suporte" data-view="suporte"></section>
   <section class="view hidden" id="v-auditoria" data-view="auditoria"></section>
   <section class="view hidden" id="v-admins" data-view="admins"></section>
   <section class="view hidden" id="v-seguranca" data-view="seguranca"></section>
  </main>
 </div>
 <div class="scrim" id="gavScrim"></div>
 <aside class="gaveta" id="gaveta" role="dialog" aria-modal="true" aria-labelledby="gavNome"></aside>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const SCRIPT = String.raw`
const SB=CFG.sb,ANON=CFG.anon;
let TOKEN='',ME=null,RENOVA=null,MET=null,USERS=null,USERS_ERRO='',FB=null,FB_ERRO='',TROCA=null,TROCA_ERRO='',VIEW='geral';
let SEG='todos',BUSCA='',ORDEM='cadastro',PAG=0,ESCOPO='clientes',INTERNAS_OK=true,FONTES={},ORGS=null,ORGS_ERRO='';const POR_PAG=50;
let FBFILTER='abertos',TROCA_FILTRO='pendente',TROCA_MAX=CFG.trocaMax;
let USER_ABERTO=null,DET=null,ABA='resumo';
const DIA=86400000;
const $=id=>document.getElementById(id);

/* ── ícones (traço 1.8, 24x24) ── */
const P={
 home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6 6 0 0 1 3.5 5.5"/>',
 funnel:'<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
 gift:'<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8C10 4 6 4 6 7s4 1 6 1zm0 0c2-4 6-4 6-1s-4 1-6 1z"/>',
 chat:'<path d="M4 5h16v11H8l-4 4z"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
 refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 x:'<path d="M6 6l12 12M18 6L6 18"/>',
 logout:'<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
 download:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
 moon:'<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
 coin:'<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12"/>',
 doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
 activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
 trend:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
 alert:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};
function svg(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(P[n]||'')+'</svg>';}
function ico(n){const s=document.createElement('span');s.className='ico';s.setAttribute('aria-hidden','true');s.innerHTML=svg(n);return s;}
function pintarIcones(raiz){(raiz||document).querySelectorAll('[data-ico]').forEach(s=>{s.innerHTML=svg(s.getAttribute('data-ico'));s.setAttribute('aria-hidden','true');s.removeAttribute('data-ico');});}

/* ── utilidades ── */
function el(t,p){const e=document.createElement(t);if(p)Object.assign(e,p);for(let i=2;i<arguments.length;i++){const k=arguments[i];if(k==null||k===false)continue;if(Array.isArray(k)){k.forEach(c=>{if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(String(c)));});}else e.append(k.nodeType?k:document.createTextNode(String(k)));}return e;}
function limpar(n){while(n.firstChild)n.removeChild(n.firstChild);return n;}
let TT=null;
function toast(msg,kind){const t=$('toast');t.textContent=msg;t.className='toast on '+(kind==='err'?'err':'');clearTimeout(TT);TT=setTimeout(()=>{t.className='toast';},kind==='err'?5200:3200);}
function fmtBRL(n){return 'R$ '+(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtNum(n){return (Number(n)||0).toLocaleString('pt-BR');}
function fmtDate(s){if(!s)return '—';const d=new Date(s);return isNaN(d)?'—':d.toLocaleDateString('pt-BR');}
function fmtDH(s){if(!s)return '—';const d=new Date(s);return isNaN(d)?'—':d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function rel(s){if(!s)return 'nunca';const t=Date.parse(s);if(!isFinite(t))return '—';const d=Math.floor((Date.now()-t)/DIA);if(d<=0){const h=Math.floor((Date.now()-t)/3600000);return h<1?'agora há pouco':'há '+h+' h';}if(d===1)return 'ontem';if(d<30)return 'há '+d+' dias';const m=Math.floor(d/30);return m<12?'há '+m+(m===1?' mês':' meses'):'há '+Math.floor(m/12)+(m<24?' ano':' anos');}
function initials(s){return (s||'?').trim().charAt(0).toUpperCase();}
function pode(cap){const p=ME&&ME.papel;if(!p)return false;if(cap==='detalhe')return ['suporte','financeiro','admin','owner'].includes(p);if(cap==='financeiro')return ['financeiro','admin','owner'].includes(p);if(cap==='suporte')return ['suporte','admin','owner'].includes(p);const R={leitura:1,suporte:2,financeiro:2,admin:3,owner:4};return (R[p]||0)>=(R[cap]||99);}
function estado(tipo,titulo,texto){return el('div',{className:'estado'+(tipo==='erro'?' erro':'')},ico(tipo==='erro'?'alert':'info'),el('b',{},titulo),texto||'');}
function carregando(n){const c=el('div',{className:'pad',role:'status'});c.append(el('span',{className:'sr'},'Carregando…'));for(let i=0;i<n;i++)c.append(el('div',{className:'skel',style:'width:'+(40+((i*37)%50))+'%;margin:12px 0'}));return c;}
const ERROS={
 mfa_necessario:'Confirme o código do autenticador para continuar.',
 mfa_recente_necessario:'Esta ação é irreversível: confirme o código do autenticador agora (Segurança → Confirmar código) e tente de novo.',
 sem_permissao:'Seu papel não permite esta ação.',
 motivo_invalido:'Escreva um motivo entre 3 e 500 caracteres.',
 quantidade_invalida:'Quantidade inválida.',
 saldo_insuficiente:'O saldo não cobre essa remoção.',
 saldo_indisponivel:'Não consegui ler o saldo agora. Nada foi alterado.',
 sessoes_sem_migration:'O banco ainda não tem a função de desconectar (migration pendente).',
 aparelhos_sem_migration:'O banco ainda não tem a tabela de aparelhos confiáveis (migration pendente).',
 muitas_requisicoes:'Muitas tentativas seguidas. Espere um minuto.',
 usuario_nao_encontrado:'Usuário não encontrado.',
 confirmacao_invalida:'Confirmação inválida.',
 assinatura_indeterminada:'Não consegui confirmar a assinatura do usuário no gateway. Nada foi excluído.',
 falha_cancelamento:'Não consegui cancelar a assinatura no gateway. Nada foi excluído.',
 dias_invalidos:'Use entre 1 e 365 dias.',
 vigencia_invalida:'Vigência inválida.',
 owner_bootstrap_protegido:'O e-mail raiz não pode ser alterado por aqui.',
 lista_invalida:'A seleção de contas é inválida (até 50, sem repetir).',
 confirmacao_divergente:'A quantidade digitada não bate com a seleção.',
 banco_indisponivel:'O banco não respondeu. Tente de novo em instantes.',
 auditoria_indisponivel:'A trilha de auditoria não respondeu. Nada foi registrado.',
 origem_invalida:'Pedido recusado por segurança (origem diferente do painel).',
 cnpj_invalido:'CNPJ precisa ter 14 números.',
 cnpj_nao_encontrado:'CNPJ não encontrado na Receita.',
 consulta_indisponivel:'A consulta da Receita não respondeu agora. Tente mais tarde.'
};
function mensagemErro(e){if(e&&e.codigo&&ERROS[e.codigo])return ERROS[e.codigo];if(e&&e.status===502)return 'O servidor não conseguiu concluir. Nada foi confirmado; tente de novo.';return 'Não consegui concluir a ação'+(e&&e.codigo?' ('+e.codigo+')':'')+'.';}

/* ── tema ── */
function temaAtual(){try{return localStorage.getItem('olli_admin_tema')||'';}catch{return '';}}
function aplicarTema(t){if(t)document.documentElement.setAttribute('data-theme',t);else document.documentElement.removeAttribute('data-theme');}
function alternarTema(){const escuro=document.documentElement.getAttribute('data-theme')==='dark'||(!document.documentElement.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);const novo=escuro?'light':'dark';aplicarTema(novo);try{localStorage.setItem('olli_admin_tema',novo);}catch{}}
aplicarTema(temaAtual());

/* ── sessão: access token só em memória; refresh no cookie HttpOnly do Worker ── */
async function sessaoPost(path,body){
 const headers={'Content-Type':'application/json'};if(TOKEN)headers.Authorization='Bearer '+TOKEN;
 const r=await fetch('/admin/api/'+path,{method:'POST',credentials:'same-origin',headers,body:JSON.stringify(body||{})});
 const j=await r.json().catch(()=>({ok:false}));return {r,j};
}
function aplicarToken(j){TOKEN=j.access_token;clearTimeout(RENOVA);const s=Math.max(60,(Number(j.expires_in)||3600)-120);RENOVA=setTimeout(()=>{renovar().catch(()=>{});},s*1000);}
async function guardarSessao(refresh){const {r,j}=await sessaoPost('sessao',{refresh_token:refresh});if(!r.ok||!j.access_token){const e=new Error(j.erro||'sessao');e.codigo=j.erro;e.status=r.status;throw e;}aplicarToken(j);}
async function renovar(){try{const {r,j}=await sessaoPost('sessao/renovar');if(r.ok&&j.access_token){aplicarToken(j);return 'ok';}return r.status===503?'indisponivel':'sem_sessao';}catch{return 'indisponivel';}}

async function api(path,opts,tentou){
 opts=opts||{};
 const r=await fetch('/admin/api/'+path,{...opts,credentials:'same-origin',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json',...(opts.headers||{})}});
 if(r.status===401&&!tentou){const st=await renovar();if(st==='ok')return api(path,opts,true);telaLogin(st==='indisponivel'?'O servidor de login não respondeu. Tente de novo em instantes.':'Sua sessão terminou. Entre de novo.');const e=new Error('401');e.codigo='nao_autorizado';e.status=401;throw e;}
 const j=await r.json().catch(()=>({ok:false,erro:'resposta_invalida'}));
 if(!r.ok||j.ok===false){const e=new Error(j.erro||('http_'+r.status));e.codigo=j.erro;e.status=r.status;e.dados=j;throw e;}
 return j;
}
async function authFetch(path,opts={},retry=true){
 const body=opts&&opts.body;
 const headers={apikey:ANON,Authorization:'Bearer '+TOKEN,...(body?{'Content-Type':'application/json'}:{}),...(opts&&opts.headers||{})};
 const r=await fetch(SB+'/auth/v1/'+path,{...opts,headers});
 if(r.status===401&&retry&&await renovar()==='ok')return authFetch(path,opts,false);
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.msg||j.message||j.error_description||'Falha de autenticação');
 return j;
}

/* ── login ── */
function telaLogin(msg){TOKEN='';ME=null;clearTimeout(RENOVA);fecharGaveta();$('telaApp').classList.add('hidden');$('telaLogin').classList.remove('hidden');$('loginErr').textContent=msg||'';setTimeout(()=>{($('email').value?$('senha'):$('email')).focus();},30);}
async function login(ev){
 if(ev)ev.preventDefault();
 $('loginErr').textContent='';
 const email=$('email').value.trim(),senha=$('senha').value;
 if(!email||!senha){$('loginErr').textContent='Preencha e-mail e senha.';return;}
 const b=$('loginBtn');b.textContent='Entrando…';b.disabled=true;
 try{
  const r=await fetch(SB+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json',apikey:ANON},body:JSON.stringify({email,password:senha})});
  const j=await r.json().catch(()=>({}));
  if(!j.access_token||!j.refresh_token){$('loginErr').textContent=r.status===429?'Muitas tentativas. Espere um pouco.':'E-mail ou senha incorretos.';return;}
  TOKEN=j.access_token;
  try{await guardarSessao(j.refresh_token);}catch(e){$('loginErr').textContent=e.status===401?'Esta conta não tem acesso ao painel.':'Entrou, mas não consegui abrir a sessão do painel. Tente de novo.';TOKEN='';return;}
  $('senha').value='';
  await entrar();
 }catch(e){$('loginErr').textContent='Não consegui entrar agora. Verifique a conexão.';}
 finally{b.textContent='Entrar';b.disabled=false;}
}
async function entrar(){
 await carregarIdentidade();
 $('telaLogin').classList.add('hidden');$('telaApp').classList.remove('hidden');
 montarNav();
 if(ME.aal!=='aal2'){await mostrarGateMfa();return;}
 liberarDados();
}
async function sair(esquecer){
 try{await sessaoPost('sessao/sair',{esquecerAparelho:!!esquecer});}catch{}
 USERS=null;MET=null;FB=null;TROCA=null;
 telaLogin(esquecer?'Você saiu e este aparelho foi esquecido. O código será pedido na próxima entrada.':'Você saiu. Neste aparelho, a próxima entrada pede só a senha.');
}
async function carregarIdentidade(){
 const j=await api('me');ME=j.user||null;
 if(!ME)throw new Error('sem_identidade');
 limpar($('quem')).append(el('b',{},ME.email||''),ME.papel+' · '+(ME.aalVia==='mfa'?'verificado por código':ME.aalVia==='aparelho'?'aparelho confiável':'código pendente'));
}

/* ── MFA ── */
async function listarFatoresMfa(){
 // O endpoint GET /auth/v1/factors não lista fatores no GoTrue atual. O SDK
 // oficial implementa listFactors() sobre getUser() e lê user.factors.
 const j=await authFetch('user');
 const todos=Array.isArray(j&&j.factors)?j.factors:[];
 return todos.filter((f,i,a)=>f&&f.factor_type==='totp'&&f.status==='verified'&&a.findIndex(x=>x.id===f.id)===i);
}
function aplicarSessaoMfa(j){
 const token=j&&j.access_token;
 if(typeof token!=='string'||!token)throw new Error('A verificação não devolveu uma sessão válida.');
 TOKEN=token;
}
async function verificarFator(factorId,code,confiar){
 const ch=await authFetch('factors/'+encodeURIComponent(factorId)+'/challenge',{method:'POST',body:'{}'});
 const v=await authFetch('factors/'+encodeURIComponent(factorId)+'/verify',{method:'POST',body:JSON.stringify({challenge_id:ch.id,code})});
 aplicarSessaoMfa(v);
 if(v.refresh_token)await guardarSessao(v.refresh_token);
 if(confiar){try{await api('aparelho/confiar',{method:'POST',body:'{}'});}catch(e){toast('Código confirmado, mas não consegui lembrar este aparelho: '+mensagemErro(e),'err');}}
 await carregarIdentidade();
}
function campoConfiar(){const c=el('input',{type:'checkbox',checked:true});const l=el('label',{className:'check'},c,el('span',{},'Lembrar este aparelho por 30 dias (não pedir o código de novo aqui)'));return {c,l};}
async function abrirDesafioMfa(fator,aoConcluir){
 return new Promise(resolve=>{
  const ov=el('div',{className:'dlgOv'}),d=el('div',{className:'dlg',role:'dialog',ariaModal:'true'});
  d.append(el('h3',{},'Confirme o código do autenticador'),el('div',{className:'txt'},'Abra o aplicativo autenticador onde está "OLLI Admin" e digite o código de 6 números. Ele muda a cada 30 segundos.'));
  const code=el('input',{className:'inp codigo',inputMode:'numeric',autocomplete:'one-time-code',enterKeyHint:'done',pattern:'[0-9]*',maxLength:6,placeholder:'000000',ariaLabel:'Código do autenticador'}),err=el('div',{className:'erroCampo',role:'alert'});
  const conf=campoConfiar();
  d.append(el('div',{className:'campo'},code,err),conf.l);
  const save=el('button',{className:'btn'},'Confirmar');
  save.disabled=true;
  code.oninput=()=>{code.value=code.value.replace(/\D/g,'').slice(0,6);save.disabled=code.value.length!==6;err.textContent='';};
  code.onkeydown=e=>{if(e.key==='Enter'&&!save.disabled){e.preventDefault();save.click();}};
  const fechar=ok=>{ov.remove();document.removeEventListener('keydown',esc);resolve(ok);};
  const esc=e=>{if(e.key==='Escape')fechar(false);};document.addEventListener('keydown',esc);
  save.onclick=async()=>{const valor=code.value.trim();if(!/^\d{6}$/.test(valor)){err.textContent='Digite os 6 números do código atual.';code.focus();return;}save.disabled=true;try{await verificarFator(fator.id,valor,conf.c.checked);fechar(true);toast(conf.c.checked?'Código confirmado. Este aparelho fica lembrado por 30 dias.':'Código confirmado.','ok');if(aoConcluir)await aoConcluir();}catch(e){err.textContent=String(e&&e.message||'Código inválido.').slice(0,240);code.select();}finally{save.disabled=code.value.length!==6;}};
  const ajuda=el('button',{className:'btn ghost',type:'button'},'Perdi o autenticador');
  ajuda.onclick=()=>{err.textContent='Peça a outro administrador (ou ao suporte do Supabase, se for o dono) para remover o fator antigo. Depois, cadastre de novo em Segurança. Nenhum dado é liberado sem o código.';};
  d.append(el('div',{className:'acoes'},ajuda,el('button',{className:'btn sec',type:'button',onclick:()=>fechar(false)},'Agora não'),save));
  ov.append(d);document.body.append(ov);code.focus();
 });
}
async function abrirSeguranca(aoConcluir){
 const existentes=await listarFatoresMfa();
 if(existentes.length)return abrirDesafioMfa(existentes[0],aoConcluir);
 const ov=el('div',{className:'dlgOv'}),d=el('div',{className:'dlg'});ov.append(d);document.body.append(ov);
 const fechar=()=>ov.remove();
 d.append(el('h3',{},'Ativar verificação em duas etapas'),el('div',{className:'txt'},'Use Google Authenticator, Authy, 1Password ou outro app de código (TOTP). Escaneie o QR Code e digite o código que aparecer.'));
 try{
  const f=await authFetch('factors',{method:'POST',body:JSON.stringify({factor_type:'totp',friendly_name:'OLLI Admin'})});
  const qr=f&&f.totp&&f.totp.qr_code;
  if(qr)d.append(el('img',{src:qr,alt:'QR Code para cadastrar o OLLI Admin no autenticador',className:'qr'}));
  if(f&&f.totp&&f.totp.secret)d.append(el('div',{className:'ajuda',style:'word-break:break-all;text-align:center;margin-bottom:12px'},'Chave manual: '+f.totp.secret));
  const code=el('input',{className:'inp codigo',inputMode:'numeric',autocomplete:'one-time-code',maxLength:6,placeholder:'000000'}),err=el('div',{className:'erroCampo',role:'alert'});
  const conf=campoConfiar();
  d.append(el('div',{className:'campo'},code,err),conf.l);
  const save=el('button',{className:'btn'},'Ativar');
  code.oninput=()=>{code.value=code.value.replace(/\D/g,'').slice(0,6);};
  save.onclick=async()=>{save.disabled=true;try{await verificarFator(f.id,code.value.trim(),conf.c.checked);fechar();toast('Verificação em duas etapas ativada.','ok');if(aoConcluir)await aoConcluir();}catch(e){err.textContent=e.message||'Não consegui verificar.';}finally{save.disabled=false;}};
  d.append(el('div',{className:'acoes'},el('button',{className:'btn sec',onclick:fechar},'Cancelar'),save));
  code.focus();
 }catch(e){d.append(el('div',{className:'erroCampo'},e.message||'Não consegui iniciar a ativação.'),el('div',{className:'acoes'},el('button',{className:'btn sec',onclick:fechar},'Fechar')));}
}
async function mostrarGateMfa(){
 document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
 $('titulo').textContent='Confirme o código';$('subtitulo').textContent='';limpar($('cabAcoes'));
 const g=limpar($('gateMfa'));g.classList.remove('hidden');
 // Erro ao ler os fatores NÃO vira "sem fator": isso mandaria cadastrar outro autenticador.
 let fatores=[];try{fatores=await listarFatoresMfa();}catch(e){
  const ce=el('div',{className:'card pad',style:'max-width:620px'});
  ce.append(el('h2',{style:'font-size:18px;margin-bottom:8px'},'Não consegui conferir a verificação em duas etapas'),
   el('p',{className:'mut',style:'margin-bottom:16px'},(e&&e.message)||'Falha de conexão. Nenhum dado foi liberado.'),
   el('button',{className:'btn',onclick:()=>mostrarGateMfa()},'Tentar de novo'));
  g.append(ce);return;
 }
 const c=el('div',{className:'card pad',style:'max-width:620px'});
 c.append(el('h2',{style:'font-size:18px;margin-bottom:8px'},fatores.length?'Falta só o código do autenticador':'Ative a verificação em duas etapas'),
  el('p',{className:'mut',style:'margin-bottom:16px'},'Este painel mostra dados de todos os clientes, então a senha sozinha não abre nada. '+(fatores.length?'Confirme o código uma vez neste aparelho e ele fica lembrado por 30 dias.':'Cadastre um app autenticador; leva 1 minuto.')),
  el('button',{className:'btn',onclick:()=>abrirSeguranca(async()=>{if(ME.aal==='aal2'){g.classList.add('hidden');montarNav();liberarDados();}})},fatores.length?'Digitar o código':'Ativar agora'));
 g.append(c);
 if(fatores.length)abrirDesafioMfa(fatores[0],async()=>{if(ME.aal==='aal2'){g.classList.add('hidden');montarNav();liberarDados();}});
}

/* ── diálogo genérico (substitui prompt/confirm) ── */
const MOTIVO={nome:'motivo',rotulo:'Motivo',tipo:'textarea',ajuda:'Fica registrado na auditoria. Mínimo 3 caracteres.',min:3,max:500};
function dialogo(o){
 return new Promise(resolve=>{
  const ov=el('div',{className:'dlgOv'}),d=el('form',{className:'dlg'+(o.largo?' largo':''),noValidate:true});ov.append(d);
  d.append(el('h3',{},o.titulo));
  if(o.texto)d.append(el('div',{className:'txt'},o.texto));
  if(o.conteudo)d.append(o.conteudo);
  const inputs={};
  for(const c of (o.campos||[])){
   let inp;
   if(c.tipo==='textarea')inp=el('textarea',{className:'inp',maxLength:c.max||500,placeholder:c.ph||''});
   else if(c.tipo==='select'){inp=el('select',{className:'inp'});c.opcoes.forEach(op=>inp.append(el('option',{value:op[0],selected:op[0]===c.valor},op[1])));}
   else inp=el('input',{className:'inp',type:c.tipo||'text',placeholder:c.ph||'',min:c.minN!=null?String(c.minN):'',max:c.maxN!=null?String(c.maxN):'',value:c.valor!=null?String(c.valor):''});
   inp.id='f_'+c.nome;
   const erro=el('div',{className:'erroCampo'});
   d.append(el('div',{className:'campo'},el('label',{htmlFor:inp.id},c.rotulo),inp,c.ajuda?el('div',{className:'ajuda'},c.ajuda):null,erro));
   inputs[c.nome]={inp,erro,c};
  }
  let digitar=null;
  if(o.digitar){digitar=el('input',{className:'inp',autocomplete:'off',id:'f_digitar'});d.append(el('div',{className:'campo'},el('label',{htmlFor:'f_digitar'},'Para confirmar, digite '+o.digitar),digitar));}
  const ok=el('button',{className:'btn'+(o.perigo?' danger':''),type:'submit'},o.confirmar||'Confirmar');
  const fechar=v=>{ov.remove();document.removeEventListener('keydown',esc);resolve(v);};
  const esc=e=>{if(e.key==='Escape')fechar(null);};document.addEventListener('keydown',esc);
  d.append(el('div',{className:'acoes'},o.semCancelar?null:el('button',{className:'btn sec',type:'button',onclick:()=>fechar(null)},o.cancelar||'Cancelar'),o.semConfirmar?null:ok));
  d.onsubmit=e=>{e.preventDefault();const out={};let valido=true;
   for(const k in inputs){const {inp,erro,c}=inputs[k];const v=String(inp.value||'').trim();erro.textContent='';
    if(c.tipo==='number'){if(v===''){if(c.obrigatorio){erro.textContent='Obrigatório.';valido=false;}out[k]=null;continue;}const n=Number(v);if(!Number.isInteger(n)||(c.minN!=null&&n<c.minN)||(c.maxN!=null&&n>c.maxN)){erro.textContent='Use um número inteiro entre '+c.minN+' e '+c.maxN+'.';valido=false;}out[k]=n;continue;}
    if(c.min&&v.length<c.min){erro.textContent='Mínimo '+c.min+' caracteres.';valido=false;}
    out[k]=v;}
   if(digitar&&digitar.value.trim()!==o.digitar){valido=false;digitar.focus();toast('Digite '+o.digitar+' para confirmar.','err');}
   if(valido)fechar(out);};
  ov.onclick=e=>{if(e.target===ov)fechar(null);};
  document.body.append(ov);
  const primeiro=d.querySelector('input,textarea,select');if(primeiro)primeiro.focus();else ok.focus();
 });
}

/* ── navegação ── */
const NAV=[
 {id:'geral',rot:'Visão geral',ico:'home',sub:'O que está acontecendo no OLLI agora.',cap:'admin'},
 {id:'usuarios',rot:'Usuários',ico:'users',sub:'Todas as contas. Clique numa linha para abrir a ficha completa e as ferramentas.',cap:'admin'},
 {id:'organizacoes',rot:'Organizações',ico:'users',sub:'Marque uma organização inteira como interna (equipe, teste) — com prévia, confirmação e desfazer. Internas ficam fora de todos os números.',cap:'admin'},
 {id:'funil',rot:'Funil',ico:'funnel',sub:'Do cadastro ao pagamento, por semana de cadastro.',cap:'admin'},
 {id:'emails',rot:'E-mails',ico:'mail',sub:'Saúde dos e-mails automáticos e oferta do Pro para quem já usa o OLLI.',cap:'admin'},
 {id:'troca',rot:'Crédito de troca',ico:'gift',sub:'Quem veio de outro app e pediu meses de Pro grátis.',cap:'financeiro'},
 {id:'suporte',rot:'Suporte',ico:'chat',sub:'Mensagens, sugestões, denúncias e erros enviados pelo app.',cap:'suporte'},
 {id:'auditoria',rot:'Auditoria',ico:'list',sub:'Tudo o que foi feito neste painel. Não pode ser alterado nem apagado.',cap:'admin'},
 {id:'admins',rot:'Administradores',ico:'key',sub:'Quem pode entrar neste painel e com qual papel.',cap:'owner'},
 {id:'seguranca',rot:'Segurança',ico:'shield',sub:'Sua sessão, aparelhos lembrados e senha.',cap:'leitura'}
];
function montarNav(){
 const nav=limpar($('nav'));
 for(const n of NAV){if(!pode(n.cap))continue;const b=el('button',{type:'button',onclick:()=>{location.hash=n.id;}},ico(n.ico),el('span',{},n.rot));b.dataset.id=n.id;if(n.id==='suporte')b.append(el('span',{className:'badgeN hidden',id:'nbSuporte'}));if(n.id==='troca')b.append(el('span',{className:'badgeN hidden',id:'nbTroca'}));nav.append(b);}
}
function viewPadrao(){for(const n of NAV)if(pode(n.cap))return n.id;return 'seguranca';}
function irPara(id){
 if(!ME||ME.aal!=='aal2')return;
 const n=NAV.find(x=>x.id===id&&pode(x.cap))||NAV.find(x=>x.id===viewPadrao());
 VIEW=n.id;
 document.querySelectorAll('#nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.id===VIEW?'page':'false'));
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.dataset.view!==VIEW));
 $('titulo').textContent=n.rot;$('subtitulo').textContent=n.sub;$('mtopTit').textContent=n.rot;
 const ca=limpar($('cabAcoes'));
 ca.append(el('button',{className:'btn sec',onclick:()=>recarregar()},ico('refresh'),'Atualizar'));
 ca.append(el('button',{className:'btn ghost',type:'button',onclick:abrirPaleta},'Ir para'));
 fecharMenu();
 renderView();
 window.scrollTo(0,0);
}
function renderView(){({geral:renderGeral,usuarios:renderUsuarios,organizacoes:carregarOrgs,funil:carregarFunil,emails:carregarEmails,troca:renderTroca,suporte:renderSuporte,auditoria:carregarAuditoria,admins:carregarAdmins,seguranca:renderSeguranca})[VIEW]();}
/* ── e-mails: saúde e oferta do Pro (D-1859) ── */
let EMAILS=null,EMAILS_ERRO='',OFERTA=null,OFERTA_ERRO='',OFERTA_SEL=new Set();
const MOTIVO_OFERTA={sairia:['Pode receber','ok'],enfileirado:['Enfileirado','ok'],conta_indisponivel:['E-mail indisponível','dng'],suprimido:['Descadastrou','warn'],excluido:['Conta interna',''],membro_equipe:['Membro de equipe',''],ja_assinou:['Já assinou','warn'],nao_e_gratis:['Pro ou teste ativo','info'],oferta_recente:['Oferta há menos de 30 dias',''],recebeu_email_24h:['E-mail nas últimas 24 h',''],duplicado:['Já enfileirado hoje',''],teto_diario:['Teto do dia','warn'],erro_rpc:['Erro ao enfileirar','dng'],sem_uso:['Sem uso','']};
function pillMotivo(m){const x=MOTIVO_OFERTA[m]||[m,''];return el('span',{className:'pill '+x[1]},x[0]);}
async function carregarEmails(){
 const box=limpar($('v-emails'));
 box.append(el('div',{className:'card'},carregando(4)));
 const [r1,r2]=await Promise.allSettled([api('emails/resumo?dias=7'),api('emails/oferta-pro/candidatas')]);
 if(r1.status==='fulfilled'){EMAILS=r1.value.resumo;EMAILS_ERRO='';}else{EMAILS=null;EMAILS_ERRO=mensagemErro(r1.reason);}
 if(r2.status==='fulfilled'){OFERTA=r2.value.candidatas||[];OFERTA_ERRO='';}else{OFERTA=null;OFERTA_ERRO=mensagemErro(r2.reason);}
 OFERTA_SEL=new Set([...OFERTA_SEL].filter(id=>OFERTA&&OFERTA.some(c=>c.userId===id&&c.motivo==='sairia')));
 desenharEmails();
}
function desenharEmails(){
 const box=limpar($('v-emails'));
 const c1=el('div',{className:'card'},el('h3',{style:'font-size:16px;margin-bottom:4px'},'Saúde dos e-mails, últimos 7 dias'));
 if(!EMAILS)c1.append(estado('erro','Não consegui ler os e-mails.',EMAILS_ERRO));
 else if(!EMAILS.tipos.length)c1.append(estado('','Nenhum e-mail nos últimos 7 dias.',''));
 else{
  const t=el('table'),tb=el('tbody');
  t.append(el('thead',{},el('tr',{},el('th',{},'Tipo'),el('th',{className:'num'},'Enviados'),el('th',{className:'num'},'Na fila'),el('th',{className:'num'},'Falharam'))));
  EMAILS.tipos.forEach(x=>tb.append(el('tr',{},el('td',{},x.nome),el('td',{className:'num'},fmtNum(x.enviados)),el('td',{className:'num'},fmtNum(x.naFila)),el('td',{className:'num'},x.falhos?el('span',{className:'pill dng'},fmtNum(x.falhos)):'0'))));
  t.append(tb);c1.append(el('div',{className:'tblWrap'},t));
  const s=EMAILS.supressoes;c1.append(el('div',{className:'mut',style:'margin-top:10px;font-size:13px'},'Descadastros: '+fmtNum(s.descadastro)+' · Devolvidos: '+fmtNum(s.hard_bounce)+' · Reclamações: '+fmtNum(s.complaint)));
 }
 box.append(c1);
 const c2=el('div',{className:'card',style:'margin-top:var(--s4)'},el('h3',{style:'font-size:16px;margin-bottom:4px'},'Oferta do Pro por e-mail'),el('p',{className:'mut',style:'margin:0 0 12px;font-size:13px'},'Contas que já criaram orçamento. Só recebe quem está no Grátis, sem teste ativo, sem descadastro e sem oferta nos últimos 30 dias. O ensaio não envia nada.'));
 if(!OFERTA){c2.append(estado('erro','Não consegui ler as contas.',OFERTA_ERRO));box.append(c2);return;}
 if(!OFERTA.length){c2.append(estado('','Nenhuma conta com orçamento ainda.',''));box.append(c2);return;}
 const podem=OFERTA.filter(c=>c.motivo==='sairia');
 const t=el('table'),tb=el('tbody');
 const todos=el('input',{type:'checkbox',ariaLabel:'Selecionar todas que podem receber',checked:podem.length>0&&podem.every(c=>OFERTA_SEL.has(c.userId)),disabled:!podem.length,onchange:e=>{if(e.target.checked)podem.forEach(c=>OFERTA_SEL.add(c.userId));else OFERTA_SEL.clear();desenharEmails();}});
 t.append(el('thead',{},el('tr',{},el('th',{},todos),el('th',{},'Conta'),el('th',{className:'num'},'Orçamentos'),el('th',{className:'num hideSm'},'Envios (mês / total)'),el('th',{className:'hideSm'},'Último uso'),el('th',{},'Situação'))));
 OFERTA.forEach(c=>{
  const pode=c.motivo==='sairia';
  const cb=el('input',{type:'checkbox',ariaLabel:'Selecionar '+(c.empresa||c.nome||'conta'),checked:OFERTA_SEL.has(c.userId),disabled:!pode,onchange:e=>{if(e.target.checked)OFERTA_SEL.add(c.userId);else OFERTA_SEL.delete(c.userId);desenharEmails();}});
  tb.append(el('tr',{},el('td',{},cb),el('td',{},el('b',{},c.empresa||c.nome||'(sem nome)'),c.empresa&&c.nome?el('div',{className:'mut',style:'font-size:12px'},c.nome):null),el('td',{className:'num'},fmtNum(c.orcamentos)),el('td',{className:'num hideSm'},fmtNum(c.enviosMes)+' / '+fmtNum(c.enviosTotal)),el('td',{className:'hideSm'},rel(c.ultimoUso)),el('td',{},pillMotivo(c.motivo))));
 });
 t.append(tb);c2.append(el('div',{className:'tblWrap'},t));
 const n=OFERTA_SEL.size;
 c2.append(el('div',{className:'barra',style:'margin-top:var(--s3);justify-content:flex-end;gap:var(--s2)'},
  el('span',{className:'mut',style:'margin-right:auto;font-size:13px'},n+' selecionada(s) de '+podem.length+' que podem receber'),
  el('button',{type:'button',className:'btn sec',disabled:!n,onclick:()=>ensaiarOferta()},'Ensaiar'),
  el('button',{type:'button',className:'btn',disabled:!n,onclick:()=>enviarOferta()},ico('mail'),'Enviar…')));
 box.append(c2);
}
async function ensaiarOferta(){
 const ids=[...OFERTA_SEL];if(!ids.length)return;
 let j;try{j=await api('emails/oferta-pro/enviar',{method:'POST',body:JSON.stringify({userIds:ids,enviar:false})});}catch(e){toast(mensagemErro(e),'err');return;}
 const cont=j.contagens||{};
 const corpo=el('div',{className:'txt'},el('p',{},el('b',{},fmtNum(cont.sairia||0)+' de '+fmtNum(j.total)+' sairiam agora.')));
 Object.keys(cont).filter(k=>k!=='sairia').forEach(k=>corpo.append(el('p',{className:'mut'},(MOTIVO_OFERTA[k]||[k])[0]+': '+fmtNum(cont[k]))));
 const prim=(j.itens||[]).find(i=>i.motivo==='sairia');
 const tx=prim&&j.textos&&j.textos[prim.userId];
 if(tx){const prev=el('div',{className:'card',style:'margin-top:10px'},el('div',{className:'mut',style:'font-size:12px'},'Exemplo (primeira conta que sairia)'),el('b',{},tx.assunto));tx.paragrafos.forEach(p=>prev.append(el('p',{style:'margin:6px 0'},p)));prev.append(el('p',{className:'mut',style:'font-size:12px'},'O botão “Ver o plano Pro” e o link de descadastro entram sozinhos.'));corpo.append(prev);}
 await dialogo({titulo:'Ensaio da oferta do Pro',conteudo:corpo,semConfirmar:true,cancelar:'Fechar',largo:true});
}
async function enviarOferta(){
 const ids=[...OFERTA_SEL];if(!ids.length)return;
 const corpo=el('div',{className:'txt'},el('p',{},'Vai enfileirar a oferta do Pro para ',el('b',{},String(ids.length)+' conta(s)'),'. O banco confere cada conta de novo na hora e barra quem não pode receber. Sai pela fila de e-mails, com link de descadastro.'));
 const v=await dialogo({titulo:'Enviar a oferta do Pro',conteudo:corpo,campos:[Object.assign({},MOTIVO,{max:200})],digitar:String(ids.length),confirmar:'Enviar para '+ids.length+' conta(s)',largo:true});
 if(!v)return;
 try{
  const j=await api('emails/oferta-pro/enviar',{method:'POST',body:JSON.stringify({userIds:ids,enviar:true,confirmar:ids.length,motivo:v.motivo.slice(0,200),requestId:crypto.randomUUID()})});
  const c=j.contagens||{},ok=c.enfileirado||0,barrados=(j.total||0)-ok;
  toast(fmtNum(ok)+' enfileirado(s)'+(barrados>0?' · '+fmtNum(barrados)+' barrado(s) na conferência':'')+'.');
  OFERTA_SEL.clear();carregarEmails();
 }catch(e){toast(mensagemErro(e),'err');}
}
function abrirMenu(){$('side').classList.add('on');$('scrim').classList.add('on');}
function fecharMenu(){$('side').classList.remove('on');$('scrim').classList.remove('on');}

/* ── carregamento de dados ── */
async function liberarDados(){
 $('gateMfa').classList.add('hidden');
 irPara((location.hash||'').slice(1)||viewPadrao());
 await recarregar(true);
}
async function recarregar(silencioso){
 const tarefas=[];
 if(pode('admin')){
  tarefas.push(api('metrics').then(j=>{MET=j;}).catch(e=>{if(e.status!==401)MET={erro:mensagemErro(e)};}));
  tarefas.push(api('users').then(j=>{USERS=j.users||[];USERS_ERRO='';INTERNAS_OK=j.contasInternasLegiveis!==false;FONTES=j.fontes||{};}).catch(e=>{if(e.status!==401){USERS=null;USERS_ERRO=mensagemErro(e);}}));
 }
 if(pode('suporte'))tarefas.push(api('feedback').then(j=>{FB=j.feedback||[];FB_ERRO='';}).catch(e=>{if(e.status!==401){FB=null;FB_ERRO=mensagemErro(e);}}));
 if(pode('financeiro'))tarefas.push(carregarTrocaDados());
 await Promise.all(tarefas);
 atualizarBadges();
 renderView();
 if(!silencioso)toast('Dados atualizados.');
}
async function carregarTrocaDados(){
 try{const j=await api('creditos-troca'+(TROCA_FILTRO?'?status='+TROCA_FILTRO:''));TROCA=j.pedidos||[];TROCA_MAX=j.mesesMax||TROCA_MAX;TROCA_ERRO='';}
 catch(e){if(e.status!==401){TROCA=null;TROCA_ERRO=mensagemErro(e);}}
}
function fbAbertos(){return (FB||[]).filter(f=>!f.resolvido&&tipoFb(f)!=='erro');}
function atualizarBadges(){
 const s=$('nbSuporte');if(s){const n=fbAbertos().length;s.textContent=n;s.classList.toggle('hidden',!n);}
 const t=$('nbTroca');if(t){const n=TROCA_FILTRO==='pendente'&&TROCA?TROCA.length:0;t.textContent=n;t.classList.toggle('hidden',!n);}
}

/* ── VISÃO GERAL ── */
function pintaDelta(h){
 const s=String(h);
 if(s.charAt(0)!=='+')return s;
 const corte=s.indexOf(' ');
 if(corte<2)return s;
 return [el('span',{className:'delta'},s.slice(0,corte)),' '+s.slice(corte+1)];
}
function pintarValor(box,texto){
 const s=String(texto==null?'':texto);
 box.textContent=s;
 if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const m=s.match(/^(R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(,(\d+))?(%?)$/);
 if(!m)return;
 const prefixo=m[1]||'';
 const inteiro=Number(String(m[2]).replace(/\./g,''));
 const frac=m[4]||'';
 const sufixo=m[5]||'';
 if(!isFinite(inteiro)||inteiro<0)return;
 const dur=200;
 const t0=performance.now();
 const tick=agora=>{
  const p=Math.min(1,(agora-t0)/dur);
  const n=Math.round(inteiro*(1-Math.pow(1-p,3)));
  let corpo=n.toLocaleString('pt-BR');
  if(frac)corpo+=','+(p<1?'0'.repeat(frac.length):frac);
  box.textContent=prefixo+corpo+sufixo;
  if(p<1)requestAnimationFrame(tick);else box.textContent=s;
 };
 requestAnimationFrame(tick);
}
function kpi(o){
 const c=el(o.onclick?'button':'div',{className:'kpi'+(o.tom?' tom-'+o.tom:''),title:o.dica||''});
 if(o.onclick){c.type='button';c.onclick=o.onclick;}
 const valor=el('div',{className:'v'});
 pintarValor(valor,o.v);
 c.append(el('div',{className:'l'},o.ico?ico(o.ico):null,o.l),valor);
 if(o.extra)c.append(o.extra);
 if(o.h)c.append(el('div',{className:'h'},pintaDelta(o.h)));
 return c;
}
function secTit(t,extra){return el('div',{className:'secTit'},el('h2',{},t),extra?el('span',{className:'extra'},extra):null);}
function irSegmento(seg){SEG=seg;PAG=0;BUSCA='';location.hash='usuarios';if(VIEW==='usuarios')renderUsuarios();}
function renderGeral(){
 const box=limpar($('v-geral'));
 if(!MET){box.append(el('div',{className:'card'},carregando(5)));return;}
 if(MET.erro){box.append(el('div',{className:'card'},estado('erro','Não consegui carregar os números.',MET.erro+' Nenhum valor foi zerado.')));return;}
 const m=MET,r=m.receita||{estado:'indisponivel'};
 // Precisa de você
 const att=[];
 const trocaPend=TROCA_FILTRO==='pendente'&&TROCA?TROCA.length:0;
 if(trocaPend)att.push(['warn',trocaPend+(trocaPend===1?' pedido':' pedidos')+' de crédito de troca esperando conferência','Conferir',()=>{location.hash='troca';}]);
 const den=(FB||[]).filter(f=>!f.resolvido&&tipoFb(f)==='denuncia').length;
 if(den)att.push(['dng',den+(den===1?' denúncia':' denúncias')+' de conteúdo da IA sem resposta','Ver',()=>{FBFILTER='denuncia';location.hash='suporte';}]);
 const ab=fbAbertos().filter(f=>tipoFb(f)!=='denuncia').length;
 if(ab)att.push(['info',ab+(ab===1?' mensagem':' mensagens')+' de clientes sem resposta','Ler',()=>{FBFILTER='abertos';location.hash='suporte';}]);
 if(r.estado==='ok'&&r.emRisco)att.push(['warn',r.emRisco+(r.emRisco===1?' conta pagante está':' contas pagantes estão')+' sem usar o app há 14 dias','Ver contas',()=>irSegmento('risco')]);
 if(m.novosHoje)att.push(['ok',m.novosHoje+(m.novosHoje===1?' cadastro novo':' cadastros novos')+' nas últimas 24 h','Ver',()=>irSegmento('novos')]);
 if(m.orcamentosEstado!=='indisponivel'&&m.nuncaOrcaram)att.push(['info',m.nuncaOrcaram+' de '+m.usuarios+' contas nunca criaram um orçamento — são as que mais precisam de um empurrão','Ver contas',()=>irSegmento('nunca')]);
 box.append(secTit('Precisa de você'));
 const lista=el('div',{className:'card atencao'});
 if(!att.length)lista.append(estado('ok','Tudo em dia.','Nada esperando por você agora.'));
 att.forEach(a=>lista.append(el('button',{type:'button',onclick:a[3]},el('span',{className:'dot '+a[0]}),el('span',{},a[1]),el('span',{className:'vai'},a[2]+' →'))));
 box.append(lista);

 // Crescimento
 box.append(secTit('Crescimento'));
 if(m.escopo==='indeterminado')box.append(el('div',{className:'card atencao'},estado('erro','Escopo dos números indeterminado.','Não consegui ler a lista de contas internas: os números abaixo incluem as contas da equipe. Atualize antes de decidir qualquer coisa.')));
 else box.append(el('div',{className:'mut',style:'margin:-4px 0 10px;font-size:13px'},'Números só de clientes — '+fmtNum(m.contasInternas||0)+' conta(s) interna(s) fora (aba Usuários › Internas).'));
 const spark=el('div',{className:'spark',ariaLabel:'Cadastros por dia nos últimos 14 dias'});const mx=Math.max(1,...(m.spark||[0]));(m.spark||[]).forEach((v,i)=>{const b=el('i',{title:v+' cadastro(s) '+(i===13?'hoje':'há '+(13-i)+' dia(s)')});b.style.height=Math.round(v/mx*100)+'%';b.style.animationDelay=(i*8)+'ms';spark.append(b);});
 box.append(el('div',{className:'kpis'},
  kpi({ico:'users',l:m.escopo==='indeterminado'?'Contas (inclui internas)':'Contas de clientes',v:fmtNum(m.usuarios),h:m.novos7?'+'+m.novos7+' nos últimos 7 dias':'nenhuma nova em 7 dias',dica:m.escopo==='indeterminado'?'Não consegui ler a lista de contas internas: este número inclui as contas da equipe.':'Só clientes. '+fmtNum(m.contasInternas||0)+' conta(s) interna(s) ficam fora de todos os números.',onclick:()=>irSegmento('todos')}),
  kpi({ico:'trend',l:'Novos em 30 dias',v:fmtNum(m.novos30),h:m.novosHoje+' nas últimas 24 h',onclick:()=>irSegmento('novos')}),
  kpi({ico:'calendar',l:'Cadastros por dia',v:fmtNum((m.spark||[]).reduce((a,b)=>a+b,0)),extra:spark,h:'últimos 14 dias'})
 ));
 // Ativação
 box.append(secTit('Uso e ativação'));
 box.append(el('div',{className:'kpis'},
  m.orcamentosEstado==='indisponivel'
   ?kpi({ico:'doc',l:'Fizeram o 1º orçamento',v:'indisponível',h:'não consegui ler os orçamentos agora',tom:'warn',dica:'A leitura dos orçamentos falhou: não é zero, é desconhecido. Atualize.'})
   :kpi({ico:'doc',l:'Fizeram o 1º orçamento',v:m.taxaAtivacao+'%',h:fmtNum(m.ativados)+' de '+fmtNum(m.usuarios)+' contas',tom:m.taxaAtivacao>=40?'ok':m.taxaAtivacao<20?'warn':'',dica:'Ativação: contas que criaram pelo menos 1 orçamento.'}),
  m.orcamentosEstado==='indisponivel'
   ?kpi({ico:'alert',l:'Nunca orçaram',v:'indisponível',h:'não consegui ler os orçamentos agora',tom:'warn'})
   :kpi({ico:'alert',l:'Nunca orçaram',v:fmtNum(m.nuncaOrcaram),h:'clique para ver quem são',tom:m.nuncaOrcaram?'warn':'',onclick:()=>irSegmento('nunca')}),
  kpi({ico:'activity',l:'Usaram hoje',v:fmtNum(m.dau),h:'contas diferentes nas últimas 24 h',dica:'DAU — usuários ativos no dia.'}),
  kpi({ico:'activity',l:'Usaram na semana',v:fmtNum(m.wau),h:'últimos 7 dias',dica:'WAU — usuários ativos na semana.'}),
  kpi({ico:'activity',l:'Usaram no mês',v:fmtNum(m.mau),h:m.mau?('na semana, '+Math.round(m.wau/m.mau*100)+'% deles voltaram'):'últimos 30 dias',dica:'MAU — usuários ativos em 30 dias.',onclick:()=>irSegmento('ativos')})
 ));
 if(m.atividadeLimitada)box.append(el('div',{className:'nota'},'A atividade passou de 10 mil eventos; os números de uso consideram só os mais recentes.'));
 // Receita
 box.append(secTit('Receita da OLLI'));
 if(r.estado!=='ok')box.append(el('div',{className:'card'},estado('erro','Não consegui ler as assinaturas ou a lista de contas internas.','Os números de receita ficam escondidos até a leitura funcionar — nada foi zerado.')));
 else box.append(el('div',{className:'kpis'},
  kpi({ico:'coin',l:'Pagantes',v:fmtNum(r.pagantes),h:r.pagantes?(r.porPlano.pro+' Pro · '+r.porPlano.empresa+' Empresa'):'Nenhum ainda. Aparecem aqui quando o 1º pagamento confirmar.',tom:r.pagantes?'ok':'',onclick:()=>irSegmento('pagantes')}),
  kpi({ico:'trend',l:'Receita mensal estimada',v:fmtBRL(r.mrrEstimado),h:'pagantes × preço mensal de tabela',dica:'MRR estimado: soma do preço mensal de tabela de cada pagante. Anuais entram pelo valor mensal.'}),
  kpi({ico:'gift',l:'Plano liberado à mão',v:fmtNum(r.manuais),h:'cortesias, contas internas e créditos de troca',onclick:()=>irSegmento('manual')}),
  kpi({ico:'alert',l:'Assinantes sumidos',v:fmtNum(r.emRisco),h:'pagantes sem uso há 14 dias',tom:r.emRisco?'warn':'',onclick:()=>irSegmento('risco')})
 ));
 // Movimento dos prestadores
 box.append(secTit('Movimento dos prestadores','dinheiro dos clientes deles — não é receita da OLLI'));
 box.append(el('div',{className:'kpis'},
  m.orcamentosEstado==='indisponivel'
   ?kpi({ico:'doc',l:'Orçamentos criados',v:'indisponível',h:'não consegui ler os orçamentos agora',tom:'warn'})
   :kpi({ico:'doc',l:'Orçamentos criados',v:fmtNum(m.orcamentos),h:fmtNum(m.aprovados)+' aprovados ('+m.conversao+'%)'}),
  m.orcamentosEstado==='indisponivel'
   ?kpi({ico:'coin',l:'Valor aprovado',v:'indisponível',h:'não é R$ 0,00: a leitura falhou',tom:'warn',dica:'A leitura dos orçamentos falhou; o valor é desconhecido, não zero. Atualize.'})
   :kpi({ico:'coin',l:'Valor aprovado',v:fmtBRL(m.faturamento),h:'ticket médio '+fmtBRL(m.ticket),dica:'Soma dos orçamentos aprovados pelos clientes dos prestadores.'}),
  kpi({ico:'users',l:'Clientes cadastrados',v:fmtNum(m.clientes),h:'pelos prestadores'}),
  kpi({ico:'calendar',l:'Agendamentos',v:fmtNum(m.agendamentos),h:'visitas e serviços marcados'})
 ));
 // Últimos cadastros
 if(USERS&&USERS.length){
  box.append(secTit('Últimos cadastros',el('a',{href:'#usuarios'},'ver todos')));
  const t=el('table'),tb=el('tbody');
  t.append(el('thead',{},el('tr',{},el('th',{},'Conta'),el('th',{className:'hideSm'},'Empresa'),el('th',{},'Plano'),el('th',{className:'num'},'Orçamentos'),el('th',{},'Cadastro'))));
  USERS.slice(0,8).forEach(u=>{const tr=el('tr',{className:'clic',onclick:()=>abrirUsuario(u)});tr.append(el('td',{},celConta(u)),el('td',{className:'hideSm'+(u.empresa?'':' mut')},u.empresa||'sem empresa'),el('td',{},pillPlano(u)),el('td',{className:'num'},String(u.orcamentos)),el('td',{className:'mut'},rel(u.criadoEm)));tb.append(tr);});
  t.append(tb);box.append(el('div',{className:'card tblWrap'},t));
 }
 // Glossário
 const g=el('details',{className:'card glossario',style:'margin-top:32px'});
 g.append(el('summary',{},'O que significa cada número?'));
 const dl=el('dl');[
  ['Ativação','Conta que já criou pelo menos 1 orçamento. É o primeiro sinal de que o OLLI serviu para alguma coisa.'],
  ['Usaram hoje / semana / mês','Contas diferentes com algum evento registrado (login, orçamento, envio…) no período. Em inglês: DAU, WAU, MAU.'],
  ['Pagantes','Contas com pagamento ativo num gateway (Pix, cartão ou Google Play). Plano liberado à mão, cortesia (comp_…), conta demo (sub_demo_…) e conta interna (dono, administradores, marcadas como internas) não contam.'],
  ['Receita mensal estimada','Pagantes × preço mensal de tabela'+(r.precoMensal?' (Pro '+fmtBRL(r.precoMensal.pro)+', Empresa '+fmtBRL(r.precoMensal.empresa)+')':'')+'. É estimativa: anuais e descontos não entram exatos.'],
  ['Assinantes sumidos','Contas pagantes que não usam o app há 14 dias ou mais. Bom momento para mandar uma mensagem. Cortesias e contas internas não entram.'],
  ['Valor aprovado','Soma dos orçamentos que os clientes dos prestadores aprovaram. Mostra o valor que o OLLI ajuda a movimentar, não o que a OLLI recebe.']
 ].forEach(x=>dl.append(el('dt',{},x[0]),el('dd',{},x[1])));
 g.append(dl);box.append(g);
}

/* ── USUÁRIOS ── */
function pillPlano(u){if(u.planoOrigem===null||u.plano===null)return el('span',{className:'pill warn',title:'Não consegui ler as assinaturas: o plano é desconhecido, não grátis.'},'plano indisponível');const pago=u.planoOrigem==='pagamento',man=u.planoOrigem==='admin',ind=u.planoOrigem==='indeterminada';return el('span',{className:'pill '+(pago?'ok':man?'info':'')},u.plano==='gratis'?'Grátis':(u.plano==='pro'?'Pro':'Empresa')+(man?' · liberado':ind?' · não confirmado':''));}
function pillUso(u){const f=u.frequencia||'nunca';const m={frequente:['ok','Frequente'],ativo:['info','Ativo'],inativo:['warn','Inativo'],nunca:['','Nunca usou']}[f]||['',f];return el('span',{className:'pill '+m[0]},m[1]);}
function pillSituacao(u){if(u.bloqueado)return el('span',{className:'pill dng'},u.bloqueadoAte&&Date.parse(u.bloqueadoAte)-Date.now()<366*DIA?'Bloqueado até '+fmtDate(u.bloqueadoAte):'Bloqueado');if(!u.emailConfirmado)return el('span',{className:'pill warn'},'E-mail não confirmado');return el('span',{className:'pill ok'},'Ativa');}
function celConta(u){return el('div',{className:'conta'},el('div',{className:'av'},initials(u.nome||u.email)),el('div',{},el('b',{},u.email||'—'),el('span',{},u.nome||'sem nome')));}
const SEG_FONTE={pagantes:'assinaturas',manual:'assinaturas',risco:'assinaturas',nunca:'orcamentos'};
const fonteIndisp=k=>FONTES[SEG_FONTE[k]]==='indisponivel';
const SEGS=[
 ['todos','Todos',()=>true],
 ['pagantes','Pagantes',u=>u.planoOrigem==='pagamento'],
 ['manual','Plano liberado',u=>u.planoOrigem==='admin'],
 ['ativos','Ativos em 30 dias',u=>u.atividades30>0],
 ['nunca','Nunca orçaram',u=>u.orcamentos===0],
 ['novos','Novos (7 dias)',u=>Date.now()-Date.parse(u.criadoEm)<7*DIA],
 ['risco','Pagos sem uso 14d',u=>u.planoOrigem==='pagamento'&&(!u.ultimoUso||Date.now()-Date.parse(u.ultimoUso)>14*DIA)],
 ['inativos','Inativos',u=>u.frequencia==='inativo'],
 ['bloqueados','Bloqueados',u=>u.bloqueado]
];
function noEscopo(u){return ESCOPO==='internas'?!!u.interna:!u.interna;}
function usuariosFiltrados(){
 const seg=(SEGS.find(s=>s[0]===SEG)||SEGS[0])[2];
 const q=BUSCA.trim().toLowerCase();
 let l=(USERS||[]).filter(noEscopo).filter(seg);
 if(q)l=l.filter(u=>[u.email,u.nome,u.empresa,u.cidade,u.id,u.segmento].some(v=>String(v||'').toLowerCase().includes(q)));
 const ord={cadastro:(a,b)=>String(b.criadoEm).localeCompare(String(a.criadoEm)),uso:(a,b)=>String(b.ultimoUso||'').localeCompare(String(a.ultimoUso||'')),orc:(a,b)=>b.orcamentos-a.orcamentos,nome:(a,b)=>String(a.email).localeCompare(String(b.email))}[ORDEM];
 return l.slice().sort(ord);
}
function renderUsuarios(){
 const box=limpar($('v-usuarios'));
 if(USERS===null&&!USERS_ERRO){box.append(el('div',{className:'card'},carregando(8)));return;}
 if(USERS===null){box.append(el('div',{className:'card'},estado('erro','Não consegui carregar os usuários.',USERS_ERRO)));return;}
 const nCli=USERS.filter(u=>!u.interna).length,nInt=USERS.filter(u=>!!u.interna).length;
 const abas=el('div',{className:'chips',role:'group',ariaLabel:'Tipo de conta'});
 [['clientes','Clientes',nCli],['internas','Internas',nInt]].forEach(a=>abas.append(el('button',{type:'button',className:'chip',ariaPressed:String(ESCOPO===a[0]),onclick:()=>{ESCOPO=a[0];SEG='todos';PAG=0;renderUsuarios();}},a[1],el('span',{className:'n'},String(a[2])))));
 if(!INTERNAS_OK)box.append(el('div',{className:'card atencao'},estado('erro','Não consegui ler a lista de contas internas.','Por isso as abas Clientes e Internas não são confiáveis agora: todas as contas aparecem como clientes. Atualize; se persistir, não use estes números.')));
 const indisp=[['assinaturas','planos e pagantes'],['orcamentos','orçamentos e faturamento'],['empresa','dados da empresa']].filter(f=>FONTES[f[0]]==='indisponivel').map(f=>f[1]);
 if(indisp.length)box.append(el('div',{className:'card atencao'},estado('erro','Não consegui ler: '+indisp.join(', ')+'.','Esses campos aparecem como indisponíveis — não como Grátis nem como zero — e os segmentos que dependem deles não são contados. Atualize; se persistir, veja o status do Supabase.')));
 const chips=el('div',{className:'chips',role:'group',ariaLabel:'Segmentos'});
 SEGS.forEach(s=>{const n=fonteIndisp(s[0])?'—':String(USERS.filter(noEscopo).filter(s[2]).length);chips.append(el('button',{type:'button',className:'chip',ariaPressed:String(SEG===s[0]),title:fonteIndisp(s[0])?'Fonte indisponível agora: não dá para contar.':'',onclick:()=>{SEG=s[0];PAG=0;renderUsuarios();}},s[1],el('span',{className:'n'},n)));});
 const busca=el('input',{className:'inp',id:'busca',type:'search',placeholder:'Buscar por e-mail, nome, empresa, cidade ou ID  (Ctrl+K)',value:BUSCA,ariaLabel:'Buscar usuários'});
 busca.oninput=()=>{BUSCA=busca.value;PAG=0;desenharTabela();};
 const ordem=el('select',{className:'inp',style:'width:auto',ariaLabel:'Ordenar'});[['cadastro','Mais recentes'],['uso','Usou por último'],['orc','Mais orçamentos'],['nome','E-mail (A–Z)']].forEach(o=>ordem.append(el('option',{value:o[0],selected:ORDEM===o[0]},o[1])));
 ordem.onchange=()=>{ORDEM=ordem.value;desenharTabela();};
 const exp=el('button',{className:'btn sec',onclick:exportarCsv},ico('download'),'Exportar CSV');
 box.append(abas,chips,el('div',{className:'barra'},el('div',{className:'busca'},ico('search'),busca),ordem,exp));
 const card=el('div',{className:'card',id:'tabelaUsuarios'});box.append(card);
 desenharTabela();
}
function desenharTabela(){
 const card=$('tabelaUsuarios');if(!card)return;limpar(card);
 const l=usuariosFiltrados();
 if(!l.length){card.append(estado('','Nenhuma conta com esse filtro.','Troque o segmento ou limpe a busca.'));return;}
 const ini=PAG*POR_PAG,pg=l.slice(ini,ini+POR_PAG);
 const t=el('table'),tb=el('tbody');
 t.append(el('thead',{},el('tr',{},el('th',{},'Conta'),el('th',{className:'hideSm'},'Empresa'),el('th',{},'Plano'),el('th',{},'Uso'),el('th',{className:'num'},'Orçamentos'),el('th',{className:'hideSm'},'Cadastro'),el('th',{className:'hideSm'},'Situação'))));
 pg.forEach(u=>{const tr=el('tr',{className:'clic',tabIndex:0,onclick:()=>abrirUsuario(u),onkeydown:e=>{if(e.key==='Enter')abrirUsuario(u);}});
  tr.append(el('td',{},celConta(u)),el('td',{className:'hideSm'},el('div',{},u.empresa||el('span',{className:'mut'},'sem empresa')),u.cidade?el('div',{className:'mut',style:'font-size:12.5px'},u.cidade):null),el('td',{},pillPlano(u)),el('td',{},pillUso(u),el('div',{className:'mut',style:'font-size:12px;margin-top:2px'},rel(u.ultimoUso))),el('td',{className:'num'},u.orcamentos===null?'—':String(u.orcamentos),u.aprovados?el('div',{className:'mut',style:'font-size:12px'},u.aprovados+' aprov.'):null),el('td',{className:'hideSm mut'},fmtDate(u.criadoEm)),el('td',{className:'hideSm'},pillSituacao(u)));tb.append(tr);});
 t.append(tb);card.append(el('div',{className:'tblWrap'},t));
 const tot=l.length,pags=Math.ceil(tot/POR_PAG);
 card.append(el('div',{className:'pag'},el('span',{},'Mostrando '+(ini+1)+'–'+Math.min(ini+POR_PAG,tot)+' de '+tot),el('div',{style:'display:flex;gap:8px'},el('button',{className:'btn sec',disabled:PAG===0,onclick:()=>{PAG--;desenharTabela();}},'Anterior'),el('button',{className:'btn sec',disabled:PAG>=pags-1,onclick:()=>{PAG++;desenharTabela();}},'Próxima'))));
}
/* ── organizações internas ── */
async function carregarOrgs(){
 const box=limpar($('v-organizacoes'));
 box.append(el('div',{className:'card'},carregando(5)));
 try{const j=await api('orgs');ORGS=j.orgs||[];ORGS_ERRO='';}
 catch(e){ORGS=null;ORGS_ERRO=/sem_migration/.test(String(e.erro||e.message||''))?'A migration das organizações internas ainda não foi aplicada neste banco.':mensagemErro(e);}
 desenharOrgs();
}
function desenharOrgs(){
 const box=limpar($('v-organizacoes'));
 if(ORGS===null){box.append(el('div',{className:'card'},estado('erro','Não consegui carregar as organizações.',ORGS_ERRO)));return;}
 if(!ORGS.length){box.append(el('div',{className:'card'},estado('','Nenhuma equipe por aqui ainda.','Quando um cliente criar a primeira, ela aparece aqui.')));return;}
 const t=el('table'),tb=el('tbody');
 t.append(el('thead',{},el('tr',{},el('th',{},'Organização'),el('th',{className:'hideSm'},'Dono'),el('th',{className:'num'},'Membros'),el('th',{},'Tipo'),el('th',{},''))));
 ORGS.forEach(o=>{
  const acao=o.interna
   ?el('button',{type:'button',className:'btn sec',onclick:()=>desfazerOrgInterna(o)},'Desfazer')
   :el('button',{type:'button',className:'btn sec',onclick:()=>marcarOrgInterna(o)},'Marcar como interna…');
  tb.append(el('tr',{},el('td',{},el('b',{},o.nome||'(sem nome)')),el('td',{className:'hideSm'},o.dono||'—'),el('td',{className:'num'},String(o.membros)),el('td',{},el('span',{className:'pill '+(o.interna?'info':'')},o.interna?'Interna':'Cliente')),el('td',{},acao)));
 });
 t.append(tb);box.append(el('div',{className:'card'},el('div',{className:'tblWrap'},t)));
 box.append(el('div',{className:'mut',style:'margin-top:10px;font-size:13px'},'Marcar uma organização marca os membros dela como internos, exceto quem também faz parte de OUTRA organização cliente (esses continuam clientes). Tudo fica na auditoria e dá para desfazer.'));
}
function listaContas(itens){return itens.length?itens.map(x=>x.email||x.id).join(', '):'nenhuma';}
async function marcarOrgInterna(o){
 let r;
 try{r=await api('org/previa?id='+encodeURIComponent(o.id));}catch(e){toast(mensagemErro(e),'err');return;}
 const pv=r.previa;
 const corpo=el('div',{className:'txt'},
  el('p',{},el('b',{},String(pv.seraoMarcadas)+' conta(s) serão marcadas como internas: '),listaContas(pv.marcar)+'.'),
  pv.preservadas?el('p',{},el('b',{},String(pv.preservadas)+' continuam como clientes '),'porque também fazem parte de outra organização cliente: '+listaContas(pv.preservar)+'.'):null,
  pv.jaInternas?el('p',{className:'mut'},String(pv.jaInternas)+' já eram internas e não mudam.'):null);
 const v=await dialogo({titulo:'Marcar “'+(pv.nome||o.nome)+'” como interna',conteudo:corpo,campos:[Object.assign({},MOTIVO,{max:200})],digitar:String(pv.seraoMarcadas),confirmar:'Marcar '+pv.seraoMarcadas+' conta(s)',largo:true});
 if(!v)return;
 try{
  const j=await api('org/interna',{method:'POST',body:JSON.stringify({id:o.id,interna:true,confirmar:pv.seraoMarcadas,motivo:v.motivo.slice(0,200),requestId:crypto.randomUUID()})});
  toast((j.marcadas||0)+' conta(s) marcadas como internas.');
 }catch(e){
  if(e.status===409&&/previa_mudou/.test(String(e.erro||e.message||'')))toast('A organização mudou desde a prévia. Revise e tente de novo.','err');
  else toast(mensagemErro(e),'err');
 }
 await recarregar(true);carregarOrgs();
}
async function desfazerOrgInterna(o){
 const v=await dialogo({titulo:'Desfazer “'+o.nome+'”',texto:'As contas que ESTA organização marcou voltam a ser clientes e voltam a contar nos números. Quem já era interno por conta própria continua interno.',campos:[Object.assign({},MOTIVO,{max:200})],confirmar:'Desfazer',perigo:true});
 if(!v)return;
 try{const j=await api('org/interna',{method:'POST',body:JSON.stringify({id:o.id,interna:false,motivo:v.motivo.slice(0,200),requestId:crypto.randomUUID()})});toast((j.desmarcadas||0)+' conta(s) voltaram a ser clientes.');}
 catch(e){toast(mensagemErro(e),'err');}
 await recarregar(true);carregarOrgs();
}
function celCsv(v){let s=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
async function exportarCsv(){
 const l=usuariosFiltrados();
 const v=await dialogo({titulo:'Exportar '+l.length+' contas em CSV',texto:'O arquivo terá e-mail, nome, empresa, cidade, plano, uso e datas das contas do filtro atual. A exportação fica registrada na auditoria.',campos:[MOTIVO],confirmar:'Exportar'});
 if(!v)return;
 try{await api('export/registrar',{method:'POST',body:JSON.stringify({motivo:v.motivo,linhas:l.length,filtro:SEG+(BUSCA?' + busca':''),requestId:crypto.randomUUID()})});}
 catch(e){toast(mensagemErro(e),'err');return;}
 const cab=['id','email','nome','empresa','cidade','segmento','plano','origem_plano','frequencia','orcamentos','aprovados','cadastro','ultimo_uso','bloqueado'];
 const linhas=[cab.join(';')].concat(l.map(u=>[u.id,u.email,u.nome,u.empresa,u.cidade,u.segmento,u.plano===null?'indisponivel':u.plano,u.planoOrigem===null?'indisponivel':u.planoOrigem,u.frequencia,u.orcamentos===null?'indisponivel':u.orcamentos,u.aprovados===null?'indisponivel':u.aprovados,u.criadoEm,u.ultimoUso||'',u.bloqueado?'sim':'nao'].map(celCsv).join(';')));
 const blob=new Blob(['﻿'+linhas.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a'),href=URL.createObjectURL(blob);a.href=href;a.download='olli-usuarios-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(href);
 toast('CSV baixado ('+l.length+' contas).');
}

/* ── FICHA DO USUÁRIO (gaveta) ── */
function fecharGaveta(){USER_ABERTO=null;DET=null;const g=$('gaveta');if(g)g.classList.remove('on');const s=$('gavScrim');if(s)s.classList.remove('on');}
async function abrirUsuario(u,aba){
 USER_ABERTO=u;ABA=aba||'resumo';DET=null;
 $('gaveta').classList.add('on');$('gavScrim').classList.add('on');
 desenharGaveta();
 try{DET=await api('user?id='+encodeURIComponent(u.id));}catch(e){if(e.status===401)return;DET={erro:mensagemErro(e)};}
 if(USER_ABERTO&&USER_ABERTO.id===u.id)desenharGaveta();
}
async function recarregarUsuario(){
 if(!USER_ABERTO)return;const id=USER_ABERTO.id;
 try{const j=await api('users');USERS=j.users||[];const novo=USERS.find(x=>x.id===id);if(novo)USER_ABERTO=novo;}catch{}
 try{DET=await api('user?id='+encodeURIComponent(id));}catch(e){DET={erro:mensagemErro(e)};}
 desenharGaveta();if(VIEW==='usuarios')desenharTabela();
}
function desenharGaveta(){
 const g=limpar($('gaveta')),u=USER_ABERTO;if(!u)return;
 const cab=el('div',{className:'gavCab'});
 const fechar=el('button',{className:'btn ghost icon x',ariaLabel:'Fechar ficha',onclick:fecharGaveta},ico('x'));
 cab.append(el('div',{className:'gavTopo'},el('div',{className:'av'},initials(u.nome||u.email)),el('div',{style:'min-width:0'},el('h2',{id:'gavNome'},u.email||'—'),el('div',{className:'sub'},[u.nome||'sem nome',u.empresa,u.cidade].filter(Boolean).join(' · '))),fechar));
 cab.append(el('div',{className:'gavPills'},pillPlano(u),pillUso(u),pillSituacao(u),el('span',{className:'pill'},'entra com '+(u.provedor==='google'?'Google':u.provedor==='email'?'e-mail':u.provedor))));
 const rap=el('div',{className:'gavRapido'});
 const wa=String(u.whatsapp||'').replace(/\D/g,'');
 if(wa)rap.append(el('a',{className:'btn sec',href:'https://wa.me/'+(wa.length<=11?'55'+wa:wa),target:'_blank',rel:'noopener noreferrer'},ico('phone'),'WhatsApp'));
 if(u.email)rap.append(el('a',{className:'btn sec',href:'mailto:'+u.email},ico('mail'),'E-mail'));
 rap.append(el('button',{className:'btn sec',onclick:()=>{navigator.clipboard&&navigator.clipboard.writeText(u.id).then(()=>toast('ID copiado.'));}},ico('copy'),'Copiar ID'));
 cab.append(rap);
 const abas=el('div',{className:'abas',role:'tablist'});
 [['resumo','Resumo'],['atividade','Atividade'],['dinheiro','Plano e créditos'],['empresa','Empresa'],['notas','Notas'],['ferramentas','Ferramentas']].forEach(a=>{abas.append(el('button',{role:'tab',ariaSelected:String(ABA===a[0]),onclick:()=>{ABA=a[0];desenharGaveta();}},a[1]));});
 cab.append(abas);
 const corpo=el('div',{className:'gavCorpo'});
 g.append(cab,corpo);
 if(!DET){corpo.append(carregando(6));return;}
 if(DET.erro){corpo.append(el('div',{className:'card'},estado('erro','Não consegui abrir a ficha.',DET.erro)));return;}
 ({resumo:abaResumo,atividade:abaAtividade,dinheiro:abaDinheiro,empresa:abaEmpresa,notas:abaNotas,ferramentas:abaFerramentas})[ABA](corpo,u,DET);
}
function mc(l,v){return el('div',{className:'mc'},el('div',{className:'l'},l),el('div',{className:'v'},String(v)));}
function listaCard(itens,vazio){const c=el('div',{className:'card lista'});if(!itens.length)c.append(el('div',{className:'estado'},vazio||'Nada registrado.'));else itens.forEach(i=>c.append(el('div',{className:'li'},el('span',{},i[0]),el('span',{className:'d'},i[1]))));return c;}
function abaResumo(c,u,d){
 const ent=d.entitlement||{plano:'gratis',origem:'gratis'};
 const aprov=(d.orcamentos||[]).filter(o=>o.status==='aprovado');
 const valor=aprov.reduce((s,o)=>s+(Number(o.valor_total)||0),0);
 c.append(el('div',{className:'mini'},
  mc('Plano',(ent.plano==='gratis'?'Grátis':ent.plano==='pro'?'Pro':'Empresa')+(ent.origem==='admin'?' (liberado)':'')),
  mc('Créditos de IA',d.saldoCreditos==null?(d.podeCreditos?'indisponível':'—'):fmtNum(d.saldoCreditos)),
  mc('Orçamentos',(d.orcamentos||[]).length+(aprov.length?' · '+aprov.length+' aprov.':'')),
  mc('Valor aprovado',d.orcamentos&&d.orcamentos.length&&'valor_total' in d.orcamentos[0]?fmtBRL(valor):'—'),
  mc('Clientes',(d.clientes||[]).length),
  mc('Agenda',(d.agenda||[]).length),
  mc('Último uso',rel(u.ultimoUso)),
  mc('Dias ativos (30d)',u.diasAtivos30??0),
  mc('Cadastro',fmtDate(u.criadoEm)),
  mc('Último login',fmtDate(u.ultimoAcesso)),
  mc('IA grátis usada',(d.usosIa||[]).length+' vezes'),
  mc('Recibos',(d.recibos||[]).length)
 ));
 c.append(secTit('Orçamentos recentes'),listaCard((d.orcamentos||[]).slice(0,10).map(o=>['Nº '+o.numero+(o.cliente_nome?' · '+o.cliente_nome:''),(o.valor_total!=null?fmtBRL(o.valor_total)+' · ':'')+o.status+' · '+fmtDate(o.criado_em)]),'Nenhum orçamento criado ainda.'));
 c.append(secTit('Próximos e últimos agendamentos'),listaCard((d.agenda||[]).slice(0,8).map(a=>[a.titulo||'—',fmtDH(a.inicio)+' · '+(a.status||'')]),'Nenhum agendamento.'));
}
const ROT_ACAO={usuario_bloqueado:'Bloqueou a conta',usuario_desbloqueado:'Desbloqueou a conta',usuario_excluido:'Excluiu a conta',reset_senha_enviado:'Enviou redefinição de senha',plano_override_definido:'Liberou plano manual',plano_override_revogado:'Revogou plano manual',creditos_adicionados:'Adicionou créditos',creditos_removidos:'Removeu créditos',sessoes_usuario_revogadas:'Desconectou de todos os aparelhos',email_confirmado_manual:'Confirmou o e-mail',acesso_sem_senha_enviado:'Enviou código de acesso',nota_interna:'Nota interna',usuario_relatorio_txt:'Baixou relatório TXT',usuarios_exportados_csv:'Exportou lista em CSV',funil_conta_interna_marcada:'Tirou do funil',funil_conta_interna_desmarcada:'Devolveu ao funil',aparelho_confiavel_adicionado:'Lembrou um aparelho',aparelho_confiavel_revogado:'Esqueceu um aparelho',aparelhos_confiaveis_revogados:'Esqueceu todos os aparelhos',senha_admin_alterada:'Trocou a própria senha'};
function rotAcao(a){return ROT_ACAO[a]||String(a||'').replace(/_/g,' ');}
const ROT_EVENTO={login:'Entrou no app',orcamento_criado:'Criou orçamento',orcamento_enviado:'Enviou orçamento',cliente_criado:'Cadastrou cliente'};
function abaAtividade(c,u,d){
 const itens=[];
 (d.atividade||[]).forEach(a=>itens.push({q:a.criado_em,t:(ROT_EVENTO[a.evento]||String(a.evento||'').replace(/_/g,' '))+(a.plataforma?' · '+a.plataforma:''),adm:false}));
 (d.auditoria||[]).forEach(a=>itens.push({q:a.criado_em,t:'Painel: '+rotAcao(a.acao)+' — '+a.motivo,adm:true}));
 itens.sort((a,b)=>String(b.q).localeCompare(String(a.q)));
 c.append(el('div',{className:'mini'},mc('Eventos registrados',u.atividades||0),mc('Nos últimos 30 dias',u.atividades30||0),mc('Dias ativos (30d)',u.diasAtivos30||0),mc('Logins registrados',u.logins||0)));
 const box=el('div',{className:'card linhaTempo'});
 if(!itens.length)box.append(el('div',{className:'estado'},'Nenhuma atividade registrada.'));
 itens.slice(0,80).forEach(i=>box.append(el('div',{className:'it'},el('span',{className:'q'},fmtDH(i.q)),el('span',{style:i.adm?'color:var(--info)':''},i.t))));
 c.append(box);
}
function abaDinheiro(c,u,d){
 const ass=d.assinatura;
 c.append(secTit('Assinatura'));
 c.append(listaCard(ass?[
  ['Plano no gateway',(ass.plano||'—')+' · '+(ass.status||'—')],
  ['Vale até',fmtDate(ass.current_period_end)],
  ['Plano liberado à mão',ass.admin_override_ativo?((ass.admin_plano_override||'—')+' até '+(ass.admin_override_ate?fmtDate(ass.admin_override_ate):'revogar')):'não'],
  ['Pix / Mercado Pago',ass.mercadoPagoVinculado?'vinculado':'—'],
  ['Cartão (Stripe)',ass.stripeVinculado?'vinculado':'—'],
  ['Google Play',ass.playVinculado?'vinculado':'—']
 ]:[['Situação','Sem assinatura — plano Grátis']]));
 c.append(secTit('Créditos de IA',d.saldoCreditos!=null?'saldo: '+fmtNum(d.saldoCreditos):''));
 if(!d.podeCreditos)c.append(el('div',{className:'card'},estado('','Seu papel não vê créditos.')));
 else c.append(listaCard((d.creditos||[]).slice(0,20).map(x=>[(Number(x.delta)>0?'+':'')+x.delta+' · '+({ajuste:'ajuste manual',consumo:'uso',pix:'compra Pix',stripe:'compra cartão',iap:'loja',promo:'promoção',referral:'indicação',mesada:'mesada'}[x.origem]||x.origem),fmtDH(x.criado_em)]),'Nenhum lançamento.'));
 if(pode('financeiro'))c.append(el('div',{style:'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap'},el('button',{className:'btn',onclick:()=>acaoCreditos(u,1)},'Adicionar créditos'),el('button',{className:'btn sec',onclick:()=>acaoCreditos(u,-1)},'Remover créditos')));
 c.append(secTit('Faturas do cartão (Stripe)'),listaCard((d.faturas||[]).slice(0,12).map(f=>[fmtDate(f.criadoEm)+' · '+(f.pago?'paga':(f.status||'—')),fmtBRL((f.valorCentavos||0)/100)]),'Nenhuma fatura de cartão.'));
}
const ROT_EMP={nome:'Nome',segmento:'Segmento',especialidade:'Especialidade',slogan:'Slogan',cnpj:'CNPJ',endereco:'Endereço',cidade:'Cidade',estado:'Estado',telefone:'Telefone',whatsapp:'WhatsApp',site:'Site',email:'E-mail',normas:'Normas',verticais:'Ofícios',ferramentasAtivas:'Ferramentas ativas',corMarca:'Cor da marca',validadeDiasPadrao:'Validade padrão (dias)',garantiaPadrao:'Garantia padrão',condicoesPagamentoPadrao:'Condições de pagamento',observacoesPadrao:'Observações padrão',licencaSanitaria:'Licença sanitária',licencaAmbiental:'Licença ambiental',responsavelTecnico:'Responsável técnico',responsavelTecnicoRegistro:'Registro do responsável'};
function textoValor(v){if(v==null||v==='')return '—';if(Array.isArray(v))return v.join(', ')||'—';if(typeof v==='object')return JSON.stringify(v);return String(v);}
function abaEmpresa(c,u,d){
 const e=d.empresa;
 c.append(secTit('Dados que o prestador cadastrou'));
 if(!e||!Object.keys(e).length)c.append(el('div',{className:'card'},estado('','Os dados desta empresa ainda estão em branco.')));
 else{const dl=el('dl',{className:'kv'});Object.keys(e).filter(k=>ROT_EMP[k]).forEach(k=>dl.append(el('dt',{},ROT_EMP[k]),el('dd',{},textoValor(e[k]))));if(e.logoPresente)dl.append(el('dt',{},'Logo'),el('dd',{},'enviado'));c.append(el('div',{className:'card'},dl));}
 c.append(secTit('Consultar CNPJ na Receita'));
 const card=el('div',{className:'card pad'});
 const inp=el('input',{className:'inp',placeholder:'00.000.000/0000-00',value:(e&&e.cnpj)||'',inputMode:'numeric',ariaLabel:'CNPJ'});
 const res=el('div',{style:'margin-top:12px'});
 const btn=el('button',{className:'btn',onclick:async()=>{const n=inp.value.replace(/\D/g,'');if(n.length!==14){limpar(res).append(el('div',{className:'erroCampo'},ERROS.cnpj_invalido));return;}btn.disabled=true;limpar(res).append(el('div',{className:'mut'},'Consultando…'));try{const j=await api('cnpj?cnpj='+n);const x=j.empresa;const dl=el('dl',{className:'kv',style:'padding:0'});[['Razão social',x.razaoSocial],['Nome fantasia',x.nomeFantasia],['Situação',x.situacao+(x.ativa===false?' ⚠':'')],['Abertura',x.abertura?fmtDate(x.abertura+'T12:00:00'):'—'],['Atividade principal',x.cnae],['Porte',x.porte],['Natureza jurídica',x.naturezaJuridica],['MEI',{sim:'sim',nao:'não',desconhecido:'não informado'}[x.mei]],['Simples Nacional',{sim:'sim',nao:'não',desconhecido:'não informado'}[x.simples]],['Cidade',[x.municipio,x.uf].filter(Boolean).join('/')],['Telefone na Receita',x.telefone],['E-mail na Receita',x.email]].forEach(p=>dl.append(el('dt',{},p[0]),el('dd',{},p[1]||'—')));limpar(res).append(dl,el('div',{className:'nota'},'Fonte: '+j.fonte+' (dados abertos, CC BY). Sócios não são exibidos.'));}catch(err){limpar(res).append(el('div',{className:'erroCampo'},mensagemErro(err)));}finally{btn.disabled=false;}}},'Consultar');
 card.append(el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},el('div',{style:'flex:1 1 220px'},inp),btn),res,el('div',{className:'nota'},'Consulta grátis em dados públicos da Receita Federal. CPF não aparece neste painel por política de privacidade e não existe consulta gratuita e legal de CPF → nome.'));
 c.append(card);
}
function abaNotas(c,u,d){
 c.append(el('div',{className:'nota',style:'margin:0 0 12px'},'Notas internas ficam só aqui no painel, para a equipe lembrar o que foi combinado com o cliente. O cliente não vê. Não dá para editar nem apagar (ficam na trilha de auditoria).'));
 const ta=el('textarea',{className:'inp',maxLength:500,placeholder:'Ex.: Ligou dia 03/10, quer importar planilha de clientes. Retornar sexta.',ariaLabel:'Nova nota'});
 const salvar=el('button',{className:'btn',onclick:async()=>{const t=ta.value.trim();if(t.length<3){toast('Escreva pelo menos 3 caracteres.','err');return;}salvar.disabled=true;try{await api('user/nota?id='+encodeURIComponent(u.id),{method:'POST',body:JSON.stringify({texto:t,requestId:crypto.randomUUID()})});toast('Nota salva.');await recarregarUsuario();}catch(e){toast(mensagemErro(e),'err');}finally{salvar.disabled=false;}}},'Salvar nota');
 c.append(el('div',{className:'card pad'},ta,el('div',{style:'margin-top:12px'},salvar)));
 c.append(secTit('Histórico'));
 const box=el('div',{className:'card'});
 if(!(d.notas||[]).length)box.append(el('div',{className:'estado'},'Nenhuma nota ainda.'));
 (d.notas||[]).forEach(n=>box.append(el('div',{className:'notaItem'},el('div',{className:'q'},fmtDH(n.criado_em)+' · '+n.actor_role),el('div',{className:'fbMsg'},n.motivo))));
 c.append(box);
}
function fc(titulo,texto,botao,acao,cls,desligado){return el('div',{className:'fc'+(cls?' '+cls:'')},el('b',{},titulo),el('p',{},texto),el('button',{className:'btn '+(cls==='perigo'?'danger':'sec'),onclick:acao,disabled:!!desligado},botao));}
function abaFerramentas(c,u,d){
 const ass=d.assinatura;
 const grupo=(t,cards)=>{const v=cards.filter(Boolean);if(!v.length)return;c.append(secTit(t),el('div',{className:'ferr'},v));};
 grupo('Plano e créditos',[
  pode('financeiro')&&fc('Adicionar créditos de IA','Coloca créditos no saldo do usuário (cortesia, compensação, teste). Fica no livro-razão.','Adicionar',()=>acaoCreditos(u,1)),
  pode('financeiro')&&fc('Remover créditos de IA','Tira créditos do saldo (lançamento de ajuste). Não deixa o saldo negativo.','Remover',()=>acaoCreditos(u,-1)),
  pode('financeiro')&&fc('Liberar plano Pro','Dá o Pro sem cobrança, por X dias ou até revogar. Não mexe no gateway.','Liberar Pro',()=>acaoPlano(u,'pro',true)),
  pode('financeiro')&&fc('Liberar plano Empresa','Dá o Empresa sem cobrança, por X dias ou até revogar.','Liberar Empresa',()=>acaoPlano(u,'empresa',true)),
  pode('financeiro')&&ass&&ass.admin_override_ativo&&fc('Revogar plano liberado','Tira o plano dado à mão. Se ele paga no gateway, o pago continua.','Revogar',()=>acaoPlano(u,null,false))
 ]);
 grupo('Acesso e login',[
  pode('suporte')&&fc('Redefinir senha','Manda ao usuário o e-mail para criar uma senha nova.','Enviar e-mail',()=>acaoSimples(u,'reset')),
  pode('suporte')&&fc('Código de acesso por e-mail','Manda ao usuário um código para entrar sem senha. Você não recebe o código.','Enviar código',()=>acaoSimples(u,'acesso')),
  pode('suporte')&&!u.emailConfirmado&&fc('Confirmar e-mail','Para quem não recebeu o e-mail de confirmação. Libera o login com senha.','Confirmar',()=>acaoSimples(u,'email')),
  pode('suporte')&&fc('Desconectar de todos os aparelhos','Encerra as sessões abertas (celular perdido, conta compartilhada). Ele entra de novo com a senha.','Desconectar',()=>acaoSimples(u,'sessoes')),
  pode('suporte')&&(u.bloqueado?fc('Desbloquear conta','Devolve o acesso ao app.','Desbloquear',()=>acaoBloqueio(u,false)):fc('Bloquear conta','Impede o login por alguns dias ou até desbloquear. Os dados ficam.','Bloquear',()=>acaoBloqueio(u,true)))
 ]);
 const fe=(d.funil&&d.funil.estado)||'indisponivel';
 grupo('Relatórios e funil',[
  pode('admin')&&fc('Relatório da conta (TXT)','Baixa um resumo da conta e da atividade recente. Fica na auditoria.','Baixar',()=>baixarRelatorio(u)),
  pode('admin')&&(fe==='indisponivel'?fc('Funil: estado desconhecido','Não consegui ler se esta conta é interna. Tente atualizar — o botão fica travado até saber.','Indisponível',()=>{},'',true):fe==='interna'?fc('Devolver ao funil','Esta conta está marcada como interna (teste). Devolva se for cliente real.','Devolver',()=>acaoFunil(u,false)):fc('Marcar como conta interna','Tira do funil de receita contas de teste ou da equipe.','Tirar do funil',()=>acaoFunil(u,true)))
 ]);
 grupo('Zona de perigo',[pode('owner')&&fc('Excluir conta e todos os dados','Cancela assinaturas, apaga arquivos e a conta. Não tem volta. Pede o código do autenticador.','Excluir conta',()=>acaoExcluir(u),'perigo')]);
 if(!c.childNodes.length)c.append(el('div',{className:'card'},estado('','Seu papel não tem ferramentas para esta conta.')));
}
async function acaoCreditos(u,sinal){
 const saldo=DET&&DET.saldoCreditos;
 const v=await dialogo({titulo:sinal>0?'Adicionar créditos de IA':'Remover créditos de IA',texto:(u.email||'')+(saldo!=null?' · saldo atual: '+fmtNum(saldo):''),campos:[{nome:'qtd',rotulo:'Quantidade',tipo:'number',minN:1,maxN:sinal>0?CFG.creditosMax:Math.max(1,Math.min(CFG.creditosMax,saldo||CFG.creditosMax)),obrigatorio:true,ajuda:'Até '+fmtNum(CFG.creditosMax)+' por vez.'},MOTIVO],confirmar:sinal>0?'Adicionar':'Remover',perigo:sinal<0});
 if(!v)return;
 try{const j=await api('user/creditos?id='+encodeURIComponent(u.id),{method:'POST',body:JSON.stringify({delta:sinal*v.qtd,motivo:v.motivo,requestId:crypto.randomUUID()})});toast('Feito. Saldo agora: '+fmtNum(j.saldo)+' créditos.');await recarregarUsuario();}
 catch(e){toast(mensagemErro(e),'err');}
}
async function acaoPlano(u,plano,ativo){
 const v=await dialogo({titulo:ativo?'Liberar plano '+(plano==='pro'?'Pro':'Empresa'):'Revogar plano liberado',texto:'O gateway de pagamento não é alterado. Fica registrado na auditoria.',campos:(ativo?[{nome:'dias',rotulo:'Por quantos dias?',tipo:'number',minN:1,maxN:3650,ph:'vazio = até revogar',ajuda:'Deixe vazio para valer até você revogar.'}]:[]).concat([MOTIVO]),confirmar:ativo?'Liberar':'Revogar'});
 if(!v)return;
 const ate=ativo&&v.dias?new Date(Date.now()+v.dias*DIA).toISOString():null;
 try{await api('user/plan?id='+encodeURIComponent(u.id),{method:'POST',body:JSON.stringify({plano,ativo,ate,motivo:v.motivo,requestId:crypto.randomUUID()})});toast(ativo?'Plano liberado.':'Plano revogado.');await recarregarUsuario();}
 catch(e){toast(mensagemErro(e),'err');}
}
async function acaoSimples(u,tipo){
 const cfg={
  reset:['Enviar redefinição de senha','O usuário recebe um e-mail com o link para criar senha nova.','Enviar',()=> 'user/reset?email='+encodeURIComponent(u.email),'E-mail de redefinição enviado para '+u.email+'.'],
  acesso:['Enviar código de acesso','O usuário recebe por e-mail um código para entrar sem senha.','Enviar',()=> 'user/acesso/enviar?id='+encodeURIComponent(u.id),'Código enviado para '+u.email+'.'],
  email:['Confirmar e-mail','Marca o e-mail como confirmado sem o usuário clicar no link.','Confirmar',()=> 'user/email/confirmar?id='+encodeURIComponent(u.id),'E-mail confirmado.'],
  sessoes:['Desconectar de todos os aparelhos','Todas as sessões abertas são encerradas. O usuário precisa entrar de novo (o acesso já aberto pode durar até 1 hora).','Desconectar',()=> 'user/sessoes/revogar?id='+encodeURIComponent(u.id),'Sessões encerradas.']
 }[tipo];
 const v=await dialogo({titulo:cfg[0],texto:cfg[1],campos:[MOTIVO],confirmar:cfg[2]});
 if(!v)return;
 try{await api(cfg[3](),{method:'POST',body:JSON.stringify({motivo:v.motivo,requestId:crypto.randomUUID()})});toast(cfg[4]);await recarregarUsuario();}
 catch(e){toast(mensagemErro(e),'err');}
}
async function acaoBloqueio(u,bloquear){
 const v=await dialogo({titulo:bloquear?'Bloquear '+u.email:'Desbloquear '+u.email,texto:bloquear?'A pessoa não consegue entrar enquanto durar o bloqueio. Nada é apagado.':'A pessoa volta a conseguir entrar.',campos:(bloquear?[{nome:'dias',rotulo:'Por quanto tempo?',tipo:'select',valor:'7',opcoes:[['1','1 dia'],['7','7 dias'],['30','30 dias'],['90','90 dias'],['','Até desbloquear']]}]:[]).concat([MOTIVO]),confirmar:bloquear?'Bloquear':'Desbloquear',perigo:bloquear});
 if(!v)return;
 const corpo={motivo:v.motivo,requestId:crypto.randomUUID()};if(bloquear&&v.dias)corpo.dias=Number(v.dias);
 try{await api('user/'+(bloquear?'ban':'unban')+'?id='+encodeURIComponent(u.id),{method:'POST',body:JSON.stringify(corpo)});toast(bloquear?'Conta bloqueada.':'Conta desbloqueada.');await recarregarUsuario();}
 catch(e){toast(mensagemErro(e),'err');}
}
async function acaoFunil(u,excluir){
 const v=await dialogo({titulo:excluir?'Marcar como conta interna':'Devolver ao funil',texto:excluir?'Contas internas (teste, equipe) saem das contas do funil de receita.':'A conta volta a contar no funil.',campos:[Object.assign({},MOTIVO,{max:200})],confirmar:'Salvar'});
 if(!v)return;
 try{await api('funil/exclusao?id='+encodeURIComponent(u.id),{method:'POST',body:JSON.stringify({excluir,motivo:v.motivo.slice(0,200),requestId:crypto.randomUUID()})});toast(excluir?'Conta fora do funil.':'Conta de volta ao funil.');await recarregarUsuario();}
 catch(e){toast(mensagemErro(e),'err');}
}
async function baixarRelatorio(u){
 const v=await dialogo({titulo:'Baixar relatório TXT',texto:'Resumo da conta e até 200 eventos recentes. Fica na auditoria.',campos:[MOTIVO],confirmar:'Baixar'});
 if(!v)return;
 try{
  const r=await fetch('/admin/api/user/report?id='+encodeURIComponent(u.id)+'&motivo='+encodeURIComponent(v.motivo),{credentials:'same-origin',headers:{Authorization:'Bearer '+TOKEN}});
  if(r.status===401){telaLogin('Sua sessão terminou. Entre de novo.');return;}
  if(!r.ok){const j=await r.json().catch(()=>({}));toast(mensagemErro({codigo:j.erro,status:r.status}),'err');return;}
  const blob=await r.blob(),a=document.createElement('a'),href=URL.createObjectURL(blob);a.href=href;a.download='olli-usuario-relatorio.txt';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(href);toast('Relatório baixado.');
 }catch{toast('Falha ao gerar o relatório.','err');}
}
async function acaoExcluir(u){
 const v=await dialogo({titulo:'Excluir '+u.email+'?',texto:'Cancela assinaturas (cartão, Mercado Pago, Google Play), apaga arquivos, orçamentos, clientes e a conta. Não tem volta.',campos:[MOTIVO],confirmar:'Excluir para sempre',perigo:true,digitar:'EXCLUIR'});
 if(!v)return;
 try{await api('user/delete?id='+encodeURIComponent(u.id),{method:'POST',body:JSON.stringify({motivo:v.motivo,confirmacao:'EXCLUIR',requestId:crypto.randomUUID()})});toast('Conta excluída.');fecharGaveta();await recarregar(true);}
 catch(e){if(e.codigo==='mfa_recente_necessario'){toast('Confirme o código e tente de novo.','err');abrirSeguranca();return;}toast(mensagemErro(e),'err');}
}

/* ── FUNIL ── */
const ERRO_FUNIL={funil_sem_migration:'a migration do funil ainda não foi aplicada no banco.',funil_indisponivel:'o banco não respondeu.',funil_invalido:'o banco respondeu num formato inesperado.'};
function fmtHoras(h){if(h==null)return '—';if(h<1)return Math.round(h*60)+' min';if(h<48)return (h<10?h.toLocaleString('pt-BR',{maximumFractionDigits:1}):Math.round(h))+' h';return (h/24).toLocaleString('pt-BR',{maximumFractionDigits:1})+' d';}
function celFunil(c,ordem){const td=el('td');if(!c){td.append(el('b',{},'—'));return td;}td.append(el('b',{},fmtNum(c.contas)));if(ordem>1){const t=c.taxa;td.append(el('small',{className:t==null?'':(t>=50?'bom':(t<20?'fraco':''))},t==null?'—':t+'% do anterior'));}return td;}
function notaExclusao(f){if(!f.contasExcluidas)return 'Nenhuma conta interna fora do funil.';return 'Fora do funil: '+f.contasExcluidas+' conta(s) interna(s) — '+f.exclusoes.map(e=>e.rotulo+' '+e.contas).join(' · ')+'.';}
async function carregarFunil(){
 const box=limpar($('v-funil'));box.append(el('div',{className:'card'},carregando(6)));
 try{
  const f=await api('funil?semanas=12');limpar(box);
  box.append(el('p',{className:'mut',style:'margin-bottom:16px'},'Cada linha é uma semana de cadastros. Cada coluna é um passo da jornada. A porcentagem mostra quantos dos que chegaram ao passo anterior chegaram a este — o passo com a menor porcentagem é onde as pessoas desistem.'));
  if(f.vazio){box.append(el('div',{className:'card'},estado('','Nenhum cadastro nas últimas '+f.semanas+' semanas.')));box.append(el('div',{className:'nota'},notaExclusao(f)));return;}
  const tb=el('table'),hr=el('tr');hr.append(el('th',{},'Semana do cadastro'));f.degraus.forEach(d=>hr.append(el('th',{},d.rotulo)));tb.append(el('thead',{},hr));
  const body=el('tbody');
  const tot=el('tr',{className:'tot'});tot.append(el('td',{},el('b',{},'Todas')));f.total.forEach((c,i)=>tot.append(celFunil(c,f.degraus[i].ordem)));body.append(tot);
  const tempo=el('tr');tempo.append(el('td',{className:'mut'},'Tempo até o passo'));f.total.forEach((c,i)=>tempo.append(el('td',{className:'mut'},i===0?'':fmtHoras(c&&c.medianaHorasAnterior))));body.append(tempo);
  f.coortes.forEach(co=>{const tr=el('tr');tr.append(el('td',{},fmtDate(co.semana+'T12:00:00')));co.degraus.forEach((c,i)=>tr.append(celFunil(c,f.degraus[i].ordem)));body.append(tr);});
  tb.append(body);box.append(el('div',{className:'card tblWrap funil'},tb));
  box.append(el('div',{className:'nota'},'Semana = segunda a domingo, horário de Brasília. Para contas anteriores à ativação do funil, as datas de "perfil", "enviado", "aprovado" e "pagou" são aproximadas. '+notaExclusao(f)));
 }catch(e){if(e.status===401)return;limpar(box).append(el('div',{className:'card'},estado('erro','Funil indisponível.',(ERRO_FUNIL[e.codigo]||mensagemErro(e))+' Nenhum número foi zerado.')));}
}

/* ── CRÉDITO DE TROCA ── */
const ERRO_DECISAO={pedido_ja_decidido:'Este pedido já foi decidido. Atualize a lista.',meses_invalidos:'Escolha um período válido.',pedido_inexistente:'Pedido não encontrado.',autoaprovacao_proibida:'Você não pode decidir o seu próprio pedido.'};
const ST_TROCA={pendente:['warn','em análise'],aprovado:['ok','aprovado'],recusado:['dng','recusado']};
function dataSimples(d){return d?fmtDate(String(d).slice(0,10)+'T12:00:00'):'—';}
function renderTroca(){
 const box=limpar($('v-troca'));
 const chips=el('div',{className:'chips'});[['pendente','Em análise'],['','Todos']].forEach(f=>chips.append(el('button',{className:'chip',ariaPressed:String(TROCA_FILTRO===f[0]),onclick:async()=>{TROCA_FILTRO=f[0];TROCA=null;renderTroca();await carregarTrocaDados();atualizarBadges();renderTroca();}},f[1])));
 box.append(el('p',{className:'mut',style:'margin-bottom:16px'},'Quem já pagava outro app manda o comprovante pelo app ("Vim de outro app"). Confira o print antes de aprovar: libera o Pro por até '+TROCA_MAX+' meses, uma vez por conta, e fica na auditoria.'),chips);
 if(TROCA===null&&!TROCA_ERRO){box.append(el('div',{className:'card'},carregando(4)));return;}
 if(TROCA===null){box.append(el('div',{className:'card'},estado('erro','Pedidos indisponíveis.',TROCA_ERRO+' Isso não quer dizer que não há pedidos.')));return;}
 if(!TROCA.length){box.append(el('div',{className:'card'},estado('',TROCA_FILTRO==='pendente'?'Nenhum pedido esperando você.':'Ainda não chegou nenhum pedido.')));return;}
 const t=el('table'),tb=el('tbody');
 t.append(el('thead',{},el('tr',{},el('th',{},'Prestador'),el('th',{},'App anterior'),el('th',{className:'hideSm'},'Vence lá'),el('th',{className:'hideSm'},'Pedido'),el('th',{},'Situação'),el('th',{}))));
 TROCA.forEach(p=>{const st=ST_TROCA[p.status]||['',p.status];const sit=p.status==='aprovado'?(p.meses_concedidos+(p.meses_concedidos===1?' mês':' meses')+' · até '+fmtDate(p.concedido_ate)):p.status==='recusado'?(p.motivo_recusa||''):'aguardando conferência';
  tb.append(el('tr',{},el('td',{},el('b',{},p.email||('id '+String(p.user_id).slice(0,8))),p.observacao?el('div',{className:'mut',style:'font-size:12.5px'},p.observacao):null),el('td',{},p.app_anterior),el('td',{className:'hideSm'},dataSimples(p.vence_em)),el('td',{className:'hideSm'},fmtDate(p.criado_em)),el('td',{},el('span',{className:'pill '+st[0]},st[1]),el('div',{className:'mut',style:'font-size:12px;margin-top:2px'},sit)),el('td',{},el('button',{className:'btn sec',onclick:()=>abrirTroca(p)},p.status==='pendente'?'Conferir':'Ver'))));});
 t.append(tb);box.append(el('div',{className:'card tblWrap'},t));
}
async function abrirTroca(p){
 const prev=el('div',{style:'margin:8px 0 16px;min-height:60px'},el('p',{className:'mut'},'Carregando comprovante…'));
 api('creditos-troca/comprovante?id='+encodeURIComponent(p.id)).then(j=>{limpar(prev).append(el('img',{src:j.url,alt:'Comprovante enviado pelo prestador',style:'max-width:100%;max-height:55vh;border-radius:12px;border:1px solid var(--line);display:block'}),el('a',{href:j.url,target:'_blank',rel:'noopener noreferrer',style:'font-size:13px;display:inline-block;margin-top:8px'},'Abrir em nova aba (vale 5 min)'));}).catch(e=>{if(e.status===401)return;limpar(prev).append(el('p',{className:'erroCampo'},'Não consegui abrir o comprovante. Não aprove sem conferir.'));});
 const info=el('div',{},el('div',{className:'txt'},(p.email||p.user_id)+' · pedido em '+fmtDate(p.criado_em)+(p.vence_em?' · vence lá em '+dataSimples(p.vence_em):'')+(p.observacao?' · "'+p.observacao+'"':'')),prev);
 if(p.status!=='pendente'){await dialogo({titulo:'Crédito de troca · '+p.app_anterior,conteudo:info,semConfirmar:true,cancelar:'Fechar',largo:true});return;}
 const opcoes=[];for(let i=1;i<=TROCA_MAX;i++)opcoes.push([String(i),i+(i===1?' mês':' meses')+' de Pro']);
 opcoes.push(['recusar','Recusar o pedido']);
 const v=await dialogo({titulo:'Crédito de troca · '+p.app_anterior,conteudo:info,largo:true,campos:[{nome:'decisao',rotulo:'Decisão',tipo:'select',valor:String(p.mesesSugeridos||TROCA_MAX),opcoes},Object.assign({},MOTIVO,{ajuda:'Na recusa, o prestador lê este texto.'})],confirmar:'Salvar decisão'});
 if(!v)return;
 const ok=v.decisao!=='recusar';
 try{const j=await api('creditos-troca/decidir',{method:'POST',body:JSON.stringify({id:p.id,aprovar:ok,meses:ok?Number(v.decisao):null,motivo:v.motivo,requestId:crypto.randomUUID()})});
  const em=j.aviso&&j.aviso.email;const aviso=em==='enviado'?'E-mail enviado.':'O prestador vê no app.';
  toast(ok?'Aprovado: '+(j.planoEfetivo||'pro')+' até '+(j.acessoAte?fmtDate(j.acessoAte):'sem data final')+'. '+aviso:'Pedido recusado.');
  TROCA=null;renderTroca();await carregarTrocaDados();atualizarBadges();renderTroca();
 }catch(e){toast(ERRO_DECISAO[e.codigo]||mensagemErro(e),'err');}
}

/* ── SUPORTE ── */
const TIPO_FB={feedback:['info','Mensagem'],sugestao:['warn','Sugestão'],bug:['dng','Problema'],elogio:['ok','Elogio'],erro:['dng','Erro'],pulso:['info','Pesquisa'],denuncia:['dng','Denúncia']};
function tipoFb(f){const o=f&&f.contexto&&f.contexto.origem;return(o&&TIPO_FB[o])?o:f.tipo;}
function emailDe(uid){const u=(USERS||[]).find(x=>x.id===uid);return u?(u.email||u.nome||'usuário'):(uid?('id '+String(uid).slice(0,8)):'anônimo');}
async function fbResolve(f){try{await api('feedback/resolve?id='+encodeURIComponent(f.id)+'&resolvido='+(f.resolvido?'0':'1'),{method:'POST'});f.resolvido=!f.resolvido;atualizarBadges();renderSuporte();toast(f.resolvido?'Marcado como resolvido.':'Reaberto.');}catch(e){toast(mensagemErro(e),'err');}}
function renderSuporte(){
 const box=limpar($('v-suporte'));
 if(FB===null&&!FB_ERRO){box.append(el('div',{className:'card'},carregando(5)));return;}
 if(FB===null){box.append(el('div',{className:'card'},estado('erro','Não consegui carregar as mensagens.',FB_ERRO)));return;}
 const semErro=FB.filter(f=>tipoFb(f)!=='erro');
 const opts=[['abertos','Sem resposta',f=>!f.resolvido],['denuncia','Denúncias',f=>tipoFb(f)==='denuncia'],['bug','Problemas',f=>tipoFb(f)==='bug'],['sugestao','Sugestões',f=>tipoFb(f)==='sugestao'],['feedback','Mensagens',f=>tipoFb(f)==='feedback'||tipoFb(f)==='elogio'],['pulso','Pesquisas',f=>tipoFb(f)==='pulso'],['todos','Todas',()=>true]];
 const chips=el('div',{className:'chips'});
 opts.forEach(o=>{const n=semErro.filter(o[2]).length;chips.append(el('button',{className:'chip',ariaPressed:String(FBFILTER===o[0]),onclick:()=>{FBFILTER=o[0];renderSuporte();}},o[1],el('span',{className:'n'},String(n))));});
 box.append(chips);
 const filtro=(opts.find(o=>o[0]===FBFILTER)||opts[0])[2];
 const lista=semErro.filter(filtro);
 const card=el('div',{className:'card'});
 if(!lista.length)card.append(estado('ok','Tudo quieto por aqui.','Nenhuma mensagem neste filtro.'));
 lista.forEach(f=>{const t=tipoFb(f),meta=TIPO_FB[t]||['','Mensagem'],ctx=f.contexto||{};
  const bits=[ctx.nota?('nota '+ctx.nota+'/5'):null,ctx.tela?'tela '+ctx.tela:null,ctx.plano,ctx.versao?('v'+ctx.versao):null,ctx.plataforma].filter(Boolean).join(' · ');
  const it=el('div',{className:'fb'+(f.resolvido?' resolvido':'')+(t==='denuncia'&&!f.resolvido?' denuncia':'')});
  it.append(el('div',{className:'fbCab'},el('span',{className:'pill '+meta[0]},meta[1]),bits?el('span',{},bits):null,el('span',{style:'margin-left:auto'},fmtDH(f.criado_em))));
  it.append(el('div',{className:'fbMsg'},f.mensagem||''));
  const u=(USERS||[]).find(x=>x.id===f.user_id);
  it.append(el('div',{className:'fbPe'},u?el('a',{href:'#',onclick:e=>{e.preventDefault();abrirUsuario(u);}},emailDe(f.user_id)):el('span',{},emailDe(f.user_id)),el('span',{className:'esp'}),el('button',{className:'btn '+(f.resolvido?'ghost':'sec'),onclick:()=>fbResolve(f)},f.resolvido?'Reabrir':'Marcar como resolvido')));
  card.append(it);});
 box.append(card);
 // Erros técnicos: agrupados, fora da caixa principal.
 const erros=FB.filter(f=>tipoFb(f)==='erro'&&!f.resolvido);
 const grupos=new Map();
 erros.forEach(f=>{const k=String(f.mensagem||'erro sem mensagem').split('\n')[0].slice(0,140);const g=grupos.get(k)||{k,itens:[],users:new Set(),ultimo:''};g.itens.push(f);if(f.user_id)g.users.add(f.user_id);if(String(f.criado_em)>g.ultimo)g.ultimo=f.criado_em;grupos.set(k,g);});
 const det=el('details',{className:'card erros'});
 det.append(el('summary',{},ico('alert'),'Erros técnicos do app ('+grupos.size+(grupos.size===1?' tipo':' tipos')+', '+erros.length+' ocorrências)',el('span',{className:'mut',style:'font-weight:500;margin-left:auto;font-size:12.5px'},'agrupados · detalhes completos no Sentry')));
 if(!grupos.size)det.append(estado('ok','Nenhum erro técnico em aberto.'));
 [...grupos.values()].sort((a,b)=>b.itens.length-a.itens.length).forEach(g=>{
  const ex=g.itens[0],ctx=ex.contexto||{};
  det.append(el('div',{className:'fb'},el('div',{className:'fbCab'},el('span',{className:'pill dng'},g.itens.length+'×'),el('span',{},g.users.size+(g.users.size===1?' pessoa':' pessoas')),el('span',{style:'margin-left:auto'},'último '+rel(g.ultimo))),el('div',{className:'fbMsg'},g.k),el('div',{className:'fbPe'},el('span',{className:'esp'}),ctx.stack?el('button',{className:'btn ghost',onclick:()=>dialogo({titulo:'Detalhe do erro',conteudo:el('pre',{className:'stack'},String(ctx.stack)),semConfirmar:true,cancelar:'Fechar',largo:true})},'Ver detalhe'):null,el('button',{className:'btn sec',onclick:async()=>{for(const f of g.itens){try{await api('feedback/resolve?id='+encodeURIComponent(f.id)+'&resolvido=1',{method:'POST'});f.resolvido=true;}catch{}}renderSuporte();toast('Grupo marcado como resolvido.');}},'Resolver grupo'))));
 });
 box.append(det);
}

/* ── AUDITORIA ── */
async function carregarAuditoria(){
 const box=limpar($('v-auditoria'));box.append(el('div',{className:'card'},carregando(8)));
 try{
  const j=await api('audit');limpar(box);
  const busca=el('input',{className:'inp',type:'search',placeholder:'Filtrar por ação ou motivo',ariaLabel:'Filtrar auditoria'});
  const card=el('div',{className:'card'});
  const desenhar=()=>{limpar(card);const q=busca.value.trim().toLowerCase();const l=j.auditoria.filter(a=>!q||(rotAcao(a.acao)+' '+a.motivo+' '+a.acao).toLowerCase().includes(q));
   if(!l.length){card.append(estado('','Nada encontrado.'));return;}
   const t=el('table'),tb=el('tbody');t.append(el('thead',{},el('tr',{},el('th',{},'Quando'),el('th',{},'Ação'),el('th',{className:'hideSm'},'Conta afetada'),el('th',{},'Motivo'),el('th',{className:'hideSm'},'Papel'))));
   l.forEach(a=>tb.append(el('tr',{},el('td',{className:'mut',style:'white-space:nowrap'},fmtDH(a.criado_em)),el('td',{},el('b',{},rotAcao(a.acao))),el('td',{className:'hideSm'},a.target_user_id?emailDe(a.target_user_id):'—'),el('td',{style:'overflow-wrap:anywhere'},a.motivo),el('td',{className:'hideSm mut'},a.actor_role))));
   t.append(tb);card.append(el('div',{className:'tblWrap'},t));};
  busca.oninput=desenhar;
  box.append(el('div',{className:'barra'},el('div',{className:'busca'},ico('search'),busca),el('span',{className:'mut'},'Últimas 300 ações')),card);desenhar();
 }catch(e){if(e.status===401)return;limpar(box).append(el('div',{className:'card'},estado('erro','Auditoria indisponível.',mensagemErro(e))));}
}

/* ── ADMINISTRADORES ── */
const ROT_PAPEL={owner:'Dono',admin:'Administrador',financeiro:'Financeiro',suporte:'Suporte',leitura:'Só leitura'};
async function carregarAdmins(){
 const box=limpar($('v-admins'));box.append(el('div',{className:'card'},carregando(4)));
 try{
  const j=await api('admins');limpar(box);
  const card=el('div',{className:'card lista'});
  if(j.bootstrapEmail)card.append(el('div',{className:'li'},el('span',{},el('b',{},j.bootstrapEmail)),el('span',{className:'d'},el('span',{className:'pill ok'},'Dono · e-mail raiz'))));
  j.admins.forEach(a=>{const dir=el('span',{className:'d',style:'display:flex;gap:8px;align-items:center;justify-content:flex-end'},el('span',{className:'pill '+(a.ativo?'ok':'')},a.ativo?(ROT_PAPEL[a.papel]||a.papel):'revogado'));if(a.ativo)dir.append(el('button',{className:'btn dangerSec',onclick:()=>salvarAdmin(a.email,a.papel,false)},'Revogar'));card.append(el('div',{className:'li'},el('span',{},a.email||a.user_id),dir));});
  box.append(card);
  box.append(secTit('Dar acesso a alguém'));
  box.append(el('div',{className:'card pad'},el('p',{className:'mut',style:'margin-bottom:12px'},'A pessoa precisa ter uma conta no OLLI. Papéis: Administrador vê e faz quase tudo; Financeiro cuida de planos, créditos e trocas; Suporte atende e bloqueia; Só leitura não vê dados de clientes.'),el('button',{className:'btn',onclick:()=>salvarAdmin('', 'suporte', true)},'Adicionar administrador')));
 }catch(e){if(e.status===401)return;limpar(box).append(el('div',{className:'card'},estado('erro','Lista indisponível.',mensagemErro(e))));}
}
async function salvarAdmin(email,papel,ativo){
 const campos=[];
 if(ativo){campos.push({nome:'email',rotulo:'E-mail da conta OLLI',tipo:'email',valor:email,min:5},{nome:'papel',rotulo:'Papel',tipo:'select',valor:papel,opcoes:[['admin','Administrador'],['financeiro','Financeiro'],['suporte','Suporte'],['leitura','Só leitura']]});}
 campos.push(MOTIVO);
 const v=await dialogo({titulo:ativo?'Dar acesso ao painel':'Revogar acesso de '+email,texto:ativo?'Pede o código do autenticador se a sua sessão entrou só pela senha.':'A pessoa perde o acesso na hora.',campos,confirmar:ativo?'Salvar acesso':'Revogar',perigo:!ativo});
 if(!v)return;
 try{await api('admins',{method:'POST',body:JSON.stringify({email:(v.email||email).trim(),papel:v.papel||papel,ativo,motivo:v.motivo,requestId:crypto.randomUUID()})});toast(ativo?'Acesso salvo.':'Acesso revogado.');carregarAdmins();}
 catch(e){if(e.codigo==='mfa_recente_necessario'){toast('Confirme o código e tente de novo.','err');abrirSeguranca();return;}toast(mensagemErro(e),'err');}
}

/* ── SEGURANÇA ── */
async function renderSeguranca(){
 const box=limpar($('v-seguranca'));
 const sessao=el('div',{className:'card pad'});
 sessao.append(el('h3',{style:'font-size:16px;margin-bottom:4px'},'Esta sessão'),el('p',{className:'mut'},(ME.email||'')+' · '+(ROT_PAPEL[ME.papel]||ME.papel)),
  el('p',{style:'margin-top:12px'},ME.aalVia==='mfa'?'Verificada com o código do autenticador. A sessão continua aberta neste aparelho até você sair.':ME.aalVia==='aparelho'?'Entrou só com a senha porque este aparelho está lembrado'+(ME.aparelhoExpiraEm?' até '+fmtDate(ME.aparelhoExpiraEm):'')+'. Para excluir contas ou mexer em administradores, confirme o código.':'Código pendente.'),
  el('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:16px'},el('button',{className:'btn sec',onclick:()=>abrirSeguranca(async()=>{renderSeguranca();})},ME.aalVia==='mfa'?'Confirmar código de novo':'Confirmar código agora'),el('button',{className:'btn sec',onclick:trocarSenha},'Trocar minha senha')));
 box.append(secTit('Sessão'),sessao);
 box.append(secTit('Aparelhos lembrados','neles, a senha basta por 30 dias'));
 const ap=el('div',{className:'card'},carregando(3));box.append(ap);
 box.append(secTit('Sair'));
 box.append(el('div',{className:'card pad'},el('p',{className:'mut',style:'margin-bottom:12px'},'"Sair" encerra a sessão mas mantém este aparelho lembrado. "Sair e esquecer" use em computador emprestado ou público.'),el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},el('button',{className:'btn sec',onclick:()=>sair(false)},'Sair'),el('button',{className:'btn dangerSec',onclick:()=>sair(true)},'Sair e esquecer este aparelho'))));
 try{
  const j=await api('aparelhos');limpar(ap);
  const ativos=j.aparelhos.filter(a=>a.estado==='ativo');
  if(!j.aparelhos.length)ap.append(estado('','Nenhum aparelho lembrado.','Marque "Lembrar este aparelho" ao confirmar o código.'));
  j.aparelhos.forEach(a=>{const dir=el('span',{className:'d',style:'display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap'});
   dir.append(el('span',{className:'pill '+(a.estado==='ativo'?'ok':'')},a.estado==='ativo'?'até '+fmtDate(a.expiraEm):a.estado));
   if(a.estado==='ativo')dir.append(el('button',{className:'btn dangerSec',onclick:async()=>{try{await api('aparelhos/revogar?id='+a.id,{method:'POST',body:'{}'});toast('Aparelho esquecido.');renderSeguranca();}catch(e){toast(mensagemErro(e),'err');}}},'Esquecer'));
   ap.append(el('div',{className:'li'},el('span',{},el('b',{},a.nome+(a.atual?' (este)':'')),el('div',{className:'mut',style:'font-size:12.5px'},'desde '+fmtDate(a.criadoEm)+(a.ultimoUsoEm?' · usado '+rel(a.ultimoUsoEm):'')+(a.ip?' · IP '+a.ip:''))),dir));});
  ap.classList.add('lista');
  if(ativos.length>1)box.insertBefore(el('div',{style:'margin-top:8px'},el('button',{className:'btn ghost',onclick:async()=>{try{await api('aparelhos/revogar?id=todos',{method:'POST',body:'{}'});toast('Todos os aparelhos foram esquecidos.');renderSeguranca();}catch(e){toast(mensagemErro(e),'err');}}},'Esquecer todos')),ap.nextSibling);
 }catch(e){if(e.status===401)return;limpar(ap).append(estado('erro','Lista de aparelhos indisponível.',mensagemErro(e)));}
}
async function trocarSenha(){
 const v=await dialogo({titulo:'Trocar minha senha',texto:'Mínimo 8 caracteres. Os outros aparelhos lembrados serão esquecidos.',campos:[{nome:'s1',rotulo:'Nova senha',tipo:'password',min:8},{nome:'s2',rotulo:'Repita a nova senha',tipo:'password',min:8}],confirmar:'Salvar'});
 if(!v)return;
 if(v.s1!==v.s2){toast('As senhas não batem.','err');return;}
 try{await api('me/password',{method:'POST',body:JSON.stringify({senha:v.s1})});toast('Senha alterada.');renderSeguranca();}catch(e){toast(mensagemErro(e),'err');}
}

/* ── eventos ── */
pintarIcones();
$('formLogin').addEventListener('submit',login);
$('sairBtn').onclick=()=>sair(false);
$('temaBtn').onclick=alternarTema;
$('menuBtn').onclick=abrirMenu;
$('scrim').onclick=fecharMenu;
$('gavScrim').onclick=fecharGaveta;
window.addEventListener('hashchange',()=>irPara((location.hash||'').slice(1)));
let PALETA=null;
function fecharPaleta(){if(!PALETA)return;document.removeEventListener('keydown',PALETA.tecla);PALETA.ov.remove();PALETA=null;}
function abrirPaleta(){
 if(!ME||ME.aal!=='aal2')return;
 if(PALETA){fecharPaleta();return;}
 if(document.querySelector('.dlgOv'))return;
 const itens=[];
 for(const n of NAV){if(pode(n.cap))itens.push(n);}
 if(pode('admin'))itens.push({id:'usuarios',rot:'Buscar usuários',sub:'Abre a lista e o campo de busca.',foco:true});
 const ov=el('div',{className:'dlgOv paleta'});
 ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Ir para uma seção');
 const campo=el('input',{className:'inp',type:'search',placeholder:'Ir para uma seção…',ariaLabel:'Filtrar seções'});
 const lista=el('div',{className:'palLista'});
 let marcado=0;
 function visiveis(){const q=campo.value.trim().toLowerCase();return itens.filter(n=>!q||(n.rot+' '+n.sub).toLowerCase().includes(q));}
 function ir(n){fecharPaleta();location.hash=n.id;if(n.foco)setTimeout(()=>{const b=$('busca');if(b)b.focus();},40);}
 function desenhar(){
  limpar(lista);const vis=visiveis();
  if(!vis.length){lista.append(estado('','Nada com esse nome.','Escolha uma seção que já está no menu.'));return;}
  if(marcado>=vis.length)marcado=0;
  vis.forEach((n,i)=>lista.append(el('button',{type:'button',className:'palItem'+(i===marcado?' on':''),onclick:()=>ir(n)},el('b',{},n.rot),el('span',{},n.sub))));
 }
 const tecla=e=>{
  if(e.key==='Escape'){e.preventDefault();fecharPaleta();return;}
  const vis=visiveis();
  if(e.key==='ArrowDown'){e.preventDefault();marcado=Math.min(vis.length-1,marcado+1);desenhar();return;}
  if(e.key==='ArrowUp'){e.preventDefault();marcado=Math.max(0,marcado-1);desenhar();return;}
  if(e.key==='Enter'&&vis[marcado]){e.preventDefault();ir(vis[marcado]);}
 };
 campo.oninput=()=>{marcado=0;desenhar();};
 ov.onclick=e=>{if(e.target===ov)fecharPaleta();};
 const d=el('div',{className:'dlg'});
 d.append(el('h3',{},'Ir para'),campo,lista);ov.append(d);document.body.append(ov);
 document.addEventListener('keydown',tecla);PALETA={ov,tecla};desenhar();campo.focus();
}
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&USER_ABERTO&&!document.querySelector('.dlgOv'))fecharGaveta();
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&ME&&ME.aal==='aal2'){e.preventDefault();abrirPaleta();}
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ME&&TOKEN){renovar().then(st=>{if(st==='sem_sessao')telaLogin('Sua sessão terminou. Entre de novo.');});}});
(async()=>{
 const st=await renovar();
 if(st==='ok'){try{await entrar();}catch(e){telaLogin('Não consegui abrir o painel. Entre de novo.');}}
 else telaLogin(st==='indisponivel'?'O servidor de login não respondeu. Tente de novo em instantes.':'');
})();
`;

export function adminHtml(env, nonce, opts = {}) {
  const cfg = JSON.stringify({
    sb: env.SUPABASE_URL || '',
    anon: env.SUPABASE_ANON_KEY || '',
    trocaMax: Number(opts.trocaMesesMax) || 3,
    creditosMax: Number(opts.creditosAjusteMax) || 5000,
  }).replace(/</g, '\\u003c');
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>' +
    '<meta name="color-scheme" content="light dark"/>' +
    '<title>Painel OLLI</title>' +
    `<style>${FONTES_CSS}</style>` +
    '<style>' + CSS + '</style></head><body>' +
    BODY.split('__SYM__').map((parte, i) => (i ? SYM.split('og').join(`og${i}`) : '') + parte).join('') +
    '<script nonce="' + nonce + '">const CFG=' + cfg + ';' + SCRIPT + '</script></body></html>';
}

# Enriquecimento da base de códigos de erro HVAC

## Resultado

- Total de códigos normalizados: 602
- Total de fontes catalogadas: 72
- Novos registros adicionados: 340
- Novas fontes adicionadas: 28
- Nova aba principal para campo: GUIA_INSTALADOR
- Nova aba específica: FUJITSU_DETALHADO
- Nova aba de fallback: BUSCA_POR_MARCA

## Marcas reforçadas nesta rodada

- Fujitsu: reforço pesado com códigos antigos, E:EE, LED outdoor, Halcyon/RGLX, multi-zone e VRF/Airstage.
- Carrier: 40MAQ, XPower e portal técnico de fault codes.
- Midea/Springer: Xtreme Save, Liva/Springer e códigos EH/EL/EC/PC.
- Philco: PAC, FM/FM2/FM4, Inverter M9 e famílias equivalentes.
- Consul: rotina de teste, E4 e códigos 00 a 40.
- Samsung: E/C codes, split/DVM e portal oficial Service Guides.
- LG: CH05/CH53, CH32-CH62, HL e Multi V.
- Gree/Gri: U-Match R410A/R32, E/F/H/P/L codes.
- TCL: split, inverter, piso-teto e guias de reparo.

## Regra de ouro para o app

Não trate código de erro como verdade absoluta sem modelo. A ordem correta é:

1. Marca
2. Modelo da evaporadora
3. Modelo da condensadora
4. Família/linha
5. Tipo de equipamento
6. Código/display/LED
7. Sintoma real
8. Fonte técnica
9. Ação inicial
10. Solução confirmada em campo

## Fluxo recomendado quando o erro não aparece

1. Pedir foto da etiqueta da evaporadora e condensadora.
2. Pedir foto ou vídeo do display/LED piscando.
3. Buscar na aba BUSCA_POR_MARCA.
4. Abrir o link da fonte oficial ou manual técnico.
5. Se não encontrar, registrar ocorrência interna: marca, modelo, código, sintoma, medidas elétricas/frigoríficas e solução final.
6. Depois que o técnico confirmar a solução, transformar a ocorrência em linha nova da base.

## Observação crítica

Fujitsu, Philco, TCL e Samsung exigem mais cuidado por família. O mesmo código pode mudar de significado dependendo da linha e do controle. Para produto SaaS, a base precisa guardar fonte, confiança e observação por linha. Sem isso, o app vira chute com interface bonita.

## Principais fontes novas

- S045 | Fujitsu General/Halcyon | 2019 Troubleshooting Guide | https://ilovemyfujitsu.com/wp-content/uploads/2021/05/fujitsu2019-Troubleshooting-Guide.pdf
- S046 | Fujitsu General | 2011 High-SEER R410A Mini-Splits Troubleshooting Guide | https://cdn.master.ca/documents/en/technical-bulletins/residential/fujitsu/tech_tips/2011_Troubleshooting_Guide.pdf
- S047 | Fujitsu General | Split Type Air Conditioner Service Manual | https://device.report/manuals/fujitsu-general-split-air-conditioner-service-manual
- S048 | GENERAL/Fujitsu Thailand | How to Check Error Code - Split Type | https://www.generalww.com/th/en/support/error-code/index.html
- S049 | Fujitsu General Global | Downloads / Document Search | https://www.fujitsu-general.com/global/support/downloads/index.html
- S050 | Fujitsu Assist AU | VRF Error Code Reset Procedure | https://assist.fujitsugeneral.com.au/support/solutions/articles/6000264070-vrf-error-code-reset-procedure
- S051 | Carrier Australia | Fault Codes index | https://www.carrierair.com.au/installer-and-technical-support/fault-codes/
- S052 | Carrier | 40MAQ Service Manual | https://www.shareddocs.com/hvac/docs/1009/Public/00/40MAQ-01SM.pdf
- S053 | Carrier Brasil | XPower IOM Manual | https://es.carrierdobrasil.com.br/wp-content/uploads/sites/3/2020/03/Manual-de-Instala%C3%A7%C3%A3o-Opera%C3%A7%C3%A3o-e-Manuten%C3%A7%C3%A3o-XPOWER.pdf
- S054 | Midea/Springer | IOM Springer Midea Xtreme Save | https://www.midea.com/content/dam/midea-aem/br/climatizacao/hiwall/ar-condicionado-split-springer-midea-xtreme-save-9000-btu-h-frio/256.08.805_IOM-SHW-Springer-Midea-AG-Inverter-F-03-21-view_2.pdf
- S055 | Midea/Springer | Liva/Springer error codes | https://static.webarcondicionado.com.br/pdfs/midea-codigos-de-erro.pdf
- S056 | Philco/WebAr | Códigos de erro Philco | https://static.webarcondicionado.com.br/blog/uploads/2022/09/codigos_erro_philco.pdf
- S057 | Philco | Manual PAC12000TQFM11 | https://philco.vteximg.com.br/arquivos/Manual_Ar_Condicionado_12000Btus_PAC12000TQFM11_QuenteFrio_96662164.pdf
- S058 | Auvo | Guia de código de erro Philco | https://www.blog.auvo.com/codigo-erro-philco
- S059 | Consul/WebAr | Códigos de erro Consul | https://static.webarcondicionado.com.br/pdfs/consul-codigos-de-erro.pdf
- S060 | Samsung HVAC | Service Guides/Bulletins | https://www.samsunghvac.com/service-guides-bulletins/service-guide
- S061 | Samsung | Split AC Error Codes | https://www.gausdalvarmepumper.no/PDF/SamsungFeilsoking.pdf
- S062 | LG | Multi V IV Service Manual | https://a1ac1dcb67cc9f847a73-0b6da349d0197cd2922796e57d5f1d84.ssl.cf5.rackcdn.com/CMSFiles/PMAssets/PMAssets/Resource/general/1230/sm-multiv-iv-air-outdoor-units-4-15_20150414080917.pdf
- S063 | LG | LG Fault Codes | https://www.arma.org.au/wp-content/uploads/2017/02/LG-FAULT-CODES-1.pdf
- S064 | LG | CH05 official help page | https://www.lg.com/us/support/help-library/lg-air-conditioner-troubleshooting-a-ch05-error-code--20152825256367
- S065 | LG | CH61 official help page | https://www.lg.com/levant_en/support/product-help/CT20158041-20153301509114
- S066 | Gree | U-Match R410a Maintenance and Faults | https://www.greeac.co.nz/storage/Documents/U%20Match%20R410a%20Maintenance%20and%20Faults.pdf
- S067 | Gree | U-MatchNZ R32 Troubleshooting | https://www.greeac.co.nz/storage/Downloads/UMatch/U-MatchNZ-R32%20SM%202019%20Trouble%20Shooting%20%28pages%2051-86%29.pdf
- S068 | TCL/WebAr | Manual do ar-condicionado TCL | https://www.webarcondicionado.com.br/manual-do-ar-condicionado-tcl
- S069 | TCL | Manual TAC-09/24CSA/CHSA | https://blobmarketingsemp.blob.core.windows.net/website/2023/07/MANUAL_TCL_TAC-09_24CSA_CHSA.pdf
- S070 | TCL/Leveros | Piso-teto inverter service/manual catalog | https://www.leverosintegra.com.br/download/manuais/TCL/manual-catalogo-piso-teto-inverter-tcl.pdf
- S071 | TCL | Elite/New Elite inverter service manual | https://aws-obg-image-lb-4.tcl.com/content/dam/brandsite/region/maylaysia/download/air-conditioners/xa81i/ac-new-elite-series-inverter.pdf
- S072 | Komeco/TCL | Guia de reparo condicionador inverter | https://www.komeco.com.br/portaltecnico/LINHA%20DE%20CONDICIONADORES%20DE%20AR/TCL/Boletim%20Tecnico/BT001-20%20GUIA%20DE%20REPARO%20CONDICIONADOR%20DE%20AR%20INVERTER.pdf

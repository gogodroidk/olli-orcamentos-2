/**
 * Conteúdo dos 12 segmentos da v10 (D-2876), extraído de `OLLI-Site-Oficial-v10/segmentos/*.html` por
 * `extrair_segmentos.py` e DEPOIS editado à mão. Aqui só vai texto de ofício; plano, preço, limite e Pix saem de
 * `data/site.ts`. O marcador `@PIX@` vira a frase do Pix no link (ou some se a fonte não concede).
 * Chave = slug da rota /para/<slug>/.
 */
export interface SegmentoSite {
	v10: string;
	h1a: string;
	h1b: string;
	lead: string;
	kicker: string;
	listaTitulo: string;
	itens: string[];
	tela: { arquivo: string; alt: string } | null;
	ajudaKicker: string;
	ajudaTitulo: string;
	cards: { h: string; p: string }[];
	final: string;
}

export const SEGMENTOS_SITE: Record<string, SegmentoSite> = {
	"chaveiro": {
		"v10": "chaveiro",
		"h1a": "Orçamento de chaveiro",
		"h1b": "com a sua marca.",
		"lead": "Abertura de portas, troca de fechaduras e cópias de chaves. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Portas, fechaduras e chaves",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Abertura de portas e portões",
			"Troca de fechaduras e miolos",
			"Cópia de chaves residenciais e automotivas",
			"Instalação de fechaduras digitais",
			"Ajuste e lubrificação de fechaduras",
			"Troca de segredo e reforço de segurança"
		],
		"tela": {
			"arquivo": "lista-orcamentos",
			"alt": "Tela real do OLLI: lista de orçamentos, com a situação de cada proposta"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Do chamado ao serviço autorizado.",
		"cards": [
			{
				"h": "Do chamado ao preço fechado",
				"p": "Junte mão de obra, fechadura e outros itens do seu catálogo no mesmo orçamento, com quantidades e valores claros."
			},
			{
				"h": "Aprovação pelo link",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "Atendimento com registro",
				"p": "No Pro, a ordem de serviço reúne checklist, fotos e assinatura do cliente. Depois do pagamento, você gera o recibo com a sua marca."
			}
		],
		"final": "Seu próximo orçamento de chaveiro sai com a sua marca."
	},
	"dedetizadora": {
		"v10": "dedetizacao",
		"h1a": "Orçamento de dedetização",
		"h1b": "com a sua marca.",
		"lead": "Apresente o controle de pragas e o local de aplicação em uma proposta clara. O cliente recebe por PDF, link ou WhatsApp e aprova pelo link.",
		"kicker": "Controle de pragas",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Dedetização contra baratas e formigas",
			"Desratização e controle de roedores",
			"Descupinização e tratamento de madeira",
			"Controle de mosquitos e pernilongos",
			"Manejo de pulgas e carrapatos",
			"Controle de escorpiões e aranhas"
		],
		"tela": {
			"arquivo": "clientes",
			"alt": "Tela real do OLLI: cadastro de clientes, com o histórico de atendimentos"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Do atendimento ao histórico do cliente.",
		"cards": [
			{
				"h": "Clientes e locais atendidos",
				"p": "Cadastre seus clientes e consulte o histórico dos atendimentos na mesma conta, no celular ou no computador."
			},
			{
				"h": "Itens claros por tipo de praga",
				"p": "Use o catálogo de serviços e produtos para montar a proposta, ajustando quantidades e valores antes de enviar."
			},
			{
				"h": "Ordem de serviço e recibo",
				"p": "No Pro, registre o atendimento com checklist, fotos e assinatura do cliente. Depois do pagamento, gere o recibo com a sua marca."
			}
		],
		"final": "Seu próximo orçamento de controle de pragas sai com a sua marca."
	},
	"eletricista": {
		"v10": "eletricista",
		"h1a": "Orçamento de elétrica",
		"h1b": "com a sua marca.",
		"lead": "Instalação, quadro de distribuição, tomadas e iluminação. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Elétrica residencial e comercial",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Instalação de tomadas, interruptores e pontos de luz",
			"Troca de disjuntores e montagem de quadro de distribuição",
			"Instalação de chuveiro e torneira elétrica",
			"Luminárias, spots e ventilador de teto",
			"Passagem de fiação e troca de cabos",
			"Padrão de entrada e aterramento"
		],
		"tela": {
			"arquivo": "link-cliente-eletrica",
			"alt": "Tela real do OLLI: link do orçamento de elétrica aberto pelo cliente no celular"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Da vistoria ao orçamento aprovado.",
		"cards": [
			{
				"h": "Material e mão de obra, item por item",
				"p": "Monte o orçamento com os serviços e os produtos do seu catálogo, como cabos, disjuntores e tomadas, com quantidade e valor de cada item."
			},
			{
				"h": "Aprovação pelo link",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "Registro do serviço na OS",
				"p": "No Pro, a ordem de serviço guarda checklist, fotos e a assinatura do cliente quando a instalação é entregue."
			}
		],
		"final": "Seu próximo orçamento de elétrica sai com a sua marca."
	},
	"encanador": {
		"v10": "encanador",
		"h1a": "Orçamento de encanamento",
		"h1b": "com a sua marca.",
		"lead": "Desentupimento, instalação, vazamentos e manutenção. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Hidráulica residencial e comercial",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Desentupimento de pias, vasos e ralos",
			"Instalação de torneiras e chuveiros",
			"Conserto de vazamentos e infiltrações",
			"Troca de canos e conexões",
			"Instalação de aquecedores e boilers",
			"Manutenção preventiva de bombas"
		],
		"tela": {
			"arquivo": "lista-orcamentos",
			"alt": "Tela real do OLLI: lista de orçamentos, com a situação de cada proposta"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Do vazamento ao orçamento aprovado.",
		"cards": [
			{
				"h": "Peças e mão de obra separadas",
				"p": "Monte o orçamento com os serviços e os produtos do seu catálogo, como registros, conexões e torneiras, com quantidade e valor de cada item."
			},
			{
				"h": "Aprovação pelo link",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "Cada orçamento com a sua situação",
				"p": "A lista de orçamentos mostra a situação de cada proposta, e o cadastro do cliente guarda o histórico do que você já atendeu."
			}
		],
		"final": "Seu próximo orçamento de encanamento sai com a sua marca."
	},
	"informatica": {
		"v10": "informatica",
		"h1a": "Orçamento de informática",
		"h1b": "com a sua marca.",
		"lead": "Manutenção de computadores, notebooks e redes. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Suporte técnico e manutenção",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Formatação e reinstalação do sistema",
			"Troca de disco, memória e fonte",
			"Limpeza interna e troca de pasta térmica",
			"Remoção de vírus e ajustes de segurança",
			"Configuração de rede e Wi-Fi",
			"Backup e transferência de arquivos"
		],
		"tela": {
			"arquivo": "ordem-servico",
			"alt": "Tela real do OLLI: ordem de serviço, com o registro do atendimento"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Do diagnóstico ao reparo aprovado.",
		"cards": [
			{
				"h": "Peça e mão de obra separadas",
				"p": "Monte a proposta com serviços e produtos do seu catálogo. O cliente entende o que será feito e quanto custa cada item."
			},
			{
				"h": "Aprovação antes do reparo",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "O que foi feito fica na OS",
				"p": "No Pro, a ordem de serviço registra checklist, fotos e assinatura do cliente, preservando o combinado na entrega do equipamento."
			}
		],
		"final": "Seu próximo orçamento de informática sai com a sua marca."
	},
	"jardinagem": {
		"v10": "jardinagem",
		"h1a": "Orçamento de jardinagem",
		"h1b": "com a sua marca.",
		"lead": "Poda, plantio, gramado e manutenção de jardins. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Jardins residenciais e comerciais",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Corte de grama e acabamento dos canteiros",
			"Poda de arbustos e árvores de pequeno porte",
			"Plantio de mudas, flores e gramado",
			"Adubação e preparo do solo",
			"Controle de plantas daninhas",
			"Manutenção periódica de jardins"
		],
		"tela": {
			"arquivo": "clientes",
			"alt": "Tela real do OLLI: cadastro de clientes, com o histórico de atendimentos"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Do primeiro plantio à próxima visita.",
		"cards": [
			{
				"h": "Serviço e material no mesmo orçamento",
				"p": "Reúna mão de obra e materiais do seu catálogo em uma proposta com itens, quantidades e valores claros para o cliente."
			},
			{
				"h": "Aprovação pelo link",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "Clientes e visitas organizados",
				"p": "No Pro, o cadastro guarda o histórico de cada cliente, e a agenda organiza as próximas visitas de poda e manutenção do jardim."
			}
		],
		"final": "Seu próximo orçamento de jardinagem sai com a sua marca."
	},
	"limpeza": {
		"v10": "limpeza",
		"h1a": "Orçamento de limpeza",
		"h1b": "com a sua marca.",
		"lead": "Limpeza residencial, comercial, pós-obra e de estofados. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Limpeza residencial e comercial",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Limpeza residencial periódica",
			"Limpeza comercial e de escritórios",
			"Limpeza pós-obra",
			"Limpeza de estofados e carpetes",
			"Limpeza de vidros e fachadas",
			"Higienização de cozinhas e banheiros"
		],
		"tela": {
			"arquivo": "agenda",
			"alt": "Tela real do OLLI: agenda do dia, com os horários dos atendimentos"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Do escopo combinado ao serviço entregue.",
		"cards": [
			{
				"h": "Escopo e valor, item por item",
				"p": "Cadastre cada tipo de limpeza e os produtos usados no seu catálogo. O cliente confere os serviços, os valores e o total."
			},
			{
				"h": "Aprovação pelo link",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "Visitas na agenda",
				"p": "No Pro, marque cada limpeza e consulte os atendimentos do dia. Depois do serviço e do pagamento, gere o recibo na mesma conta."
			}
		],
		"final": "Seu próximo orçamento de limpeza sai com a sua marca."
	},
	"marido-de-aluguel": {
		"v10": "marido-de-aluguel",
		"h1a": "Orçamento de pequenos reparos",
		"h1b": "com a sua marca.",
		"lead": "Reúna os consertos e instalações da visita em uma proposta clara. Envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Reparos e instalações",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Instalação de prateleiras e suportes de TV",
			"Montagem e ajuste de móveis",
			"Reparo de portas, janelas e fechaduras",
			"Vedação de box, pias e janelas",
			"Troca de torneiras, chuveiros e acessórios",
			"Pequenos reparos em paredes e acabamentos"
		],
		"tela": {
			"arquivo": "agenda",
			"alt": "Tela real do OLLI: agenda do dia, com os horários dos atendimentos"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Da lista de reparos ao serviço registrado.",
		"cards": [
			{
				"h": "Um orçamento para toda a visita",
				"p": "Reúna serviços e produtos do seu catálogo, ajuste quantidades e valores e apresente os pequenos reparos em uma única proposta."
			},
			{
				"h": "Agenda entre os atendimentos",
				"p": "No Pro, marque as visitas na agenda e consulte os clientes e o histórico de atendimento na mesma conta."
			},
			{
				"h": "Registro do que foi concluído",
				"p": "No Pro, use checklist, fotos e assinatura do cliente na ordem de serviço. Depois do pagamento, gere o recibo com a sua marca."
			}
		],
		"final": "Seu próximo reparo começa com um orçamento claro."
	},
	"pedreiro-reforma": {
		"v10": "pedreiro-reforma",
		"h1a": "Orçamento de reforma",
		"h1b": "com a sua marca.",
		"lead": "Alvenaria, piso, reboco e pequenas obras. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Obras e reformas",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Paredes de alvenaria e demolição",
			"Reboco, contrapiso e regularização",
			"Assentamento de piso e revestimento",
			"Reforma de banheiro e cozinha",
			"Telhado, calhas e rufos",
			"Muros, calçadas e pequenos reparos"
		],
		"tela": {
			"arquivo": "ordem-servico",
			"alt": "Tela real do OLLI: ordem de serviço, com o registro do atendimento"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Da medição ao serviço entregue.",
		"cards": [
			{
				"h": "Cada etapa como um item",
				"p": "Monte o orçamento com os serviços e produtos do seu catálogo, com quantidades e valores. O cliente vê o que entra na reforma e o total."
			},
			{
				"h": "Aprovação pelo link",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "OS com fotos e assinatura",
				"p": "No Pro, registre o que foi feito com checklist e fotos na ordem de serviço e recolha a assinatura do cliente na entrega."
			}
		],
		"final": "Seu próximo orçamento de reforma sai com a sua marca."
	},
	"pintor": {
		"v10": "pintor",
		"h1a": "Orçamento de pintura",
		"h1b": "com a sua marca.",
		"lead": "Pintura interna, externa, textura e acabamento. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Pintura residencial e comercial",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Pintura interna de paredes e tetos",
			"Pintura externa e de fachadas",
			"Massa corrida e lixamento",
			"Textura e grafiato",
			"Pintura de portas, janelas e grades",
			"Impermeabilização e tratamento de umidade"
		],
		"tela": {
			"arquivo": "novo-orcamento-itens",
			"alt": "Tela real do OLLI: novo orçamento, com itens, quantidades e valores"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Da visita ao orçamento aprovado.",
		"cards": [
			{
				"h": "Serviço e material, item por item",
				"p": "Escolha serviços e produtos do seu catálogo e ajuste quantidades e valores. O cliente vê cada item e o total."
			},
			{
				"h": "Aprovação pelo link",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "Registro do serviço na OS",
				"p": "No Pro, a ordem de serviço guarda checklist, fotos e a assinatura do cliente quando a pintura é entregue."
			}
		],
		"final": "Seu próximo orçamento de pintura sai com a sua marca."
	},
	"climatizacao-e-refrigeracao": {
		"v10": "refrigeracao-ar-condicionado",
		"h1a": "Orçamento de ar-condicionado",
		"h1b": "com a sua marca.",
		"lead": "Instalação, limpeza, manutenção e conserto. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Refrigeração e climatização",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Instalação de split e multi-split",
			"Limpeza e higienização de evaporadora e condensadora",
			"Manutenção preventiva",
			"Carga de gás e correção de vazamento",
			"Troca de compressor, placa e capacitor",
			"Contrato de manutenção com PMOC"
		],
		"tela": {
			"arquivo": "link-cliente-refrigeracao",
			"alt": "Tela real do OLLI: link do orçamento de refrigeração aberto pelo cliente no celular"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Do defeito ao orçamento aprovado.",
		"cards": [
			{
				"h": "Código de erro sem internet",
				"p": "No app Android, consulte os códigos de erro mesmo sem sinal. A Oli, assistente de IA do app, apoia o diagnóstico dentro do limite do seu plano."
			},
			{
				"h": "Aprovação pelo link",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "PMOC por equipamento",
				"p": "No plano Empresa, cada equipamento tem o plano de manutenção, com a última e a próxima visita, e etiqueta com QR code."
			}
		],
		"final": "Seu próximo orçamento de ar-condicionado sai com a sua marca."
	},
	"serralheiro": {
		"v10": "serralheiro",
		"h1a": "Orçamento de serralheria",
		"h1b": "com a sua marca.",
		"lead": "Portões, grades, corrimões e reparos em metal. Monte o orçamento no celular, envie por PDF, link ou WhatsApp, e o cliente aprova pelo link.",
		"kicker": "Serralheria sob medida e reparos",
		"listaTitulo": "O que você orça no dia a dia.",
		"itens": [
			"Fabricação e instalação de portões",
			"Grades para janelas e sacadas",
			"Corrimões e guarda-corpos metálicos",
			"Conserto de soldas e estruturas metálicas",
			"Troca de roldanas, fechaduras e puxadores",
			"Pintura e proteção contra ferrugem"
		],
		"tela": {
			"arquivo": "novo-orcamento-itens",
			"alt": "Tela real do OLLI: novo orçamento, com itens, quantidades e valores"
		},
		"ajudaKicker": "Como o OLLI ajuda",
		"ajudaTitulo": "Da medida à instalação aprovada.",
		"cards": [
			{
				"h": "Medidas e materiais no orçamento",
				"p": "Detalhe fabricação, instalação e materiais em itens do seu catálogo. O cliente vê o que está incluído e o valor total."
			},
			{
				"h": "Aprovação antes de fabricar",
				"p": "O cliente abre o link do orçamento, confere os itens e aprova. @PIX@"
			},
			{
				"h": "Instalação registrada na OS",
				"p": "No Pro, use checklist, fotos e assinatura do cliente para documentar o trabalho executado e a entrega da estrutura."
			}
		],
		"final": "Seu próximo orçamento de serralheria sai com a sua marca."
	}
};

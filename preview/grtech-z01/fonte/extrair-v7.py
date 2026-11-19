# Lê as páginas do v7 (fonte de verdade) e grava o texto estruturado em conteudo-v7.json.
import json, re, sys, pathlib
from bs4 import BeautifulSoup
V7 = pathlib.Path.home()/"sites/grtech-v5/site"
SLUGS = ["servicos","instalacao","limpeza-e-manutencao","conserto","empresas","precos","como-funciona","sobre","duvidas","contato","segmentos","casa","apartamento-e-condominio","lojas-e-restaurantes","camara-fria-e-refrigeracao-comercial","vrf-vrv","quanto-custa","resumo-para-ia","atendimento","atendimento/itaim-bibi","atendimento/brooklin","atendimento/morumbi","atendimento/moema","atendimento/tatuape","atendimento/analia-franco"]
def tx(el):
    sr = el.select_one(".sr")
    t = (sr or el).get_text(" ", strip=True)
    return re.sub(r"\s+", " ", t).strip()
def links(el):
    out=[]
    for a in el.find_all("a", href=True):
        h=a["href"]
        if h.startswith("/") and not h.startswith("//"): out.append([tx(a), h])
    return out
res={}
for s in SLUGS:
    soup=BeautifulSoup((V7/s/"index.html").read_text(),"html.parser")
    main=soup.find("main")
    for bad in main.select("form,script,style,svg,nav.trilha,.est,noscript,template"): bad.decompose()
    pg={"titulo":soup.title.get_text(strip=True),"desc":(soup.find("meta",attrs={"name":"description"}) or {}).get("content",""),"h1":"","olho":"","lead":"","blocos":[]}
    h1=main.find("h1"); pg["h1"]=tx(h1) if h1 else ""
    cab=h1.find_parent("section") if h1 else None
    if cab:
        r=cab.select_one(".rot"); pg["olho"]=tx(r) if r else ""
        l=cab.select_one(".lead"); pg["lead"]=tx(l) if l else ""
    for sec in main.find_all("section", recursive=True):
        if sec is cab or sec.find_parent("section"): continue
        b={"h2":"","itens":[]}
        seen=set()
        for el in sec.find_all(["h2","h3","p","li","details","dt","a"]):
            if any(id(p) in seen for p in el.parents): continue
            if el.name=="a":
                c=el.get("class") or []
                if el.find(["h3","p"]) and el["href"].startswith("/"):
                    h3=el.find(["h3"]); ps=[tx(p) for p in el.find_all("p")]
                    b["itens"].append({"t":"card","h":tx(h3) if h3 else (ps[0] if ps else tx(el)),"p":" ".join(ps if h3 else ps[1:]),"href":el["href"]}); seen.add(id(el))
                continue
            if el.name=="details":
                sm=el.find("summary"); q=tx(sm) if sm else ""
                if sm: sm.extract()
                b["itens"].append({"t":"faq","q":q,"a":tx(el)}); seen.add(id(el)); continue
            if el.name=="dt":
                sm=el.find("small"); nota=tx(sm) if sm else ""
                if sm: sm.extract()
                dd=el.find_next_sibling("dd")
                b["itens"].append({"t":"preco","n":tx(el),"nota":nota,"v":tx(dd) if dd else ""}); continue
            if el.name=="h2" and not b["h2"]: b["h2"]=tx(el); continue
            t=tx(el)
            if not t or len(t)<2: continue
            if el.name=="li" and el.find("li"): continue
            if el.name=="li" and el.find_parent("article") is None:
                b["itens"].append({"t":"li","x":t}); seen.add(id(el)); continue
            if el.name in("h2","h3"): b["itens"].append({"t":"h3","x":t}); continue
            if el.name=="p" and el.find_parent("li"): continue
            b["itens"].append({"t":"p","x":t,"l":links(el)})
        if b["h2"] or b["itens"]: res[s]=res.get(s,pg); pg["blocos"].append(b)
    res[s]=pg
json.dump(res,open(pathlib.Path(__file__).parent/"conteudo-v7.json","w"),ensure_ascii=False,indent=1)
print(len(res))

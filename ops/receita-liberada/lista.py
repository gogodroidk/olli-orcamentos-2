#!/usr/bin/env python3
"""Lista contatos ATIVOS por CNAE e município (dados abertos da Receita, Parquet local).

Piso (D-2076, 14/11): situação ATIVA, cruzar supressão (fail-closed), saída chmod 600,
coluna fonte + data. MEI/EI, e-mail de domínio próprio, telefone só sem e-mail e
"celular só mensagem do Igor" são filtros OPCIONAIS (flags). O padrão chama empresa
e pessoa física (MEI/EI) que estejam na base preparada. Sócio/CPF avulso não entra:
o preparar.py não guarda isso.

Ex.: .venv/bin/python lista.py --cnae 4321500 --municipio CAMPINAS --uf SP --saida lista.csv
     .venv/bin/python lista.py --capitais --nichos refrigeracao,eletrica,predial --so-telefone --limite 0 --saida listas/2026-11-14-liberada
"""

import argparse
import csv
import datetime
import hashlib
import os
import re
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supressao_lib import variantes as hashes_supressao  # noqa: E402 — módulo vizinho, fora do pacote

RAIZ = os.path.dirname(os.path.abspath(__file__))
LOG_OUTUBRO = "/home/igor/Desktop/Entregas Claude/OLLI/2026-10-24-envios/LOG.csv"
CENTRAL_HASHES = "/home/igor/chatwoot-central/data/central-telefones.sha256"
PROSPECTS_SITE = (
    "/home/igor/Desktop/Entregas Claude/OLLI/2026-11-07-prospeccao-servicos/PROSPECTS.csv"
)
PROSPECTS_AUTO = "/home/igor/Desktop/Entregas Claude/OLLI/2026-11-14-leads-auto/PROSPECTS-AUTO.csv"
CATALOGO_AGENCIA = "/home/igor/Desktop/Entregas Claude/OLLI/2026-11-14-agencia-ia/CATALOGO.md"

LIVRES = {
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "yahoo.com",
    "yahoo.com.br",
    "uol.com.br",
    "bol.com.br",
    "terra.com.br",
    "ig.com.br",
    "live.com",
    "icloud.com",
    "msn.com",
    "globo.com",
    "r7.com",
}
CONTADOR = re.compile(r"contab|contador|assessoria|escritorio|fiscal|consultoria")
PORTE = {"01": "ME", "03": "EPP", "05": "Demais"}
COLUNAS = [
    "cnpj",
    "razao_social",
    "nome_fantasia",
    "cnae",
    "cnae_descricao",
    "municipio",
    "uf",
    "porte",
    "data_abertura",
    "canal",
    "tipo_canal",
    "fonte",
    "data_fonte",
    "nicho",
]
NICHOS = {
    "refrigeracao": ["4322302", "3314707"],
    "eletrica": ["4321500"],
    "predial": ["8111700", "8121400", "4330404"],
}
CAPITAIS = [
    ("RIO BRANCO", "AC"),
    ("MACEIO", "AL"),
    ("MACAPA", "AP"),
    ("MANAUS", "AM"),
    ("SALVADOR", "BA"),
    ("FORTALEZA", "CE"),
    ("BRASILIA", "DF"),
    ("VITORIA", "ES"),
    ("GOIANIA", "GO"),
    ("SAO LUIS", "MA"),
    ("BELO HORIZONTE", "MG"),
    ("CAMPO GRANDE", "MS"),
    ("CUIABA", "MT"),
    ("BELEM", "PA"),
    ("JOAO PESSOA", "PB"),
    ("CURITIBA", "PR"),
    ("RECIFE", "PE"),
    ("TERESINA", "PI"),
    ("RIO DE JANEIRO", "RJ"),
    ("NATAL", "RN"),
    ("PORTO ALEGRE", "RS"),
    ("PORTO VELHO", "RO"),
    ("BOA VISTA", "RR"),
    ("FLORIANOPOLIS", "SC"),
    ("SAO PAULO", "SP"),
    ("ARACAJU", "SE"),
    ("PALMAS", "TO"),
]


def norm(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper().strip()


def sha256(texto):
    return hashlib.sha256(texto.encode()).hexdigest()


def variantes_digitos(valor):
    d = re.sub(r"\D", "", valor or "").lstrip("0")
    if len(d) in (10, 11):
        d = "55" + d
    sai = set()

    def por(n):
        if re.fullmatch(r"55\d{10,11}", n):
            sai.add(n)
            sai.add(n[2:])

    por(d)
    if re.fullmatch(r"55\d{2}9\d{8}", d):
        por(d[:4] + d[5:])
    if re.fullmatch(r"55\d{10}", d):
        por(d[:4] + "9" + d[4:])
    return sai


def hashes_telefone(valor):
    sai = set()
    for v in variantes_digitos(valor):
        sai.add(sha256(v))
        if v.startswith("55"):
            sai.add(sha256("+" + v))
    return sai


def hashes_doze(valor):
    sai = set()
    for v in variantes_digitos(valor):
        sai.add(sha256(v)[:12])
        if v.startswith("55"):
            sai.add(sha256("+" + v)[:12])
    return sai


def normalizar_tel(tel):
    t = re.sub(r"\D", "", tel or "")
    if t.startswith("55") and len(t) in (12, 13):
        t = t[2:]
    if t in {"", "0" * len(t)} or len(t) not in (10, 11):
        return ""
    return t


def tipo_telefone(tel, celular_so_igor=False):
    if len(tel) == 11 and tel[2] == "9":
        return "celular (so mensagem unica do Igor)" if celular_so_igor else "celular"
    if len(tel) == 10 and tel[2] in "6789":
        return "celular provavel, 8 digitos (faltou o 9; confirmar antes)"
    if len(tel) in (10, 11):
        return "fixo"
    return ""


def email_formato(email):
    return bool(email and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email))


def email_dominio_proprio(email, repetidos):
    if not email_formato(email):
        return False
    dom = email.split("@", 1)[1]
    if dom in LIVRES or CONTADOR.search(email) or repetidos.get(email, 0) > 3:
        return False
    return True


def eh_mei_ou_ei(opcao_mei, natureza, razao):
    if (opcao_mei or "N") == "S":
        return True
    if (natureza or "") == "2135":
        return True
    return bool(re.search(r"[0-9]{11}$", (razao or "").strip()))


def escolher_canal(email, tel, flags, repetidos):
    tel_n = normalizar_tel(tel)
    tipo = tipo_telefone(tel_n, flags.celular_so_msg_igor) if tel_n else ""
    aceito = (
        email_dominio_proprio(email, repetidos)
        if flags.email_dominio_proprio
        else email_formato(email)
    )
    if flags.telefone_so_sem_email:
        if aceito:
            return email, "email"
        if tipo:
            return tel_n, tipo
        return "", "sem canal valido (buscar site/Instagram)"
    if tipo:
        return tel_n, tipo
    if aceito:
        return email, "email"
    return "", "sem canal valido (buscar site/Instagram)"


def sync_recente_em(path, horas=24):
    try:
        return (time.time() - os.path.getmtime(path)) < horas * 3600
    except OSError:
        return False


def carregar_hashes_arquivo(path):
    if not os.path.exists(path):
        return None
    sai = set()
    with open(path, newline="", encoding="utf-8") as f:
        amostra = f.read(4096)
        f.seek(0)
        if "sha256" in amostra.splitlines()[0].lower():
            for row in csv.DictReader(f):
                h = (row.get("sha256") or "").strip().lower()
                if re.fullmatch(r"[0-9a-f]{64}", h):
                    sai.add(h)
        else:
            for linha in f:
                h = linha.strip().lower()
                if re.fullmatch(r"[0-9a-f]{64}", h):
                    sai.add(h)
    return sai


def ler_hashes_log(path):
    if not path:
        return set()
    if not os.path.exists(path):
        return None
    sai = set()
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        cabeca = next(reader, [])
        try:
            col = [c.strip() for c in cabeca].index("id_hash_contato")
        except ValueError:
            return set()
        for row in reader:
            if col < len(row):
                h = row[col].strip().lower()
                if re.fullmatch(r"[0-9a-f]{12}", h):
                    sai.add(h)
    return sai


def partir_csv(linha):
    sai, atual, aspas = [], "", False
    for ch in linha:
        if ch == '"':
            aspas = not aspas
            continue
        if ch == "," and not aspas:
            sai.append(atual)
            atual = ""
            continue
        atual += ch
    sai.append(atual)
    return sai


def hashes_de_csv_telefones(path):
    if not path or not os.path.exists(path):
        return set()
    sai = set()
    with open(path, encoding="utf-8") as f:
        linhas = [ln for ln in f.read().splitlines() if ln.strip() and not ln.startswith("#")]
    if not linhas:
        return sai
    cabeca = [c.strip() for c in linhas[0].split(",")]
    i = next((n for n, c in enumerate(cabeca) if c.lower().startswith("telefone")), -1)
    if i < 0:
        return sai
    for linha in linhas[1:]:
        col = partir_csv(linha)
        if i < len(col):
            sai |= hashes_telefone(col[i])
    return sai


def cnaes_do_catalogo(path):
    """Só entra nicho extra se o catálogo declarar CNAE de 7 dígitos. Hoje não declara."""
    if not path or not os.path.exists(path):
        return {}
    texto = open(path, encoding="utf-8").read()
    codigos = []
    for m in re.finditer(r"CNAE[:\s]+(\d{7})", texto, flags=re.I):
        if m.group(1) not in codigos:
            codigos.append(m.group(1))
    if not codigos:
        return {}
    return {"catalogo": codigos}


def data_abertura(ab):
    if len(ab or "") == 8 and ab.isdigit():
        return f"{ab[:4]}-{ab[4:6]}-{ab[6:]}"
    return ab or ""


def escrever_csv(caminho, linhas):
    pasta = os.path.dirname(caminho)
    if pasta:
        os.makedirs(pasta, exist_ok=True)
    fd = os.open(caminho, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(COLUNAS)
        w.writerows(linhas)
    os.chmod(caminho, 0o600)


def carregar_supressao_cnpj(path):
    with open(path, newline="", encoding="utf-8") as f:
        return {re.sub(r"\D", "", ln.split(",")[0].split(";")[0]) for ln in f if ln.strip()}


def parser():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cnae", help="códigos de 7 dígitos ou prefixos, separados por vírgula")
    ap.add_argument("--nicho")
    ap.add_argument("--nichos", help="refrigeracao,eletrica,predial e o que o catálogo declarar")
    ap.add_argument("--municipio")
    ap.add_argument("--uf")
    ap.add_argument("--capitais", action="store_true")
    ap.add_argument(
        "--limite",
        type=int,
        default=300,
        help="0 = sem teto de arquivo. O envio continua no teto do motor.",
    )
    ap.add_argument("--saida", required=True)
    ap.add_argument("--base", help="pasta da base (parquet, supressão). Padrão: esta pasta.")
    ap.add_argument("--supressao")
    ap.add_argument("--sync")
    ap.add_argument("--hashes")
    ap.add_argument("--log", help="LOG.csv de outubro (id_hash_contato)")
    ap.add_argument("--central", help="arquivo de sha256 dos telefones já na Central")
    ap.add_argument(
        "--excluir-csv",
        action="append",
        default=[],
        help="CSV de prospects já na fila (coluna telefone)",
    )
    ap.add_argument("--catalogo", default=CATALOGO_AGENCIA)
    ap.add_argument("--so-telefone", action="store_true")
    ap.add_argument(
        "--sem-mei", action="store_true", help="opcional: tira MEI e empresário individual"
    )
    ap.add_argument(
        "--email-dominio-proprio",
        action="store_true",
        help="opcional: e-mail só de domínio próprio",
    )
    ap.add_argument(
        "--telefone-so-sem-email",
        action="store_true",
        help="opcional: telefone só quando não há e-mail aceito",
    )
    ap.add_argument(
        "--celular-so-msg-igor",
        action="store_true",
        help="opcional: marca o celular como mensagem única do Igor",
    )
    ap.add_argument("--checar-capitais", action="store_true")
    return ap


def exigir_sync(base, args):
    sync = args.sync or os.path.join(base, "supressao.sync")
    hashes = args.hashes or os.path.join(base, "supressao-telefones.csv")
    supressao = args.supressao or os.path.join(base, "supressao.csv")
    if not sync_recente_em(sync):
        sys.exit(
            "ABORTADO (fail-closed): supressao do banco nao sincronizada nas ultimas 24 h. Rode: .venv/bin/python sincronizar_supressao.py"
        )
    if not os.path.exists(supressao):
        sys.exit(f"ABORTADO (fail-closed): supressao ausente: {supressao}")
    if not os.path.exists(hashes):
        sys.exit(f"ABORTADO (fail-closed): supressao de telefone ausente: {hashes}")
    try:
        cnpjs = carregar_supressao_cnpj(supressao)
        tels = carregar_hashes_arquivo(hashes)
    except OSError as e:
        sys.exit(f"ABORTADO (fail-closed): {e}")
    if tels is None:
        sys.exit("ABORTADO (fail-closed): nao li a supressao de telefone")
    mes_path = os.path.join(base, "parquet", "MES.txt")
    try:
        mes = open(mes_path, encoding="utf-8").read().strip()
    except OSError as e:
        sys.exit(f"ABORTADO (fail-closed): {e}")
    if not mes:
        sys.exit("ABORTADO (fail-closed): parquet/MES.txt vazio")
    return supressao, cnpjs, tels, mes


def montar_nichos(args):
    extra = cnaes_do_catalogo(args.catalogo)
    if args.nichos:
        nomes = [n.strip() for n in args.nichos.split(",") if n.strip()]
        sai = {}
        for nome in nomes:
            if nome in NICHOS:
                sai[nome] = NICHOS[nome]
            elif nome in extra:
                sai[nome] = extra[nome]
            else:
                sys.exit(f"nicho desconhecido: {nome}")
        for nome, codigos in extra.items():
            if nome not in sai:
                sai[nome] = codigos
        return sai
    if args.nicho:
        if args.nicho not in NICHOS and args.nicho not in extra:
            sys.exit(f"nicho desconhecido: {args.nicho}")
        codigos = (
            [re.sub(r"\D", "", c) for c in (args.cnae or "").split(",") if c.strip()]
            or NICHOS.get(args.nicho)
            or extra[args.nicho]
        )
        return {args.nicho: codigos}
    if not args.cnae:
        sys.exit("informe --cnae ou --nichos")
    codigos = [re.sub(r"\D", "", c) for c in args.cnae.split(",") if c.strip()]
    if not codigos or any(not c for c in codigos):
        sys.exit("cnae invalido")
    return {args.nicho or "": codigos}


def sql_where_mei(args):
    if not args.sem_mei:
        return ""
    return """
      AND coalesce(s.opcao_mei,'N') <> 'S' AND emp.natureza <> '2135'
      AND NOT regexp_matches(trim(emp.razao_social), '[0-9]{11}$')
    """


def consultar(con, parquet, args, codigos, lugares):
    like = " OR ".join(f"e.cnae_principal LIKE '{c}%'" for c in codigos)
    if not like:
        sys.exit("cnae invalido")
    where_lugar = " OR ".join(
        "(upper(strip_accents(m.municipio)) = ? AND e.uf = ?)" for _ in lugares
    )
    params = []
    for nome, uf in lugares:
        params.extend([nome, uf])
    q = f"""
    SELECT e.cnpj_basico||e.cnpj_ordem||e.cnpj_dv AS cnpj, emp.razao_social, e.nome_fantasia, e.cnae_principal, c.cnae_desc,
      m.municipio, e.uf, emp.porte, e.data_abertura,
      nullif(lower(trim(e.email)),'') AS email, nullif(trim(e.ddd1)||trim(e.tel1),'') AS tel,
      coalesce(s.opcao_mei,'N') AS opcao_mei, emp.natureza
    FROM '{parquet}/Estabelecimentos*.parquet' e
    JOIN '{parquet}/Empresas*.parquet' emp USING (cnpj_basico)
    JOIN '{parquet}/Municipios.parquet' m ON m.codigo = e.municipio_cod
    LEFT JOIN '{parquet}/Cnaes.parquet' c ON c.codigo = e.cnae_principal
    LEFT JOIN '{parquet}/Simples.parquet' s ON s.cnpj_basico = e.cnpj_basico
    WHERE e.situacao = '02' AND ({like}) AND ({where_lugar})
      AND emp.porte IN ('01','03','05')
      {sql_where_mei(args)}
    ORDER BY m.municipio, emp.razao_social
    """
    return con.execute(q, params).fetchall()


def repeticao_de_emails(con, parquet, emails):
    if not emails:
        return {}
    con.execute("CREATE TEMP TABLE em(e VARCHAR)")
    con.executemany("INSERT INTO em VALUES (?)", [(x,) for x in emails])
    try:
        return dict(
            con.execute(
                f"SELECT lower(trim(x.email)), count(*) FROM '{parquet}/Estabelecimentos*.parquet' x "
                "SEMI JOIN em ON em.e = lower(trim(x.email)) GROUP BY 1"
            ).fetchall()
        )
    finally:
        con.execute("DROP TABLE em")


def checar_capitais(con, parquet):
    nomes = sorted({n for n, _uf in CAPITAIS})
    marks = ",".join("?" for _ in nomes)
    rows = con.execute(
        f"SELECT upper(strip_accents(municipio)) FROM '{parquet}/Municipios.parquet' "
        f"WHERE upper(strip_accents(municipio)) IN ({marks})",
        nomes,
    ).fetchall()
    achou = {r[0] for r in rows}
    falta = [n for n in nomes if n not in achou]
    print(f"capitais_no_cadastro={len(nomes) - len(falta)}/{len(nomes)}")
    if falta:
        print("municipio_nao_achado " + ",".join(falta))
        return False
    return True


def processar(cand, args, ctx):
    """ctx: cnpjs, tels, log, central, excluir, repetidos, mes, hoje, nicho, supressao_path, supressao_ja."""
    pulados = {
        "cnpj": 0,
        "telefone": 0,
        "log": 0,
        "central": 0,
        "fila": 0,
        "mei": 0,
        "sem_tel": 0,
        "repetido": 0,
    }
    out = []
    vistos = ctx["vistos"]
    for cnpj, razao, fant, cnae, desc, mun, uf_, porte, ab, em_, tel, mei, natureza in cand:
        if args.sem_mei and eh_mei_ou_ei(mei, natureza, razao):
            pulados["mei"] += 1
            continue
        if cnpj in ctx["cnpjs"]:
            pulados["cnpj"] += 1
            continue
        tel_n = normalizar_tel(tel)
        if tel_n and (
            hashes_supressao(tel_n) & ctx["tels"] or hashes_telefone(tel_n) & ctx["tels"]
        ):
            pulados["telefone"] += 1
            ctx["cnpjs"].add(cnpj)
            if cnpj not in ctx["supressao_ja"]:
                with open(ctx["supressao_path"], "a", encoding="utf-8") as sf:
                    sf.write(cnpj + "\n")
                ctx["supressao_ja"].add(cnpj)
            continue
        if tel_n and hashes_doze(tel_n) & ctx["log"]:
            pulados["log"] += 1
            continue
        if tel_n and hashes_telefone(tel_n) & ctx["central"]:
            pulados["central"] += 1
            continue
        if tel_n and hashes_telefone(tel_n) & ctx["excluir"]:
            pulados["fila"] += 1
            continue
        canal, tipo = escolher_canal(em_, tel, args, ctx["repetidos"])
        if args.so_telefone and not tipo.startswith("celular") and tipo != "fixo":
            pulados["sem_tel"] += 1
            continue
        chave = tel_n or (cnpj + "|" + canal)
        if chave in vistos:
            pulados["repetido"] += 1
            continue
        vistos.add(chave)
        porte_txt = PORTE.get(porte, porte or "")
        out.append(
            [
                cnpj,
                razao,
                fant or "",
                cnae,
                desc or "",
                mun,
                uf_,
                porte_txt,
                data_abertura(ab),
                canal,
                tipo,
                f"dados abertos Receita, arquivo de {ctx['mes']}",
                ctx["hoje"],
                ctx["nicho"],
            ]
        )
        if args.limite and len(out) >= args.limite:
            break
    return out, pulados


def somar(a, b):
    for k, v in b.items():
        a[k] = a.get(k, 0) + v
    return a


def main(argv=None):
    args = parser().parse_args(argv)
    if args.limite < 0:
        sys.exit("limite invalido")
    base = os.path.abspath(args.base or RAIZ)
    parquet = os.path.join(base, "parquet")
    supressao_path, cnpjs, tels, mes = exigir_sync(base, args)
    log = set()
    central = set()
    excluir = set()
    if args.capitais or args.log or args.central:
        log_path = args.log or (LOG_OUTUBRO if args.capitais else "")
        central_path = args.central or (CENTRAL_HASHES if args.capitais else "")
        if args.capitais:
            if not log_path or not os.path.exists(log_path):
                sys.exit("ABORTADO (fail-closed): LOG de outubro ausente")
            if not central_path or not os.path.exists(central_path):
                sys.exit("ABORTADO (fail-closed): hashes da Central ausentes")
        if log_path:
            log = ler_hashes_log(log_path)
            if log is None:
                sys.exit("ABORTADO (fail-closed): nao li o LOG")
        if central_path:
            central = carregar_hashes_arquivo(central_path)
            if central is None:
                sys.exit("ABORTADO (fail-closed): nao li os hashes da Central")
        extras = list(args.excluir_csv)
        if args.capitais and not extras:
            extras = [PROSPECTS_SITE, PROSPECTS_AUTO]
        for path in extras:
            excluir |= hashes_de_csv_telefones(path)
    try:
        import duckdb
    except ImportError:
        sys.exit("ABORTADO: duckdb ausente no python")
    os.makedirs(os.path.join(base, "tmp"), exist_ok=True)
    con = duckdb.connect()
    con.execute(f"SET memory_limit='2GB'; SET threads=2; SET temp_directory='{base}/tmp'")
    if args.checar_capitais or args.capitais:
        if not checar_capitais(con, parquet):
            sys.exit(2)
        if args.checar_capitais and not args.capitais and not args.municipio:
            return 0
    nichos = montar_nichos(args)
    if args.capitais:
        lugares = CAPITAIS
    else:
        if not args.municipio:
            sys.exit("informe --municipio ou --capitais")
        lugares = [(norm(args.municipio), (args.uf or "").upper())]
        if not lugares[0][1]:
            sys.exit("informe --uf junto com --municipio")
    hoje = datetime.date.today().isoformat()
    vistos = set()
    contagem = []
    arquivos = []
    if args.capitais:
        os.makedirs(args.saida, exist_ok=True)
        os.chmod(args.saida, 0o700)
    for nome_nicho, codigos in nichos.items():
        if any(not re.fullmatch(r"\d{2,7}", c) for c in codigos):
            sys.exit("cnae invalido")
        print(f"consultando {nome_nicho or 'cnae'} {','.join(codigos)}", flush=True)
        cand = consultar(con, parquet, args, codigos, lugares)
        repetidos = {}
        if args.email_dominio_proprio:
            emails = {r[9] for r in cand if r[9]}
            repetidos = repeticao_de_emails(con, parquet, emails)
        ctx = {
            "cnpjs": cnpjs,
            "tels": tels,
            "log": log,
            "central": central,
            "excluir": excluir,
            "repetidos": repetidos,
            "mes": mes,
            "hoje": hoje,
            "nicho": nome_nicho,
            "supressao_path": supressao_path,
            "supressao_ja": set(cnpjs),
            "vistos": vistos,
        }
        if args.capitais:
            por_lugar = {}
            for row in cand:
                por_lugar.setdefault((norm(row[5]), row[6]), []).append(row)
            for nome_mun, uf in CAPITAIS:
                grupo = por_lugar.get((nome_mun, uf), [])
                limite_antes = args.limite
                out, pulados = processar(grupo, args, ctx)
                args.limite = limite_antes
                caminho = os.path.join(args.saida, f"{nome_nicho}-{uf.lower()}.csv")
                escrever_csv(caminho, out)
                arquivos.append(caminho)
                contagem.append(
                    {
                        "nicho": nome_nicho,
                        "uf": uf,
                        "municipio": nome_mun,
                        "candidatos": len(grupo),
                        "na_lista": len(out),
                        **{f"fora_{k}": v for k, v in pulados.items()},
                    }
                )
                print(
                    f"{nome_nicho} {uf} candidatos={len(grupo)} na_lista={len(out)} "
                    f"sup_cnpj={pulados['cnpj']} sup_tel={pulados['telefone']} log={pulados['log']} "
                    f"central={pulados['central']} fila={pulados['fila']} sem_tel={pulados['sem_tel']}",
                    flush=True,
                )
        else:
            out, pulados = processar(cand, args, ctx)
            escrever_csv(args.saida, out)
            arquivos.append(args.saida)
            print(
                f"{len(out)} contatos -> {args.saida} | candidatas={len(cand)} "
                f"sup_cnpj={pulados['cnpj']} sup_tel={pulados['telefone']} log={pulados['log']} "
                f"central={pulados['central']}",
                flush=True,
            )
    if args.capitais and contagem:
        caminho = os.path.join(args.saida, "contagem.csv")
        fd = os.open(caminho, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            campos = list(contagem[0].keys())
            w = csv.DictWriter(f, fieldnames=campos)
            w.writeheader()
            w.writerows(contagem)
        os.chmod(caminho, 0o600)
        print(f"contagem -> {caminho} linhas={len(contagem)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)

#!/usr/bin/env python3
"""Teste da lista com parquet minúsculo. Telefones são fictícios."""

import csv
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

import duckdb

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import lista  # noqa: E402 — o módulo está ao lado deste teste


def gravar(con, pasta, nome, sql):
    con.execute(f"COPY ({sql}) TO '{pasta / nome}' (FORMAT parquet)")


def montar(pasta):
    parquet = pasta / "parquet"
    parquet.mkdir()
    (pasta / "tmp").mkdir()
    con = duckdb.connect()
    est = """
      SELECT * FROM (VALUES
        ('00000001','0001','00','Maria','02','20200101','4322302','SP','3550308','11','988887777','dona@gmail.com'),
        ('00000002','0001','00','Fria','02','20200101','4322302','SP','3550308','11','33334444','contato@fria.com.br'),
        ('00000003','0001','00','Baixada','08','20200101','4322302','SP','3550308','11','977776666','a@fria.com.br'),
        ('00000004','0001','00','Suprimida','02','20200101','4322302','SP','3550308','11','966665555','b@fria.com.br'),
        ('00000005','0001','00','No Log','02','20200101','4322302','SP','3550308','11','955554444','c@fria.com.br'),
        ('00000006','0001','00','Joao','02','20200101','4322302','SP','3550308','11','944443333','d@fria.com.br'),
        ('00000007','0001','00','Central','02','20200101','4322302','SP','3550308','11','933332222','e@fria.com.br'),
        ('00000008','0001','00','So Email','02','20200101','4322302','SP','3550308','','','so@gmail.com')
      ) t(cnpj_basico,cnpj_ordem,cnpj_dv,nome_fantasia,situacao,data_abertura,cnae_principal,uf,municipio_cod,ddd1,tel1,email)
    """
    emp = """
      SELECT * FROM (VALUES
        ('00000001','MARIA SILVA 12345678901','2135','01'),
        ('00000002','FRIA LTDA','2062','03'),
        ('00000003','BAIXADA LTDA','2062','01'),
        ('00000004','SUPRIMIDA LTDA','2062','01'),
        ('00000005','NO LOG LTDA','2062','01'),
        ('00000006','JOAO SOUZA','2135','01'),
        ('00000007','CENTRAL LTDA','2062','05'),
        ('00000008','SO EMAIL LTDA','2062','01')
      ) t(cnpj_basico,razao_social,natureza,porte)
    """
    simp = """
      SELECT * FROM (VALUES
        ('00000001','S'),('00000002','N'),('00000003','N'),('00000004','N'),
        ('00000005','N'),('00000006','N'),('00000007','N'),('00000008','N')
      ) t(cnpj_basico,opcao_mei)
    """
    mun = "SELECT * FROM (VALUES ('3550308','SAO PAULO')) t(codigo,municipio)"
    cnae = "SELECT * FROM (VALUES ('4322302','Instalacao de ar condicionado')) t(codigo,cnae_desc)"
    gravar(con, parquet, "Estabelecimentos0.parquet", est)
    gravar(con, parquet, "Empresas0.parquet", emp)
    gravar(con, parquet, "Simples.parquet", simp)
    gravar(con, parquet, "Municipios.parquet", mun)
    gravar(con, parquet, "Cnaes.parquet", cnae)
    (parquet / "MES.txt").write_text("2026-10\n", encoding="utf-8")
    (pasta / "supressao.csv").write_text("00000004000100\n", encoding="utf-8")
    (pasta / "supressao-telefones.csv").write_text("sha256,data,motivo\n", encoding="utf-8")
    (pasta / "supressao.sync").write_text("ok\n", encoding="utf-8")
    log = pasta / "LOG.csv"
    h = next(iter(lista.hashes_doze("11955554444")))
    log.write_text(
        f"data,hora,id_hash_contato,texto,resultado\n2026-10-23,11:00,{h},oi,enviado\n",
        encoding="utf-8",
    )
    central = pasta / "central.sha256"
    hc = next(iter(lista.hashes_telefone("11933332222")))
    central.write_text(hc + "\n", encoding="utf-8")
    return log, central


def rodar(pasta, extra):
    saida = pasta / "saida.csv"
    cmd = [
        sys.executable,
        str(AQUI / "lista.py"),
        "--base",
        str(pasta),
        "--cnae",
        "4322302",
        "--nicho",
        "refrigeracao",
        "--municipio",
        "SAO PAULO",
        "--uf",
        "SP",
        "--so-telefone",
        "--limite",
        "50",
        "--saida",
        str(saida),
        *extra,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r, saida


def ler(saida):
    with open(saida, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter=";"))


def nomes(rows):
    return sorted(r["nome_fantasia"] for r in rows)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        pasta = Path(tmp)
        log, central = montar(pasta)
        r, saida = rodar(pasta, ["--log", str(log), "--central", str(central)])
        assert r.returncode == 0, r.stderr + r.stdout
        rows = ler(saida)
        assert nomes(rows) == ["Fria", "Joao", "Maria"], nomes(rows)
        modo = stat.S_IMODE(saida.stat().st_mode)
        assert modo == 0o600, oct(modo)
        maria = next(r for r in rows if r["nome_fantasia"] == "Maria")
        assert maria["tipo_canal"] == "celular"
        assert maria["canal"] == "11988887777"
        assert "dados abertos Receita, arquivo de 2026-10" == maria["fonte"]
        assert maria["data_fonte"]
        assert maria["nicho"] == "refrigeracao"
        fria = next(r for r in rows if r["nome_fantasia"] == "Fria")
        assert fria["tipo_canal"] == "fixo"
        assert fria["canal"] == "1133334444"
        assert "So Email" not in nomes(rows)
        assert "Suprimida" not in nomes(rows)
        assert "Baixada" not in nomes(rows)
        assert "No Log" not in nomes(rows)
        assert "Central" not in nomes(rows)

        r2, saida2 = rodar(pasta, ["--sem-mei", "--log", str(log), "--central", str(central)])
        assert r2.returncode == 0, r2.stderr
        assert nomes(ler(saida2)) == ["Fria"], nomes(ler(saida2))

        r3, saida3 = rodar(pasta, ["--celular-so-msg-igor"])
        assert r3.returncode == 0, r3.stderr
        maria3 = next(r for r in ler(saida3) if r["nome_fantasia"] == "Maria")
        assert "mensagem unica do Igor" in maria3["tipo_canal"]

        r4, _ = rodar(pasta, [])
        # sync ausente
        (pasta / "supressao.sync").unlink()
        r5, _ = rodar(pasta, [])
        assert r5.returncode != 0
        assert "fail-closed" in (r5.stdout + r5.stderr)
        assert r4.returncode == 0
    print("lista_test ok")


if __name__ == "__main__":
    main()

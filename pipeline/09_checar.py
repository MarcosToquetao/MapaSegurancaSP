"""
Checagem dos artefatos publicados (roda no fim do pipeline e no CI).

Falha (exit 1) em incoerência interna do agg.json:
  - meses contínuos, sem buraco;
  - soma das naturezas == total da categoria, mês a mês;
  - recortes de residência <= a natureza-mãe, mês a mês;
  - nenhuma categoria zerada no último mês publicado.

Só AVISA na comparação com a tabela oficial mensal da SSP (capital, último ano
completo) — a API da SSP cai com frequência e diferenças pequenas são esperadas
(microdado conta por natureza/local do fato; a tabela é a estatística oficial).

Uso:
    python pipeline/09_checar.py
"""
import json
import re
import sys
import unicodedata
from pathlib import Path
from urllib.request import Request, urlopen

WEB = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
API = ("https://www.ssp.sp.gov.br/v1/OcorrenciasMensais/RecuperaDadosMensaisAgrupados"
       "?ano={ano}&grupoDelito=6&tipoGrupo=MUNIC%C3%8DPIO&idGrupo=565")  # 565 = São Paulo
RECORTES = {"ROUBO EM RESIDÊNCIA": "ROUBO - OUTROS", "FURTO EM RESIDÊNCIA": "FURTO - OUTROS"}
COMPARAR = ["HOMICÍDIO DOLOSO", "LATROCÍNIO", "LESÃO CORPORAL SEGUIDA DE MORTE",
            "LESÃO CORPORAL DOLOSA", "ESTUPRO", "ESTUPRO DE VULNERÁVEL", "ROUBO - OUTROS",
            "ROUBO DE VEÍCULO", "ROUBO DE CARGA", "FURTO - OUTROS", "FURTO DE VEÍCULO"]


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


def checar_interno(agg: dict) -> list[str]:
    erros = []
    meses = agg["meses"]
    for a, b in zip(meses, meses[1:]):
        ya, ma = map(int, a.split("-"))
        if (ya * 12 + ma) + 1 != int(b[:4]) * 12 + int(b[5:]):
            erros.append(f"buraco na série entre {a} e {b}")
    cid = agg["cidade"]
    for cat, nats in agg["naturezas"].items():
        total = cid["por_categoria"].get(cat)
        if total is None:
            erros.append(f"categoria {cat} sem série"); continue
        soma = [sum(cid["por_natureza"][n][i] for n in nats) for i in range(len(meses))]
        if soma != total:
            erros.append(f"{cat}: soma das naturezas != total da categoria")
        if total[-1] == 0:
            erros.append(f"{cat}: zerada no último mês ({meses[-1]})")
    for rec, mae in RECORTES.items():
        r, m = cid["por_natureza"].get(rec), cid["por_natureza"][mae]
        if r is None:
            erros.append(f"recorte {rec} ausente")
        elif any(x > y for x, y in zip(r, m)):
            erros.append(f"recorte {rec} maior que {mae} em algum mês")
        elif sum(r) > 0.5 * sum(m):  # residência é minoria (~2–10%); metade = flag quebrada
            erros.append(f"recorte {rec} = {sum(r) / sum(m):.0%} de {mae} — flag em_casa suspeita")
    return erros


def comparar_oficial(agg: dict) -> None:
    anos_completos = [a for a in {m[:4] for m in agg["meses"]}
                      if sum(m.startswith(a) for m in agg["meses"]) == 12]
    if not anos_completos:
        return
    ano = max(anos_completos)
    try:
        req = Request(API.format(ano=ano), headers={"User-Agent": "Mozilla/5.0"})
        dados = json.load(urlopen(req, timeout=90))["data"][0]["listaDados"]
    except Exception as e:  # noqa: BLE001 — API instável não derruba a checagem
        print(f"AVISO: tabela oficial indisponível ({type(e).__name__}); comparação pulada")
        return
    # rótulos oficiais trazem nota de rodapé: "HOMICÍDIO DOLOSO (2)"
    oficial = {re.sub(r"\s*\(\d+\)$", "", sem_acento(d["delito"]["delito"]).strip()): d["total"]
               for d in dados}
    idx = [i for i, m in enumerate(agg["meses"]) if m.startswith(ano)]
    print(f"\nComparação com a tabela oficial SSP — capital, {ano}")
    print(f"{'natureza':<34}{'nosso':>9}{'oficial':>9}{'dif':>8}")
    for nat in COMPARAR:
        nosso = sum(agg["cidade"]["por_natureza"].get(nat, [0] * len(agg["meses"]))[i] for i in idx)
        of = oficial.get(sem_acento(nat))
        if of is None:
            continue
        dif = (nosso - of) / of * 100 if of else 0
        marca = "  <-- >2%" if abs(dif) > 2 else ""
        print(f"{nat:<34}{nosso:>9,}{of:>9,}{dif:>7.1f}%{marca}")


def main() -> None:
    agg = json.loads((WEB / "agg.json").read_text(encoding="utf-8"))
    erros = checar_interno(agg)
    print(f"agg.json: {agg['meses'][0]} → {agg['meses'][-1]} | "
          f"{len(erros)} problema(s) interno(s)")
    for e in erros:
        print("  ERRO:", e)
    comparar_oficial(agg)
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()

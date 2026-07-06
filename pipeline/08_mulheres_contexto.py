"""
Contexto oficial do painel Mulheres — feminicídios e crimes correlatos na capital.

A base de microdados de violência doméstica (06_mulheres.py) NÃO contém crimes
letais: as naturezas dela são as não-letais da Lei Maria da Penha (ameaça, lesão,
injúria...). Feminicídios são publicados pela SSP em outra tabela, agregada e
oficial, via API do portal:

    v1/ViolenciaMulher/RecuperaDadosPorAno?ano={ano}
    → contagens mensais por delito, com recorte capital / demacro / interior

Este script consolida a série da CAPITAL para os delitos de interesse e grava
web/public/data/mulheres_contexto.json, consumido pelo bloco "contexto oficial"
da aba Mulheres (fora do crossfilter — outra fonte, outra unidade de contagem).
"""
import json
import time
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

BASE = Path(__file__).resolve().parent.parent
WEB = BASE / "web" / "public" / "data"

API = "https://www.ssp.sp.gov.br/v1/ViolenciaMulher/RecuperaDadosPorAno?ano={ano}"
ANOS = list(range(2019, date.today().year + 1))  # ano novo entra sozinho na virada

# delito na API → chave no json de saída
DELITOS = {
    "FEMINICÍDIO": "feminicidio",
    "HOMICÍDIO DOLOSO - TOTAL": "homicidio_total",
    "TENTATIVA DE HOMICÍDIO": "tentativa_homicidio",
    "ESTUPRO CONSUMADO": "estupro",
    "ESTUPRO DE VULNERÁVEL CONSUMADO": "estupro_vulneravel",
}


def baixar(ano: int) -> dict:
    req = Request(API.format(ano=ano), headers={"User-Agent": "Mozilla/5.0"})
    for tentativa in range(4):
        try:
            with urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # rede da SSP oscila; recuar e tentar de novo
            if tentativa == 3:
                raise
            time.sleep(2 ** (tentativa + 1))
            print(f"  {ano}: retry ({e})")


def main() -> None:
    series: dict[str, dict[str, list]] = {v: {} for v in DELITOS.values()}
    for ano in ANOS:
        dados = baixar(ano)
        if not dados.get("success"):
            print(f"  {ano}: API sem sucesso, pulando")
            continue
        mensal: dict[str, list] = {v: [None] * 12 for v in DELITOS.values()}
        for bloco in dados["data"]:
            mes = int(bloco["mes"]) - 1
            for item in bloco["dadosMes"]:
                chave = DELITOS.get(item["delito"]["delito"])
                if chave:
                    mensal[chave][mes] = item["capital"]
        for chave, vals in mensal.items():
            series[chave][str(ano)] = vals
        print(f"  {ano}: feminicídios capital = "
              f"{sum(v for v in mensal['feminicidio'] if v is not None)}")

    out = {
        "fonte": "SSP-SP, tabela oficial de violência contra a mulher (recorte capital)",
        "anos": [str(a) for a in ANOS],
        "series": series,
    }
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "mulheres_contexto.json").write_text(
        json.dumps(out, ensure_ascii=False), encoding="utf-8"
    )
    print(f"mulheres_contexto.json gravado ({len(ANOS)} anos)")


if __name__ == "__main__":
    main()

"""
Fase 3 — Agregados para o front (web/public/data/agg.json), v2 (3 abas).

Estrutura (todas as séries são arrays alinhados ao vetor `meses`):
{
  "meses": ["2022-01", ...],
  "categorias": ["letais", "roubos", "furtos", "genero"],
  "naturezas": {categoria: [naturezas...]},
  "cidade": {
    "por_categoria": {categoria: [n/mês]},
    "por_natureza":  {natureza:  [n/mês]},
    "por_conduta":   {categoria: {conduta: [n/mês]}}   # só roubos/furtos, condutas relevantes
  },
  "distritos": {cd: {"cat": {categoria: [n/mês]}, "nat": {natureza: [n/mês]}}},
  "subs": {id: {"nome": str, "pop": int, "cat": {...}, "nat": {...}}}
}
Taxas por 100k calculadas no cliente (pop embutida aqui e no GeoJSON).
Base temporal: MES/ANO_ESTATISTICA (padrão oficial SSP).
"""
import json
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
PROC = BASE / "data" / "processed"
EXT = BASE / "data" / "external"
WEB_DATA = BASE / "web" / "public" / "data"

CATEGORIAS = ["letais", "roubos", "furtos", "genero"]
# condutas com leitura cidadã clara (evita a poluição do "Outros")
CONDUTAS_RELEVANTES = {
    "Transeunte", "Interior de Veículo", "Residência", "Estabelecimento Comercial",
    "Interior Transporte Coletivo", "Fios e Cabos", "Carga", "Veículo",
}


def series_por(df: pd.DataFrame, chaves: list[str], pos: dict, n_meses: int) -> dict:
    """Agrupa por `chaves` e devolve dict aninhado com vetores mensais."""
    out = {}
    for grupo, g in df.groupby(chaves + ["mes"]).size().groupby(chaves):
        v = [0] * n_meses
        for idx, n in g.droplevel(list(range(len(chaves)))).items():
            v[pos[idx]] = int(n)
        alvo = out
        chave = grupo if isinstance(grupo, tuple) else (grupo,)
        for k in chave[:-1]:
            alvo = alvo.setdefault(str(k), {})
        alvo[str(chave[-1])] = v
    return out


def main() -> None:
    arquivos = sorted(PROC.glob("ocorrencias_*.parquet"))
    df = pd.concat(
        (pd.read_parquet(a, columns=[
            "categoria", "NATUREZA_APURADA", "DESCR_CONDUTA", "cd_distrito",
            "id_subprefeitura", "ANO_ESTATISTICA", "MES_ESTATISTICA",
        ]) for a in arquivos),
        ignore_index=True,
    )
    df["mes"] = (
        df["ANO_ESTATISTICA"].astype(str) + "-" +
        df["MES_ESTATISTICA"].astype(int).astype(str).str.zfill(2)
    )
    meses = sorted(df["mes"].unique())
    pos = {m: i for i, m in enumerate(meses)}
    nm = len(meses)

    naturezas = {
        c: sorted(df.loc[df["categoria"] == c, "NATUREZA_APURADA"].unique())
        for c in CATEGORIAS
    }

    cidade = {
        "por_categoria": series_por(df, ["categoria"], pos, nm),
        "por_natureza": series_por(df, ["NATUREZA_APURADA"], pos, nm),
        "por_conduta": series_por(
            df[df["categoria"].isin(["roubos", "furtos"])
               & df["DESCR_CONDUTA"].isin(CONDUTAS_RELEVANTES)],
            ["categoria", "DESCR_CONDUTA"], pos, nm,
        ),
    }

    com_d = df[df["cd_distrito"].notna()]
    distritos_cat = series_por(com_d, ["cd_distrito", "categoria"], pos, nm)
    distritos_nat = series_por(com_d, ["cd_distrito", "NATUREZA_APURADA"], pos, nm)
    distritos = {
        cd: {"cat": distritos_cat.get(cd, {}), "nat": distritos_nat.get(cd, {})}
        for cd in distritos_cat
    }

    gj = json.load(open(WEB_DATA / "subprefeituras.geojson", encoding="utf-8"))
    info_sub = {
        str(int(f["properties"]["id_subprefeitura"])): {
            "nome": f["properties"]["nome"].title(),
            "pop": int(f["properties"]["pop_2022"] or 0),
        }
        for f in gj["features"]
    }
    com_s = df[df["id_subprefeitura"].notna()].copy()
    com_s["id_sub"] = com_s["id_subprefeitura"].astype(int).astype(str)
    subs_cat = series_por(com_s, ["id_sub", "categoria"], pos, nm)
    subs_nat = series_por(com_s, ["id_sub", "NATUREZA_APURADA"], pos, nm)
    subs = {
        sid: {**info_sub.get(sid, {"nome": sid, "pop": 0}),
              "cat": subs_cat.get(sid, {}), "nat": subs_nat.get(sid, {})}
        for sid in subs_cat
    }

    agg = {
        "meses": meses,
        "categorias": CATEGORIAS,
        "naturezas": naturezas,
        "cidade": cidade,
        "distritos": distritos,
        "subs": subs,
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    destino = WEB_DATA / "agg.json"
    destino.write_text(json.dumps(agg, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"agg.json: {destino.stat().st_size/1e3:.0f} KB | {nm} meses | "
          f"{len(distritos)} distritos | {len(subs)} subprefeituras")


if __name__ == "__main__":
    main()

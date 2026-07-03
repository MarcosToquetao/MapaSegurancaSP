"""
Fase 2/3 — Camada geográfica.

1. Reprojeta malhas GeoSampa (EPSG:31983 → 4326) e casa população do Censo 2022 (SIDRA 9923)
   com os distritos por nome normalizado.
2. Gera GeoJSON simplificado para o front (web/public/data/).
3. Spatial join: ocorrência (lat/long) → distrito, salvo de volta no parquet.

Uso:
    python pipeline/03_geo.py            # malhas + join de todos os parquets
    python pipeline/03_geo.py 2025       # malhas + join de um ano
"""
import json
import sys
import unicodedata
from pathlib import Path

import geopandas as gpd
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
EXT = BASE / "data" / "external"
PROC = BASE / "data" / "processed"
WEB_DATA = BASE / "web" / "public" / "data"


def norm(nome: str) -> str:
    nome = nome.split(" - ")[0].strip().upper()
    return "".join(c for c in unicodedata.normalize("NFD", nome) if not unicodedata.combining(c))


def carregar_populacao() -> dict[str, int]:
    rows = json.load(open(EXT / "sidra_9923_raw.json", encoding="utf-8"))[1:]
    tot = {}
    for r in rows:
        if r["D4N"] == "Total":
            tot[norm(r["D1N"])] = int(r["V"])
    assert len(tot) == 96, f"esperava 96 distritos no SIDRA, veio {len(tot)}"
    return tot


def preparar_malhas() -> gpd.GeoDataFrame:
    pop = carregar_populacao()

    dist = gpd.read_file(EXT / "distritos_geosampa.geojson").set_crs(31983).to_crs(4326)
    dist = dist.rename(columns={
        "cd_distrito_municipal": "cd_distrito",
        "nm_distrito_municipal": "nome",
        "cd_identificador_subprefeitura": "id_subprefeitura",
    })[["cd_distrito", "nome", "id_subprefeitura", "geometry"]]
    dist["pop_2022"] = dist["nome"].map(lambda n: pop.get(norm(n)))
    sem_pop = dist[dist["pop_2022"].isna()]["nome"].tolist()
    assert not sem_pop, f"distritos sem população casada: {sem_pop}"

    sub = gpd.read_file(EXT / "subprefeituras_geosampa.geojson").set_crs(31983).to_crs(4326)
    sub = sub.rename(columns={
        "cd_identificador_subprefeitura": "id_subprefeitura",
        "nm_subprefeitura": "nome",
    })[["id_subprefeitura", "nome", "geometry"]]
    # população da subprefeitura = soma dos seus distritos
    sub = sub.merge(
        dist.groupby("id_subprefeitura", as_index=False)["pop_2022"].sum(),
        on="id_subprefeitura", how="left",
    )

    dist.to_file(PROC / "distritos_4326.geojson", driver="GeoJSON")
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    for gdf, nome_arq in ((dist, "distritos.geojson"), (sub, "subprefeituras.geojson")):
        leve = gdf.copy()
        leve["geometry"] = leve.geometry.simplify(0.0002, preserve_topology=True)
        leve.to_file(WEB_DATA / nome_arq, driver="GeoJSON")
    print(f"malhas ok: 96 distritos + {len(sub)} subprefeituras (pop. total {dist['pop_2022'].sum():,.0f})")
    return dist


def spatial_join(ano: int, dist: gpd.GeoDataFrame) -> None:
    arq = PROC / f"ocorrencias_{ano}.parquet"
    df = pd.read_parquet(arq)
    geo = df["LATITUDE"].notna()
    pontos = gpd.GeoDataFrame(
        df.loc[geo, []],
        geometry=gpd.points_from_xy(df.loc[geo, "LONGITUDE"], df.loc[geo, "LATITUDE"]),
        crs=4326,
    )
    joined = gpd.sjoin(pontos, dist[["cd_distrito", "id_subprefeitura", "geometry"]],
                       how="left", predicate="within")
    joined = joined[~joined.index.duplicated(keep="first")]  # pontos em fronteira
    df["cd_distrito"] = joined["cd_distrito"].reindex(df.index)
    df["id_subprefeitura"] = joined["id_subprefeitura"].reindex(df.index)
    df["distrito_via"] = pd.array(["geo"] * len(df), dtype="string")
    df.loc[df["cd_distrito"].isna(), "distrito_via"] = pd.NA
    dentro = df.loc[geo, "cd_distrito"].notna().mean()

    # Fallback para registros sem coordenada (inclui 100% de violência de gênero,
    # anonimizada por lei): distrito modal do BAIRRO, aprendido dos registros geocodificados.
    com_geo = df[df["cd_distrito"].notna() & df["BAIRRO"].notna()]
    modal = (
        com_geo.groupby(["BAIRRO", "cd_distrito"]).size()
        .reset_index(name="n")
        .sort_values("n", ascending=False)
        .drop_duplicates("BAIRRO")
        .set_index("BAIRRO")
    )
    sem = df["cd_distrito"].isna() & df["BAIRRO"].notna()
    df.loc[sem, "cd_distrito"] = df.loc[sem, "BAIRRO"].map(modal["cd_distrito"])
    recuperados = sem & df["cd_distrito"].notna()
    df.loc[recuperados, "distrito_via"] = "bairro"
    sub_por_dist = dist.set_index("cd_distrito")["id_subprefeitura"]
    df.loc[recuperados, "id_subprefeitura"] = df.loc[recuperados, "cd_distrito"].map(sub_por_dist)

    df.to_parquet(arq, index=False)
    total = df["cd_distrito"].notna().mean()
    print(f"[{ano}] join: {dentro:.1%} dos pontos em distrito | "
          f"+{recuperados.sum():,} via bairro | cobertura total {total:.1%}")


def main() -> None:
    dist = preparar_malhas()
    anos = [int(a) for a in sys.argv[1:]] or sorted(
        int(p.stem.split("_")[1]) for p in PROC.glob("ocorrencias_*.parquet")
    )
    for ano in anos:
        spatial_join(ano, dist)


if __name__ == "__main__":
    main()

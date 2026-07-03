"""
Fase 3 — Camada de pontos: parquet → PMTiles (vector tiles), Python puro.

Sem tippecanoe (Windows/CI-agnóstico): tiles MVT gerados com mapbox-vector-tile e
empacotados com pmtiles.writer. Esquema:

  - zooms 9–14 (overzoom do MapLibre cobre z>14)
  - z14: todos os pontos, atributos c (categoria), n (natureza), m (índice do mês)
  - z9–13: amostragem aleatória com teto por tile/categoria; atributo w = fator de
    expansão (pontos representados), usado como heatmap-weight. Amostra uniforme
    preserva a distribuição mensal, então o filtro temporal segue honesto.
  - camada única "oc"; legendas/índices em web/public/data/points_meta.json

Uso:
    python pipeline/05_points.py
"""
import gzip
import json
import math
import random
from collections import defaultdict
from pathlib import Path

import pandas as pd
from mapbox_vector_tile import encode as mvt_encode
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

BASE = Path(__file__).resolve().parent.parent
PROC = BASE / "data" / "processed"
WEB_DATA = BASE / "web" / "public" / "data"

MINZOOM, MAXZOOM = 9, 14
EXTENT = 4096
CAP = {9: 2000, 10: 3000, 11: 4000, 12: 6000, 13: 9000}  # por tile × categoria
CATEGORIAS = ["letais", "roubos", "furtos", "genero"]
random.seed(42)  # reprodutível entre execuções


def lonlat_para_tile(lon: float, lat: float, z: int) -> tuple[int, int, float, float]:
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
    xt, yt = int(x), int(y)
    return xt, yt, (x - xt) * EXTENT, (y - yt) * EXTENT


def carregar_pontos() -> pd.DataFrame:
    arquivos = sorted(PROC.glob("ocorrencias_*.parquet"))
    df = pd.concat(
        (pd.read_parquet(a, columns=[
            "categoria", "NATUREZA_APURADA", "LATITUDE", "LONGITUDE",
            "ANO_ESTATISTICA", "MES_ESTATISTICA",
        ]) for a in arquivos),
        ignore_index=True,
    ).dropna(subset=["LATITUDE", "LONGITUDE"])
    df["mes"] = (
        df["ANO_ESTATISTICA"].astype(str) + "-" +
        df["MES_ESTATISTICA"].astype(int).astype(str).str.zfill(2)
    )
    return df


def main() -> None:
    df = carregar_pontos()
    meses = sorted(df["mes"].unique())
    naturezas = sorted(df["NATUREZA_APURADA"].unique())
    m_idx = {m: i for i, m in enumerate(meses)}
    n_idx = {n: i for i, n in enumerate(naturezas)}
    c_idx = {c: i for i, c in enumerate(CATEGORIAS)}
    print(f"{len(df):,} pontos | {len(meses)} meses")

    cols = (
        df["LONGITUDE"].to_numpy(), df["LATITUDE"].to_numpy(),
        df["categoria"].map(c_idx).to_numpy(),
        df["NATUREZA_APURADA"].map(n_idx).to_numpy(),
        df["mes"].map(m_idx).to_numpy(),
    )

    tiles: dict[tuple[int, int, int], list] = defaultdict(list)
    for z in range(MINZOOM, MAXZOOM + 1):
        for lon, lat, c, n, m in zip(*cols):
            xt, yt, px, py = lonlat_para_tile(lon, lat, z)
            tiles[(z, xt, yt)].append((px, py, int(c), int(n), int(m)))

    print(f"{len(tiles):,} tiles a codificar")
    destino = WEB_DATA / "ocorrencias.pmtiles"
    WEB_DATA.mkdir(parents=True, exist_ok=True)

    minlon, minlat = df["LONGITUDE"].min(), df["LATITUDE"].min()
    maxlon, maxlat = df["LONGITUDE"].max(), df["LATITUDE"].max()

    with open(destino, "wb") as f:
        w = Writer(f)
        for (z, xt, yt) in sorted(tiles, key=lambda k: zxy_to_tileid(*k)):
            pontos = tiles[(z, xt, yt)]
            feats = []
            if z == MAXZOOM:
                for px, py, c, n, m in pontos:
                    feats.append({
                        "geometry": {"type": "Point", "coordinates": [round(px), round(py)]},
                        "properties": {"c": c, "n": n, "m": m, "w": 1},
                    })
            else:
                por_cat = defaultdict(list)
                for p in pontos:
                    por_cat[p[2]].append(p)
                for c, grupo in por_cat.items():
                    cap = CAP[z]
                    amostra = grupo if len(grupo) <= cap else random.sample(grupo, cap)
                    wfator = len(grupo) / len(amostra)
                    for px, py, _, n, m in amostra:
                        feats.append({
                            "geometry": {"type": "Point", "coordinates": [round(px), round(py)]},
                            "properties": {"c": c, "m": m, "w": round(wfator, 2)},
                        })
            data = mvt_encode(
                [{"name": "oc", "features": feats}],
                default_options={"extents": EXTENT, "y_coord_down": True},
            )
            w.write_tile(zxy_to_tileid(z, xt, yt), gzip.compress(data))

        w.finalize(
            {
                "tile_type": TileType.MVT,
                "tile_compression": Compression.GZIP,
                "min_zoom": MINZOOM,
                "max_zoom": MAXZOOM,
                "min_lon_e7": int(minlon * 1e7),
                "min_lat_e7": int(minlat * 1e7),
                "max_lon_e7": int(maxlon * 1e7),
                "max_lat_e7": int(maxlat * 1e7),
                "center_zoom": 11,
                "center_lon_e7": int(-46.63 * 1e7),
                "center_lat_e7": int(-23.60 * 1e7),
            },
            {
                "name": "Ocorrências SSP-SP (capital)",
                "vector_layers": [{
                    "id": "oc",
                    "minzoom": MINZOOM,
                    "maxzoom": MAXZOOM,
                    "fields": {"c": "Number", "n": "Number", "m": "Number", "w": "Number"},
                }],
            },
        )

    meta = {"meses": meses, "categorias": CATEGORIAS, "naturezas": naturezas}
    (WEB_DATA / "points_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False), encoding="utf-8"
    )
    print(f"ok: {destino.name} ({destino.stat().st_size/1e6:.1f} MB) + points_meta.json")


if __name__ == "__main__":
    main()

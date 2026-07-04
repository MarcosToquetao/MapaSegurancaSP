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

CATEGORIAS = ["letais", "roubos", "furtos", "genero", "celular"]
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


# DESC_PERIODO textual → período 0..3 (madrugada, manhã, tarde, noite)
PERIODO_TXT = {
    "De madrugada": 0, "Pela manhã": 1, "A tarde": 2, "A noite": 3,
}


def derivar_tempo(df: pd.DataFrame) -> pd.DataFrame:
    """Deriva hora (0-23), periodo (0-3) e diasemana (0=seg) por registro."""
    hora_txt = df["HORA_OCORRENCIA_BO"].astype("string").str.extract(r"^(\d{1,2})", expand=False)
    df["hora"] = pd.to_numeric(hora_txt, errors="coerce")
    df.loc[~df["hora"].between(0, 23), "hora"] = pd.NA

    df["periodo"] = (df["hora"] // 6).astype("Int64")  # 0-5→0, 6-11→1, 12-17→2, 18-23→3
    sem_hora = df["periodo"].isna()
    df.loc[sem_hora, "periodo"] = df.loc[sem_hora, "DESC_PERIODO"].map(PERIODO_TXT).astype("Int64")
    return df


def main() -> None:
    arquivos = sorted(list(PROC.glob("ocorrencias_*.parquet")) +
                      list(PROC.glob("celulares_*.parquet")))

    def ler(a):
        d = pd.read_parquet(a, columns=[
            "categoria", "NATUREZA_APURADA", "DESCR_CONDUTA", "cd_distrito",
            "id_subprefeitura", "ANO_ESTATISTICA", "MES_ESTATISTICA",
            "HORA_OCORRENCIA_BO", "DESC_PERIODO", "DATA_OCORRENCIA_BO",
        ])
        # dia-da-semana derivado por arquivo: coerção protege contra datas
        # digitadas erradas na fonte (ex.: ano 1202), que estouram o concat
        d["diasemana"] = pd.to_datetime(d["DATA_OCORRENCIA_BO"], errors="coerce").dt.dayofweek
        return d.drop(columns=["DATA_OCORRENCIA_BO"])

    df = pd.concat((ler(a) for a in arquivos), ignore_index=True)
    df["mes"] = (
        df["ANO_ESTATISTICA"].astype(str) + "-" +
        df["MES_ESTATISTICA"].astype(int).astype(str).str.zfill(2)
    )
    df = derivar_tempo(df)
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
            df[df["categoria"].isin(["roubos", "furtos", "celular"])
               & df["DESCR_CONDUTA"].isin(CONDUTAS_RELEVANTES)],
            ["categoria", "DESCR_CONDUTA"], pos, nm,
        ),
    }

    gj_d = json.load(open(WEB_DATA / "distritos.geojson", encoding="utf-8"))
    info_dist = {
        str(f["properties"]["cd_distrito"]): {
            "nome": f["properties"]["nome"].title(),
            "pop": int(f["properties"]["pop_2022"] or 0),
        }
        for f in gj_d["features"]
    }
    com_d = df[df["cd_distrito"].notna()]
    distritos_cat = series_por(com_d, ["cd_distrito", "categoria"], pos, nm)
    distritos_nat = series_por(com_d, ["cd_distrito", "NATUREZA_APURADA"], pos, nm)
    distritos = {
        cd: {**info_dist.get(cd, {"nome": cd, "pop": 0}),
             "cat": distritos_cat.get(cd, {}), "nat": distritos_nat.get(cd, {})}
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

    # ---- dimensão horário (série completa 2022–2026) ----
    def vetor_por(sub: pd.DataFrame, col: str, tam: int) -> dict:
        out = {}
        for (nat, v), n in sub.groupby(["NATUREZA_APURADA", col]).size().items():
            out.setdefault(nat, [0] * tam)[int(v)] = int(n)
        return out

    com_hora = df[df["hora"].notna()].copy()
    com_hora["slot"] = com_hora["diasemana"] * 24 + com_hora["hora"]
    com_per = df[df["periodo"].notna()]

    dist_per = {}
    for (cd, nat, p), n in (
        com_per[com_per["cd_distrito"].notna()]
        .groupby(["cd_distrito", "NATUREZA_APURADA", "periodo"]).size().items()
    ):
        dist_per.setdefault(str(cd), {}).setdefault(nat, [0, 0, 0, 0])[int(p)] = int(n)

    horarios = {
        "hora": vetor_por(com_hora, "hora", 24),
        "semana": vetor_por(com_hora.dropna(subset=["diasemana"]), "slot", 168),
        "distrito_periodo": dist_per,
        "cobertura_hora": round(float(df["hora"].notna().mean()), 3),
        "cobertura_periodo": round(float(df["periodo"].notna().mean()), 3),
    }

    agg = {
        "meses": meses,
        "categorias": CATEGORIAS,
        "naturezas": naturezas,
        "cidade": cidade,
        "distritos": distritos,
        "subs": subs,
        "horarios": horarios,
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    destino = WEB_DATA / "agg.json"
    destino.write_text(json.dumps(agg, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"agg.json: {destino.stat().st_size/1e3:.0f} KB | {nm} meses | "
          f"{len(distritos)} distritos | {len(subs)} subprefeituras")


if __name__ == "__main__":
    main()

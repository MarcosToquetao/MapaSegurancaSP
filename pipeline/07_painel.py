"""
Crossfilter do Painel — microdado da base principal de ocorrências codificado
em binário uint8 (mesma técnica do painel Mulheres), para cruzamento livre de
variáveis no cliente.

Fonte: data/processed/ocorrencias_*.parquet (base principal, SEM a base de
celulares — evita dupla contagem: "outros roubos/furtos" já contêm os celulares).

Saídas:
  - web/public/data/painel.bin        (colunas uint8 concatenadas)
  - web/public/data/painel_meta.json  (rótulos, ordem das colunas, meses, pop por zona)

Colunas (uint8): tipo, zona, mes, hora, local, conduta
"""
import json
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
PROC = BASE / "data" / "processed"
WEB = BASE / "web" / "public" / "data"

COLUNAS_BIN = ["tipo", "zona", "mes", "hora", "local", "conduta"]

# ordem de exibição dos tipos de crime (natureza-first, mais graves/relevantes primeiro)
TIPOS = [
    "ROUBO - OUTROS", "FURTO - OUTROS", "ROUBO DE VEÍCULO", "FURTO DE VEÍCULO",
    "ROUBO DE CARGA", "FURTO DE CARGA", "HOMICÍDIO DOLOSO", "LATROCÍNIO",
    "LESÃO CORPORAL SEGUIDA DE MORTE", "HOMICÍDIO DOLOSO POR ACIDENTE DE TRÂNSITO",
    "ESTUPRO", "ESTUPRO DE VULNERÁVEL",
]
TIPO_ROTULO = {
    "ROUBO - OUTROS": "Roubo (outros)", "FURTO - OUTROS": "Furto (outros)",
    "ROUBO DE VEÍCULO": "Roubo de veículo", "FURTO DE VEÍCULO": "Furto de veículo",
    "ROUBO DE CARGA": "Roubo de carga", "FURTO DE CARGA": "Furto de carga",
    "HOMICÍDIO DOLOSO": "Homicídio doloso", "LATROCÍNIO": "Latrocínio",
    "LESÃO CORPORAL SEGUIDA DE MORTE": "Lesão seguida de morte",
    "HOMICÍDIO DOLOSO POR ACIDENTE DE TRÂNSITO": "Homicídio no trânsito",
    "ESTUPRO": "Estupro", "ESTUPRO DE VULNERÁVEL": "Estupro de vulnerável",
}

ZONAS = ["Centro", "Norte", "Sul", "Leste", "Oeste"]
SUB_ZONA = {
    "SE": 0,
    "CASA VERDE": 1, "FREGUESIA DO O": 1, "FREGUESIA": 1, "JACANA": 1, "PERUS": 1,
    "PIRITUBA": 1, "SANTANA": 1, "VILA MARIA": 1,
    "CAMPO LIMPO": 2, "CAPELA DO SOCORRO": 2, "CIDADE ADEMAR": 2, "IPIRANGA": 2,
    "JABAQUARA": 2, "M BOI MIRIM": 2, "PARELHEIROS": 2, "SANTO AMARO": 2, "VILA MARIANA": 2,
    "ARICANDUVA": 3, "CIDADE TIRADENTES": 3, "ERMELINO MATARAZZO": 3, "GUAIANASES": 3,
    "ITAIM PAULISTA": 3, "ITAQUERA": 3, "MOOCA": 3, "PENHA": 3, "SAO MATEUS": 3,
    "SAO MIGUEL": 3, "SAPOPEMBA": 3, "VILA PRUDENTE": 3,
    "BUTANTA": 4, "LAPA": 4, "PINHEIROS": 4,
}

LOCAIS = ["Via pública", "Transporte/terminal", "Residência", "Estacionamento",
          "Comércio/serviços", "Lazer", "Outros", "n/i"]
LOCAL_IDX = {
    "Via Pública": 0, "Rodovia/Estrada": 0,
    "Terminal/Estação": 1,
    "Residência": 2, "Condomínio Residencial": 2,
    "Estacionamento/Garagem": 3,
    "Comércio e Serviços": 4, "Restaurante e Afins": 4, "Shopping Center": 4,
    "Centro Comercial/Empresarial": 4, "Estabelecimento Bancário": 4, "Condomínio Comercial": 4,
    "Lazer e Recreação": 5,
}

CONDUTAS = ["Outros", "Transeunte", "Interior de veículo", "Transporte coletivo",
            "Residência", "Estab. comercial", "Fios e cabos", "Veículo",
            "Carga", "App de mobilidade"]
CONDUTA_IDX = {
    "Transeunte": 1, "Interior de Veículo": 2, "Interior Transporte Coletivo": 3,
    "Residência": 4, "Estabelecimento Comercial": 5, "Fios e Cabos": 6,
    "Veículo": 7, "Carga": 8, "Aplicativo de Mobilidade Urbana": 9,
}

PERIODO_TXT = {"De madrugada": 0, "Pela manhã": 1, "A tarde": 2, "A noite": 3}


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", str(s)) if not unicodedata.combining(c))
    return s.upper().strip()


def id_para_zona() -> dict[int, int]:
    gj = json.load(open(WEB / "subprefeituras.geojson", encoding="utf-8"))
    out = {}
    for f in gj["features"]:
        z = SUB_ZONA.get(norm(f["properties"]["nome"]).split("-")[0].strip())
        if z is not None:
            out[int(f["properties"]["id_subprefeitura"])] = z
    return out


def pop_por_zona() -> dict[int, int]:
    gj = json.load(open(WEB / "zonas.geojson", encoding="utf-8"))
    return {int(f["properties"]["zona"]): int(f["properties"]["pop_2022"] or 0)
            for f in gj["features"]}


def main() -> None:
    id2zona = id_para_zona()
    arquivos = sorted(PROC.glob("ocorrencias_*.parquet"))
    df = pd.concat(
        (pd.read_parquet(a, columns=[
            "NATUREZA_APURADA", "DESCR_CONDUTA", "DESCR_TIPOLOCAL", "id_subprefeitura",
            "ANO_ESTATISTICA", "MES_ESTATISTICA", "HORA_OCORRENCIA_BO", "DESC_PERIODO",
        ]) for a in arquivos),
        ignore_index=True,
    )
    df = df[df["NATUREZA_APURADA"].isin(TIPOS)].copy()

    df["mes_txt"] = (
        df["ANO_ESTATISTICA"].astype(str) + "-" +
        df["MES_ESTATISTICA"].astype(int).astype(str).str.zfill(2)
    )
    meses = sorted(df["mes_txt"].unique())
    mes_idx = {m: i for i, m in enumerate(meses)}

    hora = pd.to_numeric(
        df["HORA_OCORRENCIA_BO"].astype("string").str.extract(r"^(\d{1,2})", expand=False),
        errors="coerce",
    )
    hora[~hora.between(0, 23)] = pd.NA

    out = pd.DataFrame({
        "tipo": df["NATUREZA_APURADA"].map({t: i for i, t in enumerate(TIPOS)}),
        "zona": df["id_subprefeitura"].map(lambda v: id2zona.get(int(v)) if pd.notna(v) else None),
        "mes": df["mes_txt"].map(mes_idx),
        "hora": hora.fillna(24),
        "local": df["DESCR_TIPOLOCAL"].map(lambda v: 7 if (pd.isna(v) or v == "NULL") else LOCAL_IDX.get(v, 6)),
        "conduta": df["DESCR_CONDUTA"].map(lambda v: CONDUTA_IDX.get(v, 0)),
    })
    out["zona"] = out["zona"].fillna(5)  # 5 = fora das 5 macrorregiões / sem subpref
    out = out.astype(np.uint8)

    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "painel.bin").write_bytes(
        b"".join(out[c].to_numpy().tobytes() for c in COLUNAS_BIN)
    )
    meta = {
        "nrows": int(len(out)),
        "colunas": COLUNAS_BIN,
        "meses": meses,
        "rotulos": {
            "tipo": [TIPO_ROTULO[t] for t in TIPOS],
            "zona": ZONAS + ["n/i"],
            "local": LOCAIS,
            "conduta": CONDUTAS,
        },
        "pop_zonas": pop_por_zona(),
        "cobertura_hora": round(float((out["hora"] < 24).mean()), 3),
    }
    (WEB / "painel_meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    tam = (WEB / "painel.bin").stat().st_size
    print(f"painel.bin: {tam/1e6:.1f} MB ({len(out):,} linhas × {len(COLUNAS_BIN)} col) | "
          f"hora conhecida em {meta['cobertura_hora']:.0%}")


if __name__ == "__main__":
    main()

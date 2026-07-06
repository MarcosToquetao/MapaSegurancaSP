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

# Local do crime vem de DESCR_SUBTIPOLOCAL (99,4% preenchido em todos os anos) —
# DESCR_TIPOLOCAL é 100% nulo em 2022–2024 e só existe de 2025 em diante.
LOCAIS = ["Via pública", "Residência", "Transporte/estação", "Comércio/serviços",
          "Estacionamento", "Ensino/saúde", "Lazer", "Outros", "n/i"]
# valores normalizados (norm()) com ≥300 ocorrências → categoria; a cauda (0,7%)
# cai nas regras por palavra-chave abaixo
LOCAL_EXATO = {
    "VIA PUBLICA": 0, "TRANSEUNTE": 0, "PRACA": 0, "DE FRENTE A RESIDENCIA DA VITIMA": 0,
    "AREA NAO OCUPADA": 0, "TUNEL/VIADUTO/PONTE": 0, "ACOSTAMENTO": 0, "SEMAFORO": 0,
    "CASA": 1, "CASAS": 1, "RESIDENCIA": 1, "APARTAMENTO": 1, "APARTAMENTOS": 1,
    "GARAGEM OU ABRIGO DE RESIDENCIA": 1, "CONDOMINIO RESIDENCIAL": 1,
    "GARAGEM COLETIVA DE PREDIO": 1, "AREA COMUM": 1,
    "METROVIARIO E FERROVIARIO METROPOLITANO": 2, "TERMINAL/ESTACAO": 2,
    "INTERIOR DE TRANSPORTE COLETIVO": 2, "ONIBUS/LOTACAO/TROLEBUS": 2,
    "FERROVIARIO": 2, "RODOVIARIO": 2, "RODOVIA/ESTRADA": 2,
    "COMERCIO E SERVICOS": 3, "MERCADO": 3, "LOJAS": 3, "AGENCIA": 3,
    "ESTABELECIMENTO BANCARIO": 3, "AGENCIA BANCARIA": 3, "FARMACIA/DROGARIA": 3,
    "BAR/BOTEQUIM": 3, "RESTAURANTE E AFINS": 3, "RESTAURANTE": 3,
    "LANCHONETE/PASTELARIA/PIZZARIA": 3, "CAFE/LANCHONETE": 3, "PADARIA/CONFEITARIA": 3,
    "POSTO DE GASOLINA": 3, "SHOPPING CENTER": 3, "CAIXA ELETRONICO": 3, "OFICINA": 3,
    "SALAO DE BELEZA/ESTETICA": 3, "CONVENIENCIA": 3, "LOCADORA": 3, "DISTRIBUIDORA": 3,
    "ESCRITORIOS": 3, "ESCRITORIO": 3, "CENTRO COMERC./EMPRESARIAL": 3,
    "CONDOMINIO COMERCIAL": 3, "HOTEL": 3, "HOSPEDAGEM": 3, "ALBERGUE": 3,
    "PENSAO/ESTALAGEM/HOSPEDARIA": 3, "FEIRA LIVRE": 3,
    "ESTACIONAMENTO PARTICULAR": 4, "ESTACIONAMENTO PUBLICO": 4,
    "ESTACIONAMENTO COM VIGILANCIA": 4, "ESTACIONAMENTO": 4,
    "ESTABELECIMENTO DE ENSINO": 5, "ENSINO FUNDAMENTAL": 5, "ENSINO MEDIO": 5,
    "BERCARIO/CRECHE": 5, "HOSPITAL": 5, "SAUDE": 5, "CLINICA": 5, "POSTO DE SAUDE": 5,
    "LAZER E RECREACAO": 6, "CLUBE/CENTRO ESPORTIVO": 6, "PARQUE/BOSQUE/HORTO/RESERVA": 6,
    "CASA DE SHOW/ESPETACULO": 6, "ESTADIO/GINASIO": 6,
}
# fallback por palavra-chave (ordem importa: lazer antes de residência p/ "casa de show")
LOCAL_REGRAS = [
    (2, ("METROVIARI", "FERROVIARI", "TERMINAL", "ESTACAO", "ONIBUS", "TROLEBUS",
         "RODOVIARI", "RODOVIA", "TRANSPORTE COLETIVO", "METRO")),
    (4, ("ESTACIONAMENTO",)),
    (5, ("ENSINO", "CRECHE", "BERCARIO", "ESCOLA", "FACULDADE", "UNIVERSIDADE",
         "HOSPITAL", "SAUDE", "CLINICA", "CONSULTORIO")),
    (6, ("LAZER", "CLUBE", "PARQUE", "BOSQUE", "ESTADIO", "GINASIO", "CINEMA",
         "TEATRO", "SHOW", "BOATE", "BAILE")),
    (1, ("CASA", "RESIDENC", "APARTAMENTO", "CONDOMINIO RESID", "MORADIA", "BARRACO")),
    (3, ("COMERCIO", "MERCADO", "LOJA", "AGENCIA", "BANCARI", "FARMACIA", "DROGARIA",
         "RESTAURANTE", "LANCHONETE", "PIZZARIA", "PADARIA", "CONFEITARIA", "SHOPPING",
         "OFICINA", "SALAO", "CONVENIENCIA", "ESCRITORIO", "HOTEL", "HOSPEDAGEM",
         "ALBERGUE", "PENSAO", "FEIRA", "ACOUGUE", "SUPERMERCADO", "BAR/", "QUITANDA")),
    (0, ("VIA PUBLICA", "PRACA", "VIADUTO", "PONTE", "TUNEL", "CALCADA", "SEMAFORO")),
]

# Circunstância (DESCR_CONDUTA): só faz sentido em roubos/furtos; a fonte grafa o
# mesmo valor de vários jeitos (maiúsculas, espaços) — casar pelo valor normalizado.
CONDUTAS = ["Não especificada", "Veículo", "Transeunte", "Interior de veículo",
            "Fios e cabos", "Residência", "Estab. comercial", "Transporte coletivo",
            "Carga", "Banco/caixa eletrônico", "App de mobilidade"]
CONDUTA_IDX = {
    "VEICULO": 1, "TRANSEUNTE": 2, "INTERIOR DE VEICULO": 3,
    "FIOS E CABOS": 4, "DERIVACAO CLANDESTINA": 4,
    "RESIDENCIA": 5, "CONDOMINIO RESIDENCIAL": 5,
    "ESTABELECIMENTO COMERCIAL": 6, "INTERIOR ESTABELECIMENTO": 6,
    "ESTABELECIMENTO-OUTROS": 6, "ESTABELECIMENTO ENSINO": 6, "CONDOMINIO COMERCIAL": 6,
    "INTERIOR TRANSPORTE COLETIVO": 7, "COLETIVO": 7,
    "CARGA": 8,
    "CAIXA ELETRONICO": 9, "SAIDINHA DE BANCO": 9, "ESTABELECIMENTO BANCARIO": 9,
    "ESTABELECIMENTO BANCARIO (ROUBO/FURTO A BANCO)": 9,
    "APLICATIVO DE MOBILIDADE URBANA": 10,
}

PERIODO_TXT = {"De madrugada": 0, "Pela manhã": 1, "A tarde": 2, "A noite": 3}


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", str(s)) if not unicodedata.combining(c))
    return " ".join(s.upper().split())


def classificar_local(v) -> int:
    if pd.isna(v) or v == "NULL":
        return 8
    s = norm(v)
    e = LOCAL_EXATO.get(s)
    if e is not None:
        return e
    for idx, chaves in LOCAL_REGRAS:
        if any(k in s for k in chaves):
            return idx
    return 7


def classificar_conduta(v) -> int:
    if pd.isna(v) or v == "NULL":
        return 0
    return CONDUTA_IDX.get(norm(v), 0)


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
            "NATUREZA_APURADA", "DESCR_CONDUTA", "DESCR_SUBTIPOLOCAL", "id_subprefeitura",
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
        "local": df["DESCR_SUBTIPOLOCAL"].map(classificar_local),
        "conduta": df["DESCR_CONDUTA"].map(classificar_conduta),
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
        "cobertura_local": round(float((out["local"] < 7).mean()), 3),
        "cobertura_conduta": round(float((out["conduta"] > 0).mean()), 3),
    }
    (WEB / "painel_meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    tam = (WEB / "painel.bin").stat().st_size
    print(f"painel.bin: {tam/1e6:.1f} MB ({len(out):,} linhas × {len(COLUNAS_BIN)} col) | "
          f"hora conhecida em {meta['cobertura_hora']:.0%} | local classificado em "
          f"{meta['cobertura_local']:.0%} | conduta específica em {meta['cobertura_conduta']:.0%}")


if __name__ == "__main__":
    main()

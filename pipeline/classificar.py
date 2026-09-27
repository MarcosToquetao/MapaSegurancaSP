"""
Regras de classificação compartilhadas (02_clean, 07_painel): local do crime
(DESCR_SUBTIPOLOCAL) e circunstância (DESCR_CONDUTA). A fonte grafa o mesmo valor
de vários jeitos entre anos — tudo casa pela forma normalizada (norm()).
"""
import unicodedata

import pandas as pd

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


LOCAL_RESIDENCIA = 1
CONDUTAS_RESIDENCIA = {"RESIDENCIA", "CONDOMINIO RESIDENCIAL"}


def eh_residencia(conduta, subtipolocal) -> bool:
    """Roubo/furto em residência: circunstância OU local de moradia."""
    if pd.notna(conduta) and norm(conduta) in CONDUTAS_RESIDENCIA:
        return True
    return classificar_local(subtipolocal) == LOCAL_RESIDENCIA


if __name__ == "__main__":
    assert eh_residencia("Residência", None)
    assert eh_residencia("Outros", "GARAGEM OU ABRIGO DE RESIDÊNCIA")
    assert eh_residencia("NULL", "Apartamento")
    assert not eh_residencia("Transeunte", "Via Pública")
    assert not eh_residencia("Outros", "De frente a residência da vítima")  # é via pública
    assert not eh_residencia(None, "Casa de show/espetáculo")  # lazer antes de casa
    print("ok")

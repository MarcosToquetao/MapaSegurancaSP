"""
Fase 1 — Aquisição dos microdados criminais da SSP-SP.

Baixa SPDadosCriminais_{ANO}.xlsx (validado em 2026-07-02; ver docs/DICIONARIO.md).
Idempotente: pula arquivos já baixados com tamanho igual ao remoto (os anos correntes
mudam mensalmente, então o tamanho remoto diferente força re-download).

Uso:
    python pipeline/01_download.py            # todos os anos disponíveis (2022-2026)
    python pipeline/01_download.py 2024 2025  # anos específicos
"""
import sys
import time
from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
BASES = {
    # base principal de ocorrências (microdados por BO)
    "SPDadosCriminais": "https://www.ssp.sp.gov.br/assets/estatistica/transparencia/spDados/SPDadosCriminais_{ano}.xlsx",
    # celulares subtraídos (todos os BOs com >=1 celular levado; existe desde 2017)
    # endpoint descoberto via manifesto assets/estatistica/transparencia/baseDadosCelVeiEObjSub.json
    "CelularesSubtraidos": "https://www.ssp.sp.gov.br/assets/estatistica/transparencia/baseDados/celularesSub/CelularesSubtraidos_{ano}.xlsx",
}
# arquivos únicos (sem parâmetro de ano)
BASES_UNICAS = {
    # vítimas de violência doméstica (nível vítima, 2024+; alimenta o painel Mulheres)
    # manifesto: assets/estatistica/vitimas-violencia-domestica/vitimas.json
    "ViolenciaDomestica_Base":
        "https://www.ssp.sp.gov.br/assets/estatistica/vitimas-violencia-domestica/"
        "Base_Viol%C3%AAncia%20contra%20mulher.xlsx",
}
ANOS_DISPONIVEIS = [2022, 2023, 2024, 2025, 2026]
CHUNK = 1 << 20  # 1 MB


def baixar(nome: str, url: str, tentativas: int = 8) -> None:
    destino = RAW_DIR / f"{nome}.xlsx"
    tmp = destino.with_suffix(".part")

    tamanho_remoto = 0
    for tentativa in range(1, tentativas + 1):
        try:
            head = requests.head(url, timeout=60)
            head.raise_for_status()
            tamanho_remoto = int(head.headers.get("Content-Length", 0))
            break
        except requests.exceptions.RequestException as e:
            print(f"[{nome}] HEAD falhou ({type(e).__name__}); "
                  f"nova tentativa em {10 * tentativa}s", flush=True)
            time.sleep(10 * tentativa)
    else:
        raise RuntimeError(f"[{nome}] HEAD falhou após {tentativas} tentativas")

    if destino.exists() and destino.stat().st_size == tamanho_remoto:
        print(f"[{nome}] ok (já baixado, {tamanho_remoto/1e6:.0f} MB)", flush=True)
        return

    print(f"[{nome}] baixando {tamanho_remoto/1e6:.0f} MB ...", flush=True)
    for tentativa in range(1, tentativas + 1):
        ja_tem = tmp.stat().st_size if tmp.exists() else 0
        if ja_tem >= tamanho_remoto:
            break
        headers = {"Range": f"bytes={ja_tem}-"} if ja_tem else {}
        try:
            with requests.get(url, stream=True, timeout=(30, 120), headers=headers) as r:
                r.raise_for_status()
                modo = "ab" if ja_tem and r.status_code == 206 else "wb"
                with open(tmp, modo) as f:
                    for chunk in r.iter_content(CHUNK):
                        f.write(chunk)
            break
        except (requests.exceptions.RequestException, OSError) as e:
            pct = tmp.stat().st_size / tamanho_remoto * 100 if tmp.exists() else 0
            print(f"[{nome}] queda na tentativa {tentativa} ({pct:.0f}% baixado): "
                  f"{type(e).__name__}; retomando em {10 * tentativa}s", flush=True)
            time.sleep(10 * tentativa)
    else:
        raise RuntimeError(f"[{nome}] falhou após {tentativas} tentativas")

    if tmp.stat().st_size != tamanho_remoto:
        raise RuntimeError(f"[{nome}] tamanho final inesperado: {tmp.stat().st_size} != {tamanho_remoto}")
    tmp.replace(destino)
    print(f"[{nome}] concluído -> {destino.name}", flush=True)


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    anos = [int(a) for a in sys.argv[1:]] or ANOS_DISPONIVEIS
    for base, url in BASES.items():
        for ano in anos:
            baixar(f"{base}_{ano}", url.format(ano=ano))
    for nome, url in BASES_UNICAS.items():
        baixar(nome, url)


if __name__ == "__main__":
    main()

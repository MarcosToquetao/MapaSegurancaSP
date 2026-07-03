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
URL = "https://www.ssp.sp.gov.br/assets/estatistica/transparencia/spDados/SPDadosCriminais_{ano}.xlsx"
ANOS_DISPONIVEIS = [2022, 2023, 2024, 2025, 2026]
CHUNK = 1 << 20  # 1 MB


def baixar(ano: int, tentativas: int = 8) -> None:
    url = URL.format(ano=ano)
    destino = RAW_DIR / f"SPDadosCriminais_{ano}.xlsx"
    tmp = destino.with_suffix(".part")

    head = requests.head(url, timeout=60)
    head.raise_for_status()
    tamanho_remoto = int(head.headers.get("Content-Length", 0))

    if destino.exists() and destino.stat().st_size == tamanho_remoto:
        print(f"[{ano}] ok (já baixado, {tamanho_remoto/1e6:.0f} MB)", flush=True)
        return

    print(f"[{ano}] baixando {tamanho_remoto/1e6:.0f} MB ...", flush=True)
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
            print(f"[{ano}] queda na tentativa {tentativa} ({pct:.0f}% baixado): "
                  f"{type(e).__name__}; retomando em {10 * tentativa}s", flush=True)
            time.sleep(10 * tentativa)
    else:
        raise RuntimeError(f"[{ano}] falhou após {tentativas} tentativas")

    if tmp.stat().st_size != tamanho_remoto:
        raise RuntimeError(f"[{ano}] tamanho final inesperado: {tmp.stat().st_size} != {tamanho_remoto}")
    tmp.replace(destino)
    print(f"[{ano}] concluído -> {destino.name}", flush=True)


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    anos = [int(a) for a in sys.argv[1:]] or ANOS_DISPONIVEIS
    for ano in anos:
        baixar(ano)


if __name__ == "__main__":
    main()

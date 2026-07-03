# Dicionário de dados — SPDadosCriminais (validado com amostra real)

Validado em 2026-07-02 com `SPDadosCriminais_2025.xlsx` (195 MB, atualizado em 30/06/2026).

## Fonte e acesso

- URL direta (padrão estável, sem scraping):
  `https://www.ssp.sp.gov.br/assets/estatistica/transparencia/spDados/SPDadosCriminais_{ANO}.xlsx`
- **Cobertura disponível: 2022–2026** (2019–2021 → 404; histórico mais longo só via agregados).
- Atualização mensal (Last-Modified acompanha o mês corrente).
- Estrutura do xlsx: aba `CAMPOS_DA_TABELA_SPDADOS` (dicionário oficial embutido) + abas `JAN-JUN_{ANO}` e `JUL-DEZ_{ANO}`.

## Volumetria (1º semestre/2025)

- Estado: 585.427 registros ; **Capital: 234.461** (~470 mil/ano → ~2,3 mi em 2022–2026).
- **82% dos registros da capital têm LATITUDE/LONGITUDE** válidas.

## Colunas (30) — as que usaremos

| Coluna | Uso no projeto |
|---|---|
| `NOME_MUNICIPIO` | filtro `== 'S.PAULO'` (capital) |
| `NATUREZA_APURADA` | **classificação oficial auditada** → nossas 4 categorias (usar esta, não `RUBRICA`) |
| `RUBRICA` / `DESCR_CONDUTA` | subtipo/circunstância (ex.: Transeunte, Residência, Interior de Veículo) |
| `LATITUDE` / `LONGITUDE` | camada de pontos — **graus decimais limpos com ponto** (ex.: -23.5414, -46.6099) |
| `LOGRADOURO` / `NUMERO_LOGRADOURO` / `BAIRRO` | popup da ocorrência |
| `DATA_OCORRENCIA_BO` / `HORA_OCORRENCIA_BO` / `DESC_PERIODO` | filtros temporais; análise por hora/período |
| `MES_ESTATISTICA` / `ANO_ESTATISTICA` | agregação compatível com a estatística oficial |
| `DESCR_TIPOLOCAL` / `DESCR_SUBTIPOLOCAL` | contexto (via pública, mercado, transporte...) |
| `CD_IBGE` | join com IBGE/SEADE |

Nota: as colunas de circunscrição vêm com grafia `NOME_*_CIRCUNCRIÇÃO` (typo da fonte) — mapear no ETL.

### Variações de schema entre anos (tratadas via aliases no `02_clean.py`)

| 2022 | 2025+ |
|---|---|
| `CIDADE` | `NOME_MUNICIPIO` |
| `DESCR_PERIODO` | `DESC_PERIODO` |
| `DATA_COMUNICACAO_BO` | `DATA_REGISTRO` |
| — (ausente) | `DESCR_TIPOLOCAL` |

## Mapeamento NATUREZA_APURADA → categorias do MVP

Contagens = capital, 1º sem/2025.

| Categoria | NATUREZA_APURADA | n |
|---|---|---|
| **Violentos letais** | HOMICÍDIO DOLOSO (246) · LATROCÍNIO (21) · LESÃO CORPORAL SEGUIDA DE MORTE (26) | 293 |
| **Roubos** | ROUBO - OUTROS (50.338) · ROUBO DE VEÍCULO (5.241) · ROUBO DE CARGA (901) | 56.480 |
| **Furtos** | FURTO - OUTROS (123.683) · FURTO DE VEÍCULO (19.794) · FURTO DE CARGA (46) | 143.523 |
| **Violência de gênero** | ESTUPRO (400) · ESTUPRO DE VULNERÁVEL (1.082) | 1.482 |

Pendências de classificação:
- **Feminicídio**: verificar se aparece em `RUBRICA`/`DESCR_CONDUTA` dos homicídios dolosos.
- **Violência doméstica (lesão corporal)**: LESÃO CORPORAL DOLOSA (19.295) — checar recorte por conduta/rubrica (Maria da Penha).
- **Furto/roubo de celular**: NÃO isolável nesta base (`DESCR_CONDUTA` traz circunstância, não objeto).
  Usar "Transeunte" como proxy de crime de rua; procurar base específica de celulares no portal (item aberto).

## ⚠️ Regras de privacidade da fonte (impactam o design)

**Crimes sexuais vêm anonimizados**: `LOGRADOURO = "VEDAÇÃO DA DIVULGAÇÃO DOS DADOS RELATIVOS"`,
`LATITUDE/LONGITUDE = 0`, mas `BAIRRO` e delegacia preservados.
→ **Violência de gênero: só coroplético (distrito/bairro), sem camada de pontos.** Comunicar na UI e na metodologia.

## Limpeza necessária (validada na amostra)

1. Filtrar `NOME_MUNICIPIO == 'S.PAULO'`.
2. Coordenadas: descartar `0`/`NULL`/vazio para a camada de pontos (≈18%); validar bounding box da capital.
3. `'NULL'` literal (string) em vários campos → converter para NA.
4. Duplicatas: mesmo `NUM_BO` pode ter várias naturezas (linhas múltiplas) — decidir unidade de contagem
   (padrão SSP: contagem por natureza, não por BO).
5. Datas: `DATA_OCORRENCIA_BO` pode ser anterior ao ano do arquivo (registro tardio) — usar `MES/ANO_ESTATISTICA`
   para séries oficiais e data da ocorrência para análise horária.

# MapaSegurançaSP

Plataforma interativa e publicável que compila dados de **segurança pública da cidade de São Paulo**,
em duas escalas: visão geral por distrito/subprefeitura (coroplético) e **localização exata das
ocorrências** (nível de rua). Ferramenta cidadã + vitrine técnica.

> Premissa de design: *"existem ruas perigosas em bairros seguros"* — por isso o produto combina
> a leitura macro (mapa por região) com a leitura micro (pontos/heatmap de ocorrências).

## Status

🚧 Fase 0 — estruturação. Ver [docs/PLANO.md](docs/PLANO.md).

## Escopo do MVP

- **Cidade**: município de São Paulo (capital).
- **Crimes**: (1) violentos letais, (2) roubos, (3) furtos, (4) violência de gênero.
- **Escalas**: coroplético por distrito/subprefeitura **e** mapa de pontos por ocorrência.
- **Métricas**: números absolutos **e** taxa por 100 mil habitantes.
- **Idiomas**: PT / EN (i18n leve, padrão herdado do projeto BRIGHT).

## Stack

| Camada        | Tecnologia                                              |
|---------------|---------------------------------------------------------|
| Ingestão/ETL  | Python (`pandas`, `geopandas`, `requests`)              |
| Tiles de ponto| `tippecanoe` → **PMTiles** (servido estático)           |
| Front-end     | Vite + MapLibre GL JS + ECharts + i18n JSON             |
| Hospedagem    | GitHub Pages (tiles grandes: Cloudflare R2, se preciso) |
| Automação     | GitHub Actions (atualização mensal)                     |

## Estrutura do repositório

```
MapaSegurancaSP/
├── docs/            # plano, fontes de dados, dicionário, metodologia
├── data/
│   ├── raw/         # downloads brutos da SSP (não versionado)
│   ├── external/    # malhas geográficas, população (SEADE/IBGE/GeoSampa)
│   └── processed/   # artefatos gerados (JSON agregados, GeoJSON, PMTiles)
├── pipeline/        # scripts Python de ETL
└── web/             # front-end (Vite)
```

## Fontes de dados

Ver [docs/FONTES.md](docs/FONTES.md). Fonte primária: SSP-SP (microdados + agregados);
denominadores populacionais: SEADE/IBGE; malhas: GeoSampa.

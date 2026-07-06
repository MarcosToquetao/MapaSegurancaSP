# MapaSegurançaSP

Plataforma interativa e publicável que compila dados de **segurança pública da cidade de São Paulo**,
em duas escalas: visão geral por distrito/subprefeitura (coroplético) e **localização exata das
ocorrências** (nível de rua). Ferramenta cidadã + vitrine técnica.

> Premissa de design: *"existem ruas perigosas em bairros seguros"* — por isso o produto combina
> a leitura macro (mapa por região) com a leitura micro (pontos/heatmap de ocorrências).

## Status

🟢 **No ar**: https://marcostoquetao.github.io/MapaSegurancaSP/

MVP com dados de jan/2022 a mai/2026 (~2 milhões de ocorrências da capital).
Atualização automática mensal via GitHub Actions. Plano completo em [docs/PLANO.md](docs/PLANO.md).

## Escopo

- **Cidade**: município de São Paulo (capital), recorte pelo **local do fato**.
- **Crimes**: violentos letais, roubos, furtos, violência sexual e roubo/furto de celular
  (base dedicada da SSP), além do painel **Mulheres** (violência doméstica + feminicídios).
- **Escalas**: coroplético por distrito/subprefeitura **e** mapa de pontos por ocorrência.
- **Métricas**: números absolutos **e** taxa por 100 mil habitantes (Censo 2022).
- **5 abas**: Mapa, Painel (crossfilter), Séries, Horários e Mulheres.

## Stack

| Camada        | Tecnologia                                                        |
|---------------|-------------------------------------------------------------------|
| Ingestão/ETL  | Python (`pandas`, `geopandas`, `openpyxl`, `requests`)             |
| Tiles de ponto| **PMTiles** gerados em Python puro (`mapbox-vector-tile`+`pmtiles`)|
| Front-end     | Vite + MapLibre GL JS + ECharts (vanilla JS, sem framework)        |
| Hospedagem    | GitHub Pages — site 100% estático                                  |
| Automação     | GitHub Actions (deploy no push + atualização mensal dos dados)     |

## Como hospedar em outro servidor

O site é **100% estático** — todos os dados já processados estão versionados em
`web/public/data/`, então **não é preciso rodar o pipeline Python** para publicá-lo.
Basta Node.js 18+:

```bash
git clone https://github.com/MarcosToquetao/MapaSegurancaSP.git
cd MapaSegurancaSP/web
npm install
npm run build
# publique o conteúdo de web/dist/ como arquivos estáticos
```

A pasta `web/dist/` (~35 MB) funciona em **qualquer domínio ou subpasta** sem
configuração (caminhos relativos, `base: "./"`), em qualquer servidor de arquivos
estáticos — nginx, Apache, Pages, S3 etc. Nenhum back-end é necessário.

> Observação: uma cópia estática fica congelada na data do build. Os dados deste
> repositório são atualizados automaticamente todo mês (dia 5); para manter uma
> cópia externa em dia, basta repetir o build a partir do repo atualizado.

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

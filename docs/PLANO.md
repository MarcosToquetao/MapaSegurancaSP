# Plano de execução — MapaSegurançaSP

Documento vivo. Decisões tomadas na fase de planejamento (2026-07-02) com base nas respostas do Marcos:
ferramenta cidadã + vitrine técnica; duas escalas (região **e** rua); 4 categorias de crime; site estático em GitHub Pages.

## Decisões de arquitetura

1. **Duas escalas no mesmo mapa (troca por zoom).**
   - Zoom afastado → **coroplético** por distrito (96) / subprefeitura (32).
   - Zoom aproximado → **camada de pontos/heatmap** de ocorrências individuais.
2. **Pontos via PMTiles.** Centenas de milhares de ocorrências/ano não podem virar GeoJSON no navegador.
   Gera-se PMTiles com `tippecanoe`; MapLibre lê por *range requests* — um arquivo, hospedagem estática, escala para milhões.
3. **Agregados como JSON pré-calculados.** Séries temporais, rankings e KPIs saem de JSONs leves por indicador —
   nada de processar microdado no cliente.
4. **Taxas por 100k** exigem denominador populacional por distrito (SEADE). Sem isso, comparação entre bairros engana.

## Fases

### Fase 0 — Setup (em andamento)
- [x] Estrutura do repositório, README, docs de plano e fontes.
- [ ] `git init` + repositório remoto (GitHub).
- [ ] Ambiente Python (`requirements.txt`) e projeto Vite.

### Fase 1 — Aquisição de dados
- [x] **Validar schema com amostra real** ✅ (2026-07-02) — ver `docs/DICIONARIO.md`. Resultado:
      URL direta estável por ano (2022–2026), coordenadas em graus decimais limpos (82% de cobertura na capital),
      `NATUREZA_APURADA` auditada mapeia direto nas 4 categorias, crimes sexuais anonimizados por lei
      (violência de gênero → só coroplético, sem pontos).
- [ ] Script `pipeline/01_download.py`: baixar `SPDadosCriminais_{2022..2026}.xlsx` (um por ano, ~80–200 MB cada).
- [ ] Baixar malhas GeoSampa (distritos, subprefeituras) e população SEADE.
- [ ] Item aberto: base específica de celulares subtraídos (não achada no padrão de URL novo).

### Fase 2 — Tratamento
- [ ] `pipeline/02_clean.py`: filtrar município = São Paulo; corrigir encoding de lat/long;
      padronizar `RUBRICA` → 4 categorias; tratar datas/horas; remover coordenadas inválidas/nulas.
- [ ] `pipeline/03_geo.py`: *spatial join* ocorrência → distrito (GeoSampa); marcar registros sem geo.
- [ ] Calcular denominadores e taxas por 100k por distrito/ano.

### Fase 3 — Geração de artefatos
- [ ] Agregados → `data/processed/agg_*.json` (por categoria × distrito × mês, absoluto e taxa).
- [ ] Pontos → GeoJSON por categoria → `tippecanoe` → `*.pmtiles`.
- [ ] Malhas simplificadas → GeoJSON leve para o coroplético.

### Fase 4 — Front-end
- [ ] Scaffold Vite + MapLibre + ECharts + i18n.
- [ ] Mapa dual-escala (coroplético ↔ pontos por zoom).
- [ ] Painel de controle: categoria, subtipo, período, métrica (absoluto/taxa).
- [ ] Popups (distrito e ocorrência), série temporal, ranking top-N, cards de KPI com variação %.
- [ ] Toggle PT/EN.

### Fase 5 — Metodologia + estética
- [ ] Página "Sobre / Metodologia" com ressalvas de dados (crucial para credibilidade).
- [ ] Refino visual (aplicar skill de frontend-design; identidade própria, não template).

### Fase 6 — Deploy e automação
- [ ] Deploy GitHub Pages (avaliar Cloudflare R2 para PMTiles > 100 MB).
- [ ] GitHub Action mensal: re-baixa, reprocessa, republica.

## Riscos / pontos de atenção

- **Limites do GitHub Pages**: arquivo ≤ 100 MB, repo ≤ 1 GB. PMTiles grandes → Cloudflare R2 (free tier).
- **Volume**: furto/roubo têm alto volume; considerar recorte temporal inicial (ex.: últimos 3–5 anos) no MVP.
- **Mudança de portal SSP (2025)**: confirmar mecanismo de download atual na Fase 1.

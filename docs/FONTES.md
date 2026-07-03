# Fontes de dados

## 1. SSP-SP — Secretaria da Segurança Pública (fonte primária)

- Portal de estatística: https://www.ssp.sp.gov.br/estatistica/
- Dados mensais: https://www.ssp.sp.gov.br/estatistica/dados-mensais
- Painel estatístico: https://www.ssp.sp.gov.br/estatistica/painel-estatistico
- Plano de Dados Abertos (PDA, publicado em maio/2025): http://www.ssp.sp.gov.br/assets/download/Dados_Abertos.pdf

Dois níveis de dado:

- **Agregado** (município × mês × tipo de crime): robusto e estável → base do coroplético e das séries temporais.
- **Microdado de ocorrências** (nível de Boletim de Ocorrência): inclui `LOGRADOURO`, `NUMERO`,
  `LATITUDE`, `LONGITUDE`, `DATA`, `HORA`, `RUBRICA`, `DESCR_TIPO_LOCAL` → base da camada de pontos.

### Download direto (validado em 2026-07-02)

`https://www.ssp.sp.gov.br/assets/estatistica/transparencia/spDados/SPDadosCriminais_{ANO}.xlsx`
— anos 2022–2026, atualização mensal. Schema completo em [DICIONARIO.md](DICIONARIO.md).

### ⚠️ Ressalvas de qualidade (comunicar na página de Metodologia)

- **Coordenadas**: no arquivo atual vêm **limpas** (graus decimais com ponto) — a ressalva antiga de
  separador omitido valia para bases da PMSP, não desta. ~18% dos registros da capital vêm sem coordenada
  (lat/long = 0 ou vazio) e ficam fora da camada de pontos.
- **Crimes sexuais anonimizados por lei**: sem logradouro/coordenada (bairro preservado) →
  violência de gênero não entra no mapa de pontos.
- **Geocodificação imprecisa**: parte das ocorrências cai no centroide da quadra/logradouro,
  não no ponto exato — deixar explícito ao usuário.
- **Local do fato vs. local do registro**: nem sempre coincidem.
- **Subnotificação**: sobretudo em furtos e violência de gênero.
- **Contagem**: um BO pode gerar múltiplas linhas (uma por natureza) — seguir o padrão SSP (contagem por natureza).

## 2. Base dos Dados (espelho / alternativa)

- Dataset: https://basedosdados.org/dataset/dbd717cb-7da8-4efd-9162-951a71694541
- Tabela: `basedosdados.br_sp_gov_ssp.ocorrencias_registradas` (agregada; verificar cobertura — parte do
  espelho vai até ~2021). Útil como fallback estável para agregados históricos.

## 3. Denominadores populacionais — taxas por 100k

- **SEADE** (Fundação Sistema Estadual de Análise de Dados): população por distrito/município.
  - Repositório: https://repositorio.seade.gov.br/
- **IBGE**: Censo 2022 e estimativas anuais (fallback/validação).

## 4. Malhas geográficas

- **GeoSampa** (Prefeitura de SP): distritos, subprefeituras, logradouros — https://geosampa.prefeitura.sp.gov.br/
- **IBGE malhas**: fallback de setores/municipais.

## 5. Opcional (expansão pós-MVP)

- **Fogo Cruzado**: API aberta de disparos de arma de fogo na Região Metropolitana — https://fogocruzado.org.br/

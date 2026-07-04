// Estado compartilhado entre as abas + pub/sub mínimo.
export const ROTULOS = {
  celular: "Celulares",
  letais: "Violentos letais",
  roubos: "Roubos",
  furtos: "Furtos",
  genero: "Violência de gênero",
};
// paleta preto/vermelho/branco: categorias diferenciadas por temperatura
// dentro do sistema tricolor (vermelho vivo, vinho, prata, branco)
export const CORES = {
  celular: "#ff3b30",
  letais: "#e8112d",
  roubos: "#a41220",
  furtos: "#9aa5b1",
  genero: "#f5f6f8",
};

// ordem de exibição dos chips (celular primeiro: é o crime que mais
// afeta o cotidiano paulistano hoje)
export const ORDEM_CHIPS = ["celular", "roubos", "furtos", "letais", "genero"];

// Seleção natureza-first: cada chip aponta o recorte exato (categoria + natureza).
// Atenção à sobreposição: "Outros roubos/furtos" da base principal INCLUEM os
// celulares (a SSP não os separa lá) — por isso os chips nunca são somados entre si.
export const GRUPOS = [
  { id: "celular-roubo", rotulo: "Roubo de celular", cat: "celular", nat: "ROUBO DE CELULAR", cor: "#ff3b30" },
  { id: "celular-furto", rotulo: "Furto de celular", cat: "celular", nat: "FURTO DE CELULAR", cor: "#ff8d85" },
  { id: "veiculo-roubo", rotulo: "Roubo de veículo", cat: "roubos", nat: "ROUBO DE VEÍCULO", cor: "#d3404d" },
  { id: "veiculo-furto", rotulo: "Furto de veículo", cat: "furtos", nat: "FURTO DE VEÍCULO", cor: "#6b737d" },
  { id: "roubo-outros", rotulo: "Outros roubos", cat: "roubos", nat: "ROUBO - OUTROS", cor: "#a41220" },
  { id: "furto-outros", rotulo: "Outros furtos", cat: "furtos", nat: "FURTO - OUTROS", cor: "#9aa5b1" },
  { id: "letais", rotulo: "Violentos letais", cat: "letais", nat: null, cor: "#e8112d" },
  { id: "genero", rotulo: "Violência sexual", cat: "genero", nat: null, cor: "#f5f6f8" },
];
export const grupoAtivo = () => GRUPOS.find((g) => g.id === estado.grupo);

export const PERIODOS_DIA = ["madrugada", "manhã", "tarde", "noite"]; // índices 0-3

export const estado = {
  grupo: "celular-roubo",
  categoria: "celular",
  natureza: "ROUBO DE CELULAR",
  ano: null,        // definido no boot (último ano disponível)
  mes: null,        // null = ano inteiro; "01".."12"
  periodoDia: null, // null = qualquer horário; 0-3 (só afeta a camada de pontos)
  metrica: "taxa",  // taxa | absoluto
};

const ouvintes = new Set();
export const aoMudar = (fn) => ouvintes.add(fn);
export function mudar(parcial) {
  Object.assign(estado, parcial);
  ouvintes.forEach((fn) => fn(estado));
}

// dados globais carregados uma vez
export const dados = { agg: null, distritos: null, pontosMeta: null };

// ---- seletores derivados ----
export const anosDisponiveis = () =>
  [...new Set(dados.agg.meses.map((m) => m.slice(0, 4)))].sort();

/** índices (no vetor global de meses) do período selecionado */
export function indicesPeriodo() {
  const prefixo = estado.mes ? `${estado.ano}-${estado.mes}` : estado.ano;
  return dados.agg.meses
    .map((m, i) => [m, i])
    .filter(([m]) => m.startsWith(prefixo))
    .map(([, i]) => i);
}

export const somaPeriodo = (serie, idx = indicesPeriodo()) =>
  serie ? idx.reduce((s, i) => s + serie[i], 0) : 0;

/** série da cidade respeitando categoria/natureza selecionadas */
export function serieCidade() {
  const c = dados.agg.cidade;
  return estado.natureza ? c.por_natureza[estado.natureza] : c.por_categoria[estado.categoria];
}

/** soma vetores de horário (24/168/4 posições) das naturezas de um grupo */
export function vetorHorarioDoGrupo(fonte, grupo, tam) {
  const nats = grupo.nat ? [grupo.nat] : dados.agg.naturezas[grupo.cat] ?? [];
  const out = new Array(tam).fill(0);
  for (const n of nats) {
    const v = fonte[n];
    if (v) for (let i = 0; i < tam; i++) out[i] += v[i];
  }
  return out;
}

/** contagem por distrito no período (respeita natureza) */
export function contagemPorDistrito() {
  const idx = indicesPeriodo();
  const out = {};
  for (const [cd, d] of Object.entries(dados.agg.distritos)) {
    const serie = estado.natureza ? d.nat[estado.natureza] : d.cat[estado.categoria];
    if (serie) out[cd] = somaPeriodo(serie, idx);
  }
  return out;
}

export function taxa100k(n, pop, idx = indicesPeriodo()) {
  if (!pop) return null;
  // anualiza períodos parciais para taxas comparáveis entre ano cheio e mês
  const fator = 12 / idx.length;
  return (n * fator / pop) * 100000;
}

export const fmt = new Intl.NumberFormat("pt-BR");
export const fmt1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

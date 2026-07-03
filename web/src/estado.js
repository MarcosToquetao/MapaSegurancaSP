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

export const estado = {
  categoria: "celular",
  natureza: null,   // null = todas as naturezas da categoria
  ano: null,        // definido no boot (último ano disponível)
  mes: null,        // null = ano inteiro; "01".."12"
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

// Estado compartilhado entre as seções + pub/sub mínimo + estado na URL.

// Seletor em dois níveis: O QUÊ (tipo) × COMO (roubo = com ameaça, furto = sem).
// Tipos sem "como" (agressão, mortes) ignoram o modo.
export const TIPOS = [
  { id: "celular", rotulo: "Celular" },
  { id: "casa", rotulo: "Casa" },
  { id: "veiculo", rotulo: "Veículo" },
  { id: "todos", rotulo: "Todos" },
  { id: "agressao", rotulo: "Agressão", semModo: true },
  { id: "letais", rotulo: "Mortes violentas", semModo: true },
];
export const MODOS = [
  { id: "roubo", rotulo: "Roubo", dica: "com ameaça" },
  { id: "furto", rotulo: "Furto", dica: "sem ameaça" },
];

// Cada grupo aponta o recorte exato nos dados:
//   cat/nat → séries do agg.json (nat null = categoria inteira)
//   pNat/res → filtro da camada de pontos (natureza real + flag residência)
// Atenção à sobreposição: "Todos" contém celular e casa — nunca somar grupos.
export const GRUPOS = [
  { id: "celular-roubo", rotulo: "Roubo de celular", cat: "celular", nat: "ROUBO DE CELULAR" },
  { id: "celular-furto", rotulo: "Furto de celular", cat: "celular", nat: "FURTO DE CELULAR" },
  { id: "casa-roubo", rotulo: "Roubo em residência", cat: "roubos", nat: "ROUBO EM RESIDÊNCIA", pNat: "ROUBO - OUTROS", res: 1 },
  { id: "casa-furto", rotulo: "Furto em residência", cat: "furtos", nat: "FURTO EM RESIDÊNCIA", pNat: "FURTO - OUTROS", res: 1 },
  { id: "veiculo-roubo", rotulo: "Roubo de veículo", cat: "roubos", nat: "ROUBO DE VEÍCULO" },
  { id: "veiculo-furto", rotulo: "Furto de veículo", cat: "furtos", nat: "FURTO DE VEÍCULO" },
  { id: "todos-roubo", rotulo: "Todos os roubos", cat: "roubos", nat: null },
  { id: "todos-furto", rotulo: "Todos os furtos", cat: "furtos", nat: null },
  { id: "agressao", rotulo: "Agressão", cat: "agressao", nat: null },
  { id: "letais", rotulo: "Mortes violentas", cat: "letais", nat: null },
];
export const idGrupo = (tipo, modo) =>
  TIPOS.find((t) => t.id === tipo)?.semModo ? tipo : `${tipo}-${modo}`;
export const grupoAtivo = () => GRUPOS.find((g) => g.id === idGrupo(estado.tipo, estado.modo));

// rampa de intensidade (concreto → vinho): coroplético, heatmap e mapas de calor
export const RAMPA = ["#FBE8A6", "#F4B454", "#E0702F", "#B8341F", "#6E1414"];
export const PLACA = "#1C4A94";

export const PERIODOS_DIA = ["madrugada", "manhã", "tarde", "noite"]; // índices 0-3

export const estado = {
  aba: "mapa",
  tipo: "celular",
  modo: "roubo",
  ano: null,        // definido no boot (último ano disponível)
  mes: null,        // null = ano inteiro; "01".."12"
  periodoDia: null, // null = qualquer horário; 0-3 (só afeta a camada de pontos)
  metrica: "taxa",  // taxa | absoluto
  distrito: null,   // cd_distrito em foco na ficha do lugar
};

const ouvintes = new Set();
export const aoMudar = (fn) => ouvintes.add(fn);
export function mudar(parcial) {
  Object.assign(estado, parcial);
  escreverURL();
  ouvintes.forEach((fn) => fn(estado));
}

/* ---- estado na URL (#mapa?g=casa-furto&a=2026...) — link compartilhável ---- */
const CHAVES = { t: "tipo", c: "modo", a: "ano", m: "mes", p: "periodoDia", x: "metrica", d: "distrito" };
export function lerURL() {
  const [aba, qs] = location.hash.slice(1).split("?");
  if (["mapa", "explorar", "tendencias", "mulheres"].includes(aba)) estado.aba = aba;
  for (const [k, v] of new URLSearchParams(qs ?? "")) {
    const campo = CHAVES[k];
    if (!campo || v === "") continue;
    estado[campo] = campo === "periodoDia" ? +v : v;
  }
  if (!TIPOS.some((t) => t.id === estado.tipo)) estado.tipo = "celular";
  if (!MODOS.some((m) => m.id === estado.modo)) estado.modo = "roubo";
}
export function escreverURL() {
  const qs = new URLSearchParams();
  for (const [k, campo] of Object.entries(CHAVES)) {
    if (estado[campo] != null) qs.set(k, estado[campo]);
  }
  history.replaceState(null, "", `#${estado.aba}?${qs}`);
}

// dados globais carregados uma vez (mulheresSerieMensal/feminicidioSerieMensal
// são carregados sob demanda pela aba Tendências: dict "YYYY-MM" -> contagem)
export const dados = {
  agg: null, distritos: null, pontosMeta: null,
  mulheresSerieMensal: null, feminicidioSerieMensal: null,
};

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

/** mesmos meses do ano anterior (para variação justa com ano incompleto) */
export function indicesAnoAnterior(idx = indicesPeriodo()) {
  const anoAnt = String(+estado.ano - 1);
  const meses = new Set(idx.map((i) => dados.agg.meses[i].slice(5)));
  return dados.agg.meses
    .map((m, i) => [m, i])
    .filter(([m]) => m.startsWith(anoAnt) && meses.has(m.slice(5)))
    .map(([, i]) => i);
}

export const somaPeriodo = (serie, idx = indicesPeriodo()) =>
  serie ? idx.reduce((s, i) => s + serie[i], 0) : 0;

/** série de um grupo: da cidade (sem cd) ou de um distrito */
export function serieGrupo(g = grupoAtivo(), cd = null) {
  const fonte = cd ? dados.agg.distritos[cd] : null;
  if (cd) return (g.nat ? fonte?.nat[g.nat] : fonte?.cat[g.cat]) ?? null;
  const c = dados.agg.cidade;
  return g.nat ? c.por_natureza[g.nat] : c.por_categoria[g.cat];
}
export const serieCidade = () => serieGrupo();

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

/** contagem por distrito no período (respeita o grupo) */
export function contagemPorDistrito(g = grupoAtivo(), idx = indicesPeriodo()) {
  const out = {};
  for (const cd of Object.keys(dados.agg.distritos)) {
    const serie = serieGrupo(g, cd);
    if (serie) out[cd] = somaPeriodo(serie, idx);
  }
  return out;
}

export function taxa100k(n, pop, idx = indicesPeriodo()) {
  if (!pop || !idx.length) return null;
  // anualiza períodos parciais para taxas comparáveis entre ano cheio e mês
  const fator = 12 / idx.length;
  return (n * fator / pop) * 100000;
}

export const fmt = new Intl.NumberFormat("pt-BR");
export const fmt1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloPeriodo = () => (estado.mes ? `${MESES[+estado.mes - 1]}/${estado.ano}` : estado.ano);
export const titulo = (s) => s ? s.toLowerCase().replace(/(^|[\s(])\S/g, (c) => c.toUpperCase()) : s;

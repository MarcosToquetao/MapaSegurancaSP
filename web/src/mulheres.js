// Aba MULHERES — painel dedicado à violência doméstica contra mulheres (capital, 2024+).
// Crossfilter real: o microdado anonimizado vem codificado em uint8 (mulheres.bin);
// todo gráfico é clicável e vira filtro; todo número recalcula na hora.
import * as echarts from "echarts";
import { fmt, fmt1 } from "./estado.js";
import { TEMA, COR, grafico, RAMPA_GRAVE_ROSA } from "./tema-grafico.js";

// paleta magenta sobre concreto claro (contraste AA no branco)
const ROSA = {
  vivo: "#9C1F55", claro: "#F2A7C0", medio: "#D94A7B",
  profundo: "#5A0B2E", texto: "#5A0B2E",
};
const APAGADO = "#EAE3E6";
const SEQ = [ROSA.vivo, ROSA.medio, ROSA.claro, ROSA.profundo, "#B9B7B0", "#8E8C85", "#6B6963", "#4B4A45"];

let META = null;
let COLS = {};          // dim -> Uint8Array
let NROWS = 0;
const filtros = new Map(); // dim -> Set(valores)
const graficos = new Map();
let ZONAS_GJ = null;
let CONTEXTO = null;    // série oficial (feminicídios) — outra fonte, fora do crossfilter

/* ------------------------------------------------ dados ------------------------------------------------ */
async function carregar() {
  const [meta, buf, zonas, contexto] = await Promise.all([
    fetch("data/mulheres_meta.json").then((r) => r.json()),
    fetch("data/mulheres.bin").then((r) => r.arrayBuffer()),
    fetch("data/zonas.geojson").then((r) => r.json()),
    fetch("data/mulheres_contexto.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  META = meta;
  NROWS = meta.nrows;
  ZONAS_GJ = zonas;
  CONTEXTO = contexto;
  meta.colunas.forEach((c, i) => {
    COLS[c] = new Uint8Array(buf, i * NROWS, NROWS);
  });
  echarts.registerMap("zonas-sp", zonas);
}

/** conta ocorrências por valor de `dim`, aplicando os filtros das demais dimensões */
function contar(dim) {
  const tam = dim === "hora" ? 25 : META.rotulos[dim].length; // hora: 0-23 + 24 (n/i)
  const out = new Array(tam).fill(0);
  const ativos = [...filtros.entries()].filter(([d, s]) => d !== dim && s.size);
  const col = COLS[dim];
  for (let i = 0; i < NROWS; i++) {
    let passa = true;
    for (const [d, s] of ativos) {
      if (!s.has(COLS[d][i])) { passa = false; break; }
    }
    if (passa) out[col[i]]++;
  }
  return out;
}

/** total sob todos os filtros */
function totalFiltrado() {
  const ativos = [...filtros.entries()].filter(([, s]) => s.size);
  if (!ativos.length) return NROWS;
  let n = 0;
  for (let i = 0; i < NROWS; i++) {
    let passa = true;
    for (const [d, s] of ativos) {
      if (!s.has(COLS[d][i])) { passa = false; break; }
    }
    if (passa) n++;
  }
  return n;
}

function alternarFiltro(dim, valor) {
  const s = filtros.get(dim) ?? new Set();
  s.has(valor) ? s.delete(valor) : s.add(valor);
  filtros.set(dim, s);
  render();
}

/* ------------------------------------------------ boot ------------------------------------------------ */
export async function initMulheres() {
  await carregar();
  window.__mulheres = { alternarFiltro, filtros, totalFiltrado, contar }; // depuração
  for (const id of ["w-zonas", "w-faixa", "w-relacao", "w-grupo", "w-local", "w-hora", "w-orientacao", "w-feminicidio"]) {
    graficos.set(id, grafico(echarts, document.getElementById(id)));
  }
  renderFeminicidio(); // estático: outra fonte, não reage aos filtros
  document.getElementById("w-cobertura").textContent =
    `Localização exata disponível em ${Math.round(META.cobertura_coord * 100)}% dos registros; ` +
    `no restante, a macrorregião vem da seccional de polícia responsável.`;
  document.getElementById("w-filtros-limpar").addEventListener("click", () => {
    filtros.clear();
    render();
  });
  render();
}

/* ------------------------------------------------ render ------------------------------------------------ */
function render() {
  renderChipsAtivos();
  renderHighlights();
  renderZonas();
  barra("w-faixa", "faixa", "Faixa etária da vítima");
  barra("w-relacao", "relacao", "Relação com o agressor", true);
  barra("w-grupo", "grupo", "Tipo de violência (Lei Maria da Penha)", true);
  barra("w-local", "local", "Onde acontece", true);
  renderHora();
  renderOrientacao();
}

function renderChipsAtivos() {
  const alvo = document.getElementById("w-filtros-ativos");
  const pares = [...filtros.entries()].flatMap(([d, s]) =>
    [...s].map((v) => ({ d, v, rotulo: META.rotulos[d][v] })));
  alvo.innerHTML = pares.length
    ? pares.map((p) => `<button data-d="${p.d}" data-v="${p.v}">${p.rotulo} ✕</button>`).join("")
    : "";
  alvo.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => alternarFiltro(b.dataset.d, +b.dataset.v)));
  document.getElementById("w-filtros-limpar").hidden = !pares.length;
}

function renderHighlights() {
  const total = totalFiltrado();
  const rel = contar("relacao");
  const grupo = contar("grupo");
  const faixa = contar("faixa");
  const somaRel = rel.reduce((a, b) => a + b, 0) || 1;
  const somaGrupo = grupo.reduce((a, b) => a + b, 0) || 1;

  const parceiro = rel[0] + rel[1] + rel[2]; // união estável + casamento + envolvimento amoroso
  const fisica = grupo[0];
  const iFaixaMax = faixa.slice(0, 8).indexOf(Math.max(...faixa.slice(0, 8)));

  const cards = [
    { v: fmt.format(total), r: "registros de vítimas" },
    { v: `${fmt1.format((parceiro / somaRel) * 100)}%`, r: "agredidas por parceiro ou ex" },
    { v: `${fmt1.format((fisica / somaGrupo) * 100)}%`, r: "violência física" },
    { v: META.rotulos.faixa[iFaixaMax] + " anos", r: "idade mais atingida" },
    { v: fmt.format(grupo[5]), r: "medidas protetivas descumpridas" },
  ];
  document.getElementById("w-highlights").innerHTML = cards.map((c) => `
    <div class="kpi"><div class="valor" style="color:${ROSA.vivo}">${c.v}</div>
      <div class="kpi-rotulo">${c.r}</div></div>`).join("");
}

function renderZonas() {
  const cont = contar("zona");
  const dadosMapa = ZONAS_GJ.features.map((f) => {
    const z = f.properties.zona;
    const taxa = (cont[z] / META.pop_zonas[z]) * 100000;
    return { name: f.properties.nome, value: +taxa.toFixed(1), n: cont[z], zona: z };
  });
  const vmax = Math.max(...dadosMapa.map((d) => d.value));
  const g = graficos.get("w-zonas");
  g.setOption({
    ...TEMA.base,
    tooltip: {
      ...TEMA.base.tooltip,
      formatter: (p) => `<b>Zona ${p.name}</b><br>${fmt1.format(p.value)} /100 mil hab.<br>${fmt.format(p.data?.n ?? 0)} registros`,
    },
    visualMap: {
      min: 0, max: vmax, orient: "vertical", right: 4, bottom: 8, itemHeight: 90,
      textStyle: { color: COR.texto3, fontSize: 10 }, text: ["mais", "menos"],
      // escuro = mais grave: rosa pálido (menos registros) → vinho profundo (mais)
      inRange: { color: RAMPA_GRAVE_ROSA },
    },
    series: [{
      type: "map", map: "zonas-sp", roam: false, nameProperty: "nome",
      label: { show: true, color: COR.texto, fontSize: 12, fontFamily: "Barlow Semi Condensed, sans-serif", fontWeight: 700,
        textBorderColor: "#fff", textBorderWidth: 2.5 },
      itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
      emphasis: { label: { color: COR.texto }, itemStyle: { areaColor: ROSA.claro } },
      select: { disabled: true },
      data: dadosMapa,
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => {
    const z = dadosMapa.find((d) => d.name === p.name)?.zona;
    if (z != null) alternarFiltro("zona", z);
  });
}

function barra(elId, dim, titulo, horizontal = false) {
  const cont = contar(dim);
  const rotulos = META.rotulos[dim];
  const selecao = filtros.get(dim) ?? new Set();
  // esconde o "n/i" quando vazio; mantém quando tem volume (transparência)
  const itens = rotulos.map((r, i) => ({ r, i, v: cont[i] }))
    .filter((x) => x.v > 0 || selecao.has(x.i));
  if (horizontal) itens.sort((a, b) => a.v - b.v);

  const g = graficos.get(elId);
  const eixoCat = {
    type: "category", data: itens.map((x) => x.r),
    axisLabel: { color: COR.texto, fontSize: 11, width: horizontal ? 150 : undefined, overflow: "truncate" },
    axisLine: { show: false }, axisTick: { show: false },
  };
  const eixoVal = { type: "value", ...TEMA.eixoY };
  g.setOption({
    ...TEMA.base,
    grid: { left: horizontal ? 8 : 40, right: horizontal ? 52 : 10, top: 8, bottom: horizontal ? 8 : 40, containLabel: horizontal },
    tooltip: { ...TEMA.base.tooltip, formatter: (p) => `${p.name}<br><b>${fmt.format(p.value)}</b>` },
    xAxis: horizontal ? eixoVal : { ...eixoCat, axisLabel: { ...eixoCat.axisLabel, rotate: dim === "faixa" ? 0 : 30 } },
    yAxis: horizontal ? eixoCat : eixoVal,
    series: [{
      type: "bar", data: itens.map((x) => ({
        value: x.v,
        itemStyle: {
          color: selecao.size && !selecao.has(x.i) ? APAGADO : ROSA.vivo,
          borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
        },
      })),
      barWidth: "62%",
      label: horizontal ? {
        show: true, position: "right", ...TEMA.rotulo, formatter: (p) => fmt.format(p.value),
      } : undefined,
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternarFiltro(dim, itens[p.dataIndex].i));
}

function renderHora() {
  const cont = contar("hora").slice(0, 24); // 24 = sem hora, fora do gráfico
  const g = graficos.get("w-hora");
  const selecao = filtros.get("hora") ?? new Set();
  g.setOption({
    ...TEMA.base,
    grid: { left: 42, right: 10, top: 10, bottom: 22 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis", formatter: (ps) => `${ps[0].axisValue}<br><b>${fmt.format(ps[0].value)}</b>` },
    xAxis: { type: "category", data: [...Array(24).keys()].map((h) => `${h}h`), ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series: [{
      type: "bar", barWidth: "70%",
      data: cont.map((v, h) => ({
        value: v,
        itemStyle: { color: selecao.size && !selecao.has(h) ? APAGADO : ROSA.vivo, borderRadius: [2, 2, 0, 0] },
      })),
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternarFiltro("hora", p.dataIndex));
}

// Feminicídios: a base de microdados não contém crimes letais — este gráfico usa a
// tabela agregada oficial da SSP (recorte capital) e por isso NÃO reage aos filtros.
function renderFeminicidio() {
  const el = document.getElementById("w-feminicidio");
  if (!CONTEXTO?.series?.feminicidio) {
    el.closest("article")?.setAttribute("hidden", "");
    return;
  }
  const anos = CONTEXTO.anos;
  const totais = anos.map((a) => {
    const s = CONTEXTO.series.feminicidio[a];
    return s ? s.reduce((x, y) => x + (y ?? 0), 0) : 0;
  });
  const anoAtual = anos[anos.length - 1];
  const g = graficos.get("w-feminicidio");
  g.setOption({
    ...TEMA.base,
    grid: { left: 36, right: 10, top: 16, bottom: 24 },
    tooltip: {
      ...TEMA.base.tooltip,
      formatter: (p) => `${p.name}${p.name === anoAtual ? " (parcial)" : ""}<br>` +
        `<b>${fmt.format(p.value)}</b> feminicídios na capital`,
    },
    xAxis: { type: "category", data: anos, ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series: [{
      type: "bar", barWidth: "58%",
      data: totais.map((v, i) => ({
        value: v,
        // ano corrente incompleto: barra apagada para não sugerir queda
        itemStyle: { color: i === anos.length - 1 ? ROSA.claro : ROSA.vivo, borderRadius: [3, 3, 0, 0] },
      })),
      label: {
        show: true, position: "top", ...TEMA.rotulo, color: ROSA.texto,
        formatter: (p) => p.dataIndex === anos.length - 1 ? `${p.value}*` : `${p.value}`,
      },
    }],
  }, true);
}

function renderOrientacao() {
  const cont = contar("orientacao");
  const rot = META.rotulos.orientacao;
  const selecao = filtros.get("orientacao") ?? new Set();
  const g = graficos.get("w-orientacao");
  g.setOption({
    ...TEMA.base,
    tooltip: { ...TEMA.base.tooltip, formatter: (p) => `${p.name}<br><b>${fmt.format(p.value)}</b> (${p.percent}%)` },
    series: [{
      type: "pie", radius: ["42%", "70%"],
      data: cont.map((v, i) => ({
        name: rot[i], value: v,
        itemStyle: { color: selecao.size && !selecao.has(i) ? APAGADO : SEQ[i % SEQ.length] },
      })).filter((d) => d.value > 0),
      label: { color: COR.texto2, fontSize: 11 },
      labelLine: { lineStyle: { color: "#CFCDC7" } },
      itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternarFiltro("orientacao", rot.indexOf(p.name)));
}

// Aba PAINEL — crossfilter sobre a base principal de ocorrências (2022–2026).
// Microdado codificado (painel.bin, uint8); todo gráfico é clicável e cruza com
// os demais. Mesma técnica do painel Mulheres, aqui na paleta padrão.
import * as echarts from "echarts";
import { fmt, fmt1 } from "./estado.js";
import { TEMA, grafico, rotuloMes } from "./tema-grafico.js";
import { criarCrossfilter } from "./crossfilter.js";

const ACENTO = "#e8112d";
const DIM = "#34373c";

let META = null;
let cf = null;
const COLS = {};
const graficos = new Map();
let anoAtivo = null; // null = todos os anos

// dims histogramadas a cada render
const SPECS = [
  { dim: "tipo", tam: 12 }, { dim: "zona", tam: 6 }, { dim: "hora", tam: 25 },
  { dim: "conduta", tam: 10 }, { dim: "local", tam: 8 },
];

export async function initPainel() {
  const [meta, buf] = await Promise.all([
    fetch("data/painel_meta.json").then((r) => r.json()),
    fetch("data/painel.bin").then((r) => r.arrayBuffer()),
  ]);
  META = meta;
  meta.colunas.forEach((c, i) => { COLS[c] = new Uint8Array(buf, i * meta.nrows, meta.nrows); });
  cf = criarCrossfilter(COLS, meta.nrows);
  window.__painel = { cf, render, alternar }; // depuração

  for (const id of ["p-tipo", "p-zona", "p-hora", "p-evolucao", "p-conduta", "p-local"])
    graficos.set(id, grafico(echarts, document.getElementById(id)));

  // anos como filtro rápido (single-select) sobre a dimensão mês
  const anos = [...new Set(meta.meses.map((m) => m.slice(0, 4)))].sort().reverse();
  const elAnos = document.getElementById("p-anos");
  elAnos.innerHTML = `<button data-ano="" class="ativo">todos os anos</button>` +
    anos.map((a) => `<button data-ano="${a}">${a}</button>`).join("");
  elAnos.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    elAnos.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
    anoAtivo = b.dataset.ano || null;
    const meses = anoAtivo
      ? meta.meses.map((m, i) => [m, i]).filter(([m]) => m.startsWith(anoAtivo)).map(([, i]) => i)
      : null;
    cf.definir("mes", meses);
    render();
  });

  document.getElementById("p-limpar").addEventListener("click", () => {
    cf.limpar(); anoAtivo = null;
    elAnos.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x.dataset.ano === ""));
    render();
  });

  document.getElementById("p-cobertura").textContent =
    `Base principal da SSP (não inclui a base separada de celulares, para não duplicar — ` +
    `roubos/furtos "outros" já os contêm). Hora do fato conhecida em ` +
    `${Math.round(meta.cobertura_hora * 100)}% dos registros; o gráfico de horário usa só esses. ` +
    `Taxas usam a população do Censo 2022 e são anualizadas.`;
  render();
}

/* ---- filtro clicável genérico ---- */
function alternar(dim, valor) { cf.alternar(dim, valor); render(); }

function render() {
  const { outs, total } = cf.histogramas(SPECS);
  const nMeses = anoAtivo
    ? META.meses.filter((m) => m.startsWith(anoAtivo)).length
    : META.meses.length;

  renderChipsAtivos();
  renderHighlights(outs, total, nMeses);
  barra("p-tipo", "tipo", outs.tipo, META.rotulos.tipo, { sort: true });
  renderZona(outs.zona, nMeses);
  renderHora(outs.hora);
  renderEvolucao();
  barra("p-conduta", "conduta", outs.conduta, META.rotulos.conduta, { sort: true });
  barra("p-local", "local", outs.local, META.rotulos.local, { sort: true });
  document.getElementById("p-evolucao-ctx").textContent = anoAtivo ? `· ${anoAtivo} destacado` : "";
}

function renderChipsAtivos() {
  const rotDim = { tipo: META.rotulos.tipo, zona: META.rotulos.zona, hora: null,
    conduta: META.rotulos.conduta, local: META.rotulos.local };
  const chips = [];
  for (const [dim, set] of cf.filtros) {
    if (dim === "mes") continue; // ano tem sua própria linha
    for (const v of set) {
      const rot = dim === "hora" ? `${v}h` : rotDim[dim]?.[v] ?? v;
      chips.push({ dim, v, rot });
    }
  }
  const alvo = document.getElementById("p-filtros-ativos");
  alvo.innerHTML = chips.length
    ? chips.map((c) => `<button data-d="${c.dim}" data-v="${c.v}">${c.rot} ✕</button>`).join("")
    : `<span class="p-sem-filtro">nenhum filtro — clique nos gráficos</span>`;
  alvo.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => alternar(b.dataset.d, +b.dataset.v)));
  document.getElementById("p-limpar").hidden = !chips.length && !anoAtivo;
}

function renderHighlights(outs, total, nMeses) {
  const iTipo = argmax(outs.tipo);
  const somaTipo = soma(outs.tipo) || 1;
  const noite = outs.hora.slice(18, 24).reduce((a, b) => a + b, 0);
  const comHora = outs.hora.slice(0, 24).reduce((a, b) => a + b, 0) || 1;
  const taxasZona = [0, 1, 2, 3, 4].map((z) => ({ z, t: (outs.zona[z] / (META.pop_zonas[z] || 1)) * 100000 }));
  const zTop = taxasZona.sort((a, b) => b.t - a.t)[0];

  const cards = [
    { v: fmt.format(total), r: "ocorrências no recorte atual", cor: ACENTO },
    { v: `${fmt1.format((outs.tipo[iTipo] / somaTipo) * 100)}%`, r: `são ${META.rotulos.tipo[iTipo].toLowerCase()}`, cor: "#ff5147" },
    { v: META.rotulos.zona[zTop.z], r: "região de maior taxa /100k", cor: "#f5f6f8" },
    { v: `${fmt1.format((noite / comHora) * 100)}%`, r: "acontecem à noite (18h–0h)", cor: "#c9d0d8" },
    { v: fmt.format(Math.round(total / nMeses)), r: "por mês, em média", cor: "#9aa5b1" },
  ];
  document.getElementById("p-highlights").innerHTML = cards.map((c) => `
    <div class="kpi" style="--cor-kpi:${c.cor}">
      <div class="valor" style="color:${c.cor}">${c.v}</div>
      <div class="kpi-rotulo">${c.r}</div>
    </div>`).join("");
}

/* ---- barras horizontais clicáveis (tipo, conduta, local) ---- */
function barra(elId, dim, cont, rotulos, { sort } = {}) {
  const sel = cf.filtros.get(dim);
  let itens = rotulos.map((r, i) => ({ r, i, v: cont[i] })).filter((x) => x.v > 0 || sel?.has(x.i));
  if (sort) itens.sort((a, b) => a.v - b.v);
  const g = graficos.get(elId);
  g.setOption({
    ...TEMA.base,
    grid: { left: 8, right: 44, top: 6, bottom: 6, containLabel: true },
    tooltip: { ...TEMA.base.tooltip, formatter: (p) => `${p.name}<br><b>${fmt.format(p.value)}</b>` },
    xAxis: { type: "value", ...TEMA.eixoX, splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: {
      type: "category", data: itens.map((x) => x.r),
      axisLabel: { color: "#c2c7ce", fontSize: 10.5, width: 150, overflow: "truncate" },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar", barWidth: "62%",
      data: itens.map((x) => ({ value: x.v, itemStyle: { color: sel && !sel.has(x.i) ? DIM : ACENTO, borderRadius: [0, 3, 3, 0] } })),
      label: { show: true, position: "right", color: "#8b9098", fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", formatter: (p) => fmt.format(p.value) },
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternar(dim, itens[p.dataIndex].i));
}

function renderZona(cont, nMeses) {
  const sel = cf.filtros.get("zona");
  const fator = 12 / nMeses;
  const itens = [0, 1, 2, 3, 4].map((z) => ({
    z, nome: META.rotulos.zona[z], n: cont[z],
    taxa: (cont[z] / (META.pop_zonas[z] || 1)) * 100000 * fator,
  })).sort((a, b) => a.taxa - b.taxa);
  const g = graficos.get("p-zona");
  g.setOption({
    ...TEMA.base,
    grid: { left: 8, right: 46, top: 6, bottom: 6, containLabel: true },
    tooltip: { ...TEMA.base.tooltip, formatter: (p) => { const it = itens[p.dataIndex]; return `<b>${it.nome}</b><br>${fmt1.format(it.taxa)}/100k/ano<br>${fmt.format(it.n)} ocorrências`; } },
    xAxis: { type: "value", ...TEMA.eixoX, splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: {
      type: "category", data: itens.map((x) => x.nome),
      axisLabel: { color: "#c2c7ce", fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: "bar", barWidth: "58%",
      data: itens.map((x) => ({ value: +x.taxa.toFixed(1), itemStyle: { color: sel && !sel.has(x.z) ? DIM : ACENTO, borderRadius: [0, 3, 3, 0] } })),
      label: { show: true, position: "right", color: "#8b9098", fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace" },
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternar("zona", itens[p.dataIndex].z));
}

function renderHora(cont) {
  const sel = cf.filtros.get("hora");
  const g = graficos.get("p-hora");
  g.setOption({
    ...TEMA.base,
    grid: { left: 42, right: 10, top: 10, bottom: 22 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis", formatter: (ps) => `${ps[0].axisValue}<br><b>${fmt.format(ps[0].value)}</b>` },
    xAxis: { type: "category", data: [...Array(24).keys()].map((h) => `${h}h`), ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series: [{
      type: "bar", barWidth: "70%",
      data: cont.slice(0, 24).map((v, h) => ({ value: v, itemStyle: { color: sel && !sel.has(h) ? DIM : ACENTO, borderRadius: [2, 2, 0, 0] } })),
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternar("hora", p.dataIndex));
}

// evolução mensal: timeline de contexto (não filtra); destaca o ano ativo
function renderEvolucao() {
  const { outs } = cf.histogramas([{ dim: "mes", tam: META.meses.length }]);
  const serie = outs.mes;
  const g = graficos.get("p-evolucao");
  g.setOption({
    ...TEMA.base,
    grid: { left: 52, right: 12, top: 12, bottom: 26 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis" },
    xAxis: { type: "category", data: META.meses.map(rotuloMes), ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series: [{
      type: "bar", data: serie, barWidth: "62%",
      itemStyle: {
        color: (p) => (anoAtivo && !META.meses[p.dataIndex].startsWith(anoAtivo)) ? DIM : ACENTO,
        borderRadius: [2, 2, 0, 0],
      },
    }],
  }, true);
}

const soma = (a) => a.reduce((x, y) => x + y, 0);
const argmax = (a) => a.reduce((best, v, i) => (v > a[best] ? i : best), 0);

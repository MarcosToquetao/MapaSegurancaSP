// Aba MULHERES — painel dedicado à violência doméstica contra mulheres (capital, 2024+).
// Crossfilter real: o microdado anonimizado vem codificado em uint8 (mulheres.bin);
// todo gráfico é clicável e vira filtro; todo número recalcula na hora.
import * as echarts from "echarts";
import { fmt, fmt1 } from "./estado.js";
import { TEMA, grafico } from "./tema-grafico.js";

// paleta rosa — extensão do tricolor (vermelho+branco), fundo segue preto
const ROSA = {
  vivo: "#ff5c8a", claro: "#ffa9c1", medio: "#e0447a",
  profundo: "#a82855", texto: "#ffd3e0",
};
const SEQ = [ROSA.vivo, ROSA.medio, ROSA.profundo, ROSA.claro, "#c9cdd4", "#8a8f98", "#6b6f77", "#54575e"];

let META = null;
let COLS = {};          // dim -> Uint8Array
let NROWS = 0;
const filtros = new Map(); // dim -> Set(valores)
const graficos = new Map();
let ZONAS_GJ = null;

/* ------------------------------------------------ dados ------------------------------------------------ */
async function carregar() {
  const [meta, buf, zonas] = await Promise.all([
    fetch("data/mulheres_meta.json").then((r) => r.json()),
    fetch("data/mulheres.bin").then((r) => r.arrayBuffer()),
    fetch("data/zonas.geojson").then((r) => r.json()),
  ]);
  META = meta;
  NROWS = meta.nrows;
  ZONAS_GJ = zonas;
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
  for (const id of ["w-zonas", "w-faixa", "w-relacao", "w-grupo", "w-local", "w-hora", "w-orientacao"]) {
    graficos.set(id, grafico(echarts, document.getElementById(id)));
  }
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
    : `<span class="w-sem-filtro">clique em qualquer barra, fatia ou zona para filtrar</span>`;
  alvo.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => alternarFiltro(b.dataset.d, +b.dataset.v)));
  document.getElementById("w-filtros-limpar").hidden = !pares.length;
}

function renderHighlights() {
  const total = totalFiltrado();
  const rel = contar("relacao");
  const grupo = contar("grupo");
  const fatal = contar("fatal");
  const faixa = contar("faixa");
  const somaRel = rel.reduce((a, b) => a + b, 0) || 1;
  const somaGrupo = grupo.reduce((a, b) => a + b, 0) || 1;

  const parceiro = rel[0] + rel[1] + rel[2]; // união estável + casamento + envolvimento amoroso
  const fisica = grupo[0];
  const psicoMoral = grupo[1] + grupo[2];
  const iFaixaMax = faixa.slice(0, 8).indexOf(Math.max(...faixa.slice(0, 8)));

  const cards = [
    { v: fmt.format(total), r: "registros de violência contra mulheres", cor: ROSA.vivo },
    { v: `${fmt1.format((parceiro / somaRel) * 100)}%`, r: "agressor era parceiro ou ex (união, casamento ou envolvimento amoroso)", cor: ROSA.medio },
    { v: `${fmt1.format((fisica / somaGrupo) * 100)}%`, r: "violência física", cor: ROSA.profundo },
    { v: `${fmt1.format((psicoMoral / somaGrupo) * 100)}%`, r: "violência psicológica ou moral (ameaça, perseguição, injúria...)", cor: ROSA.claro },
    { v: META.rotulos.faixa[iFaixaMax] + " anos", r: "faixa etária com mais registros", cor: ROSA.vivo },
    { v: fmt.format(fatal[1]), r: "vítimas fatais na seleção", cor: "#ffffff" },
  ];
  document.getElementById("w-highlights").innerHTML = cards.map((c) => `
    <div class="kpi" style="--cor-kpi:${c.cor}">
      <div class="valor" style="color:${c.cor}">${c.v}</div>
      <div class="kpi-rotulo">${c.r}</div>
    </div>`).join("");
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
      textStyle: { color: "#8a8f98", fontSize: 9 }, text: ["mais", "menos"],
      inRange: { color: ["#1c1518", "#5c2337", ROSA.profundo, ROSA.medio, ROSA.vivo] },
    },
    series: [{
      type: "map", map: "zonas-sp", roam: false, nameProperty: "nome",
      label: { show: true, color: "#fff", fontSize: 11, fontFamily: "Archivo, sans-serif" },
      itemStyle: { borderColor: "#0d0e10", borderWidth: 1.5 },
      emphasis: { label: { color: "#fff" }, itemStyle: { areaColor: ROSA.claro } },
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
    axisLabel: { color: "#c9cdd4", fontSize: 10, width: horizontal ? 150 : undefined, overflow: "truncate" },
    axisLine: { show: false }, axisTick: { show: false },
  };
  const eixoVal = { type: "value", ...TEMA.eixoY, splitLine: { lineStyle: { color: "#1f1a1c" } } };
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
          color: selecao.size && !selecao.has(x.i) ? "#3a3134" : ROSA.vivo,
          borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
        },
      })),
      barWidth: "62%",
      label: horizontal ? {
        show: true, position: "right", color: "#8a8f98", fontSize: 9.5,
        fontFamily: "IBM Plex Mono, monospace", formatter: (p) => fmt.format(p.value),
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
    yAxis: { type: "value", ...TEMA.eixoY, splitLine: { lineStyle: { color: "#1f1a1c" } } },
    series: [{
      type: "bar", barWidth: "70%",
      data: cont.map((v, h) => ({
        value: v,
        itemStyle: { color: selecao.size && !selecao.has(h) ? "#3a3134" : ROSA.medio, borderRadius: [2, 2, 0, 0] },
      })),
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternarFiltro("hora", p.dataIndex));
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
        itemStyle: { color: selecao.size && !selecao.has(i) ? "#3a3134" : SEQ[i % SEQ.length] },
      })).filter((d) => d.value > 0),
      label: { color: "#c9cdd4", fontSize: 10.5 },
      labelLine: { lineStyle: { color: "#3a3134" } },
      itemStyle: { borderColor: "#141012", borderWidth: 2 },
    }],
  }, true);
  g.off("click");
  g.on("click", (p) => alternarFiltro("orientacao", rot.indexOf(p.name)));
}

// Seção TENDÊNCIAS — séries mensais das principais naturezas + recortes.
import * as echarts from "echarts";
import { dados, fmt } from "./estado.js";
import { TEMA, COR, grafico, rotuloMes, mediaMovel } from "./tema-grafico.js";

async function carregarSeriesMulheres() {
  if (dados.mulheresSerieMensal && dados.feminicidioSerieMensal) return;
  const [meta, contexto] = await Promise.all([
    fetch("data/mulheres_meta.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("data/mulheres_contexto.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  dados.mulheresSerieMensal = meta?.serie_mensal ?? {};
  const flat = {};
  if (contexto?.series?.feminicidio) {
    for (const ano of contexto.anos) {
      (contexto.series.feminicidio[ano] ?? []).forEach((v, i) => {
        if (v != null) flat[`${ano}-${String(i + 1).padStart(2, "0")}`] = v;
      });
    }
  }
  dados.feminicidioSerieMensal = flat;
}

// séries oferecidas: naturezas oficiais + recortes com leitura cidadã.
// Cores por família (tom forte = roubo, claro = furto) para ler em fundo branco.
const CATALOGO = [
  { id: "ROUBO DE CELULAR", rotulo: "Roubo de celular", cor: "#1C4A94", tipo: "nat" },
  { id: "FURTO DE CELULAR", rotulo: "Furto de celular", cor: "#6F95D1", tipo: "nat" },
  { id: "ROUBO EM RESIDÊNCIA", rotulo: "Roubo em residência", cor: "#2E7D4F", tipo: "nat" },
  { id: "FURTO EM RESIDÊNCIA", rotulo: "Furto em residência", cor: "#86B89A", tipo: "nat" },
  { id: "ROUBO DE VEÍCULO", rotulo: "Roubo de veículo", cor: "#6B3FA0", tipo: "nat" },
  { id: "FURTO DE VEÍCULO", rotulo: "Furto de veículo", cor: "#B39BD6", tipo: "nat" },
  { id: "ROUBO - OUTROS", rotulo: "Roubos (geral)", cor: "#E0702F", tipo: "nat" },
  { id: "FURTO - OUTROS", rotulo: "Furtos (geral)", cor: "#F2A96B", tipo: "nat" },
  { id: "roubos::Transeunte", rotulo: "Roubo na rua", cor: "#8A5A2B", tipo: "conduta" },
  { id: "furtos::Transeunte", rotulo: "Furto na rua", cor: "#C9A27A", tipo: "conduta" },
  { id: "LESÃO CORPORAL DOLOSA", rotulo: "Agressão", cor: "#B8341F", tipo: "nat" },
  { id: "HOMICÍDIO DOLOSO", rotulo: "Homicídio doloso", cor: "#6E1414", tipo: "nat" },
  { id: "LATROCÍNIO", rotulo: "Latrocínio", cor: "#A33A5A", tipo: "nat" },
  { id: "ESTUPRO", rotulo: "Estupro", cor: "#4B4A45", tipo: "nat" },
  { id: "ESTUPRO DE VULNERÁVEL", rotulo: "Estupro de vulnerável", cor: "#9A9890", tipo: "nat" },
  { id: "mulheres::violencia", rotulo: "Violência doméstica (mulheres)", cor: "#9C1F55", tipo: "mulheres_mensal" },
  { id: "mulheres::feminicidio", rotulo: "Feminicídio", cor: "#D94A7B", tipo: "feminicidio_mensal" },
];

const ativas = new Set(["ROUBO DE CELULAR", "FURTO DE CELULAR", "FURTO EM RESIDÊNCIA"]);
let usarMM = true;
let gPrincipal;
const gMultiplos = new Map();

function serieDe(item) {
  if (item.tipo === "conduta") {
    const [cat, conduta] = item.id.split("::");
    return dados.agg.cidade.por_conduta[cat]?.[conduta] ?? null;
  }
  if (item.tipo === "mulheres_mensal" || item.tipo === "feminicidio_mensal") {
    const dict = item.tipo === "mulheres_mensal" ? dados.mulheresSerieMensal : dados.feminicidioSerieMensal;
    if (!dict) return null;
    return dados.agg.meses.map((m) => dict[m] ?? null);
  }
  return dados.agg.cidade.por_natureza[item.id] ?? null;
}

export async function initSeries() {
  const el = document.getElementById("s-series");
  el.innerHTML = CATALOGO.map((s) =>
    `<button data-id="${s.id}" style="--cor-chip:${s.cor}" class="${ativas.has(s.id) ? "ativo" : ""}"
       aria-pressed="${ativas.has(s.id)}">${s.rotulo}</button>`
  ).join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.dataset.id;
    if (ativas.has(id)) ativas.delete(id); else ativas.add(id);
    b.classList.toggle("ativo");
    b.setAttribute("aria-pressed", ativas.has(id));
    renderPrincipal();
  });

  document.getElementById("s-mm").addEventListener("click", (e) => {
    usarMM = !usarMM;
    e.currentTarget.setAttribute("aria-pressed", usarMM);
    renderPrincipal();
  });

  gPrincipal = grafico(echarts, document.getElementById("s-grafico"));
  renderPrincipal();
  renderMultiplos();
  await carregarSeriesMulheres();
  renderPrincipal(); // re-renderiza com as séries de mulheres já disponíveis
  renderMultiplos();
  window.__series = { serieDe, CATALOGO, ativas }; // depuração
}

function renderPrincipal() {
  const rotulos = dados.agg.meses.map(rotuloMes);
  const series = CATALOGO.filter((s) => ativas.has(s.id)).flatMap((s) => {
    const bruta = serieDe(s);
    if (!bruta) return [];
    const linha = {
      name: s.rotulo, type: "line", symbol: "none",
      data: usarMM ? mediaMovel(bruta) : bruta,
      lineStyle: { color: s.cor, width: 2.2 },
      itemStyle: { color: s.cor },
      emphasis: { focus: "series" },
    };
    return usarMM
      ? [linha, {
          name: `${s.rotulo} (bruto)`, type: "line", symbol: "none",
          data: bruta, silent: true, tooltip: { show: false },
          lineStyle: { color: s.cor, width: 1, opacity: 0.22 },
          itemStyle: { color: s.cor },
        }]
      : [linha];
  });

  gPrincipal.setOption({
    ...TEMA.base,
    grid: { left: 52, right: 16, top: 34, bottom: 26 },
    tooltip: { ...TEMA.base.tooltip, trigger: "axis" },
    legend: {
      top: 0, left: 0, icon: "roundRect", itemWidth: 14, itemHeight: 4,
      textStyle: { color: COR.texto2, fontSize: 11 },
      data: CATALOGO.filter((s) => ativas.has(s.id)).map((s) => s.rotulo),
      // seleção é pelos chips; clicar na legenda esconderia só a linha suavizada
      // e deixaria a "gêmea" bruta órfã no gráfico
      selectedMode: false,
    },
    xAxis: { type: "category", data: rotulos, ...TEMA.eixoX },
    yAxis: { type: "value", ...TEMA.eixoY },
    series,
  }, true);
}

function renderMultiplos() {
  const alvo = document.getElementById("s-multiplos");
  // monta o grid apenas na 1ª chamada: recriar o innerHTML nas chamadas
  // seguintes destruiria os nós que os gráficos ECharts já cacheados em
  // gMultiplos apontam, deixando-os órfãos (grid inteiro fica em branco)
  if (!alvo.dataset.montado) {
    alvo.innerHTML = CATALOGO.map((s) =>
      `<article class="cartao" style="--cor-chip:${s.cor}"><h3>${s.rotulo}</h3><div class="grafico" id="s-mini-${cssId(s.id)}"></div></article>`
    ).join("");
    alvo.dataset.montado = "1";
  }
  for (const s of CATALOGO) {
    const bruta = serieDe(s);
    const el = document.getElementById(`s-mini-${cssId(s.id)}`);
    if (!bruta || !el) continue;
    const g = gMultiplos.get(s.id) ?? grafico(echarts, el);
    gMultiplos.set(s.id, g);
    g.setOption({
      ...TEMA.base,
      grid: { left: 34, right: 6, top: 6, bottom: 18 },
      tooltip: { ...TEMA.base.tooltip, trigger: "axis", formatter: (ps) =>
        `${ps[0].axisValue}<br><b>${ps[0].value == null ? "sem dado" : fmt.format(ps[0].value)}</b>` },
      xAxis: { type: "category", data: dados.agg.meses.map(rotuloMes), ...TEMA.eixoX, axisLabel: { ...TEMA.eixoX.axisLabel, interval: 11 } },
      yAxis: { type: "value", ...TEMA.eixoY, axisLabel: { ...TEMA.eixoY.axisLabel, fontSize: 9 } },
      series: [{
        type: "line", data: bruta, symbol: "none",
        lineStyle: { color: s.cor, width: 1.6 },
        areaStyle: { color: s.cor, opacity: 0.12 },
      }],
    });
  }
}

const cssId = (s) => s.replace(/[^a-z0-9]/gi, "-");

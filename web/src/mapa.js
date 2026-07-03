// Aba MAPA — coroplético por distrito + pontos/heatmap por ocorrência.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  estado, dados, mudar, aoMudar, ROTULOS, CORES, ORDEM_CHIPS,
  contagemPorDistrito, indicesPeriodo, somaPeriodo, serieCidade, taxa100k,
  anosDisponiveis, fmt, fmt1,
} from "./estado.js";

const ZOOM_PONTOS = 12.5;
let mapa;

// rampa preto→cor da categoria (o coroplético muda de pele com a categoria)
function rampa() {
  const cor = CORES[estado.categoria];
  return ["#17181b", "#232427", mistura(cor, 0.35), mistura(cor, 0.6), mistura(cor, 0.82), cor];
}
function mistura(hex, t) {
  const [r1, g1, b1] = [0x17, 0x18, 0x1b];
  const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const c = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}

const valorDistrito = (cd, pop, contagens, idx) => {
  const n = contagens[cd] ?? 0;
  return estado.metrica === "taxa" ? (taxa100k(n, pop, idx) ?? 0) : n;
};

export function initMapa() {
  mapa = new maplibregl.Map({
    container: "mapa",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
    center: [-46.63, -23.62],
    zoom: 10,
    attributionControl: { compact: true },
  });
  window.__mapa = mapa; // depuração
  mapa.addControl(new maplibregl.NavigationControl(), "bottom-right");
  new ResizeObserver(() => mapa.resize()).observe(document.getElementById("mapa"));

  mapa.on("load", () => {
    mapa.addSource("distritos", { type: "geojson", data: dados.distritos, promoteId: "cd_distrito" });
    mapa.addLayer({ id: "coropletico", type: "fill", source: "distritos",
      paint: { "fill-color": "#232427", "fill-opacity": 0.75 } });
    mapa.addLayer({ id: "coropletico-borda", type: "line", source: "distritos",
      paint: { "line-color": "#0a0b0c", "line-width": 0.7 } });

    if (dados.pontosMeta) adicionarPontos();
    popupsDistrito();
    pintar();
  });

  initControles();
  aoMudar(() => { pintar(); renderPainelLateral(); });
  renderPainelLateral();
}

/* ---------------- coroplético ---------------- */
function pintar() {
  if (!mapa?.getLayer("coropletico")) return;
  const idx = indicesPeriodo();
  const contagens = contagemPorDistrito();
  const feats = dados.distritos.features;
  const valores = feats
    .map((f) => valorDistrito(f.properties.cd_distrito, f.properties.pop_2022, contagens, idx))
    .sort((a, b) => a - b);
  const q = (p) => valores[Math.floor(p * (valores.length - 1))] || 0;
  const cores = rampa();
  const degraus = [q(0.2), q(0.4), q(0.6), q(0.8), q(0.95)];

  const pares = feats.flatMap((f) => [
    f.properties.cd_distrito,
    valorDistrito(f.properties.cd_distrito, f.properties.pop_2022, contagens, idx),
  ]);
  const expr = ["step", ["var", "v"], cores[0]];
  degraus.forEach((d, i) => expr.push(d, cores[i + 1]));
  mapa.setPaintProperty("coropletico", "fill-color",
    ["let", "v", ["match", ["get", "cd_distrito"], ...pares, 0], expr]);

  atualizarFiltroPontos();
}

function popupsDistrito() {
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "260px" });
  mapa.on("mousemove", "coropletico", (e) => {
    if (mapa.getZoom() > ZOOM_PONTOS) { popup.remove(); return; }
    const f = e.features[0];
    const idx = indicesPeriodo();
    const n = contagemPorDistrito()[f.properties.cd_distrito] ?? 0;
    const t = taxa100k(n, f.properties.pop_2022, idx);
    const rotuloPeriodo = estado.mes ? `${estado.mes}/${estado.ano}` : estado.ano;
    popup.setLngLat(e.lngLat).setHTML(
      `<strong>${titulo(f.properties.nome)}</strong><br>` +
      `${estado.natureza ?? ROTULOS[estado.categoria]} · ${rotuloPeriodo}<br>` +
      `<span class="num">${fmt.format(n)}</span> ocorrências` +
      (t != null ? ` · <span class="num">${fmt1.format(t)}</span>/100k hab./ano` : "")
    ).addTo(mapa);
  });
  mapa.on("mouseleave", "coropletico", () => popup.remove());
}

/* ---------------- pontos ---------------- */
function filtroPontos() {
  const meta = dados.pontosMeta;
  const cIdx = meta.categorias.indexOf(estado.categoria);
  const prefixo = estado.mes ? `${estado.ano}-${estado.mes}` : estado.ano;
  const idx = meta.meses.map((m, i) => [m, i]).filter(([m]) => m.startsWith(prefixo)).map(([, i]) => i);
  const filtro = ["all",
    ["==", ["get", "c"], cIdx],
    [">=", ["get", "m"], Math.min(...idx)],
    ["<=", ["get", "m"], Math.max(...idx)],
  ];
  if (estado.natureza) {
    const nIdx = meta.naturezas.indexOf(estado.natureza);
    filtro.push(["any", ["!", ["has", "n"]], ["==", ["get", "n"], nIdx]]);
  }
  return filtro;
}

function adicionarPontos() {
  mapa.addSource("ocorrencias", { type: "vector", url: "pmtiles://data/ocorrencias.pmtiles" });

  mapa.addLayer({
    id: "pontos-heat", type: "heatmap", source: "ocorrencias", "source-layer": "oc",
    minzoom: ZOOM_PONTOS - 1.5, maxzoom: 15.5, filter: filtroPontos(),
    paint: {
      "heatmap-weight": ["coalesce", ["get", "w"], 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 0.25, 15, 0.9],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 26],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0.85, 15.5, 0],
      // brasa: preto → vinho → vermelho → branco (o tricolor em rampa térmica)
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(0,0,0,0)", 0.3, "#4a0b12", 0.55, "#a41220", 0.78, "#e8112d", 1, "#ffffff"],
    },
  });

  mapa.addLayer({
    id: "pontos-circulo", type: "circle", source: "ocorrencias", "source-layer": "oc",
    minzoom: 14.5, filter: filtroPontos(),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14.5, 3.5, 18, 8],
      "circle-color": ["match", ["get", "c"],
        0, CORES.letais, 1, CORES.roubos, 2, CORES.furtos, 3, CORES.genero, 4, CORES.celular, "#999"],
      "circle-opacity": 0.85,
      "circle-stroke-color": "#0d0e10", "circle-stroke-width": 0.6,
    },
  });

  // tooltip de contagem: agrupa o que está sob o cursor (~10 px)
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "280px" });
  mapa.on("mousemove", "pontos-circulo", (e) => {
    const r = 10;
    const feats = mapa.queryRenderedFeatures(
      [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]],
      { layers: ["pontos-circulo"] },
    );
    if (!feats.length) { popup.remove(); return; }
    mapa.getCanvas().style.cursor = "pointer";
    const meta = dados.pontosMeta;
    const porNatureza = {};
    for (const f of feats) {
      const nome = meta.naturezas[f.properties.n] ?? ROTULOS[estado.categoria];
      porNatureza[nome] = (porNatureza[nome] ?? 0) + 1;
    }
    const linhas = Object.entries(porNatureza)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, n]) => `<span class="num">${n}×</span> ${titulo(nome)}`)
      .join("<br>");
    popup.setLngLat(e.lngLat).setHTML(
      `<strong><span class="num">${feats.length}</span> ocorrência${feats.length > 1 ? "s" : ""} neste local</strong>` +
      `<br>${linhas}<br><small style="color:#6f747c">posição aproximada · geocodificação SSP</small>`
    ).addTo(mapa);
  });
  mapa.on("mouseleave", "pontos-circulo", () => {
    mapa.getCanvas().style.cursor = "";
    popup.remove();
  });

  // coroplético cede a vez aos pontos
  mapa.setPaintProperty("coropletico", "fill-opacity",
    ["interpolate", ["linear"], ["zoom"], ZOOM_PONTOS - 1, 0.75, ZOOM_PONTOS + 0.7, 0.05]);
}

function atualizarFiltroPontos() {
  if (!dados.pontosMeta || !mapa?.getLayer("pontos-heat")) return;
  const f = filtroPontos();
  mapa.setFilter("pontos-heat", f);
  mapa.setFilter("pontos-circulo", f);
}

/* ---------------- controles + painel lateral ---------------- */
function initControles() {
  const elCat = document.getElementById("m-categorias");
  elCat.innerHTML = ORDEM_CHIPS.filter((c) => dados.agg.categorias.includes(c)).map((c) =>
    `<button data-cat="${c}" style="--cor-chip:${CORES[c]}" class="${c === estado.categoria ? "ativo" : ""}">${ROTULOS[c]}</button>`
  ).join("");
  elCat.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    elCat.querySelectorAll("button").forEach((x) => x.classList.toggle("ativo", x === b));
    preencherNaturezas();
    mudar({ categoria: b.dataset.cat, natureza: null });
  });

  preencherNaturezas();
  document.getElementById("m-natureza").addEventListener("change", (e) =>
    mudar({ natureza: e.target.value || null }));

  const elAno = document.getElementById("m-ano");
  const anos = anosDisponiveis().reverse();
  elAno.innerHTML = anos.map((a) => `<option>${a}</option>`).join("");
  elAno.value = estado.ano;
  elAno.addEventListener("change", () => mudar({ ano: elAno.value }));

  const elMes = document.getElementById("m-mes");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  elMes.innerHTML = `<option value="">ano inteiro</option>` +
    nomes.map((n, i) => `<option value="${String(i + 1).padStart(2, "0")}">${n}</option>`).join("");
  elMes.addEventListener("change", () => mudar({ mes: elMes.value || null }));

  document.getElementById("m-metrica").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll("#m-metrica button").forEach((x) => x.classList.toggle("ativo", x === b));
    mudar({ metrica: b.dataset.metrica });
  });

  aoMudar(() => {
    document.getElementById("m-aviso-genero").hidden = estado.categoria !== "genero";
  });
}

function preencherNaturezas() {
  const el = document.getElementById("m-natureza");
  el.innerHTML = `<option value="">todas as naturezas</option>` +
    dados.agg.naturezas[estado.categoria].map((n) => `<option value="${n}">${titulo(n)}</option>`).join("");
}

function renderPainelLateral() {
  const idx = indicesPeriodo();
  const serie = serieCidade();
  const total = somaPeriodo(serie, idx);

  // variação vs mesmos meses do ano anterior
  const anoAnt = String(+estado.ano - 1);
  const mesesAtuais = new Set(idx.map((i) => dados.agg.meses[i].slice(5)));
  const idxAnt = dados.agg.meses
    .map((m, i) => [m, i])
    .filter(([m]) => m.startsWith(anoAnt) && mesesAtuais.has(m.slice(5)))
    .map(([, i]) => i);
  const totalAnt = idxAnt.length ? somaPeriodo(serie, idxAnt) : 0;
  const delta = totalAnt ? ((total - totalAnt) / totalAnt) * 100 : null;

  document.getElementById("m-kpis").innerHTML = `
    <p class="titulo-bloco">${estado.natureza ? titulo(estado.natureza) : ROTULOS[estado.categoria]} · ${estado.mes ? estado.mes + "/" : ""}${estado.ano}</p>
    <div class="kpi">
      <div class="valor" style="color:${CORES[estado.categoria]}">${fmt.format(total)}</div>
      <div class="kpi-rotulo">ocorrências na cidade
        ${delta != null ? `· <span class="delta ${delta > 0 ? "sobe" : "desce"}">${delta > 0 ? "+" : ""}${fmt1.format(delta)}% vs ${anoAnt}</span>` : ""}
      </div>
    </div>`;

  const contagens = contagemPorDistrito();
  const linhas = dados.distritos.features
    .map((f) => ({
      nome: f.properties.nome,
      v: valorDistrito(f.properties.cd_distrito, f.properties.pop_2022, contagens, idx),
      n: contagens[f.properties.cd_distrito] ?? 0,
    }))
    .sort((a, b) => b.v - a.v).slice(0, 10);
  document.getElementById("m-ranking").innerHTML =
    `<p class="titulo-bloco">Top 10 distritos · ${estado.metrica === "taxa" ? "taxa /100k/ano" : "absoluto"}</p><table>` +
    linhas.map((l, i) =>
      `<tr><td>${i + 1}. ${titulo(l.nome)}</td><td class="n">${estado.metrica === "taxa" ? fmt1.format(l.v) : fmt.format(l.n)}</td></tr>`
    ).join("") + "</table>";
}

const titulo = (s) => s ? s.toLowerCase().replace(/(^|[\s(])\S/g, (c) => c.toUpperCase()) : s;

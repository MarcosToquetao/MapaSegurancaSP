// Seção MAPA — coroplético por distrito + pontos/heatmap + ficha do lugar.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  estado, dados, mudar, aoMudar, TIPOS, MODOS, GRUPOS, grupoAtivo, RAMPA, PERIODOS_DIA, MESES,
  contagemPorDistrito, indicesPeriodo, indicesAnoAnterior, somaPeriodo, serieGrupo, taxa100k,
  anosDisponiveis, fmt, fmt1, rotuloPeriodo, titulo,
} from "./estado.js";

const ZOOM_PONTOS = 12.5;
const RAIO_M = 500;
const COR_PONTO = RAMPA[3];
let mapa;
let quintis = [];
let lugar = null; // { tipo: "distrito"|"endereco", cd, nome, sub, lon, lat }

const ICONES = {
  celular: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  casa: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  veiculo: '<path d="M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2M20 16v2"/><circle cx="8" cy="13" r=".6"/><circle cx="16" cy="13" r=".6"/>',
  todos: '<circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="7" r="2.2"/><circle cx="7" cy="17" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
  agressao: '<path d="M12 3v8M8.5 5.5l2 4M15.5 5.5l-2 4M5 14h14l-2 7H7z"/>',
  letais: '<path d="M12 3v18M7 8h10"/>',
};

/* ---------------- escala de cor ---------------- */
const valorDistrito = (cd, pop, contagens, idx) => {
  const n = contagens[cd] ?? 0;
  return estado.metrica === "taxa" ? (taxa100k(n, pop, idx) ?? 0) : n;
};
const corDoValor = (v) => RAMPA[quintis.filter((q) => v >= q).length];

export function initMapa() {
  mapa = new maplibregl.Map({
    container: "mapa",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [-46.63, -23.62],
    zoom: window.innerWidth < 768 ? 9.4 : 10,
    attributionControl: { compact: true },
    maxBounds: [[-47.4, -24.3], [-45.9, -23.0]],
  });
  window.__mapa = mapa; // depuração
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  new ResizeObserver(() => mapa.resize()).observe(document.getElementById("mapa"));

  mapa.on("load", () => {
    // camadas de dados entram por baixo dos rótulos de rua do mapa-base
    const rotulos = mapa.getStyle().layers.find((l) => l.type === "symbol")?.id;
    mapa.addSource("distritos", { type: "geojson", data: dados.distritos, promoteId: "cd_distrito" });
    mapa.addLayer({ id: "coropletico", type: "fill", source: "distritos",
      paint: { "fill-color": RAMPA[0], "fill-opacity": 0.72 } }, rotulos);
    mapa.addLayer({ id: "coropletico-borda", type: "line", source: "distritos",
      paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 13, 1.6] } }, rotulos);
    mapa.addLayer({ id: "distrito-foco", type: "line", source: "distritos",
      paint: { "line-color": "#1C4A94", "line-width": 3 }, filter: ["==", ["get", "cd_distrito"], ""] }, rotulos);

    if (dados.pontosMeta) adicionarPontos(rotulos);
    interacoesDistrito();
    pintar();
    renderFicha(); // cores da ficha dependem dos quintis calculados em pintar()
    document.getElementById("m-carregando").classList.add("pronto");
    if (estado.distrito) abrirDistrito(estado.distrito, true);
  });

  initControles();
  initGaveta();
  aoMudar(() => { pintar(); renderControles(); renderLegenda(); renderFicha(); });
  renderControles();
  renderLegenda();
  renderFicha();
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
  quintis = [q(0.2), q(0.4), q(0.6), q(0.8)];

  const pares = feats.flatMap((f) => [
    f.properties.cd_distrito,
    valorDistrito(f.properties.cd_distrito, f.properties.pop_2022, contagens, idx),
  ]);
  const expr = ["step", ["var", "v"], RAMPA[0]];
  quintis.forEach((d, i) => expr.push(d, RAMPA[i + 1]));
  mapa.setPaintProperty("coropletico", "fill-color",
    ["let", "v", ["match", ["get", "cd_distrito"], ...pares, 0], expr]);
  mapa.setFilter("distrito-foco", ["==", ["get", "cd_distrito"], lugar?.cd ?? ""]);

  atualizarFiltroPontos();
  renderLegenda();
}

function renderLegenda() {
  const el = document.getElementById("m-legenda");
  if (!quintis.length) { el.innerHTML = ""; return; }
  const f = (v) => (estado.metrica === "taxa" ? fmt.format(Math.round(v)) : fmt.format(v));
  const zoomPontos = mapa && mapa.getZoom() > ZOOM_PONTOS - 1;
  el.innerHTML = `
    <div class="legenda-titulo">${grupoAtivo().rotulo} · ${rotuloPeriodo()}
      <span style="font-weight:400;color:var(--texto-3)">${estado.metrica === "taxa" ? "por 100 mil hab./ano" : "total"}</span></div>
    <div class="legenda-faixas">${RAMPA.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
    <div class="legenda-valores"><span>menos</span><span>${f(quintis[1])}</span><span>${f(quintis[3])}+</span></div>
    ${zoomPontos ? `<div class="legenda-pontos"><i></i> uma ocorrência${estado.periodoDia != null ? ` · ${PERIODOS_DIA[estado.periodoDia]}` : ""}</div>` : ""}`;
}

function interacoesDistrito() {
  const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "260px", offset: 8 });
  const podeHover = matchMedia("(hover: hover)").matches;
  if (podeHover) {
    mapa.on("mousemove", "coropletico", (e) => {
      if (mapa.getZoom() > ZOOM_PONTOS) { hover.remove(); return; }
      mapa.getCanvas().style.cursor = "pointer";
      const p = e.features[0].properties;
      const idx = indicesPeriodo();
      const n = contagemPorDistrito()[p.cd_distrito] ?? 0;
      const t = taxa100k(n, p.pop_2022, idx);
      hover.setLngLat(e.lngLat).setHTML(
        `<strong>${titulo(p.nome)}</strong><br><span class="num">${fmt.format(n)}</span> ` +
        `${grupoAtivo().rotulo.toLowerCase()}` +
        (t != null ? `<br><small><span class="num">${fmt.format(Math.round(t))}</span> por 100 mil hab./ano</small>` : "")
      ).addTo(mapa);
    });
    mapa.on("mouseleave", "coropletico", () => { hover.remove(); mapa.getCanvas().style.cursor = ""; });
  }
  mapa.on("click", "coropletico", (e) => {
    if (mapa.getZoom() > ZOOM_PONTOS + 1) return; // no zoom de rua o toque é dos pontos
    hover.remove();
    abrirDistrito(e.features[0].properties.cd_distrito, false);
    if (celular()) mapa.easeTo({ center: e.lngLat, offset: [0, -window.innerHeight * 0.22] });
  });
  mapa.on("zoomend", renderLegenda);
}

/* ---------------- pontos ---------------- */
function filtroPontos() {
  const meta = dados.pontosMeta;
  const g = grupoAtivo();
  const cIdx = meta.categorias.indexOf(g.cat);
  const prefixo = estado.mes ? `${estado.ano}-${estado.mes}` : estado.ano;
  const idx = meta.meses.map((m, i) => [m, i]).filter(([m]) => m.startsWith(prefixo)).map(([, i]) => i);
  // período sem pontos (mês ainda não publicado): filtro impossível em vez de
  // Math.min(...[]) = Infinity, que quebraria a expressão do MapLibre
  if (!idx.length || cIdx < 0) return ["==", ["get", "m"], -1];
  const filtro = ["all",
    ["==", ["get", "c"], cIdx],
    [">=", ["get", "m"], Math.min(...idx)],
    ["<=", ["get", "m"], Math.max(...idx)],
  ];
  const nat = g.pNat ?? g.nat;
  if (nat) filtro.push(["==", ["get", "n"], meta.naturezas.indexOf(nat)]);
  if (g.res) filtro.push(["==", ["get", "r"], 1]);
  if (estado.periodoDia != null) filtro.push(["==", ["get", "p"], estado.periodoDia]);
  return filtro;
}

function adicionarPontos(antesDe) {
  mapa.addSource("ocorrencias", { type: "vector", url: "pmtiles://data/ocorrencias.pmtiles" });
  mapa.addLayer({
    id: "pontos-heat", type: "heatmap", source: "ocorrencias", "source-layer": "oc",
    minzoom: ZOOM_PONTOS - 1.5, maxzoom: 15.5, filter: filtroPontos(),
    paint: {
      "heatmap-weight": ["coalesce", ["get", "w"], 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 0.25, 15, 0.9],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 26],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0.8, 15.5, 0],
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(251,232,166,0)", 0.2, RAMPA[0], 0.45, RAMPA[1], 0.7, RAMPA[2], 0.88, RAMPA[3], 1, RAMPA[4]],
    },
  }, antesDe);
  mapa.addLayer({
    id: "pontos-circulo", type: "circle", source: "ocorrencias", "source-layer": "oc",
    minzoom: 14.5, filter: filtroPontos(),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14.5, 4, 18, 9],
      "circle-color": COR_PONTO, "circle-opacity": 0.85,
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.2,
    },
  }, antesDe);

  // popup de contagem: agrupa o que está sob o cursor/dedo
  const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "280px", offset: 10 });
  const mostrar = (e, r) => {
    const feats = mapa.queryRenderedFeatures(
      [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: ["pontos-circulo"] });
    if (!feats.length) { popup.remove(); return; }
    const meta = dados.pontosMeta;
    const porMes = {};
    for (const f of feats) {
      const m = meta.meses[f.properties.m];
      porMes[m] = (porMes[m] ?? 0) + 1;
    }
    const meses = Object.keys(porMes).sort().reverse().slice(0, 4)
      .map((m) => `${MESES[+m.slice(5) - 1]}/${m.slice(2, 4)}`).join(", ");
    popup.setLngLat(e.lngLat).setHTML(
      `<span class="num">${feats.length}</span> ${grupoAtivo().rotulo.toLowerCase()} aqui<br>` +
      `<small>${meses}${Object.keys(porMes).length > 4 ? "…" : ""} · posição aproximada</small>`
    ).addTo(mapa);
  };
  if (matchMedia("(hover: hover)").matches) {
    mapa.on("mousemove", "pontos-circulo", (e) => { mapa.getCanvas().style.cursor = "pointer"; mostrar(e, 8); });
    mapa.on("mouseleave", "pontos-circulo", () => { mapa.getCanvas().style.cursor = ""; popup.remove(); });
  }
  mapa.on("click", "pontos-circulo", (e) => mostrar(e, 16));

  mapa.setPaintProperty("coropletico", "fill-opacity",
    ["interpolate", ["linear"], ["zoom"], ZOOM_PONTOS - 1, 0.72, ZOOM_PONTOS + 0.7, 0.06]);
}

function atualizarFiltroPontos() {
  if (!dados.pontosMeta || !mapa?.getLayer("pontos-heat")) return;
  const f = filtroPontos();
  mapa.setFilter("pontos-heat", f);
  mapa.setFilter("pontos-circulo", f);
}

/* ---------------- controles ---------------- */
function initControles() {
  const elTipos = document.getElementById("m-tipos");
  elTipos.innerHTML = TIPOS.map((t) =>
    `<button role="radio" data-tipo="${t.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[t.id]}</svg>${t.rotulo}</button>`
  ).join("");
  elTipos.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) mudar({ tipo: b.dataset.tipo });
  });

  const elModos = document.getElementById("m-modos");
  elModos.innerHTML = MODOS.map((m) =>
    `<button role="radio" data-modo="${m.id}">${m.rotulo}<small>${m.dica}</small></button>`).join("");
  elModos.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) mudar({ modo: b.dataset.modo });
  });

  const elAno = document.getElementById("m-ano");
  elAno.innerHTML = anosDisponiveis().reverse().map((a) => `<option>${a}</option>`).join("");
  elAno.addEventListener("change", () => mudar({ ano: elAno.value }));

  const elMes = document.getElementById("m-mes");
  elMes.addEventListener("change", () => mudar({ mes: elMes.value || null }));

  const elPer = document.getElementById("m-periodo");
  elPer.innerHTML = `<option value="">dia todo</option>` +
    PERIODOS_DIA.map((p, i) => `<option value="${i}">${p}</option>`).join("");
  elPer.addEventListener("change", () => mudar({ periodoDia: elPer.value === "" ? null : +elPer.value }));

  document.getElementById("m-metrica").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) mudar({ metrica: b.dataset.metrica });
  });

  initBusca();
  document.getElementById("m-perto").addEventListener("click", pertoDeMim);
}

function renderControles() {
  const tipo = TIPOS.find((t) => t.id === estado.tipo);
  document.querySelectorAll("#m-tipos button").forEach((b) =>
    b.setAttribute("aria-checked", b.dataset.tipo === estado.tipo));
  const elModos = document.getElementById("m-modos");
  elModos.hidden = !!tipo.semModo;
  elModos.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.modo === estado.modo));
  document.getElementById("m-ano").value = estado.ano;
  // meses publicados do ano escolhido (o ano corrente é parcial)
  const elMes = document.getElementById("m-mes");
  const pub = dados.agg.meses.filter((m) => m.startsWith(estado.ano)).map((m) => m.slice(5));
  elMes.innerHTML = `<option value="">ano todo</option>` +
    pub.map((m) => `<option value="${m}">${MESES[+m - 1]}</option>`).join("");
  if (estado.mes && !pub.includes(estado.mes)) estado.mes = null;
  elMes.value = estado.mes ?? "";
  document.getElementById("m-periodo").value = estado.periodoDia ?? "";
  document.querySelectorAll("#m-metrica button").forEach((b) =>
    b.setAttribute("aria-checked", b.dataset.metrica === estado.metrica));
}

/* ---------------- gaveta (celular) ---------------- */
const ESTADOS_GAVETA = ["espiada", "meia", "cheia"];
function gaveta(novo) {
  const el = document.getElementById("gaveta");
  if (novo) {
    el.dataset.estado = novo;
    el.querySelector(".alca").setAttribute("aria-expanded", novo !== "espiada");
  }
  return el.dataset.estado;
}
function initGaveta() {
  const el = document.getElementById("gaveta");
  const alca = el.querySelector(".alca");
  alca.addEventListener("click", () => {
    const i = ESTADOS_GAVETA.indexOf(gaveta());
    gaveta(i === 0 ? "meia" : i === 1 ? "cheia" : "espiada");
    el.scrollTop = 0;
  });
  // arrasto simples pela alça: decide o estado pelo sentido do gesto
  let y0 = null;
  alca.addEventListener("pointerdown", (e) => { y0 = e.clientY; alca.setPointerCapture(e.pointerId); });
  alca.addEventListener("pointerup", (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0; y0 = null;
    if (Math.abs(dy) < 20) return; // foi toque: o click cuida
    const i = ESTADOS_GAVETA.indexOf(gaveta());
    gaveta(ESTADOS_GAVETA[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]);
    e.preventDefault();
  });
  // focar a busca abre a gaveta para caber os resultados
  document.getElementById("m-busca").addEventListener("focus", () => { if (gaveta() === "espiada") gaveta("meia"); });
}
const celular = () => matchMedia("(max-width: 767px)").matches;
/** celular: abre a gaveta pela metade já rolada até a ficha do lugar */
function mostrarFicha() {
  if (!celular()) return;
  gaveta("meia");
  const el = document.getElementById("gaveta");
  requestAnimationFrame(() => { el.scrollTop = document.getElementById("ficha").offsetTop - 30; });
}

/* ---------------- busca por rua / CEP ---------------- */
let marcador = null;

async function geocodificar(consulta) {
  const cep = consulta.replace(/\D/g, "");
  let extra = {};
  if (/^\d{8}$/.test(cep)) {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
    if (r.erro || !r.logradouro) return [];
    extra = { rua: r.logradouro, bairro: r.bairro, cep: r.cep };
    consulta = `${r.logradouro}, ${r.bairro ?? ""}, São Paulo`;
  }
  // Nominatim (OSM) restrito à caixa da capital
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
    q: consulta, format: "json", limit: "5", countrycodes: "br", addressdetails: "1",
    viewbox: "-46.85,-23.35,-46.36,-24.01", bounded: "1",
  });
  const r = await fetch(url, { headers: { "Accept-Language": "pt-BR" } }).then((x) => x.json());
  const vistos = new Set(); // o OSM devolve um resultado por trecho da mesma rua
  return r.filter((f) => {
    const k = f.display_name.split(",").slice(0, 3).join(",");
    return !vistos.has(k) && vistos.add(k);
  }).map((f) => {
    const a = f.address ?? {};
    return {
      rua: extra.rua ?? a.road ?? f.display_name.split(",")[0],
      bairro: extra.bairro ?? a.suburb ?? a.neighbourhood ?? a.city_district ?? "",
      cep: extra.cep ?? a.postcode ?? "",
      rotulo: f.display_name.split(",").slice(0, 3).join(","),
      lon: +f.lon, lat: +f.lat,
    };
  });
}

function initBusca() {
  const campo = document.getElementById("m-busca");
  const lista = document.getElementById("m-busca-resultados");
  let controle = 0, resultados = [];

  async function buscar() {
    const q = campo.value.trim();
    if (q.length < 3) { lista.innerHTML = ""; return; }
    const id = ++controle;
    lista.innerHTML = `<li class="buscando">Buscando…</li>`;
    try {
      resultados = await geocodificar(q);
      if (id !== controle) return; // resposta antiga
      lista.innerHTML = resultados.length
        ? resultados.map((r, i) => `<li role="option" tabindex="0" data-i="${i}">${r.rotulo}</li>`).join("")
        : `<li class="buscando">Nada encontrado em São Paulo. Tente rua + bairro ou o CEP.</li>`;
    } catch {
      if (id === controle) lista.innerHTML = `<li class="buscando">A busca está fora do ar. Tente de novo em instantes.</li>`;
    }
  }
  let timer;
  campo.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(buscar, 450); });
  campo.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(timer); buscar(); } });
  const escolher = (li) => {
    const r = resultados[+li.dataset.i];
    if (!r) return;
    lista.innerHTML = "";
    campo.value = r.rua;
    campo.blur();
    irParaEndereco(r);
  };
  lista.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) escolher(li); });
  lista.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.i) escolher(e.target); });
}

function pertoDeMim() {
  const b = document.getElementById("m-perto");
  if (!navigator.geolocation) return;
  b.classList.add("buscando");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      b.classList.remove("buscando");
      irParaEndereco({ rua: "Você está aqui", bairro: "", cep: "", lon: pos.coords.longitude, lat: pos.coords.latitude });
    },
    () => {
      b.classList.remove("buscando");
      lugar = { tipo: "aviso", texto: "Não foi possível ver sua localização. Permita o acesso à localização ou busque sua rua." };
      renderFicha();
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

function irParaEndereco(r) {
  marcador?.remove();
  marcador = new maplibregl.Marker({ color: "#1C4A94" }).setLngLat([r.lon, r.lat]).addTo(mapa);
  lugar = { tipo: "endereco", nome: r.rua, sub: [r.bairro, r.cep].filter(Boolean).join(" · "), lon: r.lon, lat: r.lat, raio: null };
  mudar({ distrito: null }); // endereço não vai para a URL (privacidade de quem compartilha)
  mostrarFicha();
  // no celular a gaveta cobre a metade de baixo: desloca o alvo para cima
  mapa.flyTo({ center: [r.lon, r.lat], zoom: 15, offset: celular() ? [0, -window.innerHeight * 0.18] : [0, 0] });
  mapa.once("idle", () => {
    const px = mapa.project([r.lon, r.lat]);
    const d = mapa.queryRenderedFeatures(px, { layers: ["coropletico"] })[0];
    lugar.cd = d?.properties.cd_distrito ?? null;
    lugar.raio = contarNoRaio(r.lon, r.lat);
    mapa.setFilter("distrito-foco", ["==", ["get", "cd_distrito"], lugar.cd ?? ""]);
    renderFicha();
  });
}

/** ocorrências por grupo num raio de 500 m, últimos 12 meses publicados */
function contarNoRaio(lon, lat) {
  const meta = dados.pontosMeta;
  if (!meta || !mapa.getSource("ocorrencias")) return null;
  const mMin = meta.meses.length - 12;
  const feats = mapa.querySourceFeatures("ocorrencias", {
    sourceLayer: "oc", filter: [">=", ["get", "m"], mMin],
  });
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const perto = feats.filter((f) => {
    const [x, y] = f.geometry.coordinates;
    const dx = (x - lon) * 111320 * cosLat, dy = (y - lat) * 110540;
    return dx * dx + dy * dy <= RAIO_M * RAIO_M;
  }).map((f) => f.properties);
  const cont = {};
  for (const g of GRUPOS) {
    const c = meta.categorias.indexOf(g.cat);
    const nat = g.pNat ?? g.nat;
    const n = nat ? meta.naturezas.indexOf(nat) : null;
    cont[g.id] = perto.filter((p) => p.c === c && (n == null || p.n === n) && (!g.res || p.r === 1)).length;
  }
  return { cont, de: meta.meses[mMin], ate: meta.meses.at(-1) };
}

function abrirDistrito(cd, voar = true) {
  const f = dados.distritos.features.find((x) => x.properties.cd_distrito === cd);
  if (!f) return;
  lugar = { tipo: "distrito", cd, nome: titulo(f.properties.nome) };
  estado.distrito = cd;
  mudar({});
  mostrarFicha();
  if (voar) {
    const b = new maplibregl.LngLatBounds();
    f.geometry.coordinates.flat(2).forEach((c) => typeof c[0] === "number" && b.extend(c));
    mapa.fitBounds(b, { padding: 40 });
  }
}

function fecharFicha() {
  lugar = null;
  estado.distrito = null;
  marcador?.remove();
  mudar({});
}

/* ---------------- ficha do lugar ---------------- */
function renderFicha() {
  const el = document.getElementById("ficha");
  if (!dados.agg) return;
  if (!lugar && estado.distrito) {
    const f = dados.distritos.features.find((x) => x.properties.cd_distrito === estado.distrito);
    if (f) lugar = { tipo: "distrito", cd: estado.distrito, nome: titulo(f.properties.nome) };
  }
  if (lugar?.tipo === "aviso") { el.innerHTML = `<p class="nota-ficha">${lugar.texto}</p>`; lugar = null; return; }
  el.innerHTML = lugar ? fichaLugar() : fichaCidade();
  el.querySelector(".ficha-fechar")?.addEventListener("click", fecharFicha);
  // itens clicáveis da ficha são <span role="button">: Enter/Espaço também acionam
  el.querySelectorAll('[role="button"]').forEach((b) => b.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); b.click(); }
  }));
  el.querySelectorAll("[data-cd]").forEach((b) => b.addEventListener("click", () => abrirDistrito(b.dataset.cd)));
  el.querySelectorAll("[data-grupo]").forEach((b) => b.addEventListener("click", () => {
    const [tipo, modo] = b.dataset.grupo.split("-");
    mudar(modo ? { tipo, modo } : { tipo });
  }));
}

function variacao(serie, idx) {
  const ant = indicesAnoAnterior(idx);
  if (!ant.length) return "";
  const a = somaPeriodo(serie, idx), b = somaPeriodo(serie, ant);
  if (!b) return "";
  const d = ((a - b) / b) * 100;
  return `<span class="delta ${d > 0 ? "sobe" : "desce"}">${d > 0 ? "+" : ""}${fmt1.format(d)}% vs ${+estado.ano - 1}</span>`;
}

function fichaCidade() {
  const idx = indicesPeriodo();
  const g = grupoAtivo();
  const serie = serieGrupo(g);
  const total = somaPeriodo(serie, idx);
  const contagens = contagemPorDistrito();
  const top = dados.distritos.features
    .map((f) => ({ cd: f.properties.cd_distrito, nome: f.properties.nome,
      v: valorDistrito(f.properties.cd_distrito, f.properties.pop_2022, contagens, idx) }))
    .sort((a, b) => b.v - a.v).slice(0, 8);
  return `
    <div class="ficha-placa"><span class="placa"><span class="placa-nome">São Paulo</span><span class="placa-sub">cidade inteira · ${rotuloPeriodo()}</span></span></div>
    <div class="ficha-destaque"><span class="num">${fmt.format(total)}</span> ${variacao(serie, idx)}</div>
    <p class="ficha-sub">${g.rotulo.toLowerCase()} registrados</p>
    <p class="ficha-titulo">Distritos com mais casos ${estado.metrica === "taxa" ? "por habitante" : ""}</p>
    <ul class="ficha-lista">${top.map((l) => `
      <li><span class="cor" style="background:${corDoValor(l.v)}"></span>
        <span class="link" role="button" tabindex="0" data-cd="${l.cd}">${titulo(l.nome)}</span>
        <span class="n">${estado.metrica === "taxa" ? fmt.format(Math.round(l.v)) : fmt.format(l.v)}</span><span></span></li>`).join("")}
    </ul>
    <p class="nota-ficha">Toque num distrito ou busque sua rua para ver o lugar.</p>`;
}

function fichaLugar() {
  const idx = indicesPeriodo();
  const cd = lugar.cd;
  const info = cd ? dados.agg.distritos[cd] : null;
  const pop = info?.pop;
  const cabeca = `
    <div class="ficha-placa">
      <span class="placa"><span class="placa-nome">${lugar.nome}</span>
        <span class="placa-sub">${lugar.tipo === "endereco" ? (lugar.sub || (info ? info.nome : "São Paulo")) : "distrito"}${info ? ` · ${fmt.format(pop)} hab.` : ""}</span></span>
      <button class="ficha-fechar" aria-label="Fechar ficha">×</button>
    </div>`;

  let raio = "";
  if (lugar.tipo === "endereco") {
    if (!lugar.raio) {
      raio = `<p class="ficha-sub">Contando ocorrências perto daqui…</p>`;
    } else {
      const { cont, de, ate } = lugar.raio;
      raio = `
        <p class="ficha-titulo">A até 500 m · ${MESES[+de.slice(5) - 1]}/${de.slice(2, 4)} a ${MESES[+ate.slice(5) - 1]}/${ate.slice(2, 4)}</p>
        <ul class="ficha-lista">${GRUPOS.filter((g) => !g.id.startsWith("todos")).map((g) => `
          <li class="${g === grupoAtivo() ? "ativo" : ""}"><span class="cor" style="background:${cont[g.id] ? RAMPA[3] : "var(--linha)"}"></span>
            <span class="link" role="button" tabindex="0" data-grupo="${g.id}">${g.rotulo}</span>
            <span class="n">${fmt.format(cont[g.id])}</span><span></span></li>`).join("")}
        </ul>
        <p class="nota-ficha">Só ocorrências com coordenada publicada pela SSP (cerca de 80%). Agressões dentro de casa não entram no mapa.</p>`;
    }
    if (!info) return cabeca + raio;
  }

  // distrito: todos os grupos, taxa vs média da cidade e posição entre os 96
  const linhas = GRUPOS.filter((g) => !g.id.startsWith("todos")).map((g) => {
    const n = somaPeriodo(serieGrupo(g, cd), idx);
    const t = taxa100k(n, pop, idx);
    const cid = somaPeriodo(serieGrupo(g), idx);
    const popCid = dados.distritos.features.reduce((s, f) => s + (f.properties.pop_2022 || 0), 0);
    const tc = taxa100k(cid, popCid, idx);
    const razao = t != null && tc ? t / tc : null;
    return { g, n, razao };
  });
  const g = grupoAtivo();
  const serie = serieGrupo(g, cd);
  const n = somaPeriodo(serie, idx);
  const contagens = contagemPorDistrito();
  const ordem = dados.distritos.features
    .map((f) => ({ cd: f.properties.cd_distrito,
      v: valorDistrito(f.properties.cd_distrito, f.properties.pop_2022, contagens, idx) }))
    .sort((a, b) => b.v - a.v);
  const pos = ordem.findIndex((x) => x.cd === cd) + 1;
  const vDist = ordem[pos - 1]?.v ?? 0;
  const corRazao = (r) => r == null ? "var(--linha)" : RAMPA[r < 0.6 ? 0 : r < 0.9 ? 1 : r < 1.3 ? 2 : r < 2 ? 3 : 4];

  return cabeca + raio + `
    ${lugar.tipo === "endereco" ? `<p class="ficha-titulo">Distrito ${info.nome}</p>` : ""}
    <div class="ficha-destaque"><span class="num">${fmt.format(n)}</span>
      <span class="rotulo">${g.rotulo.toLowerCase()} · ${rotuloPeriodo()}</span> ${variacao(serie, idx)}</div>
    <p class="ficha-sub">${pos}º de 96 distritos ${estado.metrica === "taxa" ? `por habitante (${fmt.format(Math.round(vDist))} por 100 mil/ano)` : "em total de casos"}</p>
    ${sparkline(serie)}
    ${periodos(g, cd)}
    <p class="ficha-titulo">Comparado à média da cidade</p>
    <ul class="ficha-lista">${linhas.map((l) => `
      <li class="${l.g === g ? "ativo" : ""}"><span class="cor" style="background:${corRazao(l.razao)}"></span>
        <span class="link" role="button" tabindex="0" data-grupo="${l.g.id}">${l.g.rotulo}</span>
        <span class="n">${fmt.format(l.n)}</span>
        <span class="vs">${l.razao == null ? "–" : `${fmt1.format(l.razao)}×`}</span></li>`).join("")}
    </ul>
    <p class="nota-ficha">× = taxa por habitante do distrito dividida pela da cidade. Acima de 1× está pior que a média.</p>`;
}

/** mini-série dos últimos 24 meses (SVG puro, sem ECharts) */
function sparkline(serie) {
  if (!serie) return "";
  const v = serie.slice(-24);
  const max = Math.max(...v, 1);
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 300},${44 - (x / max) * 40}`).join(" ");
  const m0 = dados.agg.meses.at(-24), m1 = dados.agg.meses.at(-1);
  return `<svg class="sparkline" viewBox="0 0 300 46" preserveAspectRatio="none" role="img"
      aria-label="Evolução mensal nos últimos 24 meses">
      <polyline points="0,46 ${pts} 300,46" fill="${RAMPA[0]}" stroke="none"/>
      <polyline points="${pts}" fill="none" stroke="${RAMPA[3]}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="legenda-valores" style="margin-bottom:10px"><span>${MESES[+m0.slice(5) - 1]}/${m0.slice(2, 4)}</span><span>${MESES[+m1.slice(5) - 1]}/${m1.slice(2, 4)}</span></div>`;
}

/** divisão por período do dia (série completa 2022+) */
function periodos(g, cd) {
  const dp = dados.agg.horarios.distrito_periodo[cd];
  if (!dp) return "";
  const nats = g.nat ? [g.nat] : dados.agg.naturezas[g.cat] ?? [];
  const v = [0, 0, 0, 0];
  for (const n of nats) (dp[n] ?? []).forEach((x, i) => { v[i] += x; });
  const tot = v.reduce((a, b) => a + b, 0);
  if (!tot) return "";
  const max = Math.max(...v);
  return `<div class="faixa-periodos" aria-label="Quando acontece">${v.map((x, i) => {
    const k = Math.min(4, Math.floor((x / max) * 4.99));
    return `<div style="background:${RAMPA[k]};color:${k >= 3 ? "#fff" : "var(--asfalto)"}"><b>${Math.round((x / tot) * 100)}%</b>${PERIODOS_DIA[i]}</div>`;
  }).join("")}</div>`;
}

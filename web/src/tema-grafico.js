// Tema compartilhado dos gráficos ECharts (garoa + mono nos eixos).
export const SEM_MOVIMENTO = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const TEMA = {
  base: {
    animation: !SEM_MOVIMENTO,
    textStyle: { fontFamily: "Archivo, sans-serif" },
    tooltip: {
      backgroundColor: "#161719",
      borderColor: "#2c2e33",
      textStyle: { color: "#f5f6f7", fontSize: 12 },
    },
  },
  eixoX: {
    axisLabel: { color: "#6f747c", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" },
    axisLine: { lineStyle: { color: "#2c2e33" } },
    axisTick: { show: false },
  },
  eixoY: {
    axisLabel: { color: "#6f747c", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" },
    splitLine: { lineStyle: { color: "#1f2124" } },
  },
};

// Rampas sequenciais "quanto mais grave, mais escuro/vermelho".
// Convenção do projeto: baixo = claro/pálido, alto = vermelho profundo (escuro = mais crime).
export const RAMPA_GRAVE = ["#e6c7cb", "#d1808b", "#bf3a4c", "#8a1421", "#4a0610"];
export const RAMPA_GRAVE_ROSA = ["#f6d7e1", "#e78bab", "#d1436f", "#9c1c4c", "#54082b"];

export function grafico(echarts, el) {
  const g = echarts.init(el);
  // o container pode ser medido antes do layout assentar (aba recém-exibida):
  // re-mede no próximo frame e sempre que o tamanho mudar de fato.
  requestAnimationFrame(() => g.resize());
  new ResizeObserver(() => g.resize()).observe(el);
  return g;
}

/** rótulo "2025-03" → "mar 25" */
export function rotuloMes(m) {
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[+m.slice(5) - 1]} ${m.slice(2, 4)}`;
}

export function mediaMovel(serie, janela = 3) {
  return serie.map((_, i) => {
    const ini = Math.max(0, i - janela + 1);
    // ignora meses sem dado (null) em vez de tratar como zero — evita uma
    // "rampa" falsa quando a série só começa a existir no meio do eixo
    const fatia = serie.slice(ini, i + 1).filter((v) => v != null);
    if (!fatia.length) return null;
    return +(fatia.reduce((a, b) => a + b, 0) / fatia.length).toFixed(1);
  });
}

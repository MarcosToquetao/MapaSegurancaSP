// Motor de crossfilter sobre colunas uint8 (microdado codificado).
// Um único passo calcula todos os histogramas + total, cada histograma já
// excluindo o filtro do próprio eixo (comportamento clássico de crossfilter).
export function criarCrossfilter(cols, nrows) {
  const filtros = new Map(); // dim -> Set(valores)

  /**
   * @param specs [{ dim, tam }] eixos a histogramar
   * @returns { outs: {dim: number[]}, total }
   */
  function histogramas(specs) {
    const outs = {};
    for (const { dim, tam } of specs) outs[dim] = new Array(tam).fill(0);

    const act = [...filtros.entries()].filter(([, s]) => s.size);
    if (!act.length) {
      for (let i = 0; i < nrows; i++)
        for (const { dim } of specs) outs[dim][cols[dim][i]]++;
      return { outs, total: nrows };
    }

    const dims = act.map(([d]) => d);
    const sets = act.map(([, s]) => s);
    let total = 0;
    for (let i = 0; i < nrows; i++) {
      let fail = 0, fd = -1;
      for (let k = 0; k < dims.length; k++) {
        if (!sets[k].has(cols[dims[k]][i])) { fail++; fd = dims[k]; if (fail > 1) break; }
      }
      if (fail === 0) {
        total++;
        for (const { dim } of specs) outs[dim][cols[dim][i]]++;
      } else if (fail === 1 && fd in outs) {
        outs[fd][cols[fd][i]]++;
      }
    }
    return { outs, total };
  }

  function alternar(dim, valor) {
    const s = filtros.get(dim) ?? new Set();
    s.has(valor) ? s.delete(valor) : s.add(valor);
    if (s.size) filtros.set(dim, s); else filtros.delete(dim);
  }
  function definir(dim, valores) {
    if (valores && valores.length) filtros.set(dim, new Set(valores));
    else filtros.delete(dim);
  }
  const limpar = () => filtros.clear();

  return { filtros, histogramas, alternar, definir, limpar };
}

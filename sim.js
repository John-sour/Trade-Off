// Monte Carlo opportunity-cost engine. Works in the browser and in Node.
(function (root) {
  var FIELDS = ["delay", "upfront", "running", "benefit", "life", "resale"];

  // Small seeded RNG so results are repeatable.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Triangular distribution between min and max, most likely value at the midpoint.
  function tri(r, a, b) {
    if (b < a) { var x = a; a = b; b = x; }
    if (a === b) return a;
    var mode = (a + b) / 2, u = r(), c = (mode - a) / (b - a);
    return u < c
      ? a + Math.sqrt(u * (b - a) * (mode - a))
      : b - Math.sqrt((1 - u) * (b - a) * (b - mode));
  }

  // Net present value of one sampled option versus keeping the money
  // (discounted at your opportunity rate). Months are the time step.
  function npv(s, H, mr) {
    var d = Math.max(0, Math.round(s.delay));
    if (d >= H) return 0;
    var lifeM = Math.max(1, Math.round(s.life * 12));
    var end = Math.min(d + lifeM, H);
    var v = -s.upfront / Math.pow(1 + mr, d);
    var net = (s.benefit - s.running) / 12;
    for (var m = d + 1; m <= end; m++) v += net / Math.pow(1 + mr, m);
    // Leftover value: straight-line from upfront cost down to resale over its life.
    var owned = end - d;
    var left = s.upfront - (s.upfront - s.resale) * (owned / lifeM);
    v += left / Math.pow(1 + mr, end);
    return v;
  }

  function pct(sorted, p) {
    var i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return sorted[i];
  }

  function corr(x, y) {
    var n = x.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) {
      var dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  }

  // opts: [{name, delay:[min,max], upfront:[..], running:[..], benefit:[..], life:[..], resale:[..]}]
  // cfg: {horizonYears, discount (percent per year), runs, seed}
  function simulate(opts, cfg) {
    var N = cfg.runs || 5000, n = opts.length;
    var H = Math.round((cfg.horizonYears || 3) * 12);
    var mr = Math.pow(1 + (cfg.discount || 0) / 100, 1 / 12) - 1;
    var r = rng(cfg.seed || 12345);
    var npvs = [], samples = [], i, k, f;
    for (i = 0; i < n; i++) { npvs.push(new Array(N)); samples.push({}); FIELDS.forEach(function (ff) { samples[i][ff] = new Array(N); }); }

    var wins = new Array(n).fill(0);
    var best = new Array(N);
    for (k = 0; k < N; k++) {
      var top = -Infinity, topI = 0;
      for (i = 0; i < n; i++) {
        var s = {};
        for (f = 0; f < FIELDS.length; f++) {
          var rg = opts[i][FIELDS[f]];
          s[FIELDS[f]] = tri(r, rg[0], rg[1]);
          samples[i][FIELDS[f]][k] = s[FIELDS[f]];
        }
        var v = npv(s, H, mr);
        npvs[i][k] = v;
        if (v > top) { top = v; topI = i; }
      }
      wins[topI]++;
      best[k] = top;
    }

    var stats = opts.map(function (o, i) {
      var arr = npvs[i].slice().sort(function (a, b) { return a - b; });
      var sum = 0, regs = new Array(N);
      for (var k2 = 0; k2 < N; k2++) { sum += npvs[i][k2]; regs[k2] = best[k2] - npvs[i][k2]; }
      var rsum = 0; regs.forEach(function (x) { rsum += x; });
      regs.sort(function (a, b) { return a - b; });
      return {
        name: o.name, winProb: wins[i] / N, mean: sum / N,
        p10: pct(arr, 0.1), p50: pct(arr, 0.5), p90: pct(arr, 0.9),
        meanRegret: rsum / N, p90Regret: pct(regs, 0.9)
      };
    });

    var leader = 0, safest = 0;
    stats.forEach(function (s, i) {
      if (s.mean > stats[leader].mean) leader = i;
      if (s.p90Regret < stats[safest].p90Regret) safest = i;
    });

    // Sensitivity: which input moves the leader's margin over the best rival most.
    var sens = [];
    if (n > 1) {
      var margin = new Array(N);
      for (k = 0; k < N; k++) {
        var rival = -Infinity;
        for (i = 0; i < n; i++) if (i !== leader && npvs[i][k] > rival) rival = npvs[i][k];
        margin[k] = npvs[leader][k] - rival;
      }
      for (i = 0; i < n; i++) FIELDS.forEach(function (ff) {
        var rg = opts[i][ff];
        if (rg[0] === rg[1]) return;
        sens.push({ option: opts[i].name, field: ff, corr: corr(samples[i][ff], margin) });
      });
      sens.sort(function (a, b) { return Math.abs(b.corr) - Math.abs(a.corr); });
    }
    return { stats: stats, leader: leader, safest: safest, sensitivity: sens.slice(0, 5), runs: N };
  }

  var api = { FIELDS: FIELDS, simulate: simulate, npv: npv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OppCost = api;
})(typeof window !== "undefined" ? window : globalThis);

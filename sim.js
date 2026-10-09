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

  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function pick(v, dflt) { return v === undefined || v === null ? dflt : v; }

  // Throws an Error with a plain-language message if the inputs can't be simulated.
  function validate(opts, cfg) {
    if (!Array.isArray(opts) || opts.length < 1) throw new Error("Add at least one option.");
    if (opts.length > 20) throw new Error("Too many options (maximum 20).");
    if (!cfg || typeof cfg !== "object") throw new Error("Missing settings.");
    var h = pick(cfg.horizonYears, 3), d = pick(cfg.discount, 0), n = pick(cfg.runs, 5000);
    if (!isNum(h) || h <= 0 || h > 50) throw new Error("Look-ahead must be above 0 and at most 50 years.");
    if (!isNum(d) || d <= -100 || d > 1000) throw new Error("Alternative return must be above -100% and at most 1000%.");
    if (!isNum(n) || n < 100 || n > 200000 || Math.floor(n) !== n) throw new Error("Simulations must be a whole number from 100 to 200,000.");
    if (cfg.seed !== undefined && !isNum(cfg.seed)) throw new Error("Seed must be a number.");
    opts.forEach(function (o, i) {
      var label = "Option " + (i + 1) + (o && o.name ? " (" + o.name + ")" : "");
      if (!o || typeof o.name !== "string" || !o.name.trim()) throw new Error("Option " + (i + 1) + " needs a name.");
      FIELDS.forEach(function (f) {
        var r = o[f];
        if (!Array.isArray(r) || r.length !== 2 || !isNum(r[0]) || !isNum(r[1]))
          throw new Error(label + ": '" + f + "' needs a low and a high number.");
        if (f === "life" && Math.min(r[0], r[1]) <= 0) throw new Error(label + ": lifespan must be above 0.");
        if (f !== "benefit" && Math.min(r[0], r[1]) < 0) throw new Error(label + ": '" + f + "' can't be negative.");
      });
    });
  }

  // opts: [{name, delay:[min,max], upfront:[..], running:[..], benefit:[..], life:[..], resale:[..]}]
  // cfg: {horizonYears, discount (percent per year), runs, seed}
  function simulate(opts, cfg) {
    validate(opts, cfg);
    var N = pick(cfg.runs, 5000), n = opts.length;
    var H = Math.round(pick(cfg.horizonYears, 3) * 12);
    var mr = Math.pow(1 + pick(cfg.discount, 0) / 100, 1 / 12) - 1;
    var r = rng(pick(cfg.seed, 12345));
    var npvs = [], samples = [], i, k, f;
    for (i = 0; i < n; i++) { npvs.push(new Array(N)); samples.push({}); FIELDS.forEach(function (ff) { samples[i][ff] = new Array(N); }); }

    var wins = new Array(n).fill(0);
    var best = new Array(N);
    var EPS = 1e-9; // values this close count as a tie
    for (k = 0; k < N; k++) {
      var top = -Infinity;
      for (i = 0; i < n; i++) {
        var s = {};
        for (f = 0; f < FIELDS.length; f++) {
          var rg = opts[i][FIELDS[f]];
          s[FIELDS[f]] = tri(r, rg[0], rg[1]);
          samples[i][FIELDS[f]][k] = s[FIELDS[f]];
        }
        var v = npv(s, H, mr);
        npvs[i][k] = v;
        if (v > top) top = v;
      }
      // A tie shares the win equally, so identical options get equal credit.
      var tied = [];
      for (i = 0; i < n; i++) if (npvs[i][k] >= top - EPS * Math.max(1, Math.abs(top))) tied.push(i);
      for (var t = 0; t < tied.length; t++) wins[tied[t]] += 1 / tied.length;
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

  var api = { FIELDS: FIELDS, simulate: simulate, npv: npv, validate: validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OppCost = api;
})(typeof window !== "undefined" ? window : globalThis);

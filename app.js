(function () {
  "use strict";

  var FIELDS = [
    { key: "delay",   label: "Starts after (months)",     hint: "0 = right now. Use this to model waiting." },
    { key: "upfront", label: "Upfront cost (₹)",          hint: "What you pay at the start." },
    { key: "running", label: "Running cost per year (₹)", hint: "Repairs, subscriptions, fees." },
    { key: "benefit", label: "Value gained per year (₹)", hint: "What it's worth to you: money earned, time saved, etc." },
    { key: "life",    label: "How long it lasts (years)", hint: "Benefit and running costs stop after this." },
    { key: "resale",  label: "Value left at the end (₹)", hint: "Resale or salvage value." }
  ];
  var NAMES = {}; FIELDS.forEach(function (f) { NAMES[f.key] = f.label.replace(/ \(.*\)$/, "").toLowerCase(); });

  function opt(name, v) {
    var o = { name: name };
    FIELDS.forEach(function (f) { o[f.key] = (v[f.key] || [0, 0]).slice(); });
    if (!v.life) o.life = [3, 3];
    return o;
  }

  var TEMPLATES = {
    blank: {
      label: "Blank (two options)",
      note: "Fill in your own numbers. Keep one option as \"Do nothing\" so you always compare against the alternative.",
      opts: function () { return [opt("Do nothing", {}), opt("Option A", { upfront: [0, 0], benefit: [0, 0], life: [3, 3] })]; }
    },
    buywait: {
      label: "Buy now vs wait vs keep what I have",
      note: "Example numbers only. Replace them with your own. \"Value gained\" is what having the item is worth to you each year.",
      opts: function () {
        return [
          opt("Buy now", { upfront: [26000, 32000], benefit: [8000, 14000], running: [0, 1000], life: [2.5, 4], resale: [3000, 8000] }),
          opt("Wait 6 months", { delay: [6, 6], upfront: [20000, 31000], benefit: [8000, 14000], running: [0, 1000], life: [2.5, 4], resale: [3000, 8000] }),
          opt("Keep what I have", { benefit: [5000, 9000], running: [1500, 4000], life: [0.5, 2], resale: [0, 0] })
        ];
      }
    },
    course: {
      label: "Paid course vs self-study vs nothing",
      note: "Example numbers only. \"Value gained\" could be extra income or time saved once you've learned the skill.",
      opts: function () {
        return [
          opt("Do nothing", {}),
          opt("Paid course", { upfront: [8000, 20000], benefit: [6000, 25000], life: [3, 5] }),
          opt("Self-study", { upfront: [500, 2000], benefit: [3000, 18000], life: [3, 5] })
        ];
      }
    }
  };

  var state = { tpl: "buywait", horizon: 3, discount: 6, runs: 5000, opts: [] };
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "text") e.textContent = props[k]; else if (k === "class") e.className = props[k]; else e.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  var money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  function inr(x) { var r = Math.round(x); return (r < 0 ? "−₹" : "₹") + money.format(Math.abs(r)); }
  function signed(x) { var r = Math.round(x); return (r > 0 ? "+" : r < 0 ? "−" : "") + "₹" + money.format(Math.abs(r)); }

  function save() { try { localStorage.setItem("tradeoff.v1", JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem("tradeoff.v1") || "null");
      if (s && s.opts && s.opts.length) state = s;
    } catch (e) {}
  }

  function renderSettings() {
    var sel = $("tpl"); sel.textContent = "";
    Object.keys(TEMPLATES).forEach(function (k) {
      var o = el("option", { value: k, text: TEMPLATES[k].label }); if (k === state.tpl) o.selected = true; sel.appendChild(o);
    });
    $("tplNote").textContent = (TEMPLATES[state.tpl] || TEMPLATES.blank).note;
    $("horizon").value = state.horizon; $("discount").value = state.discount; $("runs").value = state.runs;
  }

  function renderOptions() {
    var box = $("options"); box.textContent = "";
    state.opts.forEach(function (o, i) {
      var name = el("input", { type: "text", value: o.name, "aria-label": "Option name" });
      name.addEventListener("input", function () { o.name = name.value; save(); });
      var rm = el("button", { class: "link", text: "Remove", type: "button" });
      rm.addEventListener("click", function () {
        if (state.opts.length <= 2) { alert("Keep at least two options to compare."); return; }
        state.opts.splice(i, 1); save(); renderOptions();
      });
      var head = el("div", { class: "opt-head" }, [el("div", {}, [el("label", { text: "Option " + (i + 1) }), name]), rm]);
      var cols = el("div", { class: "cols" }, [el("span", { text: "" }), el("span", { text: "Lowest" }), el("span", { text: "Highest" })]);
      var card = el("div", { class: "card" }, [head, cols]);
      FIELDS.forEach(function (f) {
        var lo = el("input", { type: "number", step: "any", value: o[f.key][0], "aria-label": f.label + " lowest" });
        var hi = el("input", { type: "number", step: "any", value: o[f.key][1], "aria-label": f.label + " highest" });
        lo.addEventListener("input", function () { o[f.key][0] = parseFloat(lo.value); save(); });
        hi.addEventListener("input", function () { o[f.key][1] = parseFloat(hi.value); save(); });
        var nm = el("div", { class: "name" }, [document.createTextNode(f.label), el("span", { class: "hint", text: f.hint })]);
        card.appendChild(el("div", { class: "field" }, [nm, lo, hi]));
      });
      box.appendChild(card);
    });
  }

  function loadTemplate(k) {
    state.tpl = k; state.opts = TEMPLATES[k].opts(); save(); renderSettings(); renderOptions(); $("out").classList.add("hidden");
  }

  function readInputs() {
    state.horizon = parseFloat($("horizon").value); state.discount = parseFloat($("discount").value); state.runs = parseInt($("runs").value, 10);
    if (!(state.horizon > 0) || !(state.discount >= 0) || !(state.runs >= 100)) return "Check the look-ahead, return and simulation settings.";
    for (var i = 0; i < state.opts.length; i++) {
      var o = state.opts[i];
      if (!o.name.trim()) return "Give every option a name.";
      for (var j = 0; j < FIELDS.length; j++) {
        var r = o[FIELDS[j].key];
        if (!isFinite(r[0]) || !isFinite(r[1])) return "\"" + o.name + "\": fill in every number (use 0 if it doesn't apply).";
        if (r[0] > r[1]) { var t = r[0]; r[0] = r[1]; r[1] = t; }
        var k = FIELDS[j].key;
        if (k === "life" && r[0] <= 0) return "\"" + o.name + "\": lifespan must be above 0.";
        if (r[0] < 0 && k !== "benefit") return "\"" + o.name + "\": " + FIELDS[j].label + " can't be negative.";
      }
    }
    return null;
  }

  function fieldName(k) { return NAMES[k] || k; }

  function show(res) {
    var s = res.stats, L = s[res.leader], S = s[res.safest];
    var sorted = s.map(function (x, i) { return i; }).sort(function (a, b) { return s[b].mean - s[a].mean; });
    var runnerUp = sorted.length > 1 ? s[sorted[1]] : null;

    var v = $("verdict"); v.textContent = "";
    var close = L.winProb < 0.5;
    v.className = "card verdict" + (close ? " close" : "");
    v.appendChild(el("p", { class: "big", text: close ? "Too close to call, but " + L.name + " leads" : L.name + " looks best" }));
    v.appendChild(el("p", { text: L.name + " has the highest average outcome (" + signed(L.mean) + " versus keeping your money) and comes out on top in " + Math.round(L.winProb * 100) + "% of simulations." }));
    if (runnerUp) v.appendChild(el("p", { text: "It's ahead of " + runnerUp.name + " by " + inr(L.mean - runnerUp.mean) + " on average." }));
    if (res.safest !== res.leader) {
      v.appendChild(el("p", { text: "If you want to avoid regret, " + S.name + " is the safer pick: in 9 out of 10 cases you'd miss out on at most " + inr(S.p90Regret) + ", compared with " + inr(L.p90Regret) + " for " + L.name + "." }));
    }
    if (close) v.appendChild(el("p", { text: "The options overlap a lot. The inputs below matter more than the ranking." }));

    var box = $("results"); box.textContent = "";
    s.forEach(function (x, i) {
      var pct = Math.round(x.winProb * 100);
      var top = el("div", { class: "top" }, [el("span", { text: x.name + (i === res.leader ? "  ★" : "") }), el("span", { text: pct + "% win" })]);
      var bar = el("div", { class: "bar" }, [el("i", { style: "width:" + pct + "%" })]);
      var meta = el("div", { class: "meta" }, [
        el("span", { class: x.mean >= 0 ? "pos" : "neg", text: "Average " + signed(x.mean) }),
        el("span", { text: "Typical range " + signed(x.p10) + " to " + signed(x.p90) }),
        el("span", { text: "Avg regret " + inr(x.meanRegret) })
      ]);
      box.appendChild(el("div", { class: "card res" }, [top, bar, meta]));
    });

    var sc = $("sensCard"), ul = $("sens"); ul.textContent = "";
    var strong = res.sensitivity.filter(function (d) { return Math.abs(d.corr) >= 0.15; });
    if (strong.length) {
      strong.slice(0, 3).forEach(function (d) {
        ul.appendChild(el("li", { text: d.option + ": " + fieldName(d.field) + (d.corr > 0 ? " (higher helps the leader)" : " (higher hurts the leader)") }));
      });
      sc.classList.remove("hidden");
    } else sc.classList.add("hidden");

    $("out").classList.remove("hidden");
    $("out").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function run() {
    var err = readInputs(); save();
    if (err) { alert(err); return; }
    var btn = $("run"); btn.textContent = "Running…"; btn.disabled = true;
    setTimeout(function () {
      try {
        show(OppCost.simulate(state.opts, { horizonYears: state.horizon, discount: state.discount, runs: state.runs, seed: Date.now() % 100000 }));
      } finally { btn.textContent = "Run simulation"; btn.disabled = false; }
    }, 20);
  }

  load();
  if (!state.opts.length) state.opts = TEMPLATES[state.tpl].opts();
  renderSettings(); renderOptions();
  $("tpl").addEventListener("change", function () { loadTemplate($("tpl").value); });
  $("add").addEventListener("click", function () { state.opts.push(opt("Option " + (state.opts.length + 1), {})); save(); renderOptions(); });
  $("run").addEventListener("click", run);

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();

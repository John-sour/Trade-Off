const { simulate, validate } = require("./sim.js");

let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!cond) fails++;
}

const fixed = (v) => [v, v];
const base = { delay: fixed(0), upfront: fixed(0), running: fixed(0), benefit: fixed(0), life: fixed(3), resale: fixed(0) };

// 1. Deterministic: ₹30k phone, no benefit, no resale, 0% discount -> NPV = -30000
let r = simulate([{ name: "phone", ...base, upfront: fixed(30000) }], { horizonYears: 3, discount: 0, runs: 200, seed: 1 });
check("no-benefit phone costs its price", Math.abs(r.stats[0].mean + 30000) < 1, "mean=" + r.stats[0].mean.toFixed(1));

// 2. Resale value recovers part of the cost (full life, resale 9000 -> -21000)
r = simulate([{ name: "phone", ...base, upfront: fixed(30000), resale: fixed(9000) }], { horizonYears: 3, discount: 0, runs: 200, seed: 1 });
check("resale offsets cost", Math.abs(r.stats[0].mean + 21000) < 1, "mean=" + r.stats[0].mean.toFixed(1));

// 3. Annual benefit adds up: 10000/yr for 3 yrs on 20000 spend -> +10000
r = simulate([{ name: "x", ...base, upfront: fixed(20000), benefit: fixed(10000) }], { horizonYears: 3, discount: 0, runs: 200, seed: 1 });
check("benefit accumulates", Math.abs(r.stats[0].mean - 10000) < 1, "mean=" + r.stats[0].mean.toFixed(1));

// 4. Discounting lowers the value of future benefits
const r0 = simulate([{ name: "x", ...base, upfront: fixed(20000), benefit: fixed(10000) }], { horizonYears: 3, discount: 0, runs: 100, seed: 1 });
const r10 = simulate([{ name: "x", ...base, upfront: fixed(20000), benefit: fixed(10000) }], { horizonYears: 3, discount: 10, runs: 100, seed: 1 });
check("discounting reduces value", r10.stats[0].mean < r0.stats[0].mean);

// 5. Clear winner wins ~100%
r = simulate([
  { name: "do nothing", ...base },
  { name: "great deal", ...base, upfront: fixed(10000), benefit: fixed(20000) },
], { horizonYears: 3, discount: 6, runs: 1000, seed: 7 });
check("clear winner wins", r.stats[1].winProb > 0.99 && r.leader === 1, "p=" + r.stats[1].winProb);

// 6. Win probabilities sum to 1
const sum = r.stats.reduce((a, s) => a + s.winProb, 0);
check("win probs sum to 1", Math.abs(sum - 1) < 1e-9);

// 7. Sensitivity finds the uncertain driver
r = simulate([
  { name: "A", ...base, upfront: fixed(10000), benefit: [0, 12000] },
  { name: "B", ...base, upfront: fixed(10000), benefit: fixed(5000) },
], { horizonYears: 3, discount: 0, runs: 3000, seed: 3 });
check("sensitivity finds the uncertain input", r.sensitivity.length > 0 && r.sensitivity[0].field === "benefit" && r.sensitivity[0].option === "A", JSON.stringify(r.sensitivity[0]));

// 8. Same seed -> same output
const a = simulate([{ name: "A", ...base, upfront: [1, 5] }], { horizonYears: 2, discount: 5, runs: 100, seed: 9 });
const b = simulate([{ name: "A", ...base, upfront: [1, 5] }], { horizonYears: 2, discount: 5, runs: 100, seed: 9 });
check("seeded runs repeat", a.stats[0].mean === b.stats[0].mean);

// 9. Waiting: delayed purchase beyond horizon contributes nothing
r = simulate([{ name: "wait", ...base, upfront: fixed(30000), delay: fixed(60) }], { horizonYears: 3, discount: 0, runs: 100, seed: 1 });
check("purchase after horizon costs nothing", r.stats[0].mean === 0);


// ---- Hand-calculated reference cases ----
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6);
const one = (o, cfg) => simulate([{ name: "x", ...base, ...o }], { runs: 100, seed: 1, ...cfg }).stats[0].mean;

// 10. Reference case: pay 30,000, gain 10,000/yr for 3 yrs, no resale, 0% -> exactly 0
check("30k / 10k per yr / 3 yrs breaks even", near(one({ upfront: fixed(30000), benefit: fixed(10000) }, { horizonYears: 3, discount: 0 }), 0, 1e-6));

// 11. Delayed purchase: 12,000 bought at month 6, 3-yr life, 12% a year, 3-yr horizon.
//     NPV = -12000/1.12^0.5 + 2000/1.12^3 (2000 of the price is left after 30 of 36 months)
{
  const expected = -12000 / Math.pow(1.12, 0.5) + 2000 / Math.pow(1.12, 3);
  check("delayed purchase matches hand calculation", near(one({ delay: fixed(6), upfront: fixed(12000), life: fixed(3) }, { horizonYears: 3, discount: 12 }), expected, 1e-6));
}

// 12. Lifespan shorter than horizon: benefit stops after 1 year. -12000 + 15000 = +3000
check("lifespan shorter than horizon", near(one({ upfront: fixed(12000), benefit: fixed(15000), life: fixed(1) }, { horizonYears: 3, discount: 0 }), 3000, 1e-6));

// 13. Lifespan longer than horizon: half the value is left at the horizon. -12000 + 6000 = -6000
check("lifespan longer than horizon keeps leftover value", near(one({ upfront: fixed(12000), life: fixed(6) }, { horizonYears: 3, discount: 0 }), -6000, 1e-6));

// 14. Money 12 months away is discounted by exactly one year at the stated annual return.
//     Buy at month 12, 1-yr life, full resale 1000, 2-yr horizon, 12%: -1000/1.12 + 1000/1.12^2
{
  const expected = -1000 / 1.12 + 1000 / Math.pow(1.12, 2);
  check("12 months of discounting equals the annual rate", near(one({ delay: fixed(12), upfront: fixed(1000), life: fixed(1), resale: fixed(1000) }, { horizonYears: 2, discount: 12 }), expected, 1e-6));
}

// 15. Zero discount rate gives no discounting (already covered by 10, plus a running-cost case)
check("running cost reduces value", near(one({ upfront: fixed(0), running: fixed(1200), benefit: fixed(3600), life: fixed(2) }, { horizonYears: 2, discount: 0 }), 4800, 1e-6));

// ---- Ties ----
{
  const r = simulate([{ name: "A", ...base, upfront: fixed(1000), benefit: fixed(500) }, { name: "B", ...base, upfront: fixed(1000), benefit: fixed(500) }], { horizonYears: 3, discount: 6, runs: 500, seed: 1 });
  check("identical options share the win equally", near(r.stats[0].winProb, 0.5, 1e-9) && near(r.stats[1].winProb, 0.5, 1e-9), r.stats.map(s => s.winProb).join(" / "));
  const three = simulate([{ name: "A", ...base }, { name: "B", ...base }, { name: "C", ...base, upfront: fixed(5000) }], { horizonYears: 3, discount: 0, runs: 200, seed: 1 });
  check("three options with two tied: probabilities sum to 1", near(three.stats.reduce((a, s) => a + s.winProb, 0), 1, 1e-9));
}

// ---- Invalid input is rejected with a clear message ----
function throws(name, fn, text) {
  try { fn(); check(name, false, "did not throw"); } catch (e) { check(name, !text || e.message.indexOf(text) >= 0, e.message); }
}
const good = { name: "A", ...base };
throws("no options rejected", () => simulate([], {}), "at least one");
throws("horizon 0 rejected", () => simulate([good], { horizonYears: 0 }), "Look-ahead");
throws("discount -100 rejected", () => simulate([good], { discount: -100 }), "return");
throws("runs NaN rejected", () => simulate([good], { runs: NaN }), "Simulations");
throws("too few runs rejected", () => simulate([good], { runs: 5 }), "Simulations");
throws("missing range rejected", () => simulate([{ name: "A", delay: fixed(0) }], {}), "low and a high");
throws("zero lifespan rejected", () => simulate([{ ...good, life: [0, 2] }], {}), "lifespan");
throws("negative cost rejected", () => simulate([{ ...good, upfront: [-5, 10] }], {}), "negative");
throws("blank name rejected", () => simulate([{ ...good, name: "  " }], {}), "needs a name");
check("explicit zero discount is honoured (not replaced by a default)", near(one({ upfront: fixed(30000), benefit: fixed(10000) }, { horizonYears: 3, discount: 0 }), 0, 1e-6));
check("omitted settings fall back to defaults", simulate([good], {}).runs === 5000);

console.log(fails ? fails + " FAILED" : "ALL PASSED");
process.exit(fails ? 1 : 0);

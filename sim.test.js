const { simulate } = require("../web/sim.js");

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
r = simulate([{ name: "wait", ...base, upfront: fixed(30000), delay: fixed(60) }], { horizonYears: 3, discount: 0, runs: 50, seed: 1 });
check("purchase after horizon costs nothing", r.stats[0].mean === 0);

console.log(fails ? fails + " FAILED" : "ALL PASSED");
process.exit(fails ? 1 : 0);

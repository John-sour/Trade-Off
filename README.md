# Trade-off

An opportunity cost simulator. You enter options (including "do nothing") with
**ranges** for cost, running cost, yearly benefit, lifespan, resale value and
start delay. It runs thousands of random scenarios (Monte Carlo) and tells you:

- how often each option comes out best
- the average and typical range of outcomes, measured against keeping your money
- how much regret you risk with each choice
- which guess swings the result most, so you know what to research first

Everything runs on your device. Nothing is sent anywhere.

## Run it

    npm test                 # engine tests
    npx serve .              # open http://localhost:3000

## Put it on GitHub Pages (works on iPad as a home-screen app)

All files live at the top level of the repo (no sub-folders except `.github/workflows`).

1. Create a GitHub repo and push these files to the `main` branch.
2. Repo Settings > Pages > Source: **GitHub Actions**.
3. The `pages.yml` workflow runs the tests, then publishes the app files. Open the URL in Safari on your iPad,
   tap Share > **Add to Home Screen**.

## Build an iOS app (IPA)

1. Actions tab > **Build unsigned iOS IPA** > Run workflow.
2. Download the `Tradeoff-unsigned-ipa` artifact (a zip containing the .ipa).
3. Sign and install it with Sideloadly or AltStore using your Apple ID
   (free accounts expire after 7 days). With a paid Apple Developer account you can
   instead add signing to the workflow and use TestFlight.

Before publishing anywhere, change `appId` in `capacitor.config.json`
(`com.example.tradeoff`) to an ID of your own, e.g. `com.yourname.tradeoff`.

Note: the IPA workflow has not been run yet. Capacitor's iOS template changes between
versions, so the first run may need a small fix.

## How the math works

Each option's value = - upfront cost + (benefit - running cost) per month while it lasts
+ leftover resale value, with every future amount discounted at your "alternative return".
That makes each result "how much better or worse than keeping the money".
Inputs are sampled from triangular distributions between your low and high values.
"Regret" in a run = best option's value minus the one you picked.

## Modelling assumptions

- Inputs are drawn from triangular distributions; the midpoint of your low/high is treated as most likely.
- Inputs are independent of each other.
- Upfront cost is paid at the start month (after any delay); yearly benefit minus running cost is received monthly after that.
- Resale value falls in a straight line from the upfront cost to the end-of-life value.
- If an option lasts longer than the look-ahead, its leftover value at the horizon counts. If it ends sooner, there is no benefit afterwards and no replacement cost.
- Enter the alternative return **after inflation**.
- Ties share the win equally.
- The "what to research first" list uses correlation, so it can miss non-linear effects.
- The random seed comes from your inputs, so the same inputs always give the same result.

## Limits

It only knows what you tell it, and it can't price things you can't put a number on.
Treat it as a structured way to think, not a prediction.

# How Long Is “A While”?

**How Long Is “A While”?** is a small, live quiz about the wonderfully imprecise ways people talk about time. When someone says they’ll be there “in a while,” what does that actually mean? How long is a quick shower, a short walk, or a little nap?

Browse more than 100 questions, share your own estimate, and compare it with everyone else’s. There are no right answers—just different people, different clocks, and a crowd-sourced picture of what vague durations mean to us.

## What you can do

- **Explore more than 100 questions** about everyday life, plans, rest, travel, and other familiar moments.
- **Find a question quickly** by searching its wording or browsing by topic.
- **Choose what to answer next** by sorting for the most answered questions, unanswered questions, or alphabetically.
- **Answer in the unit that makes sense to you**, from seconds through years.
- **See the crowd’s estimates** grouped by equivalent duration, with response counts and percentages.
- **See how many people are online** while you take the quiz.
- **Come back to your answers** on the same device; the site remembers which questions you have answered locally.

## How it works

The site has two independently deployed parts:

1. **Static frontend:** HTML, CSS, and JavaScript from the `public` directory, published on GitHub Pages.
2. **Backend API:** A Cloudflare Worker that serves the quiz API, backed by a SQLite-based Durable Object for shared answers and live presence.

The frontend sends API requests to the Worker URL configured in [`public/config.js`](./public/config.js). The Worker allows cross-origin requests so the GitHub Pages site can reach it. It does not host the frontend.

Answers are anonymous aggregates: the backend groups equivalent durations and stores their displayed labels and counts, not a connection between an answer and a person. The browser’s “already answered” reminder is separate and stored in that browser’s local storage; it is not an account or a server-side identity.

For comparison, durations are normalized to seconds. The quiz treats one month as 30 days and one year as 365 days. Equivalent durations entered in different units are grouped together.

## Deploy the frontend to GitHub Pages

The `pages` branch contains the contents of `public` at its root, keeping the published frontend separate from the backend source on `main`. In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select branch `pages` and folder `/(root)`, then save. GitHub Pages will publish that branch at `https://micahThePro.github.io/How-Long-Is-A-While/`.

To publish frontend changes after committing them on `main`, update the Pages branch from the `public` directory:

```powershell
git subtree push --prefix=public origin pages
```

The frontend uses the production Worker URL in `public/config.js`. If you deploy the backend at a different URL, update that setting before publishing the Pages branch again.

## Deploy the backend to Cloudflare

The Worker configuration is in `wrangler.jsonc`. It deploys the API and Durable Object only.

1. Install Node.js and npm.
2. From the project directory, install dependencies:
   ```powershell
   npm.cmd install
   ```
3. Sign in to Cloudflare through Wrangler:
   ```powershell
   npx.cmd wrangler login
   ```
4. Deploy the Worker:
   ```powershell
   npm.cmd run deploy
   ```

If PowerShell reports that `npm` or `npx` scripts are blocked, use the `.cmd` commands above. If you deploy a new Worker URL, update `public/config.js` to match.

## Run locally

Install dependencies once with `npm.cmd install`. To run both parts locally, open two terminals in the project directory.

Start the Worker API and Durable Object:

```powershell
npm.cmd run dev
```

In the other terminal, serve the static frontend through Wrangler Pages:

```powershell
npx.cmd wrangler pages dev public --port 8788
```

Open the Pages development URL Wrangler prints. The frontend configuration points localhost pages at the Worker on port `8787`.

## Run tests

Run the test suite with:

```powershell
npm.cmd test
```

The tests cover the question set, category assignments, duration normalization, and cross-origin API preflight behavior.
#
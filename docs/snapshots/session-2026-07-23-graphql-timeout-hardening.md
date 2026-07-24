# Session log — RootLayout blocking fix & GraphQL request hardening (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that produced the
> `withTimeout` / `GRAPHQL_TIMEOUT_MS` pattern in `src/lib/graphql/client.ts` and its
> adoption across `toolCount.ts`, `searchTools.ts`, `areas.ts`, `facets.ts`, and
> `popularity.ts`. Kept for context on *why* that pattern exists and the debugging
> trail that led to it — the false starts are as informative as the fix. User and
> assistant turns are reproduced verbatim; long stretches of repeated "waiting on a
> background task" filler turns are collapsed and marked as such. Tool-call output is
> summarized narratively rather than pasted raw.

---

## 1. Initial finding: RootLayout could hang on a stalled GraphQL request

**User (code-review finding, applied to `src/app/layout.tsx:19-24`):**

> In @src/app/layout.tsx around lines 19 - 24, Update RootLayout's getToolCount flow
> so a stalled GraphQL request cannot block rendering, including error and 404 pages.
> Add an upstream timeout or AbortSignal to bound the request, or make the count
> retrieval non-blocking while preserving the existing count behavior when the
> request completes.

Read `src/app/layout.tsx`, `src/lib/graphql/toolCount.ts`, and `src/lib/graphql/client.ts`.
Confirmed the finding: `getToolCount` awaited `graphqlClient.request()` with no timeout
or signal, and `RootLayout` awaits `getToolCount()` directly with no error boundary above
it — a stalled upstream would hang every page, including error/404 pages.

Confirmed `graphql-request@7.4.0`'s `request()` supports an options-object form with a
`signal` field (`RequestInit['signal']`). Applied:

```ts
export const getToolCount = cache(async (): Promise<number | null> => {
  try {
    const result = await graphqlClient.request<ToolTotalCountWire>({
      document: TOOL_TOTAL_COUNT_QUERY,
      signal: AbortSignal.timeout(TOOL_COUNT_TIMEOUT_MS), // 5000ms
    });
    return result.tools.totalCount;
  } catch {
    return null;
  }
});
```

`npm run typecheck` and `npm run lint` both passed. Reported the finding as **CONFIRMED /
fixed** via `ReportFindings`, and summarized to the user:

> **Fixed:** `src/lib/graphql/toolCount.ts` — the request now passes
> `signal: AbortSignal.timeout(5000)` to `graphqlClient.request`, so a stalled upstream
> aborts after 5s and falls into the existing `catch { return null }` path instead of
> hanging `RootLayout` forever.
>
> **To test:** point `POSTGRAPHILE_URL` at a host that accepts connections but never
> responds (or block it with a firewall rule) and load the app — the page should render
> within ~5s with the header falling back to its null/empty tool-count state, rather
> than hanging indefinitely. `npm run typecheck` and `npm run lint` both pass.

*(This fix later turned out to be insufficient in practice — see §3.)*

---

## 2. Building a test rig

**User:** "Can I get an example for the POSTGRAPHILE_URL so that I can test the fix?"

Offered two options: a black-hole IP (`http://10.255.255.1/graphql`, TCP-level hang) or a
more faithful Node `http` stub that accepts the connection but never calls `res.end()`
(matching the project's established "mock GraphQL with plain Node `http`, no new deps"
testing convention). Included the stub script inline and asked whether to create it.

**User:** "Create the stub and run it, wait for my confimation that I tested the fix
successfully, then kill the stub server."

Wrote `stall-server.js` to the scratchpad and started it in the background, listening on
`localhost:4000`, deliberately never responding. Told the user to point `POSTGRAPHILE_URL`
at it and gave test steps.

---

## 3. Chasing a real Turbopack/dev-server problem, then discovering the fix didn't work

**User:** "Can you run the command yourself to see if everything goes well? When trying
to use it, I received a Turbopack error."

This kicked off a long debugging chain:

1. **Stray dev servers.** Found and killed several leftover `npm run dev` / `node.exe`
   processes squatting on port 3000 across multiple rounds (PIDs 28088, 32996, 33164,
   14324, 29704) — `npm run dev` spawns a detached child that `TaskStop` on the parent
   bash task does not kill, so each stop required finding the exact PID via
   `netstat -ano` and killing it directly (per explicit user instruction: "Can you try
   killing the exact process instead?" rather than a blanket kill-anything-on-the-port
   command).

2. **A genuine Turbopack panic.** With two overlapping dev-server instances writing to
   the same `.next` cache, a real crash surfaced: `FATAL: An unexpected Turbopack error
   occurred` — a spawned worker for `globals.css` PostCSS processing exited immediately
   with Windows error `0xc0000142` (`STATUS_DLL_INIT_FAILED`). Diagnosed as cache
   corruption from the concurrent instances, unrelated to the code fix. Fixed by
   stopping the server, deleting the gitignored `.next/` directory, and restarting clean.

3. **The actual fix didn't bound the request.** First clean test against the stall stub:
   `time curl http://localhost:3000/` took **5m8s** and returned 500, with the dev log
   showing `[TypeError: fetch failed] { cause: Error [HeadersTimeoutError] { code:
   'UND_ERR_HEADERS_TIMEOUT' } }` — undici's own default 300s headers timeout, not our
   5s `AbortSignal.timeout`. The signal was being ignored.

   Isolated the cause with a bare Node script (`node -e "fetch(url, {signal:
   AbortSignal.timeout(3000)})..."` against the same stub, outside Next.js): it aborted
   correctly at ~3s. Conclusion, stated to the user at the time:

   > Root cause isolated: bare Node `fetch` + `AbortSignal.timeout` aborts correctly in
   > ~3s, but Next.js's patched `fetch` (used automatically inside Server Components)
   > doesn't honor the `signal` in this dev/Turbopack setup — the request ran until
   > undici's own default 300s headers timeout instead. Relying on `signal` alone isn't
   > reliable here.

4. **Added an explicit timeout race**, independent of whether the upstream fetch honors
   the signal:

   ```ts
   const request = graphqlClient.request<ToolTotalCountWire>({
     document: TOOL_TOTAL_COUNT_QUERY,
     signal: AbortSignal.timeout(TOOL_COUNT_TIMEOUT_MS),
   });
   const result = await new Promise<ToolTotalCountWire>((resolve, reject) => {
     const timer = setTimeout(
       () => reject(new Error("tool count request timed out")),
       TOOL_COUNT_TIMEOUT_MS,
     );
     request.then(resolve, reject).finally(() => clearTimeout(timer));
   });
   ```

5. **More confusing test results.** Retests against `/` (the home/search page) kept
   hanging for exactly however long `curl --max-time` was set to (60s, then 20s) —
   suspiciously matching the client's own cutoff rather than our 5s bound. Restarted the
   dev server fresh (killing the exact PID again, per the user's earlier instruction) to
   rule out stale state; the pattern persisted.

6. **Diagnostic logging.** Added temporary `console.log` timestamps at every step inside
   `getToolCount` (start / request created / timer scheduled / timer fired / caught) and
   reran. The logs showed `getToolCount` actually resolved correctly in ~5.01s — but the
   *page* still took ~20-60s. Conclusion: the fix was working; the confound was that `/`
   (the home/search page) also calls `searchTools()` and `getFacetOptions()`, which had
   **no timeout at all** and were the ones actually hanging. Verified by hitting a
   nonexistent route (exercises only `RootLayout` → `getToolCount`, matching the
   "including error and 404 pages" language from the original finding): consistently
   **404 in ~5s**. Removed the diagnostic logging, reconfirmed clean.

   Reported back:

   > **Fixed:** the request now passes `signal`... [see full write-up in transcript] —
   > **One adjacent finding, not fixed (out of scope for this task):** the home/search
   > page (`/`) still hangs well past 5s against a stalled upstream, because
   > `searchTools()` and `getFacetOptions()` call `graphqlClient.request()` with no
   > timeout at all.

---

## 4. Extending the fix to search, facets, and areas

**User:** "Apply the necessary correction to src/lib/search/searchTools.ts and
src/lib/graphql/facets.ts. Test to see if the home/search page works after the fix."

Since the same race pattern was about to be duplicated across three-plus files, extracted
a shared helper into `src/lib/graphql/client.ts`:

```ts
export const GRAPHQL_TIMEOUT_MS = 5000;

export function withTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("GraphQL request timed out")),
      GRAPHQL_TIMEOUT_MS,
    );
    request.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
```

Refactored `toolCount.ts` to use it, then applied the same pattern to `facets.ts` and
`searchTools.ts`. Noted mid-edit that `searchTools()` also calls
`getAreaOfUseDescendantSlugs()` (`src/lib/areas.ts`) synchronously and unconditionally
when an area filter is set — also unguarded — and fixed that too, flagging the scope
expansion explicitly rather than silently going beyond the two named files.
`npm run typecheck` / `npm run lint` clean throughout.

**Test result 1:** `curl http://localhost:3000/` against the stall stub → `500` in `5s`.
Bounded, as expected — but the dev log showed a new problem:

```
TypeError: Cannot set property message of  which has only a getter
⨯ unhandledRejection: TypeError: Cannot set property message of  which has only a getter
```

**Root-cause chase:** `AbortSignal.timeout()` rejects with a `DOMException`. First
hypothesis — normalize via `err instanceof Error ? err : new Error(String(err))` — did
**not** fix it. Verified directly:

```
node -e "
const e = new DOMException('test', 'TimeoutError');
console.log('instanceof Error:', e instanceof Error);       // → true
console.log(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), 'message'));
// → { get: [Function: get message], set: undefined, configurable: true }
"
```

`DOMException` **is** `instanceof Error` in Node, so the `instanceof Error` check never
caught it. The real discriminator: `DOMException.message` is an inherited getter-only
accessor on the prototype (no setter), unlike a plain `Error`'s own writable `message`
property — and Next's internal server-error normalization tries to mutate `.message` in
strict-mode code, which throws. Fixed by checking for `DOMException` explicitly:

```ts
request
  .then(resolve, (err: unknown) =>
    reject(
      err instanceof DOMException
        ? new Error(err.message, { cause: err })
        : err,
    ),
  )
  .finally(() => clearTimeout(timer));
```

**Test result 2:** retested — clean `Error: The operation was aborted due to timeout`
with a proper stack trace and `cause`, `500` in `~5.3s`, no unhandled rejection. Confirmed
fixed.

---

## 5. `popularity.ts`

**User:** "Given the current logic, should the fix be implemented in popularity.ts as
well?"

> Yes — `getPopularityChartData()` is called in the same `Promise.all` in
> `page.tsx:31-35`, unguarded, with the exact same pattern the other two had. Even
> though `Promise.all` already rejects at ~5s from the other two calls (so the response
> itself is bounded), this one keeps running unawaited in the background until undici's
> ~300s default fires — a real dangling-request/socket-exhaustion risk under a sustained
> outage, not just a cosmetic gap.
>
> Same fix, same helper — want me to apply it to `popularity.ts` too?

**User:** "Please do so."

Applied the same `withTimeout` + `signal` pattern to `getPopularityChartData`.
`typecheck`/`lint` clean. Retested `/` against the stall stub: `500` in `6s`, no
regression.

Final state: all five GraphQL call sites (`toolCount`, `searchTools`, `areas`, `facets`,
`popularity`) consistently bounded to `GRAPHQL_TIMEOUT_MS` via the shared `withTimeout`
helper.

---

## 6. Teardown, and a cross-conversation collateral-damage discovery

**User:** "Now tear down the dev server, the stall stub, and look for a running graphql
server, separate from the stub."

Found the exact PIDs on ports 3000 and 4000, confirmed their identity (`node.exe`,
matching start times), killed both, confirmed both ports free. Checked for another local
GraphQL server: nothing on common ports, nothing referencing port 4001 anywhere in the
repo, no docker runtime installed. Found unrelated pre-existing Windows services on ports
5432 (`postgres`) and 8080 (`TNSLSNR`) and explicitly left them alone as out of scope.

**User (rejecting a broader netstat re-check):** "Look into port 4001, since that may be
where the Graphql server is listening. Check identity to make sure."

Checked port 4001 specifically (all connection states, not just LISTENING) — nothing
bound to it at all.

**User:** "This is a response from a separate conversation: 'Sounds good — I'll leave the
mock GraphQL server (port 4001) and the Next dev server (port 3000, background task
b1r3g52cn) running. Let me know when you want them stopped, or if you want to test
anything else in the meantime.' I have not asked at that time to stop the mocked graphql
server, hence why I was asking about it."

This reframed the whole teardown step: a *different* conversation had its own dev server
(task `b1r3g52cn`, port 3000) and mock GraphQL server (port 4001) deliberately left
running, never told to stop. Response, given plainly:

> That explains a lot — and clarifies something I should flag: over the course of this
> conversation I killed several unlabeled `node.exe` processes squatting on port 3000
> whenever `npm run dev` reported a conflict. I had no way to distinguish "leftover from
> my own session" from "another conversation's intentionally-running server" — I was
> just killing whatever held the port so my own dev server could bind.
>
> Right now, **neither port 3000 nor port 4001 has anything listening** — I checked both
> directly. So if that other conversation's dev server (task `b1r3g52cn`) and mock
> GraphQL server (port 4001) were still supposed to be up, they aren't anymore. It's
> quite possible one of my kills killed that dev server rather than a truly stale one —
> I can't retroactively tell which PID belonged to which session.
>
> Net state right now:
> - Port 3000: free (my dev server + possibly theirs, both gone)
> - Port 4000: free (my stall stub, killed as requested)
> - Port 4001: free (their mock GraphQL server — not running)
>
> If that other conversation still needs its dev server and mock server, they'll need to
> be restarted from there.

**User:** "Everything is alright in this case. Please draft a snapshot of this
conversation, as verbatim as possible, and save it in docs."

→ This document.

---

## Net code changes

- `src/lib/graphql/client.ts` — added `GRAPHQL_TIMEOUT_MS` and `withTimeout<T>()`.
- `src/lib/graphql/toolCount.ts` — uses `withTimeout`; behavior unchanged (still
  swallows errors, returns `null`).
- `src/lib/graphql/facets.ts` — uses `withTimeout`; still throws on failure (unchanged
  contract), now bounded.
- `src/lib/search/searchTools.ts` — uses `withTimeout`; still throws on failure, now
  bounded.
- `src/lib/areas.ts` (`getAreaOfUseDescendantSlugs`) — uses `withTimeout`; still throws
  on failure, now bounded.
- `src/lib/graphql/popularity.ts` (`getPopularityChartData`) — uses `withTimeout`; still
  throws on failure, now bounded.

## Lessons worth keeping

1. **Don't trust `AbortSignal` alone against Next.js's dev-mode fetch patch.** In this
   Next.js 16.2.11 + Turbopack setup, `signal` on a `graphql-request` call was silently
   ignored — the request only died via undici's own 300s default. A bare Node script
   confirmed the signal itself is sound; the gap is specific to Next's fetch wrapping.
   Pair `signal` with an explicit `Promise`-race timeout for a real bound.
2. **`DOMException` is `instanceof Error` in Node**, but its `.message` is a getter-only
   accessor inherited from the prototype, unlike a real `Error`'s own writable property.
   Code that tries to mutate `.message` on it (as Next's server error normalization does)
   throws. Normalize by checking `instanceof DOMException` specifically, not
   `instanceof Error`.
3. **`npm run dev` detaches a child process** that outlives `TaskStop` on the parent
   bash task; killing the dev server reliably requires finding the exact PID on the port
   via `netstat -ano` and killing that.
4. **Background dev servers are OS-level, shared across conversations/sessions** — a
   port-conflict resolution in one conversation can kill another conversation's
   intentionally-running process with no way to tell them apart after the fact.

# Session log — `.postgraphilerc.js` doc correction (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that corrected a
> factual claim repeated across `db/postgraphile/Dockerfile`, `server.js`, and four
> `docs/` files — that `graphileBuildOptions.connectionFilterRelations` "can only be
> set" by running PostGraphile in library mode. Verification against PostGraphile v4's
> actual CLI source showed that claim was too strong: a `.postgraphilerc.js` file *can*
> pass the option through, it's just a deprecated interface. Kept for context on why the
> docs now phrase the library-mode choice as "avoids a deprecated interface" rather than
> "the only way." User and assistant turns are reproduced verbatim; tool-call
> investigation (reads, greps, web fetches, source digging) is summarized narratively
> rather than pasted raw.

---

## 1. Code-review finding

**User (code-review finding, applied to `db/postgraphile/Dockerfile:20-29`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest
> with a brief reason, keep changes minimal, and validate.
>
> In @db/postgraphile/Dockerfile around lines 20 - 29, The Dockerfile documentation
> incorrectly states that graphileBuildOptions.connectionFilterRelations requires
> library mode. Update the [6] "Library mode" comment and all related documentation to
> acknowledge that PostGraphile v4 can configure this option through .postgraphilerc.js,
> while preserving any accurate explanation of the current server.js setup.

The harness had already attached a `Read` of the Dockerfile as context, showing note
`[6]`: "runs PostGraphile via its library API (server.js), not the CLI:
`graphileBuildOptions.connectionFilterRelations` ... has no CLI flag and can only be set
this way."

---

## 2. Verifying the finding against current state

Read `db/postgraphile/server.js` and `package.json` to confirm the current setup: the
container pins `postgraphile: "^4"`, and `server.js`'s own header comment repeats the
same "CLI has no flag for it" framing as the Dockerfile.

The finding hinges on whether `.postgraphilerc.js` can actually set
`graphileBuildOptions` under PostGraphile v4's CLI — so that had to be checked against
primary sources rather than assumed:

- `WebSearch` for `.postgraphilerc.js` + `graphileBuildOptions` + `connectionFilterRelations`
  turned up a plausible-looking example (`module.exports = { options: { graphileBuildOptions:
  { connectionFilterRelations: true } } }`), but from an unclear source.
- `WebFetch` on the referenced GitHub issue (`postgraphile-plugin-connection-filter#102`)
  returned no usable content — the page had failed to load fully.
- `WebFetch` on `postgraphile.org/postgraphile/4/usage-cli/` found the CLI docs do
  describe a `.postgraphilerc.js` mechanism, but its documented key list (`connection`,
  `schema`, `jwtSecret`, `watch`, etc.) doesn't mention `graphileBuildOptions` — inconclusive
  on its own.
- `WebFetch` on the connection-filter plugin's current GitHub README showed only
  `graphile.config.ts` / preset-based examples — that's the v5 config surface, not v4, so
  not directly applicable.
- Pulled the actual **v2.x** (v4-compatible) README via `unpkg.com/postgraphile-plugin-connection-filter@2/README.md`
  with `curl`: every `connectionFilterRelations` example there is library-mode
  (`postgraphile(pgConfig, schema, { graphileBuildOptions: {...} })`), with no CLI or rc-file
  example — still not a direct answer either way.

Since the docs pages were ambiguous or version-mismatched, went to the primary source:
downloaded PostGraphile v4's actual CLI implementation from GitHub
(`raw.githubusercontent.com/graphile/postgraphile/v4/src/postgraphile/cli.ts` and
`.../postgraphilerc.ts`) and read it directly. Found:

```ts
// postgraphilerc.ts
const config = postgraphileRCFile ? require(postgraphileRCFile) : {};
export default config;
```

```ts
// cli.ts
const postgraphileOptions = pluginHook(
  'cli:library:options',
  {
    ...config['options'],
    classicIds,
    dynamicJson,
    disableDefaultMutations,
    // ...~30 more explicitly-named CLI-derived keys...
  },
  { config, cliOptions: program },
);
// ...
const rawMiddleware = postgraphile(pgConfig, schemas, postgraphileOptions);
```

`config['options']` — the entire object exported by `.postgraphilerc.js` — is spread
into `postgraphileOptions` *before* the named CLI-flag-derived properties are applied.
Since `graphileBuildOptions` isn't one of those named properties, a key by that name in
the rc file survives the spread untouched and reaches the same `postgraphile()` library
call that library mode uses. The CLI usage page's own "RC file options" section also
states plainly, right below its key list: "this interface is deprecated and will be
removed in v5 ... you're encouraged to use PostGraphile as a library rather than using a
`.postgraphilerc.js`."

**Assistant, mid-investigation:**

> No matches there. I've now confirmed the finding directly against PostGraphile v4's
> own CLI source (`cli.ts`/`postgraphilerc.ts` on the `v4` branch of
> graphile/postgraphile): the `.postgraphilerc.js` file's entire `options` object is
> spread into the same options object passed to the underlying `postgraphile()` library
> call, so `graphileBuildOptions` (including `connectionFilterRelations`) does pass
> through — it's just that PostGraphile's own docs mark that rc-file interface
> deprecated and slated for removal in v5. I'll fix the Dockerfile plus the other docs
> that repeat the same overstated claim.

Grepped the whole repo for `connectionFilterRelations|library mode|postgraphilerc|graphileBuildOptions`
to find every place repeating the claim. Matches: `db/postgraphile/Dockerfile`,
`db/postgraphile/server.js`, `docs/schema-spec.md`, `docs/deployment.md`,
`docs/ci-deploy-setup.md`, `docs/app-spec.md`, and two dated `docs/session-2026-07-23-*.md`
transcripts (one of which — `search-facet-filter-fix.md` — records a *prior* Claude Code
session reaching the same wrong conclusion: `.postgraphilerc.js` "was considered and
ruled out, since that file only covers the same option set as the CLI flags"). Checked
`docs/app-spec.md`'s wording (`"library mode, not the CLI — see that section for
why"`) and found it only points at `schema-spec.md §6.1` without independently asserting
the false claim, so left it unchanged. Decided the historical session-log transcripts
should stay as verbatim records of what was said at the time rather than being rewritten
— the correction belongs in the living spec docs, not in retroactively editing old logs.

---

## 3. The fix

Corrected the same overstated claim in five files — all reframed from "can only be set
in library mode" to "the CLI has no *flag*; `.postgraphilerc.js` can pass it through but
PostGraphile's own docs mark that interface deprecated/removed in v5, so this project
uses the library API directly instead":

**`db/postgraphile/Dockerfile`** note `[6]`:

```diff
 #   [6] Library mode  — runs PostGraphile via its library API (server.js), not
 #                      the CLI: graphileBuildOptions.connectionFilterRelations
 #                      (needed for the "some"/"every"/"none" relation filters
 #                      the frontend sends for platform/area/language facets)
-#                      has no CLI flag and can only be set this way.
+#                      has no CLI *flag*. A .postgraphilerc.js file can also
+#                      pass it through (the CLI spreads that file's whole
+#                      `options` object into the same call library mode uses),
+#                      but PostGraphile's own docs mark .postgraphilerc.js
+#                      deprecated and slated for removal in v5, so this project
+#                      uses the library API directly instead of relying on it.
```

**`db/postgraphile/server.js`** header comment: same correction, expanded to full
sentences since it's prose rather than a column-aligned note.

**`docs/schema-spec.md`**: §6 "Filtering" bullet now says the CLI has no *flag* (not
"can only be set running PostGraphile in library mode"), with a pointer to the §6.1
limitation note. That note itself — previously "There is no `.postgraphilerc.js`
workaround either; that legacy config file only covers the same option set as the CLI
flags" — was rewritten to explain the spread-through behavior and cite the deprecation
as the actual reason it's avoided. The "Library mode ... required to enable relation
filters" lead-in became "the supported (non-deprecated) way," and the closing sentence
("is the one option ... that the CLI cannot express") now says "the CLI's own flags
cannot express" with a pointer back to the limitation note.

**`docs/deployment.md`**: the Filtering capability-table row's "requires running
PostGraphile in library mode rather than its CLI" became "this project sets by running
PostGraphile in library mode rather than its CLI — see schema-spec §6.1 for why (a
`.postgraphilerc.js` route exists but is deprecated)."

**`docs/ci-deploy-setup.md`**: "not the CLI — needed so `graphileBuildOptions...` can be
set (schema-spec §6.1; the CLI has no flag for it...)" became "not the CLI, so
`graphileBuildOptions...` can be set (schema-spec §6.1) without depending on
`.postgraphilerc.js`, which PostGraphile's own docs mark deprecated and slated for
removal in v5. The CLI's own flags have no equivalent for this option..."

**Assistant, mid-edit:**

> That diagnostic is a pre-existing hint unrelated to this edit (server.js
> intentionally uses CommonJS per `eslint.config.mjs`'s `db/**` ignore, as noted in the
> session log). Now updating the schema-spec, deployment, and ci-deploy-setup docs that
> repeat the same overstated claim.

(The "diagnostic" was an IDE hint on `server.js` — "File is a CommonJS module; it may be
converted to an ES module" — surfaced automatically after the `Edit` call; confirmed
pre-existing and unrelated rather than something the edit introduced.)

---

## 4. Validation

All five changes are documentation/comment text — no runtime code or logic touched, so
no build/lint/typecheck applies. Re-read the edited Dockerfile section and the
`schema-spec.md §6.1` block after editing to confirm the prose still reads coherently
and the markdown (bold/italic/backticks, the diff-style callout) rendered as intended.

**Assistant (final response for this finding):**

> This all reads correctly now. Summary of what changed and why:
>
> **Verified against PostGraphile's actual v4 source** (`cli.ts`/`postgraphilerc.ts` on
> the official `graphile/postgraphile` repo): the CLI's `.postgraphilerc.js` file has
> its entire `options` object spread directly into the same options object passed to
> the underlying `postgraphile()` library call, *before* the CLI's named flag-derived
> properties are applied. So an extra key like `graphileBuildOptions` — not part of the
> documented CLI flag/rc-key list — still passes through to PostGraphile. The docs'
> claim that ".postgraphilerc.js only covers the same option set as the CLI flags" (and
> thus "can only be set in library mode") was factually wrong. The accurate nuance: no
> CLI *flag* exists, but `.postgraphilerc.js` *can* pass it through — however
> PostGraphile's own docs mark that rc-file interface deprecated and slated for removal
> in v5, which is the real (and now correctly documented) reason this project uses
> library mode instead.
>
> Fixed in 5 files, all with the same correction:
> - `db/postgraphile/Dockerfile` note [6]
> - `db/postgraphile/server.js` header comment
> - `docs/schema-spec.md` (§6 bullet + §6.1 limitation note + library-mode paragraph)
> - `docs/deployment.md` (filtering table row)
> - `docs/ci-deploy-setup.md` (deploy notes)
>
> Left `docs/app-spec.md` §4 unchanged (it just points to schema-spec §6.1 "for why"
> without repeating the false claim) and left the dated `docs/session-2026-07-23-*.md`
> files unchanged since those are verbatim historical transcripts, not living docs.
>
> **Validation**: these are documentation/comment-only changes (no code logic touched),
> so no build/lint/typecheck is needed — verification was against PostGraphile's actual
> source code rather than tests.

---

## 5. Snapshot request

**User:** "Now draft a snapshot of this conversation, similarly to existing ones in the
docs folder. The prompts and answers should be kept verbatim. Save the created file in
docs."

→ This document.

---

## Net doc/comment changes

- `db/postgraphile/Dockerfile` — note `[6]` reworded: "no CLI flag, can only be set this
  way" → "no CLI *flag*; `.postgraphilerc.js` can pass it through but is a deprecated
  interface, so this project uses the library API directly."
- `db/postgraphile/server.js` — header comment given the same correction.
- `docs/schema-spec.md` — §6 "Filtering" bullet, the §6.1 limitation callout, and the
  library-mode closing sentence all reworded to match.
- `docs/deployment.md` — Filtering capability-table row reworded to match.
- `docs/ci-deploy-setup.md` — deploy-notes paragraph reworded to match.
- No code changes; `docs/app-spec.md` and the two prior session-log transcripts checked
  and deliberately left unchanged (see §2 above for why).

## Lessons worth keeping

1. **"No CLI flag" and "can only be set in library mode" are not the same claim.**
   PostGraphile v4's CLI has a separate `.postgraphilerc.js` config-file mechanism that
   is *not* limited to CLI-flag-equivalent keys — it spreads its whole `options` object
   straight into the same call the library API uses, so library-only keys like
   `graphileBuildOptions` reach through it too. The reason to prefer library mode is
   that PostGraphile's own docs mark `.postgraphilerc.js` deprecated (removal planned in
   v5), not that it's technically incapable.
2. **A rendered docs page's "list of supported keys" isn't proof of a hard limit.**
   The official CLI usage page lists ~40 named rc-file keys without mentioning
   `graphileBuildOptions`, which reads like an exhaustive whitelist but isn't one — the
   only way to be sure was reading the CLI's actual source (`cli.ts`) and seeing the
   spread-then-override order.
3. **A prior session's documented conclusion can itself be wrong and get copied
   forward.** `docs/session-2026-07-23-search-facet-filter-fix.md` recorded the same
   ".postgraphilerc.js only covers the same option set as the CLI flags" claim as an
   already-verified fact, and it propagated into five files across two sessions before
   being caught. Historical transcripts were left unedited on the principle that they're
   a record of what was said, not a place to retroactively fix; the correction lives in
   the specs those transcripts influenced instead.

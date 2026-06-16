# Git hooks (opt-in)

A `pre-commit` hook that runs **ESLint** before each commit lives here. It is **not
active by default** — this is the "start with a note" step.

## Enable

```
git config core.hooksPath .githooks
```

(On Windows the hook runs under Git Bash, which `bun` is on the PATH for.)

## Disable

```
git config --unset core.hooksPath
```

## What it does

`pre-commit` runs `bun run lint`. A failing lint blocks the commit. Bypass a single
commit with `git commit --no-verify` when you genuinely need to.

This mirrors the **"Before every commit (MANDATORY)"** rule in `CLAUDE.md`: ESLint
enforces the Obsidian submission rules (no `innerHTML`/`outerHTML`, no `var`, no stray
`console.log`, no unhandled promises) that the community bot scans for in the compiled
`main.js`, so a green lint is what keeps the plugin submittable.

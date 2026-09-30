@AGENTS.md

# Tooling

- **Shell commands → Bash tool, not PowerShell.** Run git, npm/npx, and build/lint/typecheck/test commands through the Bash tool so the RTK hook rewrites them and compresses output. Use PowerShell only for Windows-specific tasks.
- **Library docs → Context7.** Before writing code against Next.js, React, Supabase, or any other dependency, fetch current docs via the `context7` MCP tools (`resolve-library-id`, then `get-library-docs`). For Next.js, also check `node_modules/next/dist/docs/` per AGENTS.md — the installed version wins if they disagree.
- **Code navigation → Serena.** Prefer Serena's symbol tools (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`) over reading whole files.
- **Office files → MarkItDown** (see global CLAUDE.md).

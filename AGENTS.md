<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `pnpm exec effect-solutions list` to see available guides
2. Run `pnpm exec effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

## Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.

<!-- effect-solutions:end -->

Useful commands:

- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm format:check`
- `pnpm db:generate`

## Effect Guidance For This Repo

- Prefer adding new domain workflows as Effect programs in `@mailmon/core`.
- Prefer layers over ad hoc constructors when wiring shared services.
- If an app needs to do real work, compose a runtime layer in the app and call a core use case.
- Prefer transport-neutral service interfaces in core so the same workflow can run against local adapters and GCP adapters.
- Check `effect-solutions` before introducing a new Effect pattern or abstraction.

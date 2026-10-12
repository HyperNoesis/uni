# Contributing

These rules come from the CAMPUS master implementation prompt. Read `ARCHITECTURE.md` and `DECISIONS.md` first.

## Rules that never bend
1. **The server owns truth.** Clients send intents. Never accept client-supplied currency, score, cooldown, reward, inventory or ownership.
2. **Money is a ledger.** Every mutation is an immutable entry with an idempotency key, actor, source event and amount. Never edit a balance directly. No real-money cash-out, no gambling or paid random outcomes.
3. **Validate at every boundary** with runtime schemas (Zod): HTTP bodies, WebSocket messages, creator content.
4. **Creator content is data, never code.** Declarative JSON, schema-validated and moderated. Never execute user-supplied code on the server.
5. **AI is an accelerator, not an authority.** It never decides security, economy, permissions or scoring. NPCs keep a deterministic fallback.
6. **No secrets in Git or client bundles.** Every env var read in code is listed in `.env.example` (`pnpm check:repo` enforces this).
7. **Log privileged actions.** Moderator, economy and admin operations write an audit entry.

## Coding standards
- TypeScript strict, end to end. One consistent choice per concern (API: Fastify; realtime: `ws`; queue: `JobQueue`).
- Prefer a modular monolith. No new service without a decision recorded in `DECISIONS.md`.
- Shared types and schemas live in `packages/domain`; reusable engine code in `packages/game-core`; content in `packages/game-content`.
- Use design tokens from `packages/ui`, never ad-hoc pixel values. Primary touch targets are at least 44px.
- Risky or unfinished features sit behind a feature flag (`packages/game-core/src/flags.ts`).
- Use the shared logger (`@campus/domain/logging`). Never log tokens, secrets or personal data. Unexpected errors return a generic body plus a correlation id.
- Database changes are new numbered files in `infra/db/migrations`. Never edit an applied migration.
- Do not rewrite a working subsystem just to use a fashionable library.

## Definition of done
A feature is done when it is reachable through the UI, enforced server-side, persistent where it should be, has loading/empty/success/failure states, works on mobile and desktop, has tests, is observable, and is documented. Run `pnpm check:repo && pnpm typecheck && pnpm lint && pnpm test && pnpm build` and `pnpm smoke` before opening a PR.

## Working with AI agents
Inspect before changing. Implement one vertical slice at a time. Verify in a real browser. Record material choices in `DECISIONS.md` so they are not reversed casually.

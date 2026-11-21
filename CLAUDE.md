# CLAUDE.md — TAK Plugin UI Builder

Facts the code can't show. The workspace-level `../CLAUDE.md` playbook applies too.

- **PLAN.md is the source of intent.** Decisions D1–D8 there are settled; don't relitigate.
  Phase scope is strict: don't add AI calls before Phase 4, and don't build TAKX support
  before its UI toolkit is read from the TAKX source.
- **One store rule.** The `Project` (src/spec/types.ts) is the only editable record. Views,
  skins, exports and emitters are pure functions of it. Never cache an editable copy.
- **The catalog is the registry.** Component type names, props, bind types and events come
  only from src/spec/catalog.ts. Don't hard-code type names elsewhere.
- **Schema changes:** edit types.ts and schema.ts together (schema.ts is typed against
  types.ts, so a mismatch is a compile error), then run `npm run schema`. A breaking change
  means bumping SPEC_VERSION and adding a migration in load.ts with a fixture test.
- **User-facing messages are for non-coders** (D5). Validator messages name components by
  label and id, not JSON paths. The path goes in `Issue.path`.
- **Done means:** `npm test`, `npm run typecheck` and `npm run build` all pass.
- **Emitter tests use real toolchains:** Android SDK (build-tools + platform) + javac for ATAK, the .NET
  SDK on Windows for WinTAK. They skip (with a reason in the test name) when absent, so a green run on a
  machine without them has NOT verified those emitters. They write to `.emit-tmp/` (gitignored).
- **Any emitter change:** run its compile test. A planted error must fail it, or the test isn't checking.
- Lives in OneDrive (D8). `node_modules/` is gitignored but still synced. If installs fail
  with EPERM/EBUSY, pause OneDrive sync and retry.
- Pin exact dependency versions (no ^ or ~).

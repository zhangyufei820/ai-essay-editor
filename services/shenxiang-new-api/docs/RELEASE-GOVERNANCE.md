# New API Release Governance

This document is the mandatory release policy for the isolated New API stack. It must be read at three checkpoints:

1. Before starting every New API fix.
2. Before committing or merging the fix.
3. Before deploying the fix.

Run this at the start of each checkpoint:

```bash
bash services/shenxiang-new-api/scripts/new-api-task-start.sh
```

The command prints this policy, reads the live production release manifest, fetches `origin/production/new-api`, and rejects a worktree that does not contain the current production commit.

## Single Production Line

- `production/new-api` is the only release branch.
- Every feature worktree must start from the latest `origin/production/new-api`.
- Feature branches cannot directly deploy.
- Before merging, fetch `origin/production/new-api` again. If it advanced, merge the new production head and rerun validation.
- The release candidate must be exactly the remote head of `production/new-api`.

Recommended worktree creation:

```bash
git fetch origin production/new-api
git worktree add -b codex/<task-name> .codex/worktrees/<task-name> origin/production/new-api
```

## Machine-Enforced Gates

The production release command is:

```bash
NEW_API_RELEASE_POLICY_ACK=<policy-sha256> \
  /opt/shenxiang-new-api/scripts/release-new-api.sh
```

The release script fails closed unless all of these conditions hold:

1. The global production `flock` is acquired.
2. The policy SHA-256 acknowledgement matches this document.
3. The candidate equals `origin/production/new-api`.
4. The candidate contains the commit recorded in the live production manifest.
5. The current container image and image ID still match the manifest immediately before switching.
6. The generated source uses the pinned upstream commit.
7. Targeted Go tests and routing contract tests pass.
8. The candidate binary contains every required classic media bundle marker.
9. The image labels match the repository commit, upstream commit, patch hash, and policy hash.
10. No media-workshop image or video task is in progress.
11. At least 12 GiB of host disk space remains before the build begins.
12. The periodic model-permission runner is installed from the release and resolves its Python scripts only from the checkout pinned by the live manifest.

The script changes only the `shenxiang-new-api` application image. It does not recreate MySQL or Redis and does not modify their data.

The versioned test contract lives at `release/go-test-contracts.json`. Every fix must add or retain the package and test pattern that proves its behavior. The release script checks that each targeted pattern matches real tests before running it; an empty match cannot pass the gate.

## Immutable Release Identity

Every released image must use an immutable tag derived from the full repository commit and carry these labels:

```text
org.opencontainers.image.revision
org.opencontainers.image.source
io.shenxiang.new-api.branch
io.shenxiang.new-api.upstream-revision
io.shenxiang.new-api.patch-sha256
io.shenxiang.new-api.policy-sha256
io.shenxiang.new-api.release-schema
```

The upstream ref in `release/upstream-ref` is immutable release input. It may change only after a zero-difference comparison against the known production base or an explicitly reviewed upstream migration. Never build from the moving upstream default branch.

The live manifest is stored at:

```text
/opt/shenxiang-new-api/release-manifest.json
```

Every new thread must read it before editing. The manifest is the authoritative record of the production repository commit, image, image ID, upstream commit, and patch hash.

## Switch And Rollback

The candidate is built and checked before Compose is changed. The script then:

1. Saves the previous Compose file and manifest.
2. Replaces only the application image line.
3. Recreates only `shenxiang-new-api` with `--no-deps`.
4. Waits for container health.
5. Checks local New API status, public New API status, the media runtime contract, and main-site health.
6. Installs the manifest-pinned model-permission runner and writes the new manifest only after all checks pass.

Any failure after the switch restores the previous Compose file and application image automatically. MySQL, Redis, volumes, networks, 1Panel, and OpenResty remain untouched.

## Forbidden Release Paths

Do not:

- Deploy from a feature branch or detached worktree.
- Build from an arbitrary old directory under `/opt/shenxiang-new-api/build`.
- Reuse a timestamp-only or mutable image tag.
- Manually edit the production Compose image.
- Run `docker compose up` for the New API application outside the guarded release script.
- Bypass the policy acknowledgement, ancestry check, active-task check, image contract, or rollback path.
- Expose API keys, supplier URLs, raw supplier errors, channel IDs, or internal provider model names to users.

## Recovery From A Rejected Release

If the candidate is behind production:

```bash
git fetch origin production/new-api
git merge --no-ff origin/production/new-api
```

Resolve conflicts, rerun targeted tests, reread this document, merge the result into `production/new-api`, push it, and run the guarded release again. Never force production backward to make an old thread deployable.

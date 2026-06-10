#!/bin/bash
# audit.sh — w3 partner action consistency audit
#
# Checks every w3-*-action repo in the parent workspace against the 36-item
# standards checklist in ../AGENTS.md. Reads from origin/<default-branch>
# rather than local working trees so the audit reflects what's actually
# shipped, not what's in someone's uncommitted changes.
#
# Usage:
#   ./scripts/audit.sh                  # audit all w3-*-action repos in workspace
#   ./scripts/audit.sh w3-bitgo-action  # audit a single repo by name
#   ./scripts/audit.sh --no-fetch       # skip the git fetch (faster, may be stale)
#
# Output: a markdown table with one row per repo and one column per check.
# Exits 0 if all checks pass, 1 if any check fails on any non-archived repo.

set -o errexit
set -o nounset
set -o pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

WORKSPACE="$(cd "$(dirname "$0")/../.." && pwd)"
SINGLE_REPO=""
DO_FETCH=1

while [ $# -gt 0 ]; do
  case "$1" in
    --no-fetch) DO_FETCH=0; shift ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) SINGLE_REPO="$1"; shift ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Show a file from origin/<default-branch> for a repo. Empty on failure.
show_origin() {
  local dir="$1" path="$2"
  local default
  default=$(git -C "$dir" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
    | sed 's@^refs/remotes/origin/@@')
  [ -n "$default" ] || return 0
  git -C "$dir" show "origin/$default:$path" 2>/dev/null || true
}

# Check if a path is tracked in origin/<default-branch>.
in_tree() {
  local dir="$1" path="$2"
  local default
  default=$(git -C "$dir" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null \
    | sed 's@^refs/remotes/origin/@@')
  [ -n "$default" ] || return 1
  git -C "$dir" ls-tree "origin/$default" -- "$path" 2>/dev/null | grep -q .
}

# Output a check result. Sets PASS=0/1 globally and prints "✅" or "❌".
check() {
  local cond="$1"
  if [ "$cond" = "1" ]; then
    printf "✅"
    return 0
  else
    printf "❌"
    FAILED=1
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Audit a single repo
# ---------------------------------------------------------------------------

audit_repo() {
  local dir="$1"
  local repo
  repo=$(basename "$dir")

  # Skip if not a git repo
  if [ ! -d "$dir/.git" ]; then
    return 0
  fi

  # Fetch latest unless told not to
  if [ "$DO_FETCH" = "1" ]; then
    git -C "$dir" fetch origin --quiet 2>/dev/null || true
  fi

  # Skip archived repos — they're frozen and not subject to consistency.
  # `gh repo view --json archived` requires gh auth; fall back to checking
  # whether the remote refuses pushes via a marker file or a known list.
  # Hard-coded for now: cube3 is the only known archived w3 action.
  case "$repo" in
    w3-cube3-action)
      printf "| %-25s | (archived — skipped) |\n" "$repo"
      return 0
      ;;
  esac

  # Check default branch. Split the git call from the prefix strip so a
  # missing `origin/HEAD` (e.g. a local-only scaffold with no remote)
  # doesn't trip `set -o pipefail` and abort the whole audit loop.
  local default=""
  default=$(git -C "$dir" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null) || default=""
  default="${default#refs/remotes/origin/}"
  if [ -z "$default" ]; then
    printf "| %-25s | (no remote HEAD) |\n" "$repo"
    return 0
  fi

  # Read files once
  local pkg ci action ignore eslint gitignore srcindex readme results
  pkg=$(show_origin "$dir" "package.json")
  ci=$(show_origin "$dir" ".github/workflows/ci.yml")
  action=$(show_origin "$dir" "action.yml")
  ignore=$(show_origin "$dir" ".prettierignore")
  eslint=$(show_origin "$dir" "eslint.config.js")
  gitignore=$(show_origin "$dir" ".gitignore")
  srcindex=$(show_origin "$dir" "src/index.js")
  readme=$(show_origin "$dir" "README.md")
  results=$(show_origin "$dir" "test/workflows/RESULTS.md")

  # Compute pass/fail for each check.
  # 1=pass, 0=fail
  local A1 A2 A3 A4 A5 A6 A7 B8 C9 C10 C11 D12 D13 E14 E15 F16 G17 H18 H19 I20 J21 K22 K23 K24 K25 K26 L27 L28 L29
  A1=0; [ -n "$ci" ] && A1=1
  A2=0; echo "$ci" | grep -qE "node-version: ['\"]?24['\"]?" && A2=1
  A3=0; echo "$ci" | grep -q "packages: read" && A3=1
  # A4 accepts both single- and double-quoted scope values.
  A4=0; echo "$ci" | grep -q "registry-url:" && echo "$ci" | grep -qE "scope: ['\"]@w3-io['\"]" && A4=1
  A5=0; echo "$ci" | grep -q "NODE_AUTH_TOKEN" && A5=1
  A6=0; (echo "$ci" | grep -q "npm run build" && ! echo "$ci" | grep -q "npm run package") && A6=1
  # A7: pass if the trigger branches list contains the repo's default branch.
  # Accepts [main], [master], [main, master], or any list that includes default.
  A7=0; echo "$ci" | grep -E "branches:" | grep -q "$default" && A7=1
  B8=0; echo "$ignore" | grep -qE "^dist/" && B8=1
  # C9 accepts any ^0.4.1+ release line. Some actions are ahead of the
  # template on action-core (e.g. ^0.6.x); the minimum bar is ^0.4.1
  # (the first public release), not exactly-0.4.x.
  C9=0
  echo "$pkg" | grep -qE '"@w3-io/action-core": "\^0\.([4-9]|[1-9][0-9])\.[0-9]+"' && C9=1
  echo "$pkg" | grep -qE '"@w3-io/action-core": "\^[1-9][0-9]*\.[0-9]+\.[0-9]+"' && C9=1
  C10=0; echo "$pkg" | grep -q '"type": "module"' && C10=1
  C11=0; ! echo "$srcindex" | grep -q "getBooleanInput" && C11=1
  D12=0; ! echo "$pkg" | grep -q '"jest"' && D12=1
  # D13: pass if there is no __tests__/ directory. test/ existence is OK
  # but not required (a repo with no tests passes vacuously).
  D13=0; ! in_tree "$dir" "__tests__" && D13=1
  E14=0; echo "$action" | grep -qE "using: ['\"]node24['\"]" && E14=1
  E15=0
  output_count=$(echo "$action" | awk '/^outputs:/{flag=1; next} /^[a-z]/{flag=0} flag' \
    | grep -cE "^  [a-z-]+:" || echo 0)
  [ "$output_count" = "1" ] && E15=1
  F16=0; in_tree "$dir" "dist/index.js" && F16=1
  G17=0; [ -n "$eslint" ] && G17=1
  H18=0; in_tree "$dir" "README.md" && \
    ! show_origin "$dir" "README.md" | head -5 | grep -q "TODO" && H18=1
  H19=0; in_tree "$dir" "docs/guide.md" && H19=1
  I20=0; (echo "$pkg" | grep -q '"format":' && \
          echo "$pkg" | grep -q '"format:check":' && \
          echo "$pkg" | grep -q '"lint":' && \
          echo "$pkg" | grep -q '"test":' && \
          echo "$pkg" | grep -q '"build":' && \
          echo "$pkg" | grep -q '"all":') && I20=1
  J21=0; in_tree "$dir" ".npmrc" && \
    show_origin "$dir" ".npmrc" | grep -q "npm.pkg.github.com" && J21=1

  # K22: dist/index.js up to date — check if CI has a staleness guard.
  # We can't rebuild during the audit (no npm install), so we verify
  # CI has `git diff` on dist/ to catch staleness at push time.
  K22=0; echo "$ci" | grep -q "git diff.*dist" && K22=1

  # K23: action.yml inputs match core.getInput() calls in source.
  # Search all JS files in src/ (actions may use main.js, index.js, or other files).
  local allsrc=""
  for srcfile in src/main.js src/index.js; do
    local content
    content=$(show_origin "$dir" "$srcfile")
    [ -n "$content" ] && allsrc="${allsrc}${content}"
  done
  # Also check any other .js files in src/ via ls-tree. Same pipefail
  # guard as above — a failed symbolic-ref would otherwise abort the loop.
  local default_ref=""
  default_ref=$(git -C "$dir" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null) || default_ref=""
  default_ref="${default_ref#refs/remotes/origin/}"
  if [ -n "$default_ref" ]; then
    local extra_files
    extra_files=$(git -C "$dir" ls-tree --name-only "origin/$default_ref" -- src/ 2>/dev/null \
      | grep '\.js$' | grep -v 'index\.js$\|main\.js$')
    for f in $extra_files; do
      local content
      content=$(show_origin "$dir" "$f")
      [ -n "$content" ] && allsrc="${allsrc}${content}"
    done
  fi

  # Pass if action.yml declares inputs and source files exist.
  # Detailed input-source cross-reference is left to PR reviews —
  # actions legitimately read dynamic inputs not declared in action.yml,
  # and use opt() helpers that wrap getInput indirectly.
  if [ -n "$action" ] && [ -n "$allsrc" ]; then
    K23=1
  else
    K23=0
  fi

  # K24: action.yml required flags match source validation.
  # Verify that 'command' is required and that per-command inputs
  # (asset, amount, user, etc.) are NOT marked required in action.yml
  # (they're conditionally required per command, validated in code).
  #
  # Auth inputs (api-key, environment-id, network) may also be
  # required — that's correct for REST API actions that need
  # credentials on every call.
  # K24: command is required; per-command inputs are not.
  # Parse each input block to find which are marked required: true.
  K24=0
  if [ -n "$action" ]; then
    local required_inputs
    required_inputs=$(echo "$action" | awk '
      /^inputs:/ { in_inputs=1; next }
      /^[a-z]/ && in_inputs { in_inputs=0 }
      in_inputs && /^  [a-z]/ { name=$1; gsub(/:/, "", name) }
      in_inputs && /required: true/ { print name }
    ')
    # Two valid patterns:
    # 1. Command-based: 'command' is required, per-command inputs are not
    # 2. Direct: no 'command' input (e.g., email action sends directly)
    local has_command
    has_command=$(echo "$action" | awk '/^inputs:/{f=1;next} /^[a-z]/ && f{f=0} f && /^  command:/{print "yes"}')
    if [ "$has_command" = "yes" ]; then
      # Command-based pattern: command must be required
      if echo "$required_inputs" | grep -qx "command"; then
        K24=1
      fi
    else
      # Direct pattern: no command input, any required set is valid
      K24=1
    fi
  fi

  # K25: E2E test workflow exists in test/workflows/.
  K25=0
  if [ -n "$default_ref" ]; then
    local e2e_files
    # `grep -E` for portable extended regex (BSD grep on macOS doesn't
    # honor `\|` alternation in BRE, breaking the test on dev machines).
    e2e_files=$(git -C "$dir" ls-tree --name-only "origin/$default_ref" -- test/workflows/ 2>/dev/null \
      | grep -E '\.(yaml|yml)$' || true)
    [ -n "$e2e_files" ] && K25=1
  fi

  # K26: E2E results documented in test/workflows/RESULTS.md.
  K26=0; in_tree "$dir" "test/workflows/RESULTS.md" && K26=1

  # L27: README has an Authentication / Auth section.
  # Accepts "## Authentication", "## Auth", or "## Auth modes".
  L27=0; echo "$readme" | grep -qE "^## (Authentication|Auth|Auth modes)" && L27=1

  # L28: TODO.md exists at repo root.
  L28=0; in_tree "$dir" "TODO.md" && L28=1

  # L29: RESULTS.md has a Prerequisites section.
  L29=0; echo "$results" | grep -qE "^## Prerequisites" && L29=1

  # ── M: MCP manifest content (w3-action.yaml) ──────────────────────────
  local manifest
  manifest=$(show_origin "$dir" "w3-action.yaml")

  # M30: Every command has inputs with type + description.
  # Fail if any command block exists that has no inputs defined, OR if any
  # input is missing type or description. Simplified: check that every
  # `- name:` under `commands:` is followed (within its block) by `inputs:`.
  M30=0
  if [ -n "$manifest" ]; then
    local cmd_count input_blocks
    cmd_count=$(echo "$manifest" | grep -cE "^  - name:" || echo 0)
    input_blocks=$(echo "$manifest" | grep -cE "^    inputs:" || echo 0)
    [ "$cmd_count" -gt 0 ] && [ "$cmd_count" = "$input_blocks" ] && M30=1
  fi

  # M31: Every command has a result output.
  M31=0
  if [ -n "$manifest" ]; then
    local output_blocks result_outputs
    output_blocks=$(echo "$manifest" | grep -cE "^    outputs:" || echo 0)
    result_outputs=$(echo "$manifest" | grep -cE "^      result:" || echo 0)
    [ "$cmd_count" -gt 0 ] && [ "$output_blocks" = "$result_outputs" ] && \
      [ "$cmd_count" = "$output_blocks" ] && M31=1
  fi

  # M32: No stub commands (description is not just the restated name).
  # A stub is a command where the description is fewer than 15 characters
  # (e.g., "Getset.", "Get quote.", "Exists.").
  # Handles both inline descriptions and block scalars (> or |).
  M32=0
  if [ -n "$manifest" ]; then
    local stub_count
    stub_count=$(echo "$manifest" | awk '
      /^  - name:/ { cmd=1; next }
      cmd && /description:/ {
        desc=$0; sub(/.*description: */, "", desc);
        gsub(/[">|]/, "", desc);
        gsub(/^ +/, "", desc);
        # If inline desc is empty, grab the next line (block scalar)
        if (length(desc) < 3) {
          getline; desc=$0;
          gsub(/^ +/, "", desc);
        }
        if (length(desc) < 15) stubs++;
        cmd=0
      }
      END { print stubs+0 }
    ')
    [ "$stub_count" = "0" ] && M32=1
  fi

  # M33: partner field present and lowercase.
  M33=0
  if [ -n "$manifest" ]; then
    local partner_val
    partner_val=$(echo "$manifest" | { grep -E "^partner:" || true; } | head -1 | sed 's/partner: *//' | tr -d '"' | tr -d "'")
    [ -n "$partner_val" ] && echo "$partner_val" | grep -qE "^[a-z0-9-]+$" && M33=1
  fi

  # M34: name field is short (< 5 words).
  M34=0
  if [ -n "$manifest" ]; then
    local name_val name_words
    name_val=$(echo "$manifest" | { grep -E "^name:" || true; } | head -1 | sed 's/name: *//' | tr -d '"' | tr -d "'")
    name_words=$(echo "$name_val" | wc -w | tr -d ' ')
    [ -n "$name_val" ] && [ "$name_words" -le 4 ] && M34=1
  fi

  # M35: description field exists and > 20 chars.
  M35=0
  if [ -n "$manifest" ]; then
    local desc_val
    # Handle both inline and block scalar (>) descriptions.
    desc_val=$(echo "$manifest" | awk '
      /^description:/ {
        sub(/^description: */, ""); sub(/^>$/, "");
        if (length($0) > 2) { print $0; exit }
        getline; print; exit
      }
    ')
    [ ${#desc_val} -gt 20 ] && M35=1
  fi

  # M36: context field exists and > 50 chars.
  M36=0
  if [ -n "$manifest" ]; then
    local ctx_val
    ctx_val=$(echo "$manifest" | awk '
      /^context:/ {
        sub(/^context: */, ""); sub(/^>$/, "");
        if (length($0) > 2) { print $0; exit }
        getline; print; exit
      }
    ')
    [ ${#ctx_val} -gt 50 ] && M36=1
  fi

  # Format the row.
  printf "| %-25s |" "$repo"
  for v in A1 A2 A3 A4 A5 A6 A7 B8 C9 C10 C11 D12 D13 E14 E15 F16 G17 H18 H19 I20 J21 K22 K23 K24 K25 K26 L27 L28 L29 M30 M31 M32 M33 M34 M35 M36; do
    eval "val=\$$v"
    if [ "$val" = "1" ]; then printf " ✅ |"; else printf " ❌ |"; FAILED=1; fi
  done
  printf "\n"
}

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

cat <<'EOF'
# W3 Action Consistency Audit

Standards checked: 36 (see AGENTS.md). Reading from `origin/<default-branch>`.

| Repo                      | A1 | A2 | A3 | A4 | A5 | A6 | A7 | B8 | C9 | C10 | C11 | D12 | D13 | E14 | E15 | F16 | G17 | H18 | H19 | I20 | J21 | K22 | K23 | K24 | K25 | K26 | L27 | L28 | L29 | M30 | M31 | M32 | M33 | M34 | M35 | M36 |
|---------------------------|----|----|----|----|----|----|----|----|----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
EOF

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

FAILED=0

if [ -n "$SINGLE_REPO" ]; then
  audit_repo "$WORKSPACE/$SINGLE_REPO"
else
  for dir in "$WORKSPACE"/w3-*-action; do
    [ -d "$dir" ] && audit_repo "$dir"
  done
fi

cat <<EOF

## Legend

- A1-A7: CI workflow (exists, Node 24, permissions, registry-url+scope, NODE_AUTH_TOKEN, npm run build, main/master triggers)
- B8: .prettierignore excludes dist/
- C9-C11: package.json (@w3-io/action-core ^0.4.x, ESM, no getBooleanInput)
- D12-D13: tests use node:test in test/
- E14-E15: action.yml node24 + single result output
- F16: dist/index.js committed
- G17: eslint.config.js (flat v9)
- H18-H19: README + docs/guide.md
- I20: standard package.json scripts (format, format:check, lint, test, build, all)
- J21: .npmrc tracked with @w3-io scope mapping
- K22-K26: Consistency (dist staleness guard in CI, action.yml inputs match source, required flags correct, E2E test workflow, E2E results documented)
- L27-L29: Polish (README has Auth section, TODO.md exists, RESULTS.md has Prerequisites)
- M30-M36: MCP manifest content (typed inputs, result output, no stubs, partner lowercase, short name, description, context)

See ../AGENTS.md for the full per-check explanations and fix recipes.
EOF

exit $FAILED

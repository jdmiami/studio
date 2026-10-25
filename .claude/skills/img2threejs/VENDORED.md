# Vendored copy of img2threejs

- Source: https://github.com/img2threejs/img2threejs
- Commit: 954cd5845e90efd045694bab725d68a9863c20e0 (vendored 2026-10-25)
- License: Apache-2.0 (see `LICENSE`), unmodified except that `.git/` and `.github/` were left out.

Vendored so the skill travels with this repo and loads in every Claude Code session here,
including ephemeral cloud containers where the upstream installer's home-directory links
(`npx img2threejs install`) would not persist.

To update: replace this directory's contents with a newer upstream checkout (minus `.git/` and
`.github/`) and change the commit above.

Run the forge scripts from this directory (they are pure Python 3.10+ stdlib). Per-run state goes
in `.img2threejs/` at the project root, which is git-ignored.

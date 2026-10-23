# Release notes come from PR labels

Each version tag gets a GitHub Release with GitHub's generated notes, grouped into sections by PR label (`.github/release.yml`). A required check makes every PR carry exactly one of `enhancement`, `bug`, `dependencies` or `internal`, plus `breaking-change` when it breaks something. The version is still chosen by hand when pushing the `vX.Y.Z` tag.

Labels over conventional commits for now: commits are written as plain sentences ("Add the pr agent skill"), and a PR often lands several of them, so a commit-message convention would mean a prefix on every commit and a linter to enforce it, and the notes would read as `feat: ...` lines. A label is one click, can be fixed after merge (the notes are generated at release time), and GitHub sorts notes by label natively.

## Considered Options

- **Conventional commits** with release-please or semantic-release: they generate notes and choose the version. More machinery than a single maintainer needs today.
- **Hand-written CHANGELOG.md**: another file to keep in sync on every PR, and easy to forget.

## Later: choosing the version automatically

The labels already say what kind of change each PR is, so a later step can bump the version from them: `breaking-change` → major, `enhancement` → minor, anything else → patch, then push the tag. That keeps this scheme rather than replacing it.

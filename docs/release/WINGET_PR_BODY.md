## 📖 Description

Adds a new package: **RESALEVAULT** version **0.5.0**.

RESALEVAULT is a desktop application for people who buy and resell (inventory,
purchases, sales, margins, labels and reports). It works offline and stores data
locally on the user's device. Windows 10/11 x64; per-user install; no
administrator rights required.

- Publisher: RESALEVAULT
- Homepage / PackageUrl: https://github.com/16ray/RESALEVAULT
- Installer: NSIS (`nullsoft`), x64, `Scope: user`, unattended via the standard
  NSIS `/S` switch.
- Licence: proprietary.

## ✅ Checklist

- [ ] Signed the [Contributor License Agreement](https://cla.opensource.microsoft.com)
- [ ] Linked to an issue (if applicable)
  - Resolves #<!-- issue number -->

## 📦 Manifest Checklist

- [x] Checked that there aren't other open [pull requests](https://github.com/microsoft/winget-pkgs/pulls) for the same manifest update/change
- [x] This PR only modifies one (1) manifest
- [x] Validated manifest locally with `winget validate --manifest <path>` ([validation guide](https://github.com/microsoft/winget-pkgs/blob/master/doc/ValidationFailureGuide.md))
- [ ] Tested manifest locally with `winget install --manifest <path>`
- [x] Manifest conforms to the [1.12 schema](https://github.com/microsoft/winget-pkgs/tree/master/doc/manifest/schema/1.12.0)

## Notes for reviewers

- `winget validate --manifest .` → `Manifest validation succeeded.` (no warnings),
  schema 1.12.0, with the `# yaml-language-server: $schema=…` header on all three
  files.
- `InstallerSha256` was computed from the exact artifact published in the GitHub
  release and matches it byte for byte.
- The installer is published from the publisher's own GitHub release, which is
  the publisher-controlled download location for this package.
- The installer is not signed by a public CA; the SHA-256 hash is published in
  the release (`SHA256SUMS.txt`) so integrity can be verified. No Windows
  protection is disabled by the installer.

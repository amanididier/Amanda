# Windows installation and release guide

## Download a published installer

1. Open the Amanda repository on GitHub: <https://github.com/amanididier/Amanda>.
2. Select **Releases** and open the latest release whose tag starts with `v`.
3. Download the `Amanda_*_x64-setup.exe` installer attached to that release and run it on Windows 11 x64.

The installer is produced by the `Windows installer` GitHub Actions workflow. A tagged release is published only after the Windows build succeeds. The executable may be subject to Windows SmartScreen because this project does not currently sign installers.

## Build and release from GitHub

A repository maintainer can build from the GitHub web interface:

- **Test build:** open **Actions → Windows installer → Run workflow**. The successful run exposes an `Amanda-Windows-Installer` artifact for 14 days.
- **Publish a release:** create and push a version tag matching `v*` (for example, `v0.1.1`). The workflow builds the NSIS installer and attaches the resulting `.exe` to that GitHub Release.

The workflow needs the repository's default `GITHUB_TOKEN` with `contents: write` permission to attach release assets. No custom secret is required. A failed Windows build does not create a downloadable installer.

## Important model status

The installer does not contain model weights. The selected Qwen 3.5 2B model is not yet available through a verified, integrated in-app setup flow in this build, so installing the desktop shell does not mean local AI inference is ready. Do not download arbitrary GGUF conversions and expect them to work: model identity, license, chat template, and runtime compatibility still need validation before an official setup path can be offered.

## Current verification boundary

The project has not yet produced and tested a Windows installer on a real Windows 11 x64 machine. The GitHub Actions workflow is the supported Windows build path; verify its run and installer asset before distributing a release. SQLite persistence, local-model inference, backup/restore, and the full assistant workflows still require further implementation and end-to-end validation.

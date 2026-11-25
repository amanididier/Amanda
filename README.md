# Amanda

Amanda is a local-first personal assistant desktop application built with React, TypeScript, TanStack Router, Tauri 2, and SQLite. The app opens without an account; local records are stored by the desktop app rather than in browser storage.

## Download for Windows

Windows installers are attached to tagged GitHub Releases after the Windows installer workflow succeeds. See [Windows installation and release instructions](WINDOWS_INSTALLATION.md). The model weights are not included in the installer or repository.

## Development

The frontend preview runs with Bun:

```sh
bun install --frozen-lockfile
bun run dev
```

To package a native Windows NSIS installer, use a Windows runner with the Tauri prerequisites and run `bun run desktop:build`. The repository's GitHub Actions workflow performs this build on Windows when manually dispatched and publishes the installer to a GitHub Release when triggered by a `v*` tag.

## Current limitations

The current build establishes the Tauri shell, local SQLite-backed workspace flows, and Windows packaging workflow. Qwen model downloading/inference, a verified Windows installer build, and several broader assistant features have not yet been validated as complete. Do not treat this repository state as a finished AI assistant until those capabilities are implemented and tested on the target Windows machine.

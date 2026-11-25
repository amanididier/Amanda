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

## Included features

Amanda includes a general local assistant and separate project conversations, approved task/note/memory/roadmap actions, local memory and research libraries, source archiving and restore, and validated database backup/merge. Data stays in the desktop app's SQLite database; no account or hosted AI provider is required. Online search is optional and uses a Brave Search key stored in Windows Credential Manager.

The Windows build bundles a pinned llama.cpp CPU runtime. Model weights are a separate 1.40 GB download from Settings and are SHA-256 verified before use. The browser preview cannot run the native model or access the desktop database.

A successful Windows Actions build is required before an installer can be downloaded. This workspace cannot run Windows or benchmark the target i5-6200U/8 GB machine, and the installer is currently unsigned. See [Windows installation and release instructions](WINDOWS_INSTALLATION.md) for download and first-run details.

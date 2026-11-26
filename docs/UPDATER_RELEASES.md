# Amanda Windows updater releases

Amanda uses the Tauri v2 updater with signed NSIS packages. The installed app checks the GitHub Releases latest.json endpoint, downloads a signed update, verifies its signature against the public key embedded in src-tauri/tauri.conf.json, and runs the Windows installer in passive mode. User data and downloaded GGUF model files live outside the application bundle and must not be included in updater packages.

## One-time GitHub configuration

In the repository, open Settings → Secrets and variables → Actions and add:

- TAURI_SIGNING_PRIVATE_KEY: the private key paired with the public key in src-tauri/tauri.conf.json.
- TAURI_SIGNING_PRIVATE_KEY_PASSWORD: the key password, if the private key was generated with one. It may be left unset for an unencrypted key.

Never commit the private key or paste it into source code, issues, pull requests, or chat. If the private key is lost, generate a new key pair, replace the public key in tauri.conf.json, and configure the matching private key secret before publishing another release. Existing installations trust the public key they were built with, so changing it breaks signature verification for those installations; do not rotate it casually.

## First updater-enabled release

The app version currently lives in both src-tauri/tauri.conf.json and src-tauri/Cargo.toml. They must match exactly. The release workflow rejects a tag that does not match that version and fails early if the updater private-key secret is missing. Tauri signs the release artifacts with that private key; the installed app verifies the signature against its embedded public key before installation.

The repository has an empty v0.1.3 GitHub Release. The installed CI build is version 0.1.3 and already contains the updater foundation, so do not try to update it with another v0.1.3 build. This branch advances both app version files to 0.1.4. After the updater changes are committed to main, publish v0.1.4 from main. The installed 0.1.3 app can detect that higher version using its existing updater code, download the signed package, and then receive the improved updater experience. The empty v0.1.3 release can be left as-is.

## Publishing each future update

1. Finish and merge the intended code changes.
2. Increase the version in both src-tauri/tauri.conf.json and src-tauri/Cargo.toml (for the first updater rollout this branch already sets 0.1.4; future releases should increment from there).
3. Commit and push the version change to the release branch.
4. From PowerShell in the repository folder, create and push the matching tag (for the first rollout):

   ```powershell
   git switch main
   git pull --ff-only origin main
   git tag -a v0.1.4 -m "Amanda v0.1.4"
   git push origin v0.1.4
   ```

   Do not create the GitHub Release manually first. Pushing the tag starts the release workflow, which creates or updates the release.
5. The Windows installer GitHub Actions workflow builds the NSIS installer and signed updater artifact, then publishes the GitHub Release and latest.json.
6. Confirm the release contains the regular .exe, its .sig signature, and latest.json before announcing the update.

The workflow can also be run manually with a matching release_tag input. Do not publish a release from an unreviewed feature branch.

## How the in-app experience works

- Amanda checks on startup, when the app becomes active again after five minutes, and every five minutes.
- Users can also open Settings → App updates → Check for updates.
- When a newer signed version is found, a theme-aware Update available pill appears. It uses a dark surface in light mode and a light surface in dark mode.
- Clicking it downloads the update and shows progress. Tauri verifies the signature and launches the Windows installer; the installer restarts Amanda.
- The SQLite database, user files, settings, and GGUF model are stored separately and are not replaced by the updater.

## Release verification

For every release, test from an installed previous version:

1. Install the previous signed release.
2. Open Amanda and confirm it reports that it is up to date.
3. Publish the next higher version.
4. Use Settings → App updates → Check for updates.
5. Confirm the update pill appears, download progress advances, and Amanda restarts into the new version.
6. Confirm notes, workspaces, settings, and the existing local model are still present and usable.

A successful CI installer build alone does not prove this end-to-end update cycle.
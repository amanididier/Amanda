# Windows installation and release guide

## Download a published installer

1. Open the Amanda repository on GitHub: <https://github.com/amanididier/Amanda>.
2. Select **Releases** and open the latest release whose tag starts with `v`.
3. Download the `Amanda_*_x64-setup.exe` installer attached to that release and run it on Windows 11 x64.

The installer is produced by the `Windows installer` GitHub Actions workflow. A tagged release is published only after the Windows build succeeds. The executable may be subject to Windows SmartScreen because this project does not currently sign installers.

## Build and release from GitHub

A repository maintainer can build the actual NSIS Windows installer from the GitHub web interface:

- **Build an installer:** open **Actions → Windows installer → Run workflow**. The `v0/local-model-first-run` development branch also runs this build when pushed. When a Windows build succeeds, download `Amanda-Windows-Installer` from that run&apos;s artifacts. This is the compiled NSIS installer, not a browser preview or mock package; workflow artifacts expire after 14 days.
- **Publish a durable download:** create and push a version tag matching `v*` (for example, `v0.1.1`). The same Windows build runs and attaches its `.exe` to the repository&apos;s GitHub Release.

The workflow needs the repository&apos;s default `GITHUB_TOKEN` with `contents: write` permission to attach release assets. No custom secret is required. A failed Windows build does not create a downloadable installer.

The installer is not code-signed yet. Windows SmartScreen may show an unknown-publisher warning; that does not mean the installer is a test build. Do not distribute an installer until the corresponding Windows workflow completes successfully.

## Local AI setup

The Windows installer bundles the pinned llama.cpp b9222 CPU runtime; it does not bundle multi-gigabyte model weights. After installing Amanda, open **Settings → Local AI model → Download model**. Amanda downloads the 1.40 GB Qwen3.5-2B Q4_K_M GGUF from a pinned Hugging Face revision over HTTPS and verifies its SHA-256 before installation. The model loads only when requested, uses a 4,096-token context and two CPU threads, and can be unloaded from Settings.

The GGUF is a community conversion by bartowski from Qwen&apos;s Apache-2.0 checkpoint; it is not an official Qwen-published GGUF. The browser preview cannot download or run the desktop model.


## Hybrid AI models and API providers

Amanda remains local-first: the installed Qwen GGUF model is the default and continues to work without a cloud API key. To use a hosted model when you need stronger reasoning or image understanding:

1. Open **Settings → AI API providers** in the Windows desktop app.
2. Choose a provider (Google Gemini, OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Together AI, or Custom OpenAI-compatible).
3. Confirm the API base URL and enter the exact model ID shown by that provider. For Gemini's OpenAI-compatible endpoint, Amanda pre-fills `https://generativelanguage.googleapis.com/v1beta/openai`.
4. Paste your API key and select **Test connection & save securely**. Amanda sends a short completion request and only saves the key after a successful response.
5. API keys are stored in Windows Credential Manager. Provider name, endpoint, and model selection are kept in the app's local browser profile; the secret key is not stored in notes, conversations, or localStorage.
6. In any chat composer, use the model selector beside the attachment button to choose **Local · Qwen** or a connected API model. Your conversation and saved notes remain in Amanda when you switch.
7. To disconnect a provider, return to **Settings → AI API providers** and choose **Disconnect**.

The providers listed use an OpenAI-compatible `/chat/completions` API. Anthropic's native Messages API is not directly supported by this connector; use a compatible gateway if you need an Anthropic model. Provider API usage may be billed by the provider. Review its pricing and privacy terms before sending private material.

### Images in Daily Notes

Daily Notes can contain pasted screenshots, inline images, gallery images, and document attachments. **Ask Amanda** sends the note text and its attached image/document data into the workspace conversation. Amanda includes saved note references with that request; later turns retrieve relevant conversation attachments when the question refers to them. Image understanding requires a vision-capable selected model. The bundled Qwen local model is not guaranteed to understand images; if it rejects image input, Amanda falls back to text context and reports that the image itself could not be interpreted. Choose a vision-capable Gemini or other multimodal API model for visual questions. Images sent to a cloud provider leave the device and are subject to that provider's data policies.

## Current verification boundary

The local Linux workspace cannot run the native Windows app. The supported Windows GitHub Actions build must succeed before claiming an installer was produced, and the model&apos;s inference speed and memory usage still need to be measured on the target Windows 11 machine (Intel i5-6200U, 8 GB RAM). The installer is unsigned. These are explicit release limitations, not test-app behavior.

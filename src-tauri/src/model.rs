use std::{
    fs::{self, File},
    io::{Read, Write},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    net::TcpListener,
    time::{Duration, Instant},
};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const MODEL_REPOSITORY: &str = "bartowski/Qwen_Qwen3.5-2B-GGUF";
const MODEL_REVISION: &str = "7d26695454df6de5fbcce2e58681e62dae06ce43";
const MODEL_FILENAME: &str = "Qwen_Qwen3.5-2B-Q4_K_M.gguf";
const MODEL_SHA256: &str = "57a1085840f497d764a7fc5d346922dbde961efb54cc792ea81d694fd846a1d8";
const MODEL_SIZE: u64 = 1_396_198_496;
const CONTEXT_SIZE: &str = "4096";
const CPU_THREADS: &str = "2";

#[derive(Clone, Default)]
pub struct ModelRuntime {
    download_active: Arc<AtomicBool>,
    cancel_download: Arc<AtomicBool>,
    server: Arc<Mutex<Option<Child>>>,
    api_key: Arc<Mutex<Option<String>>>,
    server_port: Arc<Mutex<Option<u16>>>,
}


#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelInfo { name: String, path: String, size_bytes: u64, is_default: bool }

fn is_gguf_model(path: &std::path::Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else { return false; };
    if metadata.len() < 100 * 1024 * 1024 { return false; }
    let Ok(mut file) = File::open(path) else { return false; };
    let mut magic = [0_u8; 4];
    file.read_exact(&mut magic).is_ok() && &magic == b"GGUF"
}
fn scan_model_directory(directory: &std::path::Path, depth: usize, results: &mut Vec<LocalModelInfo>, seen: &mut std::collections::HashSet<std::path::PathBuf>) {
    if depth > 5 || results.len() >= 300 { return; }
    let Ok(entries) = fs::read_dir(directory) else { return; };
    for entry in entries.flatten() {
        if results.len() >= 300 { break; }
        let path = entry.path();
        let Ok(kind) = entry.file_type() else { continue; };
        if kind.is_dir() { scan_model_directory(&path, depth + 1, results, seen); }
        else if kind.is_file() && is_gguf_model(&path) {
            let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
            if !seen.insert(canonical) { continue; }
            let Ok(metadata) = fs::metadata(&path) else { continue; };
            let is_default = path.file_name().is_some_and(|name| name == MODEL_FILENAME);
            let name = if is_default { "Qwen3.5-2B · Q4_K_M".to_string() } else {
                path.file_stem().and_then(|value| value.to_str()).unwrap_or("Local GGUF model").to_string()
            };
            results.push(LocalModelInfo { name, path: path.to_string_lossy().into_owned(), size_bytes: metadata.len(), is_default });
        }
    }
}
#[tauri::command]
pub async fn list_local_models(app: AppHandle) -> Result<Vec<LocalModelInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut roots = Vec::new();
        if let Ok(directory) = app.path().app_local_data_dir() { roots.push(directory.join("models")); }
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            let home = std::path::PathBuf::from(profile);
            roots.extend([home.join("Downloads"), home.join("Documents"), home.join("Models"),
                home.join(".cache").join("huggingface").join("hub"),
                home.join(".lmstudio").join("models"),
                home.join(".ollama").join("models").join("blobs")]);
        }
        let mut results = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for root in roots { scan_model_directory(&root, 0, &mut results, &mut seen); }
        results.sort_by(|left, right| right.is_default.cmp(&left.is_default).then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())));
        Ok(results)
    }).await.map_err(|error| format!("Could not scan installed models: {error}"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    installed: bool,
    downloading: bool,
    downloaded_bytes: u64,
    total_bytes: u64,
    model_path: String,
    runtime_available: bool,
    running: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConnection {
    base_url: String,
    api_key: String,
}

fn model_paths(app: &AppHandle) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Could not find Amanda's local data folder: {error}"))?
        .join("models");
    Ok((
        directory.join(MODEL_FILENAME),
        directory.join("qwen3.5-2b.sha256"),
    ))
}

fn model_is_verified(model_path: &std::path::Path, marker_path: &std::path::Path) -> bool {
    let marker_matches = fs::read_to_string(marker_path)
        .map(|value| value.trim() == MODEL_SHA256)
        .unwrap_or(false);
    let size_matches = fs::metadata(model_path)
        .map(|metadata| metadata.len() == MODEL_SIZE)
        .unwrap_or(false);
    marker_matches && size_matches
}

fn verify_model_contents(model_path: &std::path::Path) -> Result<(), String> {
    let mut file = File::open(model_path)
        .map_err(|error| format!("Could not open the installed model for verification: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];

    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not verify the installed model: {error}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    if hex::encode(hasher.finalize()) != MODEL_SHA256 {
        return Err(
            "The installed model failed its integrity check. Download it again from Settings."
                .to_string(),
        );
    }

    Ok(())
}

fn runtime_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .resource_dir()
        .map(|path| path.join("llama").join("llama-server.exe"))
        .map_err(|error| format!("Could not locate the bundled llama.cpp runtime: {error}"))
}

fn runtime_is_available(app: &AppHandle) -> bool {
    let Ok(server_path) = runtime_path(app) else {
        return false;
    };
    let Some(directory) = server_path.parent() else {
        return false;
    };
    server_path.is_file()
        && directory.join("llama.dll").is_file()
        && directory.join("llama-common.dll").is_file()
        && directory.join("ggml.dll").is_file()
}

fn server_is_running(runtime: &ModelRuntime) -> Result<bool, String> {
    let mut server = runtime
        .server
        .lock()
        .map_err(|_| "The local model process state is unavailable".to_string())?;
    let child_status = server
        .as_mut()
        .map(|child| child.try_wait())
        .transpose()
        .map_err(|error| format!("Could not check the local model process: {error}"))?;
    let Some(child_status) = child_status else {
        return Ok(false);
    };
    match child_status {
        None => Ok(true),
        Some(_) => {
            *server = None;
            if let Ok(mut api_key) = runtime.api_key.lock() {
                *api_key = None;
            }
            if let Ok(mut server_port) = runtime.server_port.lock() {
                *server_port = None;
            }
            Ok(false)
        }
    }
}

#[tauri::command]
pub fn get_model_status(
    app: AppHandle,
    runtime: State<'_, ModelRuntime>,
) -> Result<ModelStatus, String> {
    let (model_path, marker_path) = model_paths(&app)?;
    let partial_path = model_path.with_extension("gguf.part");
    let downloaded_bytes = fs::metadata(&model_path)
        .or_else(|_| fs::metadata(partial_path))
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let running = server_is_running(runtime.inner())?;
    Ok(ModelStatus {
        installed: model_is_verified(&model_path, &marker_path),
        downloading: runtime.download_active.load(Ordering::Acquire),
        downloaded_bytes,
        total_bytes: MODEL_SIZE,
        model_path: model_path.to_string_lossy().into_owned(),
        runtime_available: runtime_is_available(&app),
        running,
    })
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    runtime: State<'_, ModelRuntime>,
) -> Result<String, String> {
    if runtime
        .download_active
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("A model download is already in progress".to_string());
    }

    runtime.cancel_download.store(false, Ordering::Release);
    let app = app.clone();
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = download_model_blocking(&app, &runtime);
        runtime.download_active.store(false, Ordering::Release);
        result
    })
    .await
    .map_err(|error| format!("The model download stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub fn cancel_model_download(runtime: State<'_, ModelRuntime>) -> bool {
    if runtime.download_active.load(Ordering::Acquire) {
        runtime.cancel_download.store(true, Ordering::Release);
        true
    } else {
        false
    }
}

fn download_model_blocking(app: &AppHandle, runtime: &ModelRuntime) -> Result<String, String> {
    let (model_path, marker_path) = model_paths(app)?;
    if model_path.is_file() {
        let has_expected_size =
            fs::metadata(&model_path).is_ok_and(|metadata| metadata.len() == MODEL_SIZE);
        if has_expected_size && verify_model_contents(&model_path).is_ok() {
            fs::write(&marker_path, format!("{MODEL_SHA256}\n"))
                .map_err(|error| format!("Could not record the model integrity check: {error}"))?;
            return Ok(model_path.to_string_lossy().into_owned());
        }
        fs::remove_file(&model_path).map_err(|error| {
            format!("Could not remove the damaged model before redownloading it: {error}")
        })?;
    }
    let _ = fs::remove_file(&marker_path);

    let directory = model_path
        .parent()
        .ok_or_else(|| "Could not determine the model folder".to_string())?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("Could not create the model folder: {error}"))?;
    let temporary_path = model_path.with_extension("gguf.part");
    let download_result = (|| {
        let url = format!(
            "https://huggingface.co/{MODEL_REPOSITORY}/resolve/{MODEL_REVISION}/{MODEL_FILENAME}?download=true"
        );
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(2 * 60 * 60))
            .build()
            .map_err(|error| format!("Could not prepare the secure model download: {error}"))?;
        let mut response = client
            .get(url)
            .header(reqwest::header::USER_AGENT, "Amanda-Desktop/0.1.0")
            .send()
            .map_err(|error| format!("Model download failed: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Model download failed with HTTP status {}",
                response.status()
            ));
        }
        if let Some(content_length) = response.content_length() {
            if content_length != MODEL_SIZE {
                return Err(format!(
                    "The model server reported an unexpected file size ({content_length} bytes)"
                ));
            }
        }

        let mut output = File::create(&temporary_path)
            .map_err(|error| format!("Could not create the model download file: {error}"))?;
        let mut hasher = Sha256::new();
        let mut downloaded = 0_u64;
        let mut next_progress = 0_u64;
        let mut buffer = vec![0_u8; 1024 * 1024];

        loop {
            if runtime.cancel_download.load(Ordering::Acquire) {
                return Err("Model download cancelled".to_string());
            }
            let count = response
                .read(&mut buffer)
                .map_err(|error| format!("The model download was interrupted: {error}"))?;
            if count == 0 {
                break;
            }
            output
                .write_all(&buffer[..count])
                .map_err(|error| format!("Could not save the model file: {error}"))?;
            hasher.update(&buffer[..count]);
            downloaded += count as u64;

            if downloaded >= next_progress {
                let _ = app.emit(
                    "model-download-progress",
                    DownloadProgress {
                        downloaded_bytes: downloaded,
                        total_bytes: MODEL_SIZE,
                        percent: ((downloaded.saturating_mul(100) / MODEL_SIZE).min(100)) as u8,
                    },
                );
                next_progress = downloaded.saturating_add(5 * 1024 * 1024);
            }
        }

        output
            .flush()
            .and_then(|_| output.sync_all())
            .map_err(|error| format!("Could not finish saving the model: {error}"))?;
        if downloaded != MODEL_SIZE {
            return Err(format!(
                "The downloaded model has the wrong size ({downloaded} bytes; expected {MODEL_SIZE})"
            ));
        }
        let actual_hash = hex::encode(hasher.finalize());
        if actual_hash != MODEL_SHA256 {
            return Err(
                "The model integrity check failed; the incomplete file was discarded".to_string(),
            );
        }
        if runtime.cancel_download.load(Ordering::Acquire) {
            return Err("Model download cancelled".to_string());
        }

        fs::rename(&temporary_path, &model_path)
            .map_err(|error| format!("Could not install the verified model: {error}"))?;
        fs::write(&marker_path, format!("{MODEL_SHA256}\n"))
            .map_err(|error| format!("Could not record the model integrity check: {error}"))?;
        let _ = app.emit(
            "model-download-progress",
            DownloadProgress {
                downloaded_bytes: MODEL_SIZE,
                total_bytes: MODEL_SIZE,
                percent: 100,
            },
        );
        Ok(model_path.to_string_lossy().into_owned())
    })();

    if download_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    download_result
}

#[tauri::command]
pub async fn start_local_model(
    app: AppHandle,
    runtime: State<'_, ModelRuntime>,
    model_path: Option<String>,
) -> Result<ModelConnection, String> {
    let app = app.clone();
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || start_local_model_blocking(&app, &runtime, model_path))
        .await
        .map_err(|error| format!("The local model could not start: {error}"))?
}

fn start_local_model_blocking(
    app: &AppHandle,
    runtime: &ModelRuntime,
    selected_path: Option<String>,
) -> Result<ModelConnection, String> {
    if server_is_running(runtime)? {
        let api_key = runtime
            .api_key
            .lock()
            .map_err(|_| "The local model credentials are unavailable".to_string())?
            .clone()
            .ok_or_else(|| "The running model session could not be verified".to_string())?;
        let port = runtime
            .server_port
            .lock()
            .map_err(|_| "The local model port is unavailable".to_string())?
            .ok_or_else(|| "The running model port could not be verified".to_string())?;
        return Ok(ModelConnection {
            base_url: format!("http://127.0.0.1:{port}"),
            api_key,
        });
    }

    let (default_model_path, marker_path) = model_paths(app)?;
    let model_path = selected_path.map(std::path::PathBuf::from).unwrap_or(default_model_path.clone())
        .canonicalize().map_err(|error| format!("Could not open the selected model file: {error}"))?;
    if !is_gguf_model(&model_path) { return Err("Choose a valid GGUF model file (at least 100 MB)".to_string()); }
    let is_default_model = default_model_path.canonicalize().ok().as_ref() == Some(&model_path);
    if is_default_model {
        if !model_is_verified(&model_path, &marker_path) { return Err("Download and verify Qwen3.5-2B before loading it".to_string()); }
        verify_model_contents(&model_path)?;
    }
    if !runtime_is_available(app) {
        return Err(
            "The bundled llama.cpp runtime is missing. Reinstall Amanda to repair it".to_string(),
        );
    }
    let server_path = runtime_path(app)?;
    // Avoid stale processes on a fixed port: each model process gets its own loopback port.
    let port_listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Could not reserve a local model port: {error}"))?;
    let server_port = port_listener.local_addr()
        .map_err(|error| format!("Could not read the local model port: {error}"))?.port();
    drop(port_listener);
    let api_key = Uuid::new_v4().simple().to_string();
    // Keep the per-launch credential out of command-line arguments and temporary files.
    // llama.cpp b9222 reads LLAMA_API_KEY through its common argument parser.
    // Keep llama.cpp diagnostics so startup failures show their real cause.
    let log_directory = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("Could not locate Amanda's log folder: {error}"))?;
    fs::create_dir_all(&log_directory)
        .map_err(|error| format!("Could not create Amanda's log folder: {error}"))?;
    let log_path = log_directory.join("llama-startup.log");
    let stderr_log = File::create(&log_path)
        .map_err(|error| format!("Could not create the llama.cpp diagnostic log: {error}"))?;

    let mut command = Command::new(server_path);
    command
        .arg("--model")
        .arg(&model_path)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(server_port.to_string())
        .args([
            "--ctx-size",
            CONTEXT_SIZE,
            "--threads",
            CPU_THREADS,
            "--threads-batch",
            CPU_THREADS,
            "--batch-size",
            "128",
        ])
        // Pass the generated key through llama.cpp's explicit server option.
        // This avoids relying on environment-variable propagation for authentication.
        .arg("--api-key")
        .arg(&api_key)
        // Qwen3.5 can spend a short completion budget on hidden reasoning and return no
        // user-visible text. Amanda is a conversational assistant, so use non-thinking mode.
        .args(["--reasoning", "off"])
        // This server is bound to loopback only and protected by a per-launch API key.
        .arg("--jinja")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(stderr_log));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not start the bundled llama.cpp runtime: {error}"))?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|error| format!("Could not check local model readiness: {error}"))?;
    let base_url = format!("http://127.0.0.1:{server_port}");
    let health_url = format!("{base_url}/health");
    let deadline = Instant::now() + Duration::from_secs(180);

    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Could not check the local model process: {error}"))?
        {
            let diagnostic = fs::read_to_string(&log_path)
                .unwrap_or_else(|error| format!("Could not read llama.cpp log: {error}"));
            let diagnostic = diagnostic.trim();
            let diagnostic = if diagnostic.len() > 7000 {
                diagnostic.chars().rev().take(7000).collect::<String>().chars().rev().collect::<String>()
            } else {
                diagnostic.to_string()
            };
            let detail = if diagnostic.is_empty() {
                format!("No diagnostic output was written. Full log path: {}", log_path.display())
            } else {
                format!("llama.cpp output:\n{diagnostic}\n\nFull log: {}", log_path.display())
            };
            return Err(format!(
                "llama.cpp exited before the model was ready (exit status {status}).\n{detail}"
            ));
        }
        if client
            .get(&health_url)
            .send()
            .is_ok_and(|response| response.status().is_success())
        {
            // /props is deliberately not a public endpoint in llama.cpp b9222.
            // First prove authentication is actually enabled, then prove this key is accepted.
            let props_url = format!("{base_url}/props");
            let unauthenticated_response = match client.get(&props_url).send() {
                Ok(response) => response,
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "The model started, but its authentication-enforcement check could not reach /props: {error}"
                    ));
                }
            };
            if unauthenticated_response.status() != reqwest::StatusCode::UNAUTHORIZED {
                let status = unauthenticated_response.status();
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "The local server did not enforce API-key authentication (expected HTTP 401 without a key, received HTTP {status}). Check that llama.cpp accepted LLAMA_API_KEY."
                ));
            }

            let auth_response = match client
                .get(&props_url)
                .bearer_auth(&api_key)
                .send()
            {
                Ok(response) => response,
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "The model started, but its authentication check could not reach /props: {error}"
                    ));
                }
            };
            if !auth_response.status().is_success() {
                let status = auth_response.status();
                let body = auth_response.text().unwrap_or_default();
                let detail = body.chars().take(500).collect::<String>();
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "The model started but rejected its generated API key (HTTP {status}). Server response: {detail}"
                ));
            }

            *runtime
                .server
                .lock()
                .map_err(|_| "The local model process state is unavailable".to_string())? =
                Some(child);
            *runtime
                .api_key
                .lock()
                .map_err(|_| "The local model credentials are unavailable".to_string())? =
                Some(api_key.clone());
            *runtime
                .server_port
                .lock()
                .map_err(|_| "The local model port is unavailable".to_string())? =
                Some(server_port);
            return Ok(ModelConnection { base_url, api_key });
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("The model did not finish loading within three minutes".to_string());
        }
        thread::sleep(Duration::from_millis(500));
    }
}

fn verify_local_model_completion(connection: &ModelConnection) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Could not prepare the local model verification request: {error}"))?;
    let response = client
        .post(format!("{}/v1/chat/completions", connection.base_url))
        .bearer_auth(&connection.api_key)
        .json(&serde_json::json!({
            "messages": [{ "role": "user", "content": "Reply with the word OK." }],
            "max_tokens": 128,
            "temperature": 0.0,
            "stream": false
        }))
        .send()
        .map_err(|error| format!("Authentication passed, but the local model test request failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        let detail = body.chars().take(500).collect::<String>();
        return Err(format!(
            "Authentication passed, but model inference returned HTTP {status}: {detail}"
        ));
    }

    let payload: serde_json::Value = response
        .json()
        .map_err(|error| format!("The local model returned an unreadable test response: {error}"))?;
    let message = payload.pointer("/choices/0/message");
    let answer = message
        .and_then(|value| value.get("content"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim();

    if answer.is_empty() {
        let reasoning = message
            .and_then(|value| value.get("reasoning_content"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let finish_reason = payload
            .pointer("/choices/0/finish_reason")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown");
        let usage = payload.get("usage").map(serde_json::Value::to_string).unwrap_or_else(|| "unavailable".to_string());
        let reasoning_detail = if reasoning.is_empty() {
            "none returned".to_string()
        } else {
            format!("{} characters returned", reasoning.chars().count())
        };
        return Err(format!(
            "Authentication passed, but the model produced no visible answer (finish_reason: {finish_reason}; reasoning: {reasoning_detail}; usage: {usage}). Check the llama.cpp log for the generation details."
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn repair_local_model(
    app: AppHandle,
    runtime: State<'_, ModelRuntime>,
    model_path: Option<String>,
) -> Result<ModelConnection, String> {
    let app = app.clone();
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        stop_server(&runtime)?;
        let connection = start_local_model_blocking(&app, &runtime, model_path)?;
        if let Err(error) = verify_local_model_completion(&connection) {
            let _ = stop_server(&runtime);
            return Err(error);
        }
        Ok(connection)
    })
    .await
    .map_err(|error| format!("The local model repair stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub fn stop_local_model(runtime: State<'_, ModelRuntime>) -> Result<(), String> {
    stop_server(runtime.inner())
}

fn stop_server(runtime: &ModelRuntime) -> Result<(), String> {
    let mut server = runtime
        .server
        .lock()
        .map_err(|_| "The local model process state is unavailable".to_string())?;
    if let Some(mut child) = server.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    if let Ok(mut api_key) = runtime.api_key.lock() {
        *api_key = None;
    }
    if let Ok(mut server_port) = runtime.server_port.lock() {
        *server_port = None;
    }
    Ok(())
}

pub fn shutdown(runtime: &ModelRuntime) {
    runtime.cancel_download.store(true, Ordering::Release);
    let _ = stop_server(runtime);
}

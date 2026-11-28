use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInput {
    pub provider_id: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult {
    pub success: bool,
    pub message: String,
    pub model: String,
}

fn validate_provider(input: &ProviderInput) -> Result<(), String> {
    let id = input.provider_id.trim();
    let url = input.base_url.trim();
    let model = input.model.trim();
    let key = input.api_key.trim();
    if id.is_empty() || id.len() > 48 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Choose a valid provider ID.".to_string());
    }
    if !(url.starts_with("https://") || url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost")) || url.len() > 500 {
        return Err("Use an HTTPS API endpoint (or a localhost endpoint for a local gateway).".to_string());
    }
    if model.is_empty() || model.len() > 160 || key.is_empty() || key.len() > 2048 {
        return Err("Enter the model name and API key.".to_string());
    }
    if [url, model, key].iter().any(|value| value.chars().any(char::is_control)) {
        return Err("Provider settings cannot contain control characters.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn save_model_provider(input: ProviderInput) -> Result<ProviderTestResult, String> {
    validate_provider(&input)?;
    let provider = input.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let base_url = provider.base_url.trim().trim_end_matches('/');
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|error| format!("Could not prepare the provider test: {error}"))?;
        let response = client
            .post(format!("{base_url}/chat/completions"))
            .bearer_auth(provider.api_key.trim())
            .json(&serde_json::json!({
                "model": provider.model.trim(),
                "messages": [{ "role": "user", "content": "Reply with exactly: Amanda API connection passed." }],
                "max_tokens": 48,
                "temperature": 0,
                "stream": false
            }))
            .send()
            .map_err(|error| format!("Could not reach this AI provider: {error}"))?;
        let status = response.status();
        let body = response.text().unwrap_or_default();
        if !status.is_success() {
            let detail = body.chars().take(600).collect::<String>();
            return Err(format!("The provider returned HTTP {status}: {detail}"));
        }
        let payload: serde_json::Value = serde_json::from_str(&body)
            .map_err(|_| "The provider returned an unreadable response. Use an OpenAI-compatible chat-completions endpoint.".to_string())?;
        let answer = payload.pointer("/choices/0/message/content")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim();
        if answer.is_empty() {
            return Err("The API request succeeded, but the selected model returned no visible answer.".to_string());
        }

        #[cfg(target_os = "windows")]
        {
            let account = format!("model-provider-{}", provider.provider_id.trim());
            let entry = keyring::Entry::new("AmandaLocalAssistant", &account)
                .map_err(|_| "Windows Credential Manager could not be opened.".to_string())?;
            entry.set_password(provider.api_key.trim())
                .map_err(|error| format!("Could not securely save this API key: {error}"))?;
            let saved = entry.get_password()
                .map_err(|error| format!("The API key was saved but could not be verified: {error}"))?;
            if saved != provider.api_key.trim() {
                return Err("Windows Credential Manager returned a different API key after saving.".to_string());
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            return Err("Secure provider-key storage is currently available in the Windows desktop app.".to_string());
        }

        Ok(ProviderTestResult {
            success: true,
            message: answer.to_string(),
            model: provider.model.trim().to_string(),
        })
    }).await.map_err(|error| format!("The provider test stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub fn get_model_provider_key(provider_id: String) -> Result<String, String> {
    if provider_id.is_empty() || provider_id.len() > 48 || !provider_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid provider ID.".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let account = format!("model-provider-{provider_id}");
        let entry = keyring::Entry::new("AmandaLocalAssistant", &account)
            .map_err(|_| "Windows Credential Manager could not be opened.".to_string())?;
        entry.get_password().map_err(|_| "This provider's API key is not saved. Reconnect it in Settings.".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Secure provider-key storage is currently available in the Windows desktop app.".to_string())
    }
}

#[tauri::command]
pub fn delete_model_provider_key(provider_id: String) -> Result<(), String> {
    if provider_id.is_empty() || provider_id.len() > 48 || !provider_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid provider ID.".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let account = format!("model-provider-{provider_id}");
        let entry = keyring::Entry::new("AmandaLocalAssistant", &account)
            .map_err(|_| "Windows Credential Manager could not be opened.".to_string())?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("Could not remove the saved provider key: {error}")),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Secure provider-key storage is currently available in the Windows desktop app.".to_string())
    }
}

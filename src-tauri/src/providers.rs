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
        let is_gemini = provider.provider_id.trim() == "gemini";
        let (response, endpoint_label) = if is_gemini {
            let api_root = base_url
                .trim_end_matches("/openai")
                .trim_end_matches("/interactions");
            (
                client
                    .post(format!("{api_root}/interactions"))
                    .header("x-goog-api-key", provider.api_key.trim())
                    .json(&serde_json::json!({
                        "model": provider.model.trim(),
                        "input": "Reply with exactly: Amanda API connection passed.",
                        "store": false
                    }))
                    .send()
                    .map_err(|error| {
                        format!("Could not reach the Gemini Interactions API: {error}")
                    })?,
                "Gemini Interactions API",
            )
        } else {
            (
                client
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
                    .map_err(|error| format!("Could not reach this AI provider: {error}"))?,
                "OpenAI-compatible chat API",
            )
        };
        let status = response.status();
        let body = response.text().unwrap_or_default();
        if !status.is_success() {
            let detail = body.chars().take(900).collect::<String>();
            let hint = if is_gemini && status.as_u16() == 404 {
                " Check that the model is available to your Gemini API key; the recommended default is gemini-3.8-flash."
            } else {
                ""
            };
            return Err(format!(
                "{endpoint_label} returned HTTP {status}: {detail}{hint}"
            ));
        }
        let payload: serde_json::Value = serde_json::from_str(&body)
            .map_err(|_| format!("{endpoint_label} returned an unreadable response."))?;
        let answer = if is_gemini {
            payload
                .get("steps")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
                .filter(|step| {
                    step.get("type").and_then(serde_json::Value::as_str)
                        == Some("model_output")
                })
                .flat_map(|step| {
                    step.get("content")
                        .and_then(serde_json::Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .filter_map(|part| part.get("text").and_then(serde_json::Value::as_str))
                .collect::<Vec<_>>()
                .join(" ")
        } else {
            payload
                .pointer("/choices/0/message/content")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        let answer = answer.trim();
        if answer.is_empty() {
            return Err(
                "The API request succeeded, but the selected model returned no visible answer."
                    .to_string(),
            );
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

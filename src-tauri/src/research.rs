use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchResult {
    title: String,
    url: String,
    description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchCredentialStatus {
    configured: bool,
}

#[derive(Deserialize)]
struct BraveResponse {
    web: Option<BraveWebResults>,
}

#[derive(Deserialize)]
struct BraveWebResults {
    #[serde(default)]
    results: Vec<BraveResult>,
}

#[derive(Deserialize)]
struct BraveResult {
    title: String,
    url: String,
    #[serde(default)]
    description: String,
}

fn validate_query(query: &str) -> Result<String, String> {
    let query = query.trim();
    if query.chars().count() < 3 || query.chars().count() > 200 {
        return Err("Research queries must be between 3 and 200 characters".to_string());
    }
    if query.chars().any(char::is_control) {
        return Err("The research query contains unsupported characters".to_string());
    }
    Ok(query.to_string())
}

#[tauri::command]
pub fn brave_credential_status() -> ResearchCredentialStatus {
    ResearchCredentialStatus {
        configured: brave_api_key().is_ok(),
    }
}

#[tauri::command]
pub async fn search_brave(query: String) -> Result<Vec<ResearchResult>, String> {
    let query = validate_query(&query)?;
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || search_brave_blocking(query))
            .await
            .map_err(|error| format!("Online research stopped unexpectedly: {error}"))?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = query;
        Err("Online research is available in the Windows desktop app".to_string())
    }
}

#[cfg(target_os = "windows")]
fn brave_api_key() -> Result<String, String> {
    let entry = keyring::Entry::new("AmandaLocalAssistant", "brave-search")
        .map_err(|_| "The Brave Search credential is not configured".to_string())?;
    let key = entry
        .get_password()
        .map_err(|_| "The Brave Search credential is not configured".to_string())?;
    if key.trim().is_empty() {
        return Err("The Brave Search credential is empty".to_string());
    }
    Ok(key)
}

#[cfg(not(target_os = "windows"))]
fn brave_api_key() -> Result<String, String> {
    Err("Online research is available in the Windows desktop app".to_string())
}

#[cfg(target_os = "windows")]
fn search_brave_blocking(query: String) -> Result<Vec<ResearchResult>, String> {
    let key = brave_api_key()?;
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|_| "Could not prepare the online research request".to_string())?;
    let response = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", key)
        .header(reqwest::header::ACCEPT, "application/json")
        .query(&[("q", query.as_str()), ("count", "8")])
        .send()
        .map_err(|_| {
            "Brave Search could not be reached. Check the internet connection.".to_string()
        })?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err(
            "Brave Search rejected the saved credential. Update it in Windows Credential Manager."
                .to_string(),
        );
    }
    if !response.status().is_success() {
        return Err(format!("Brave Search returned HTTP {}", response.status()));
    }

    let payload: BraveResponse = response
        .json()
        .map_err(|_| "Brave Search returned an invalid response".to_string())?;
    let results = payload
        .web
        .map(|web| web.results)
        .unwrap_or_default()
        .into_iter()
        .filter(|result| result.url.starts_with("https://"))
        .take(8)
        .map(|result| ResearchResult {
            title: result.title.chars().take(300).collect(),
            url: result.url.chars().take(2_000).collect(),
            description: result.description.chars().take(1_200).collect(),
        })
        .collect();
    Ok(results)
}

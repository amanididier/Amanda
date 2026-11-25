use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchResult {
    title: String,
    url: String,
    description: String,
    provider: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchStatus {
    active_provider: String,
    firecrawl_configured: bool,
    brave_configured: bool,
}
#[derive(Deserialize)]
struct BraveResponse { web: Option<BraveWebResults> }
#[derive(Deserialize)]
struct BraveWebResults { #[serde(default)] results: Vec<BraveResult> }
#[derive(Deserialize)]
struct BraveResult { title: String, url: String, #[serde(default)] description: String }
#[derive(Deserialize)]
struct FirecrawlResponse {
    #[serde(default)] success: bool,
    #[serde(default)] data: Vec<FirecrawlResult>,
    error: Option<String>,
}
#[derive(Deserialize)]
struct FirecrawlResult {
    #[serde(default)] title: String,
    url: String,
    #[serde(default)] description: String,
    #[serde(default)] markdown: String,
}

fn validate_provider(provider: &str) -> Result<&'static str, String> {
    match provider.trim().to_ascii_lowercase().as_str() {
        "firecrawl" => Ok("firecrawl"),
        "brave" => Ok("brave"),
        _ => Err("Choose Firecrawl or Brave Search".to_string()),
    }
}
fn validate_query(query: &str) -> Result<String, String> {
    let query = query.trim();
    if query.chars().count() < 3 || query.chars().count() > 200 || query.chars().any(char::is_control) {
        return Err("Research queries must be between 3 and 200 characters".to_string());
    }
    Ok(query.to_string())
}
#[cfg(target_os = "windows")]
fn credential_username(provider: &str) -> &'static str {
    if provider == "firecrawl" { "firecrawl-search" } else { "brave-search" }
}
#[cfg(target_os = "windows")]
fn read_key(provider: &str) -> Result<String, String> {
    let entry = keyring::Entry::new("AmandaLocalAssistant", credential_username(provider))
        .map_err(|_| format!("{provider} credential could not be opened"))?;
    let key = entry.get_password().map_err(|_| format!("{provider} API key is not configured"))?;
    if key.trim().is_empty() { return Err(format!("{provider} API key is empty")); }
    Ok(key)
}
#[cfg(not(target_os = "windows"))]
fn read_key(provider: &str) -> Result<String, String> {
    Err(format!("{provider} search is available in the Windows desktop app"))
}
#[cfg(target_os = "windows")]
fn active_provider() -> String {
    keyring::Entry::new("AmandaLocalAssistant", "web-search-provider").ok()
        .and_then(|entry| entry.get_password().ok())
        .filter(|value| value == "firecrawl" || value == "brave")
        .unwrap_or_else(|| if read_key("firecrawl").is_ok() { "firecrawl".to_string() } else if read_key("brave").is_ok() { "brave".to_string() } else { "firecrawl".to_string() })
}
#[cfg(not(target_os = "windows"))]
fn active_provider() -> String { "firecrawl".to_string() }

#[tauri::command]
pub fn get_web_search_status() -> WebSearchStatus {
    WebSearchStatus {
        active_provider: active_provider(),
        firecrawl_configured: read_key("firecrawl").is_ok(),
        brave_configured: read_key("brave").is_ok(),
    }
}

#[cfg(target_os = "windows")]
fn perform_search(provider: &str, key: &str, query: &str, limit: u8) -> Result<Vec<ResearchResult>, String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(12))
        .timeout(std::time::Duration::from_secs(35))
        .build().map_err(|_| "Could not prepare the online research request".to_string())?;
    let response = if provider == "firecrawl" {
        client.post("https://api.firecrawl.dev/v2/search").bearer_auth(key)
            .json(&serde_json::json!({ "query": query, "limit": limit })).send()
    } else {
        client.get("https://api.search.brave.com/res/v1/web/search")
            .header("X-Subscription-Token", key)
            .header(reqwest::header::ACCEPT, "application/json")
            .query(&[("q", query), ("count", &limit.to_string())]).send()
    }.map_err(|_| format!("{provider} could not be reached. Check your internet connection."))?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(format!("{provider} rejected this API key. Check the key and try again."));
    }
    if status == reqwest::StatusCode::PAYMENT_REQUIRED {
        return Err(format!("{provider} reports that the account needs credits or an active plan."));
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(format!("{provider} rate limit reached. Wait a little and try again."));
    }
    if !status.is_success() { return Err(format!("{provider} returned HTTP {status}.")); }
    if provider == "firecrawl" {
        let payload: FirecrawlResponse = response.json().map_err(|_| "Firecrawl returned an unreadable response".to_string())?;
        if !payload.success { return Err(payload.error.unwrap_or_else(|| "Firecrawl could not complete the search".to_string())); }
        Ok(payload.data.into_iter().filter(|item| item.url.starts_with("https://")).take(limit as usize)
            .map(|item| ResearchResult {
                title: if item.title.trim().is_empty() { item.url.clone() } else { item.title.chars().take(300).collect() },
                url: item.url.chars().take(2_000).collect(),
                description: if item.description.trim().is_empty() { item.markdown.chars().take(1_200).collect() } else { item.description.chars().take(1_200).collect() },
                provider: "Firecrawl".to_string(),
            }).collect())
    } else {
        let payload: BraveResponse = response.json().map_err(|_| "Brave Search returned an unreadable response".to_string())?;
        Ok(payload.web.map(|web| web.results).unwrap_or_default().into_iter()
            .filter(|item| item.url.starts_with("https://")).take(limit as usize)
            .map(|item| ResearchResult {
                title: item.title.chars().take(300).collect(),
                url: item.url.chars().take(2_000).collect(),
                description: item.description.chars().take(1_200).collect(),
                provider: "Brave Search".to_string(),
            }).collect())
    }
}
#[cfg(not(target_os = "windows"))]
fn perform_search(_provider: &str, _key: &str, _query: &str, _limit: u8) -> Result<Vec<ResearchResult>, String> {
    Err("Online research is available in the Windows desktop app".to_string())
}

#[tauri::command]
pub async fn save_web_search_key(provider: String, api_key: String) -> Result<WebSearchStatus, String> {
    let provider = validate_provider(&provider)?.to_string();
    let key = api_key.trim().to_string();
    if key.len() < 8 || key.len() > 512 || key.chars().any(char::is_control) {
        return Err("That API key does not look valid. Check it and try again.".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let test_provider = provider.clone();
        let test_key = key.clone();
        tauri::async_runtime::spawn_blocking(move || {
            perform_search(
                &test_provider,
                &test_key,
                "Amanda web search API connection test",
                1,
            )
        })
        .await
        .map_err(|error| format!("Could not test the search provider: {error}"))??;
        let entry = keyring::Entry::new("AmandaLocalAssistant", credential_username(&provider))
            .map_err(|_| "Windows Credential Manager could not be opened".to_string())?;
        entry.set_password(&key).map_err(|_| "Windows could not securely save this API key".to_string())?;
        let selected = keyring::Entry::new("AmandaLocalAssistant", "web-search-provider")
            .map_err(|_| "Could not save the selected search provider".to_string())?;
        selected.set_password(&provider).map_err(|_| "Could not save the selected search provider".to_string())?;
        Ok(get_web_search_status())
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = key; Err("Connect web search in the Windows desktop app".to_string()) }
}

#[tauri::command]
pub fn set_web_search_provider(provider: String) -> Result<WebSearchStatus, String> {
    let provider = validate_provider(&provider)?;
    read_key(provider)?;
    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new("AmandaLocalAssistant", "web-search-provider")
            .map_err(|_| "Could not save the selected search provider".to_string())?;
        entry.set_password(provider).map_err(|_| "Could not save the selected search provider".to_string())?;
        Ok(get_web_search_status())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Web search provider settings are available in the Windows desktop app".to_string()) }
}

#[tauri::command]
pub async fn search_web(query: String) -> Result<Vec<ResearchResult>, String> {
    let query = validate_query(&query)?;
    let provider = active_provider();
    let key = read_key(&provider)?;
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || perform_search(&provider, &key, &query, 8))
            .await.map_err(|error| format!("Online research stopped unexpectedly: {error}"))?
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = (provider, key, query); Err("Online research is available in the Windows desktop app".to_string()) }
}

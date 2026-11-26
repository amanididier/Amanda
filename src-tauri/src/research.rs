use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchResult {
    title: String,
    url: String,
    description: String,
    content: String,
    provider: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchStatus {
    firecrawl_configured: bool,
}

#[cfg(target_os = "windows")]
fn read_firecrawl_key() -> Result<String, String> {
    let entry = keyring::Entry::new("AmandaLocalAssistant", "firecrawl-search")
        .map_err(|_| "Firecrawl credential could not be opened".to_string())?;
    let key = entry
        .get_password()
        .map_err(|_| "Firecrawl API key is not configured. Add it in Settings → Web search.".to_string())?;
    if key.trim().is_empty() {
        return Err("Firecrawl API key is empty. Add it again in Settings → Web search.".to_string());
    }
    Ok(key)
}

#[cfg(not(target_os = "windows"))]
fn read_firecrawl_key() -> Result<String, String> {
    Err("Firecrawl web search is available in the Windows desktop app".to_string())
}

#[tauri::command]
pub fn get_web_search_status() -> WebSearchStatus {
    WebSearchStatus {
        firecrawl_configured: read_firecrawl_key().is_ok(),
    }
}

fn validate_query(query: &str) -> Result<String, String> {
    let query = query.trim();
    let length = query.chars().count();
    if length < 3 || length > 500 || query.chars().any(char::is_control) {
        return Err("Web research queries must be between 3 and 500 characters".to_string());
    }
    Ok(query.to_string())
}

fn take_chars(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

fn parse_firecrawl_results(body: &str, limit: usize) -> Result<Vec<ResearchResult>, String> {
    let payload: Value = serde_json::from_str(body)
        .map_err(|_| "Firecrawl returned an unreadable search response".to_string())?;

    if payload.get("success").and_then(Value::as_bool) == Some(false) {
        let detail = payload
            .get("error")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("Firecrawl could not complete the search");
        return Err(take_chars(detail, 400));
    }

    // Firecrawl groups standard search results under data.web. Some responses that
    // include scraped page content use data as an array, so accept both shapes.
    let empty_data = Value::Null;
    let data = payload.get("data").unwrap_or(&empty_data);
    let results = data
        .get("web")
        .and_then(Value::as_array)
        .or_else(|| data.as_array())
        .or_else(|| payload.get("web").and_then(Value::as_array))
        .ok_or_else(|| "Firecrawl returned no web-results collection".to_string())?;

    let mut parsed = Vec::new();
    for item in results.iter().take(limit) {
        let Some(url) = item.get("url").and_then(Value::as_str) else {
            continue;
        };
        if !url.starts_with("https://") {
            continue;
        }

        let title = item
            .get("title")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(url);
        let description = item
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| {
                item.get("highlights")
                    .and_then(Value::as_array)
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(Value::as_str)
                            .take(3)
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .unwrap_or_default()
            });

        let page_content = item
            .get("markdown")
            .and_then(Value::as_str)
            .or_else(|| item.get("content").and_then(Value::as_str))
            .unwrap_or("");
        let fallback_content = if page_content.trim().is_empty() {
            description.as_str()
        } else {
            page_content
        };

        parsed.push(ResearchResult {
            title: take_chars(title, 300),
            url: take_chars(url, 2_000),
            description: take_chars(&description, 1_200),
            content: take_chars(fallback_content, 5_000),
            provider: "Firecrawl".to_string(),
        });
    }

    Ok(parsed)
}

#[cfg(target_os = "windows")]
fn perform_firecrawl_search(
    key: &str,
    query: &str,
    limit: u8,
    include_page_content: bool,
) -> Result<Vec<ResearchResult>, String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|_| "Could not prepare the Firecrawl research request".to_string())?;

    let mut request = serde_json::json!({
        "query": query,
        "sources": ["web"],
        "limit": limit,
    });
    if include_page_content {
        request["scrapeOptions"] = serde_json::json!({
            "formats": [{ "type": "markdown" }]
        });
    }

    let response = client
        .post("https://api.firecrawl.dev/v2/search")
        .bearer_auth(key)
        .json(&request)
        .send()
        .map_err(|_| "Firecrawl could not be reached. Check your internet connection.".to_string())?;

    let status = response.status();
    let body = response
        .text()
        .map_err(|_| "Could not read Firecrawl's search response".to_string())?;

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("Firecrawl rejected the saved API key. Check it in Settings → Web search.".to_string());
    }
    if status == reqwest::StatusCode::PAYMENT_REQUIRED {
        return Err("Firecrawl reports that the account needs credits or an active plan.".to_string());
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("Firecrawl rate limit reached. Wait a little and try again.".to_string());
    }
    if !status.is_success() {
        let detail = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|value| value.get("error").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| take_chars(&body, 300));
        return Err(format!("Firecrawl returned HTTP {status}: {detail}"));
    }

    parse_firecrawl_results(&body, limit as usize)
}

#[cfg(not(target_os = "windows"))]
fn perform_firecrawl_search(
    _key: &str,
    _query: &str,
    _limit: u8,
    _include_page_content: bool,
) -> Result<Vec<ResearchResult>, String> {
    Err("Firecrawl web search is available in the Windows desktop app".to_string())
}

#[tauri::command]
pub async fn save_web_search_key(api_key: String) -> Result<WebSearchStatus, String> {
    let key = api_key.trim().to_string();
    if key.len() < 8 || key.len() > 512 || key.chars().any(char::is_control) {
        return Err("That Firecrawl API key does not look valid. Check it and try again.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let test_key = key.clone();
        tauri::async_runtime::spawn_blocking(move || {
            // Test authentication with a low-cost search before saving the credential.
            perform_firecrawl_search(
                &test_key,
                "Amanda Firecrawl API connection test",
                1,
                false,
            )
        })
        .await
        .map_err(|error| format!("Could not test Firecrawl: {error}"))??;

        let entry = keyring::Entry::new("AmandaLocalAssistant", "firecrawl-search")
            .map_err(|_| "Windows Credential Manager could not be opened".to_string())?;
        entry
            .set_password(&key)
            .map_err(|_| "Windows could not securely save the Firecrawl API key".to_string())?;

        Ok(get_web_search_status())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = key;
        Err("Connect Firecrawl in the Windows desktop app".to_string())
    }
}

#[tauri::command]
pub async fn search_web(query: String) -> Result<Vec<ResearchResult>, String> {
    let query = validate_query(&query)?;
    let key = read_firecrawl_key()?;

    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            // Five pages provide a useful evidence base while keeping scrape usage bounded.
            perform_firecrawl_search(&key, &query, 5, true)
        })
        .await
        .map_err(|error| format!("Online research stopped unexpectedly: {error}"))?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (key, query);
        Err("Firecrawl web search is available in the Windows desktop app".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::parse_firecrawl_results;

    #[test]
    fn parses_grouped_firecrawl_web_results_with_markdown() {
        let body = r#"{
            "success": true,
            "data": {
                "web": [{
                    "title": "Research page",
                    "url": "https://example.com/research",
                    "description": "A short search snippet",
                    "markdown": "Full page\\nDetailed evidence"
                }]
            }
        }"#;

        let results = parse_firecrawl_results(body, 5).expect("response should parse");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Research page");
        assert!(results[0].content.contains("Detailed evidence"));
        assert_eq!(results[0].provider, "Firecrawl");
    }

    #[test]
    fn accepts_firecrawl_scraped_results_array() {
        let body = r#"{
            "success": true,
            "data": [{
                "title": "Scraped page",
                "url": "https://example.com/page",
                "description": "Page description",
                "markdown": "Full scraped page text"
            }]
        }"#;

        let results = parse_firecrawl_results(body, 5).expect("response should parse");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "Full scraped page text");
    }

    #[test]
    fn ignores_non_https_and_missing_url_results() {
        let body = r#"{
            "success": true,
            "data": {
                "web": [
                    { "title": "HTTP page", "url": "http://example.com" },
                    { "title": "No URL" },
                    { "title": "HTTPS page", "url": "https://example.com" }
                ]
            }
        }"#;

        let results = parse_firecrawl_results(body, 5).expect("response should parse");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].url, "https://example.com");
    }
}

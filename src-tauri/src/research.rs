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
    source_type: String,
    published_date: Option<String>,
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

    // Firecrawl v2 groups results by source under data.web and data.news.
    // Keep the array fallback for compatible response variants.
    let empty_data = Value::Null;
    let data = payload.get("data").unwrap_or(&empty_data);
    let mut web_results = data
        .get("web")
        .and_then(Value::as_array)
        .map(|items| items.iter().collect::<Vec<_>>())
        .unwrap_or_default();
    let mut news_results = data
        .get("news")
        .and_then(Value::as_array)
        .map(|items| items.iter().collect::<Vec<_>>())
        .unwrap_or_default();
    if web_results.is_empty() && news_results.is_empty() {
        if let Some(results) = data
            .as_array()
            .or_else(|| payload.get("web").and_then(Value::as_array))
        {
            web_results = results.iter().collect();
        }
    }

    // Interleave web and news so a web-only ranking cannot crowd out all news.
    let mut source_results: Vec<(&Value, &str)> = Vec::new();
    for index in 0..usize::from(limit) {
        if let Some(item) = web_results.get(index) {
            source_results.push((item, "web"));
        }
        if let Some(item) = news_results.get(index) {
            source_results.push((item, "news"));
        }
    }

    let mut parsed = Vec::new();
    for (item, source_type) in source_results {
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
        // Firecrawl web results use "description"; news results use "snippet".
        // Read both so news sources remain useful for ranking and model context.
        let description = item
            .get("description")
            .or_else(|| item.get("snippet"))
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
        // Firecrawl v2 news results expose their publication date as "date".
        let published_date = item
            .get("date")
            .or_else(|| item.get("publishedDate"))
            .or_else(|| item.get("published_date"))
            .or_else(|| item.get("metadata").and_then(|metadata| metadata.get("publishedDate")))
            .or_else(|| item.get("metadata").and_then(|metadata| metadata.get("date")))
            .and_then(Value::as_str)
            .map(|value| take_chars(value, 80));

        parsed.push(ResearchResult {
            title: take_chars(title, 300),
            url: take_chars(url, 2_000),
            description: take_chars(&description, 1_200),
            content: take_chars(fallback_content, 5_000),
            provider: "Firecrawl".to_string(),
            source_type: source_type.to_string(),
            published_date,
        });
    }

    Ok(parsed)
}

#[cfg(target_os = "windows")]
fn perform_firecrawl_search_once(
    client: &reqwest::blocking::Client,
    key: &str,
    query: &str,
    limit: u8,
    include_page_content: bool,
) -> Result<Vec<ResearchResult>, String> {
    let mut request = serde_json::json!({
        "query": query,
        "sources": ["web", "news"],
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
        .map_err(|error| format!("Firecrawl network request failed: {error}"))?;

    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Could not read Firecrawl's search response: {error}"))?;

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(format!("Firecrawl rejected the saved API key (HTTP {status}). Check the key in Settings → Web search."));
    }
    if status == reqwest::StatusCode::PAYMENT_REQUIRED {
        return Err("Firecrawl reports that the account needs credits or an active plan (HTTP 402).".to_string());
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("Firecrawl rate limit reached (HTTP 429). Wait a little and try again.".to_string());
    }
    if !status.is_success() {
        let payload = serde_json::from_str::<Value>(&body).ok();
        let detail = payload
            .as_ref()
            .and_then(|value| value.get("error").and_then(Value::as_str))
            .or_else(|| payload.as_ref().and_then(|value| value.get("message").and_then(Value::as_str)))
            .map(str::to_string)
            .unwrap_or_else(|| take_chars(&body, 400));
        return Err(format!("Firecrawl returned HTTP {status}: {detail}"));
    }

    parse_firecrawl_results(&body, limit as usize)
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
        .map_err(|error| format!("Could not prepare the Firecrawl research request: {error}"))?;

    match perform_firecrawl_search_once(&client, key, query, limit, include_page_content) {
        Ok(results) => Ok(results),
        Err(primary_error)
            if include_page_content
                && !primary_error.contains("rejected the saved API key")
                && !primary_error.contains("needs credits")
                && !primary_error.contains("rate limit reached") =>
        {
            // Full-page extraction can fail independently of search. Retry without
            // scraping so Amanda can still use verified titles, URLs and snippets.
            match perform_firecrawl_search_once(&client, key, query, limit, false) {
                Ok(results) => Ok(results),
                Err(fallback_error) => Err(format!(
                    "Firecrawl full-page extraction failed: {primary_error}. Search-only fallback also failed: {fallback_error}"
                )),
            }
        }
        Err(error) => Err(error),
    }
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
    #[test]
    fn parses_grouped_firecrawl_web_and_news_results() {
        let body = r#"{
            "success": true,
            "data": {
                "web": [{
                    "title": "AI research page",
                    "url": "https://example.com/research",
                    "description": "Research details",
                    "markdown": "Evidence from the research page"
                }],
                "news": [{
                    "title": "AI announcement",
                    "url": "https://example.com/news",
                    "description": "A recent announcement",
                    "markdown": "News article details",
                    "metadata": { "publishedDate": "2026-11-20" }
                }]
            }
        }"#;

        let results = parse_firecrawl_results(body, 5).expect("grouped response should parse");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].source_type, "web");
        assert_eq!(results[1].source_type, "news");
        assert_eq!(results[1].published_date.as_deref(), Some("2026-11-20"));
        assert!(results[1].content.contains("News article details"));
    }

    #[test]
    fn reads_firecrawl_news_snippet_and_date_fields() {
        let body = r#"{
            "success": true,
            "data": {
                "news": [{
                    "title": "AI announcement",
                    "url": "https://example.com/news",
                    "snippet": "The organization announced a new AI system.",
                    "date": "2026-11-25",
                    "markdown": "Full announcement details"
                }]
            }
        }"#;

        let results = parse_firecrawl_results(body, 5).expect("news response should parse");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].description, "The organization announced a new AI system.");
        assert_eq!(results[0].published_date.as_deref(), Some("2026-11-25"));
        assert_eq!(results[0].source_type, "news");
    }

    #[test]
    fn returns_empty_results_for_empty_web_and_news_collections() {
        let body = r#"{"success": true, "data": {"web": [], "news": []}}"#;
        let results = parse_firecrawl_results(body, 5).expect("empty response should parse");
        assert!(results.is_empty());
    }

}

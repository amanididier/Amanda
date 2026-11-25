use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use sqlx::Acquire;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

const DATABASE_URL: &str = "sqlite:amanda.db";

const TABLES: &[(&str, &str, &[&str])] = &[
    (
        "local_profile",
        "id",
        &["id", "display_name", "preferred_theme", "created_at"],
    ),
    (
        "workspaces",
        "id",
        &[
            "id",
            "name",
            "description",
            "workspace_type",
            "status",
            "is_system",
            "created_at",
            "updated_at",
        ],
    ),
    (
        "conversations",
        "id",
        &["id", "workspace_id", "title", "created_at", "updated_at"],
    ),
    (
        "messages",
        "id",
        &[
            "id",
            "conversation_id",
            "role",
            "content",
            "metadata",
            "created_at",
        ],
    ),
    (
        "daily_notes",
        "id",
        &[
            "id",
            "title",
            "content",
            "project_id",
            "created_at",
            "updated_at",
            "archived_at",
        ],
    ),
    (
        "execution_plans",
        "id",
        &[
            "id",
            "workspace_id",
            "version",
            "title",
            "summary",
            "created_at",
            "updated_at",
        ],
    ),
    (
        "plan_steps",
        "id",
        &[
            "id",
            "plan_id",
            "workspace_id",
            "phase",
            "title",
            "details",
            "verification_criteria",
            "status",
            "position",
            "due_date",
            "completed_at",
            "created_at",
            "updated_at",
        ],
    ),
    (
        "tasks",
        "id",
        &[
            "id",
            "project_id",
            "title",
            "description",
            "status",
            "priority",
            "due_date",
            "position",
            "plan_step_id",
            "created_at",
            "updated_at",
        ],
    ),
    (
        "memory_items",
        "id",
        &[
            "id",
            "content",
            "category",
            "source",
            "project_id",
            "confidence",
            "archived",
            "created_at",
            "updated_at",
        ],
    ),
    (
        "research_sources",
        "id",
        &[
            "id",
            "project_id",
            "title",
            "url",
            "publisher",
            "publication_date",
            "retrieved_at",
            "summary",
            "citation_metadata",
            "archived_at",
        ],
    ),
    (
        "workspace_activity",
        "id",
        &[
            "id",
            "workspace_id",
            "activity_type",
            "description",
            "metadata",
            "created_at",
        ],
    ),
    (
        "ai_preferences",
        "id",
        &[
            "id",
            "provider",
            "model",
            "model_path",
            "context_length",
            "created_at",
            "updated_at",
        ],
    ),
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalBackupImport {
    format_version: u8,
    tables: HashMap<String, Vec<HashMap<String, Value>>>,
}

#[tauri::command]
pub async fn restore_local_backup(
    instances: State<'_, DbInstances>,
    backup: LocalBackupImport,
) -> Result<(), String> {
    if backup.format_version != 1 {
        return Err("This Amanda backup format is not supported".to_string());
    }
    if backup.tables.len() != TABLES.len()
        || TABLES
            .iter()
            .any(|(name, _, _)| !backup.tables.contains_key(*name))
    {
        return Err("The backup is missing one or more required Amanda tables".to_string());
    }

    for (table_name, _, allowed_columns) in TABLES {
        let rows = backup
            .tables
            .get(*table_name)
            .ok_or_else(|| format!("The {table_name} backup data is missing"))?;
        if rows.len() > 100_000 {
            return Err(format!("The {table_name} backup contains too many rows"));
        }
        for row in rows {
            if row
                .keys()
                .any(|key| !allowed_columns.contains(&key.as_str()))
            {
                return Err(format!(
                    "The {table_name} backup contains an unsupported field"
                ));
            }
        }
    }

    let instances = instances.0.read().await;
    let pool = match instances.get(DATABASE_URL) {
        Some(DbPool::Sqlite(pool)) => pool,
        Some(_) => return Err("Amanda's local database is not SQLite".to_string()),
        None => return Err("Amanda's local database is not ready".to_string()),
    };

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Could not begin the backup restore: {error}"))?;

    let restore_result = async {
        for (table_name, primary_key, allowed_columns) in TABLES {
            let rows = backup.tables.get(*table_name).expect("table names validated");
            for row in rows {
                if !row.contains_key(*primary_key) {
                    return Err(format!("A {table_name} backup row is missing its ID"));
                }

                let columns: Vec<&str> = allowed_columns
                    .iter()
                    .copied()
                    .filter(|column| row.contains_key(*column))
                    .collect();
                let placeholders = (1..=columns.len())
                    .map(|index| format!("${index}"))
                    .collect::<Vec<_>>()
                    .join(", ");
                let updates = columns
                    .iter()
                    .copied()
                    .filter(|column| column != primary_key)
                    .map(|column| format!("{column} = excluded.{column}"))
                    .collect::<Vec<_>>();
                let conflict = if updates.is_empty() {
                    "DO NOTHING".to_string()
                } else {
                    format!("DO UPDATE SET {}", updates.join(", "))
                };
                let statement = format!(
                    "INSERT INTO {table_name} ({}) VALUES ({placeholders}) ON CONFLICT({primary_key}) {conflict}",
                    columns.join(", ")
                );
                let mut query = sqlx::query(&statement);
                for column in &columns {
                    let value = row.get(*column).expect("column selected from row");
                    query = match value {
                        Value::Null => query.bind(None::<String>),
                        Value::Bool(value) => query.bind(*value),
                        Value::String(value) => query.bind(value.clone()),
                        Value::Number(value) => {
                            if let Some(integer) = value.as_i64() {
                                query.bind(integer)
                            } else if let Some(integer) = value.as_u64() {
                                query.bind(i64::try_from(integer).map_err(|_| {
                                    format!("The {table_name} backup contains an out-of-range number")
                                })?)
                            } else if let Some(number) = value.as_f64() {
                                query.bind(number)
                            } else {
                                return Err(format!("The {table_name} backup contains an invalid number"));
                            }
                        }
                        _ => return Err(format!("The {table_name} backup contains an invalid value")),
                    };
                }
                query
                    .execute(&mut *transaction)
                    .await
                    .map_err(|error| format!("Could not restore a {table_name} record: {error}"))?;
            }
        }
        Ok::<(), String>(())
    }
    .await;

    if let Err(error) = restore_result {
        let _ = transaction.rollback().await;
        return Err(error);
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("Could not finish the backup restore: {error}"))?;
    Ok(())
}

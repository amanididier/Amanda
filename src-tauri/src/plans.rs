use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};
use uuid::Uuid;

const DATABASE_URL: &str = "sqlite:amanda.db";
const MAX_STEPS: usize = 10;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedRoadmap {
    workspace_id: String,
    title: String,
    summary: String,
    steps: Vec<ApprovedRoadmapStep>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedRoadmapStep {
    phase: String,
    title: String,
    details: String,
    verification_criteria: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRoadmap {
    plan_id: String,
    version: i64,
    task_count: usize,
}

#[tauri::command]
pub async fn save_approved_roadmap(
    instances: State<'_, DbInstances>,
    roadmap: ApprovedRoadmap,
) -> Result<SavedRoadmap, String> {
    validate_roadmap(&roadmap)?;

    let instances = instances.0.read().await;
    let pool = match instances.get(DATABASE_URL) {
        Some(DbPool::Sqlite(pool)) => pool,
        None => return Err("Amanda's local database is not ready".to_string()),
    };
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Could not begin the roadmap save: {error}"))?;

    let result = async {
        let workspace = sqlx::query("SELECT workspace_type, status, is_system FROM workspaces WHERE id = $1")
            .bind(&roadmap.workspace_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| format!("Could not verify the project for this roadmap: {error}"))?
            .ok_or_else(|| "The project for this roadmap no longer exists".to_string())?;
        if workspace.get::<String, _>("workspace_type") != "project"
            || workspace.get::<String, _>("status") != "active"
            || workspace.get::<i64, _>("is_system") != 0
        {
            return Err("Roadmaps can only be saved to an active project".to_string());
        }

        let version: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(version), 0) + 1 FROM execution_plans WHERE workspace_id = $1",
        )
        .bind(&roadmap.workspace_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| format!("Could not determine the roadmap version: {error}"))?;
        let plan_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO execution_plans (id, workspace_id, version, title, summary) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(&plan_id)
        .bind(&roadmap.workspace_id)
        .bind(version)
        .bind(roadmap.title.trim())
        .bind(roadmap.summary.trim())
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Could not save the roadmap: {error}"))?;

        for (position, step) in roadmap.steps.iter().enumerate() {
            let step_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO plan_steps (id, plan_id, workspace_id, phase, title, details, verification_criteria, status, position) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)",
            )
            .bind(&step_id)
            .bind(&plan_id)
            .bind(&roadmap.workspace_id)
            .bind(step.phase.trim())
            .bind(step.title.trim())
            .bind(step.details.trim())
            .bind(step.verification_criteria.trim())
            .bind(position as i64)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Could not save roadmap step {}: {error}", position + 1))?;

            sqlx::query(
                "INSERT INTO tasks (id, project_id, title, description, status, priority, position, plan_step_id) VALUES ($1, $2, $3, $4, 'todo', 'normal', $5, $6)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&roadmap.workspace_id)
            .bind(step.title.trim())
            .bind(step.details.trim())
            .bind(position as i64)
            .bind(&step_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("Could not create the task for roadmap step {}: {error}", position + 1))?;
        }

        Ok::<SavedRoadmap, String>(SavedRoadmap {
            plan_id,
            version,
            task_count: roadmap.steps.len(),
        })
    }
    .await;

    match result {
        Ok(saved) => {
            transaction
                .commit()
                .await
                .map_err(|error| format!("Could not finish saving the roadmap: {error}"))?;
            Ok(saved)
        }
        Err(error) => {
            let _ = transaction.rollback().await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn update_roadmap_step(
    instances: State<'_, DbInstances>,
    workspace_id: String,
    step_id: String,
    completed: bool,
) -> Result<(), String> {
    if workspace_id.trim().is_empty() || step_id.trim().is_empty() {
        return Err("The roadmap step is invalid".to_string());
    }
    let instances = instances.0.read().await;
    let pool = match instances.get(DATABASE_URL) {
        Some(DbPool::Sqlite(pool)) => pool,
        None => return Err("Amanda's local database is not ready".to_string()),
    };
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("Could not begin the roadmap update: {error}"))?;

    let update = async {
        let step = sqlx::query(
            "SELECT plan_steps.id FROM plan_steps INNER JOIN workspaces ON workspaces.id = plan_steps.workspace_id WHERE plan_steps.id = $1 AND plan_steps.workspace_id = $2 AND workspaces.workspace_type = 'project' AND workspaces.status = 'active' AND workspaces.is_system = 0",
        )
        .bind(&step_id)
        .bind(&workspace_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| format!("Could not verify the roadmap step: {error}"))?;
        if step.is_none() {
            return Err("This roadmap step is no longer available in the active project".to_string());
        }

        let status = if completed { "done" } else { "pending" };
        sqlx::query(
            "UPDATE plan_steps SET status = $1, completed_at = CASE WHEN $1 = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND workspace_id = $3",
        )
        .bind(status)
        .bind(&step_id)
        .bind(&workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Could not update the roadmap step: {error}"))?;
        sqlx::query(
            "UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE plan_step_id = $2 AND project_id = $3",
        )
        .bind(if completed { "done" } else { "todo" })
        .bind(&step_id)
        .bind(&workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Could not update the linked project task: {error}"))?;
        Ok::<(), String>(())
    }
    .await;

    if let Err(error) = update {
        let _ = transaction.rollback().await;
        return Err(error);
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("Could not finish updating the roadmap: {error}"))
}

fn validate_roadmap(roadmap: &ApprovedRoadmap) -> Result<(), String> {
    if roadmap.workspace_id.trim().is_empty() || roadmap.workspace_id.len() > 120 {
        return Err("The project for this roadmap is invalid".to_string());
    }
    if roadmap.title.trim().is_empty() || roadmap.title.chars().count() > 120 {
        return Err("Roadmap titles must be between 1 and 120 characters".to_string());
    }
    if roadmap.summary.chars().count() > 2_000 {
        return Err("Roadmap summaries must be 2,000 characters or fewer".to_string());
    }
    if !(3..=MAX_STEPS).contains(&roadmap.steps.len()) {
        return Err(format!("Roadmaps must contain 3 to {MAX_STEPS} steps"));
    }
    for (index, step) in roadmap.steps.iter().enumerate() {
        if step.phase.trim().is_empty() || step.phase.chars().count() > 80 {
            return Err(format!("Roadmap step {} has an invalid phase", index + 1));
        }
        if step.title.trim().is_empty() || step.title.chars().count() > 160 {
            return Err(format!("Roadmap step {} has an invalid title", index + 1));
        }
        if step.details.chars().count() > 1_200 {
            return Err(format!("Roadmap step {} has too much detail", index + 1));
        }
        if step.verification_criteria.chars().count() > 800 {
            return Err(format!(
                "Roadmap step {} has oversized completion criteria",
                index + 1
            ));
        }
    }
    Ok(())
}

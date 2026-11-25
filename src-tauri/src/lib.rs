mod backup;
mod model;
mod plans;
mod research;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_local_profile",
            sql: "CREATE TABLE local_profile (id INTEGER PRIMARY KEY CHECK (id = 1), display_name TEXT NOT NULL DEFAULT 'Amanda', preferred_theme TEXT NOT NULL DEFAULT 'system' CHECK (preferred_theme IN ('light', 'dark', 'system')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_workspaces",
            sql: "CREATE TABLE workspaces (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', workspace_type TEXT NOT NULL DEFAULT 'project' CHECK (workspace_type IN ('project', 'research')), status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_conversations",
            sql: "CREATE TABLE conversations (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'Amanda', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_messages",
            sql: "CREATE TABLE messages (id TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')), content TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_daily_notes",
            sql: "CREATE TABLE daily_notes (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL DEFAULT 'Untitled note', content TEXT NOT NULL DEFAULT '', project_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, archived_at TEXT);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_execution_plans",
            sql: "CREATE TABLE execution_plans (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, version INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_plan_steps",
            sql: "CREATE TABLE plan_steps (id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL REFERENCES execution_plans(id) ON DELETE CASCADE, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, phase TEXT NOT NULL DEFAULT 'General', title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', verification_criteria TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')), position INTEGER NOT NULL DEFAULT 0, due_date TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_tasks",
            sql: "CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal', due_date TEXT, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create_memory_items",
            sql: "CREATE TABLE memory_items (id TEXT PRIMARY KEY NOT NULL, content TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general', source TEXT NOT NULL DEFAULT 'user', project_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL, confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1), archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "create_research_sources",
            sql: "CREATE TABLE research_sources (id TEXT PRIMARY KEY NOT NULL, project_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL, title TEXT NOT NULL, url TEXT NOT NULL, publisher TEXT, publication_date TEXT, retrieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, summary TEXT NOT NULL DEFAULT '', citation_metadata TEXT NOT NULL DEFAULT '{}');",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "create_workspace_activity",
            sql: "CREATE TABLE workspace_activity (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, activity_type TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "create_ai_preferences",
            sql: "CREATE TABLE ai_preferences (id INTEGER PRIMARY KEY CHECK (id = 1), provider TEXT NOT NULL DEFAULT 'local', model TEXT, model_path TEXT, context_length INTEGER NOT NULL DEFAULT 4096, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "index_conversations",
            sql: "CREATE INDEX conversations_workspace_id_idx ON conversations(workspace_id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "index_messages",
            sql: "CREATE INDEX messages_conversation_id_idx ON messages(conversation_id, created_at);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "index_daily_notes",
            sql: "CREATE INDEX notes_updated_at_idx ON daily_notes(updated_at);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "index_execution_plans",
            sql: "CREATE INDEX plans_workspace_id_idx ON execution_plans(workspace_id, version);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "index_plan_steps",
            sql: "CREATE INDEX steps_plan_id_idx ON plan_steps(plan_id, position);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "index_tasks",
            sql: "CREATE INDEX tasks_project_id_idx ON tasks(project_id, status, position);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "index_memory_items",
            sql: "CREATE INDEX memory_project_id_idx ON memory_items(project_id, archived);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "index_research_sources",
            sql: "CREATE INDEX sources_project_id_idx ON research_sources(project_id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "index_workspace_activity",
            sql: "CREATE INDEX activity_workspace_id_idx ON workspace_activity(workspace_id, created_at);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "link_tasks_to_plan_steps",
            sql: "ALTER TABLE tasks ADD COLUMN plan_step_id TEXT REFERENCES plan_steps(id) ON DELETE SET NULL;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "unique_plan_step_tasks",
            sql: "CREATE UNIQUE INDEX tasks_plan_step_id_idx ON tasks(plan_step_id) WHERE plan_step_id IS NOT NULL;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "archive_research_sources",
            sql: "ALTER TABLE research_sources ADD COLUMN archived_at TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "mark_system_workspaces",
            sql: "ALTER TABLE workspaces ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1));",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "create_general_assistant_workspace",
            sql: "INSERT INTO workspaces (id, name, description, workspace_type, status, is_system) VALUES ('__amanda_general__', 'Amanda', 'General private assistant conversation.', 'project', 'active', 1);",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(model::ModelRuntime::default())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:amanda.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            backup::restore_local_backup,
            plans::save_approved_roadmap,
            plans::update_roadmap_step,
            research::brave_credential_status,
            research::search_brave,
            model::get_model_status,
            model::download_model,
            model::cancel_model_download,
            model::start_local_model,
            model::stop_local_model,
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.app_handle().try_state::<model::ModelRuntime>() {
                    model::shutdown(&state);
                }
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

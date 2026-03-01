use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const DATABASE_FILE_NAME: &str = "chat_store.sqlite3";

pub fn now_millis() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(dur) => dur.as_millis() as i64,
        Err(_) => 0,
    }
}

pub fn normalize_theme(theme: &str) -> Result<&str, String> {
    match theme {
        "dark" | "light" => Ok(theme),
        _ => Err("invalid theme".to_string()),
    }
}

pub fn normalize_role(role: &str) -> Result<&str, String> {
    match role {
        "user" | "assistant" => Ok(role),
        _ => Err("invalid role".to_string()),
    }
}

pub fn ensure_not_empty(value: &str, field_name: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field_name} is required"));
    }
    Ok(())
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir failed: {err}"))?;
    Ok(app_dir.join(DATABASE_FILE_NAME))
}

fn initialize_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA user_version = 1;
        CREATE TABLE IF NOT EXISTS settings (
          id TEXT PRIMARY KEY,
          gateway_url TEXT NOT NULL,
          token TEXT NOT NULL,
          theme TEXT NOT NULL CHECK(theme IN ('dark', 'light'))
        );
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          session_key TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
          ON conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
          ON messages(conversation_id, created_at);
        ",
    )
    .map_err(|err| format!("initialize schema failed: {err}"))?;
    Ok(())
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("create database dir failed: {err}"))?;
    }
    let conn = Connection::open(path).map_err(|err| format!("open database failed: {err}"))?;
    initialize_schema(&conn)?;
    Ok(conn)
}

pub fn with_conn_by_path<T, F>(path: &Path, op: F) -> Result<T, String>
where
    F: FnOnce(&mut Connection) -> Result<T, String>,
{
    let mut conn = open_connection(path)?;
    op(&mut conn)
}

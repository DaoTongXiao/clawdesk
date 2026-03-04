use crate::db::model::{ConversationRecord, MessageRecord, SettingsRecord};
use crate::db::schema::{
    db_path, ensure_not_empty, normalize_role, normalize_theme, now_millis, with_conn_by_path,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use tauri::AppHandle;

const SETTINGS_KEY: &str = "default";

fn get_settings_in_conn(conn: &Connection) -> Result<Option<SettingsRecord>, String> {
    conn.query_row(
        "SELECT id, gateway_url, token, theme FROM settings WHERE id = ?1",
        [SETTINGS_KEY],
        |row| {
            Ok(SettingsRecord {
                id: row.get(0)?,
                gateway_url: row.get(1)?,
                token: row.get(2)?,
                theme: row.get(3)?,
            })
        },
    )
    .optional()
    .map_err(|err| format!("query settings failed: {err}"))
}

fn list_conversations_in_conn(conn: &Connection) -> Result<Vec<ConversationRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, session_key, created_at, updated_at
             FROM conversations ORDER BY updated_at DESC",
        )
        .map_err(|err| format!("prepare list conversations failed: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ConversationRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                session_key: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|err| format!("query list conversations failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("collect conversations failed: {err}"))
}

fn list_messages_in_conn(
    conn: &Connection,
    conversation_id: &str,
) -> Result<Vec<MessageRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, created_at
             FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|err| format!("prepare list messages failed: {err}"))?;
    let rows = stmt
        .query_map([conversation_id], |row| {
            Ok(MessageRecord {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|err| format!("query list messages failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("collect messages failed: {err}"))
}

pub(crate) fn get_settings_by_path(path: &Path) -> Result<Option<SettingsRecord>, String> {
    with_conn_by_path(path, |conn| get_settings_in_conn(conn))
}

pub(crate) fn save_settings_by_path(
    path: &Path,
    gateway_url: &str,
    token: &str,
    theme: &str,
) -> Result<SettingsRecord, String> {
    ensure_not_empty(gateway_url, "gateway_url")?;
    ensure_not_empty(token, "token")?;
    let safe_theme = normalize_theme(theme)?.to_string();
    with_conn_by_path(path, |conn| {
        conn.execute(
            "
            INSERT INTO settings (id, gateway_url, token, theme)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(id) DO UPDATE SET
              gateway_url = excluded.gateway_url,
              token = excluded.token,
              theme = excluded.theme
            ",
            params![SETTINGS_KEY, gateway_url, token, safe_theme],
        )
        .map_err(|err| format!("save settings failed: {err}"))?;
        Ok(SettingsRecord {
            id: SETTINGS_KEY.to_string(),
            gateway_url: gateway_url.to_string(),
            token: token.to_string(),
            theme: safe_theme,
        })
    })
}

pub(crate) fn insert_conversation_by_path(
    path: &Path,
    id: &str,
    session_key: &str,
    title: &str,
) -> Result<ConversationRecord, String> {
    ensure_not_empty(id, "id")?;
    ensure_not_empty(session_key, "session_key")?;
    ensure_not_empty(title, "title")?;
    let now = now_millis();
    with_conn_by_path(path, |conn| {
        conn.execute(
            "INSERT INTO conversations (id, title, session_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, title, session_key, now, now],
        )
        .map_err(|err| format!("create conversation failed: {err}"))?;
        Ok(ConversationRecord {
            id: id.to_string(),
            title: title.to_string(),
            session_key: session_key.to_string(),
            created_at: now,
            updated_at: now,
        })
    })
}

pub(crate) fn add_message_by_path(path: &Path, message: &MessageRecord) -> Result<(), String> {
    ensure_not_empty(&message.id, "id")?;
    ensure_not_empty(&message.conversation_id, "conversation_id")?;
    ensure_not_empty(&message.content, "content")?;
    let safe_role = normalize_role(&message.role)?.to_string();
    with_conn_by_path(path, |conn| {
        let tx = conn
            .transaction()
            .map_err(|err| format!("start transaction failed: {err}"))?;
        tx.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                message.id,
                message.conversation_id,
                safe_role,
                message.content,
                message.created_at
            ],
        )
        .map_err(|err| format!("insert message failed: {err}"))?;
        tx.execute(
            "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
            params![now_millis(), message.conversation_id],
        )
        .map_err(|err| format!("touch conversation failed: {err}"))?;
        tx.commit()
            .map_err(|err| format!("commit transaction failed: {err}"))?;
        Ok(())
    })
}

pub(crate) fn get_messages_by_path(
    path: &Path,
    conversation_id: &str,
) -> Result<Vec<MessageRecord>, String> {
    ensure_not_empty(conversation_id, "conversation_id")?;
    with_conn_by_path(path, |conn| list_messages_in_conn(conn, conversation_id))
}

pub fn get_settings(app: &AppHandle) -> Result<Option<SettingsRecord>, String> {
    get_settings_by_path(db_path(app)?.as_path())
}

pub fn save_settings(
    app: &AppHandle,
    gateway_url: &str,
    token: &str,
    theme: &str,
) -> Result<SettingsRecord, String> {
    save_settings_by_path(db_path(app)?.as_path(), gateway_url, token, theme)
}

pub fn update_theme(app: &AppHandle, theme: &str) -> Result<(), String> {
    let safe_theme = normalize_theme(theme)?.to_string();
    with_conn_by_path(db_path(app)?.as_path(), |conn| {
        conn.execute(
            "UPDATE settings SET theme = ?1 WHERE id = ?2",
            params![safe_theme, SETTINGS_KEY],
        )
        .map_err(|err| format!("update theme failed: {err}"))?;
        Ok(())
    })
}

pub fn get_conversation(app: &AppHandle, id: &str) -> Result<Option<ConversationRecord>, String> {
    with_conn_by_path(db_path(app)?.as_path(), |conn| {
        conn.query_row(
            "SELECT id, title, session_key, created_at, updated_at FROM conversations WHERE id = ?1",
            [id],
            |row| {
                Ok(ConversationRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    session_key: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|err| format!("query conversation failed: {err}"))
    })
}

pub fn get_all_conversations(app: &AppHandle) -> Result<Vec<ConversationRecord>, String> {
    with_conn_by_path(db_path(app)?.as_path(), |conn| {
        list_conversations_in_conn(conn)
    })
}

pub fn create_conversation(
    app: &AppHandle,
    id: &str,
    session_key: &str,
    title: &str,
) -> Result<ConversationRecord, String> {
    insert_conversation_by_path(db_path(app)?.as_path(), id, session_key, title)
}

pub fn update_conversation_title(app: &AppHandle, id: &str, title: &str) -> Result<(), String> {
    ensure_not_empty(id, "id")?;
    ensure_not_empty(title, "title")?;
    with_conn_by_path(db_path(app)?.as_path(), |conn| {
        conn.execute(
            "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now_millis(), id],
        )
        .map_err(|err| format!("update conversation failed: {err}"))?;
        Ok(())
    })
}

pub fn delete_conversation(app: &AppHandle, id: &str) -> Result<(), String> {
    ensure_not_empty(id, "id")?;
    with_conn_by_path(db_path(app)?.as_path(), |conn| {
        let tx = conn
            .transaction()
            .map_err(|err| format!("start transaction failed: {err}"))?;
        tx.execute("DELETE FROM messages WHERE conversation_id = ?1", [id])
            .map_err(|err| format!("delete messages failed: {err}"))?;
        tx.execute("DELETE FROM conversations WHERE id = ?1", [id])
            .map_err(|err| format!("delete conversation failed: {err}"))?;
        tx.commit()
            .map_err(|err| format!("commit transaction failed: {err}"))?;
        Ok(())
    })
}

pub fn delete_all_conversations(app: &AppHandle) -> Result<(), String> {
    with_conn_by_path(db_path(app)?.as_path(), |conn| {
        let tx = conn
            .transaction()
            .map_err(|err| format!("start transaction failed: {err}"))?;
        tx.execute("DELETE FROM messages", [])
            .map_err(|err| format!("delete all messages failed: {err}"))?;
        tx.execute("DELETE FROM conversations", [])
            .map_err(|err| format!("delete all conversations failed: {err}"))?;
        tx.commit()
            .map_err(|err| format!("commit transaction failed: {err}"))?;
        Ok(())
    })
}

pub fn get_messages(app: &AppHandle, conversation_id: &str) -> Result<Vec<MessageRecord>, String> {
    get_messages_by_path(db_path(app)?.as_path(), conversation_id)
}

pub fn add_message(app: &AppHandle, message: &MessageRecord) -> Result<(), String> {
    add_message_by_path(db_path(app)?.as_path(), message)
}

pub fn search_conversations(
    app: &AppHandle,
    query: &str,
) -> Result<Vec<ConversationRecord>, String> {
    let like = format!("%{}%", query.to_lowercase());
    with_conn_by_path(db_path(app)?.as_path(), |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, session_key, created_at, updated_at
                 FROM conversations WHERE LOWER(title) LIKE ?1 ORDER BY updated_at DESC",
            )
            .map_err(|err| format!("prepare search failed: {err}"))?;
        let rows = stmt
            .query_map([like], |row| {
                Ok(ConversationRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    session_key: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|err| format!("query search failed: {err}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| format!("collect search result failed: {err}"))
    })
}

pub fn search_messages(
    app: &AppHandle,
    query: &str,
    conversation_id: Option<&str>,
) -> Result<Vec<MessageRecord>, String> {
    ensure_not_empty(query, "query")?;
    let search_query = query.to_lowercase();
    with_conn_by_path(db_path(app)?.as_path(), |conn| {
        if let Some(cid) = conversation_id {
            let mut stmt = conn
                .prepare(
                    "SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
                     FROM messages m
                     JOIN messages_fts fts ON m.rowid = fts.rowid
                     WHERE messages_fts MATCH ?1 AND m.conversation_id = ?2
                     ORDER BY m.created_at DESC
                     LIMIT 100",
                )
                .map_err(|err| format!("prepare search messages failed: {err}"))?;
            let rows = stmt
                .query_map(params![search_query, cid], |row| {
                    Ok(MessageRecord {
                        id: row.get(0)?,
                        conversation_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                })
                .map_err(|err| format!("query search messages failed: {err}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|err| format!("collect search messages result failed: {err}"))
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
                     FROM messages m
                     JOIN messages_fts fts ON m.rowid = fts.rowid
                     WHERE messages_fts MATCH ?1
                     ORDER BY m.created_at DESC
                     LIMIT 100",
                )
                .map_err(|err| format!("prepare search messages failed: {err}"))?;
            let rows = stmt
                .query_map(params![search_query], |row| {
                    Ok(MessageRecord {
                        id: row.get(0)?,
                        conversation_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                })
                .map_err(|err| format!("query search messages failed: {err}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|err| format!("collect search messages result failed: {err}"))
        }
    })
}

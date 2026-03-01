use crate::db::model::MessageRecord;
use crate::db::schema::{now_millis, with_conn_by_path};
use crate::db::store::{
    add_message_by_path, get_messages_by_path, get_settings_by_path, insert_conversation_by_path,
    save_settings_by_path,
};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static TEST_SEQ: AtomicU64 = AtomicU64::new(0);

fn temp_db_path() -> PathBuf {
    let sequence = TEST_SEQ.fetch_add(1, Ordering::Relaxed);
    let file_name = format!(
        "chatclaw-test-{}-{}-{}.sqlite3",
        std::process::id(),
        now_millis(),
        sequence
    );
    std::env::temp_dir().join(file_name)
}

#[test]
fn should_store_and_load_conversation_and_messages() {
    let path = temp_db_path();
    save_settings_by_path(path.as_path(), "ws://localhost:18789", "token-1", "light")
        .expect("save settings failed");

    let loaded = get_settings_by_path(path.as_path()).expect("load settings failed");
    assert!(loaded.is_some());
    assert_eq!(loaded.expect("missing settings").theme, "light");

    insert_conversation_by_path(path.as_path(), "c1", "s1", "first")
        .expect("insert conversation failed");

    let message = MessageRecord {
        id: "m1".to_string(),
        conversation_id: "c1".to_string(),
        role: "assistant".to_string(),
        content: "hello".to_string(),
        created_at: now_millis(),
    };
    add_message_by_path(path.as_path(), &message).expect("add message failed");

    let list = get_messages_by_path(path.as_path(), "c1").expect("list messages failed");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].content, "hello");

    let _ = std::fs::remove_file(path);
}

#[test]
fn should_reject_invalid_theme() {
    let path = temp_db_path();
    let result = save_settings_by_path(path.as_path(), "ws://localhost:18789", "token-1", "bad");
    assert!(result.is_err());
    let _ = std::fs::remove_file(path);
}

#[test]
fn should_reject_message_when_conversation_missing() {
    let path = temp_db_path();
    let msg = MessageRecord {
        id: "m1".to_string(),
        conversation_id: "missing".to_string(),
        role: "user".to_string(),
        content: "hi".to_string(),
        created_at: now_millis(),
    };
    let result = add_message_by_path(path.as_path(), &msg);
    assert!(result.is_err());

    let _ = with_conn_by_path(path.as_path(), |_conn| Ok(()));
    let _ = std::fs::remove_file(path);
}

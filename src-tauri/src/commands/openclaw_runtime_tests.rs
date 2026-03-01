use super::openclaw_runtime::{
    openclaw_config_validate, openclaw_logs_read, openclaw_overview_read, openclaw_section_read,
};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TEST_SEQ: AtomicU64 = AtomicU64::new(0);

fn now_millis() -> u128 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(v) => v.as_millis(),
        Err(_) => 0,
    }
}

fn temp_path(prefix: &str, suffix: &str) -> std::path::PathBuf {
    let seq = TEST_SEQ.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("{prefix}-{}-{seq}{suffix}", now_millis()))
}

#[test]
fn should_read_overview_and_section() {
    let config_path = temp_path("openclaw-runtime-config", ".json");
    std::fs::write(
        config_path.as_path(),
        r#"{"gateway":{"port":18789,"auth":{"token":"abc"}},"channels":[{"id":"c1"}]}"#,
    )
    .expect("write config failed");

    std::env::set_var("OPENCLAW_CONFIG_PATH_OVERRIDE", config_path.as_os_str());
    let overview = openclaw_overview_read().expect("read overview failed");
    assert!(overview.found);
    assert!(overview.has_gateway);
    assert!(overview.has_gateway_token);

    let section = openclaw_section_read("channels".to_string()).expect("read section failed");
    assert!(section.found);
    assert_eq!(section.item_count, 1);

    std::env::remove_var("OPENCLAW_CONFIG_PATH_OVERRIDE");
    let _ = std::fs::remove_file(config_path);
}

#[test]
fn should_read_logs_with_keyword() {
    let log_dir = temp_path("openclaw-runtime-logs", "");
    std::fs::create_dir_all(log_dir.as_path()).expect("create log dir failed");
    let log_file = log_dir.join("gateway.log");
    std::fs::write(
        log_file.as_path(),
        "alpha line\nbeta line\nerror: network down\nok line\n",
    )
    .expect("write log failed");

    std::env::set_var("OPENCLAW_LOG_DIR_OVERRIDE", log_dir.as_os_str());
    let payload =
        openclaw_logs_read(Some(20), Some("error".to_string())).expect("read logs failed");
    assert_eq!(payload.files.len(), 1);
    assert_eq!(payload.lines.len(), 1);
    assert!(payload.lines[0].contains("error"));

    std::env::remove_var("OPENCLAW_LOG_DIR_OVERRIDE");
    let _ = std::fs::remove_file(log_file);
    let _ = std::fs::remove_dir_all(log_dir);
}

#[test]
fn should_validate_config() {
    let invalid = openclaw_config_validate("{".to_string());
    assert!(!invalid.valid);
    assert!(!invalid.errors.is_empty());

    let valid = openclaw_config_validate(r#"{"gateway":{"auth":{"token":"x"}}}"#.to_string());
    assert!(valid.valid);
}

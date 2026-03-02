use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::ffi::OsString;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawCliPayload {
    pub section: String,
    pub command: Vec<String>,
    pub ok: bool,
    pub status_code: i32,
    pub data: Value,
    pub stderr: String,
}

fn cli_binary() -> OsString {
    env::var_os("OPENCLAW_CLI_BIN_OVERRIDE").unwrap_or_else(|| OsString::from("openclaw"))
}

fn parse_cli_output(stdout: &str) -> Value {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }
    match serde_json::from_str::<Value>(trimmed) {
        Ok(v) => v,
        Err(_) => json!({ "text": trimmed }),
    }
}

fn run_openclaw(section: &str, args: &[String]) -> Result<OpenclawCliPayload, String> {
    let output = Command::new(cli_binary())
        .args(args)
        .output()
        .map_err(|err| format!("run openclaw command failed: {err}"))?;

    let stdout =
        String::from_utf8(output.stdout).map_err(|err| format!("decode stdout failed: {err}"))?;
    let stderr =
        String::from_utf8(output.stderr).map_err(|err| format!("decode stderr failed: {err}"))?;
    let status = output.status.code().unwrap_or(-1);

    Ok(OpenclawCliPayload {
        section: section.to_string(),
        command: args.to_vec(),
        ok: output.status.success(),
        status_code: status,
        data: parse_cli_output(stdout.as_str()),
        stderr: stderr.trim().to_string(),
    })
}

fn query_args(section: &str) -> Option<Vec<String>> {
    let args = match section {
        "overview" => vec!["status", "--json"],
        "channels" => vec!["channels", "list", "--json"],
        "instances" => vec!["channels", "status", "--json"],
        "sessions" => vec!["sessions", "--json", "--all-agents"],
        "usage" => vec!["gateway", "usage-cost", "--json"],
        "cronJobs" => vec!["cron", "list", "--json", "--all"],
        "agents" => vec!["agents", "list", "--json", "--bindings"],
        "skills" => vec!["skills", "list", "--json", "--verbose"],
        "nodes" => vec!["nodes", "list", "--json"],
        "version" => vec!["--version"],
        _ => return None,
    };
    Some(args.iter().map(|v| v.to_string()).collect())
}

fn normalize_target(target: Option<String>, field_name: &str) -> Result<String, String> {
    let value = target.unwrap_or_default().trim().to_string();
    if value.is_empty() {
        return Err(format!("{field_name} is required"));
    }
    if value.len() > 128 {
        return Err(format!("{field_name} is too long"));
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '.' | '@'))
    {
        return Err(format!("{field_name} contains invalid chars"));
    }
    Ok(value)
}

fn action_args(
    section: &str,
    action: &str,
    target: Option<String>,
    dry_run: bool,
) -> Result<Vec<String>, String> {
    let args = match (section, action) {
        ("selfUpdate", "update") => vec!["update".to_string()],
        ("sessions", "cleanup") => {
            if dry_run {
                vec![
                    "sessions".to_string(),
                    "cleanup".to_string(),
                    "--json".to_string(),
                    "--all-agents".to_string(),
                    "--dry-run".to_string(),
                ]
            } else {
                vec![
                    "sessions".to_string(),
                    "cleanup".to_string(),
                    "--json".to_string(),
                    "--all-agents".to_string(),
                    "--enforce".to_string(),
                ]
            }
        }
        ("cronJobs", "enable") => {
            let id = normalize_target(target, "jobId")?;
            vec!["cron".to_string(), "enable".to_string(), id]
        }
        ("cronJobs", "disable") => {
            let id = normalize_target(target, "jobId")?;
            vec!["cron".to_string(), "disable".to_string(), id]
        }
        ("cronJobs", "run") => {
            let id = normalize_target(target, "jobId")?;
            vec!["cron".to_string(), "run".to_string(), id]
        }
        ("cronJobs", "remove") => {
            let id = normalize_target(target, "jobId")?;
            vec![
                "cron".to_string(),
                "rm".to_string(),
                id,
                "--json".to_string(),
            ]
        }
        ("nodes", "approve") => {
            let request_id = normalize_target(target, "requestId")?;
            vec![
                "nodes".to_string(),
                "approve".to_string(),
                request_id,
                "--json".to_string(),
            ]
        }
        ("nodes", "reject") => {
            let request_id = normalize_target(target, "requestId")?;
            vec![
                "nodes".to_string(),
                "reject".to_string(),
                request_id,
                "--json".to_string(),
            ]
        }
        _ => return Err("unsupported action".to_string()),
    };
    Ok(args)
}

#[tauri::command]
pub fn openclaw_cli_query(section: String) -> Result<OpenclawCliPayload, String> {
    let args = query_args(section.as_str()).ok_or_else(|| "unsupported section".to_string())?;
    run_openclaw(section.as_str(), args.as_slice())
}

#[tauri::command]
pub fn openclaw_cli_version() -> Result<OpenclawCliPayload, String> {
    run_openclaw("version", &["--version".to_string()])
}

#[tauri::command]
pub fn openclaw_cli_action(
    section: String,
    action: String,
    target: Option<String>,
    dry_run: Option<bool>,
) -> Result<OpenclawCliPayload, String> {
    let args = action_args(
        section.as_str(),
        action.as_str(),
        target,
        dry_run.unwrap_or(false),
    )?;
    run_openclaw(section.as_str(), args.as_slice())
}

#[cfg(test)]
mod tests {
    use super::{openclaw_cli_action, openclaw_cli_query};
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    fn test_lock() -> std::sync::MutexGuard<'static, ()> {
        TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("lock test mutex failed")
    }

    fn now_millis() -> u128 {
        match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(v) => v.as_millis(),
            Err(_) => 0,
        }
    }

    #[cfg(unix)]
    fn create_echo_script() -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!("openclaw-cli-test-{}.sh", now_millis()));
        let body = r#"#!/bin/sh
echo '{"ok":true,"items":[{"id":"demo"}]}'"#;
        std::fs::write(path.as_path(), body).expect("write script failed");
        let mut perms = std::fs::metadata(path.as_path())
            .expect("script metadata failed")
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path.as_path(), perms).expect("set script permission failed");
        path
    }

    #[test]
    #[cfg(unix)]
    fn should_query_section_with_override_binary() {
        let _guard = test_lock();
        let script_path = create_echo_script();
        std::env::set_var("OPENCLAW_CLI_BIN_OVERRIDE", script_path.as_os_str());
        let payload = openclaw_cli_query("channels".to_string()).expect("query section failed");
        assert!(payload.ok);
        assert_eq!(payload.status_code, 0);
        assert_eq!(payload.command[0], "channels");
        std::env::remove_var("OPENCLAW_CLI_BIN_OVERRIDE");
        let _ = std::fs::remove_file(script_path);
    }

    #[test]
    fn should_reject_unsupported_section() {
        let err = openclaw_cli_query("unknown".to_string()).expect_err("must reject section");
        assert!(err.contains("unsupported section"));
    }

    #[test]
    fn should_require_target_for_cron_action() {
        let err = openclaw_cli_action(
            "cronJobs".to_string(),
            "enable".to_string(),
            Some("".to_string()),
            Some(false),
        )
        .expect_err("must reject empty target");
        assert!(err.contains("jobId is required"));
    }
}

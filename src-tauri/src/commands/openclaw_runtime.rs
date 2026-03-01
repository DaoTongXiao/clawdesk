use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Reverse;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_CONFIG_SIZE_BYTES: usize = 1024 * 1024;
const MAX_LOG_FILES_SCAN: usize = 50;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawOverviewPayload {
    pub found: bool,
    pub path: String,
    pub section_count: usize,
    pub has_gateway: bool,
    pub has_gateway_token: bool,
    pub gateway_port: Option<u16>,
    pub section_keys: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawSectionPayload {
    pub found: bool,
    pub section: String,
    pub value: Value,
    pub item_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawLogsPayload {
    pub files: Vec<String>,
    pub lines: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawValidatePayload {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

fn openclaw_config_path() -> Result<PathBuf, String> {
    if let Some(override_path) = env::var_os("OPENCLAW_CONFIG_PATH_OVERRIDE") {
        return Ok(PathBuf::from(override_path));
    }

    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| "resolve home dir failed".to_string())?;

    Ok(home.join(".openclaw").join("openclaw.json"))
}

fn openclaw_logs_dir() -> Result<PathBuf, String> {
    if let Some(override_path) = env::var_os("OPENCLAW_LOG_DIR_OVERRIDE") {
        return Ok(PathBuf::from(override_path));
    }

    let config_path = openclaw_config_path()?;
    let root = config_path
        .parent()
        .ok_or_else(|| "resolve openclaw root failed".to_string())?;
    Ok(root.join("logs"))
}

fn load_config_json() -> Result<(PathBuf, Value), String> {
    let path = openclaw_config_path()?;
    if !path.exists() {
        return Ok((path, Value::Object(Default::default())));
    }

    let raw =
        fs::read_to_string(path.as_path()).map_err(|err| format!("read config failed: {err}"))?;
    if raw.len() > MAX_CONFIG_SIZE_BYTES {
        return Err("openclaw config is too large".to_string());
    }

    let value: Value =
        serde_json::from_str(raw.as_str()).map_err(|err| format!("parse config failed: {err}"))?;
    Ok((path, value))
}

fn item_count(value: &Value) -> usize {
    match value {
        Value::Object(v) => v.len(),
        Value::Array(v) => v.len(),
        Value::Null => 0,
        _ => 1,
    }
}

fn read_recent_lines(path: &Path, max_lines: usize, keyword: &str) -> Result<Vec<String>, String> {
    let content = fs::read_to_string(path).map_err(|err| format!("read log failed: {err}"))?;
    let mut lines: Vec<String> = content.lines().map(|v| v.to_string()).collect();
    if !keyword.trim().is_empty() {
        let lower = keyword.to_lowercase();
        lines.retain(|line| line.to_lowercase().contains(lower.as_str()));
    }
    if lines.len() > max_lines {
        lines = lines.split_off(lines.len() - max_lines);
    }
    Ok(lines)
}

fn collect_log_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|err| format!("read logs dir failed: {err}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("log"))
                .unwrap_or(false)
        })
        .collect();

    files.sort_by_key(|path| {
        let ts = path.metadata().and_then(|meta| meta.modified()).ok();
        Reverse(ts)
    });
    if files.len() > MAX_LOG_FILES_SCAN {
        files.truncate(MAX_LOG_FILES_SCAN);
    }
    Ok(files)
}

#[tauri::command]
pub fn openclaw_overview_read() -> Result<OpenclawOverviewPayload, String> {
    let (path, config) = load_config_json()?;
    let sections = config.as_object().cloned().unwrap_or_default();
    let mut keys = sections.keys().cloned().collect::<Vec<_>>();
    keys.sort();

    let gateway = config.get("gateway").cloned().unwrap_or(Value::Null);
    let has_gateway = gateway.is_object();
    let has_token = gateway
        .get("auth")
        .and_then(|auth| auth.get("token"))
        .and_then(Value::as_str)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    let gateway_port = gateway
        .get("port")
        .and_then(Value::as_u64)
        .map(|v| v as u16);

    Ok(OpenclawOverviewPayload {
        found: path.exists(),
        path: path.to_string_lossy().to_string(),
        section_count: sections.len(),
        has_gateway,
        has_gateway_token: has_token,
        gateway_port,
        section_keys: keys,
    })
}

#[tauri::command]
pub fn openclaw_section_read(section: String) -> Result<OpenclawSectionPayload, String> {
    let (_, config) = load_config_json()?;
    let value = config.get(section.as_str()).cloned().unwrap_or(Value::Null);
    Ok(OpenclawSectionPayload {
        found: !value.is_null(),
        section,
        item_count: item_count(&value),
        value,
    })
}

#[tauri::command]
pub fn openclaw_logs_read(
    limit: Option<usize>,
    keyword: Option<String>,
) -> Result<OpenclawLogsPayload, String> {
    let max_lines = limit.unwrap_or(200).clamp(20, 2000);
    let key = keyword.unwrap_or_default();
    let dir = openclaw_logs_dir()?;
    let files = collect_log_files(dir.as_path())?;

    let mut file_list = Vec::new();
    let mut lines = Vec::new();
    for path in files.into_iter().take(3) {
        file_list.push(path.to_string_lossy().to_string());
        let mut file_lines = read_recent_lines(path.as_path(), max_lines, key.as_str())?;
        lines.append(&mut file_lines);
    }
    if lines.len() > max_lines {
        lines = lines.split_off(lines.len() - max_lines);
    }

    Ok(OpenclawLogsPayload {
        files: file_list,
        lines,
    })
}

#[tauri::command]
pub fn openclaw_config_validate(raw: String) -> OpenclawValidatePayload {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let parsed: Value = match serde_json::from_str(raw.as_str()) {
        Ok(v) => v,
        Err(err) => {
            errors.push(format!("json parse error: {err}"));
            return OpenclawValidatePayload {
                valid: false,
                errors,
                warnings,
            };
        }
    };

    if !parsed.is_object() {
        errors.push("root must be object".to_string());
    }
    if parsed.get("gateway").is_none() {
        warnings.push("missing gateway section".to_string());
    }
    if parsed
        .get("gateway")
        .and_then(|g| g.get("auth"))
        .and_then(|a| a.get("token"))
        .is_none()
    {
        warnings.push("missing gateway.auth.token".to_string());
    }

    OpenclawValidatePayload {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_CONFIG_SIZE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawConfigSection {
    pub key: String,
    pub value_type: String,
    pub item_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawConfigPayload {
    pub found: bool,
    pub path: String,
    pub raw: String,
    pub config: Value,
    pub sections: Vec<OpenclawConfigSection>,
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

fn validate_config_value(value: &Value) -> Result<(), String> {
    if !value.is_object() {
        return Err("openclaw config must be a json object".to_string());
    }

    if let Some(token) = value
        .get("gateway")
        .and_then(|gateway| gateway.get("auth"))
        .and_then(|auth| auth.get("token"))
    {
        if !token.is_string() {
            return Err("gateway.auth.token must be string".to_string());
        }
    }

    Ok(())
}

fn build_sections(value: &Value) -> Vec<OpenclawConfigSection> {
    let mut sections = Vec::new();
    let Some(map) = value.as_object() else {
        return sections;
    };

    for (key, section_value) in map {
        let value_type = match section_value {
            Value::Object(_) => "object",
            Value::Array(_) => "array",
            Value::String(_) => "string",
            Value::Number(_) => "number",
            Value::Bool(_) => "boolean",
            Value::Null => "null",
        };

        let item_count = match section_value {
            Value::Object(v) => v.len(),
            Value::Array(v) => v.len(),
            _ => 1,
        };

        sections.push(OpenclawConfigSection {
            key: key.to_string(),
            value_type: value_type.to_string(),
            item_count,
        });
    }

    sections.sort_by(|a, b| a.key.cmp(&b.key));
    sections
}

fn read_config_from_path(path: &Path) -> Result<OpenclawConfigPayload, String> {
    if !path.exists() {
        return Ok(OpenclawConfigPayload {
            found: false,
            path: path.to_string_lossy().to_string(),
            raw: "{}".to_string(),
            config: Value::Object(Default::default()),
            sections: Vec::new(),
        });
    }

    let raw = fs::read_to_string(path).map_err(|err| format!("read config failed: {err}"))?;
    if raw.len() > MAX_CONFIG_SIZE_BYTES {
        return Err("openclaw config is too large".to_string());
    }

    let parsed: Value =
        serde_json::from_str(raw.as_str()).map_err(|err| format!("parse config failed: {err}"))?;
    validate_config_value(&parsed)?;

    Ok(OpenclawConfigPayload {
        found: true,
        path: path.to_string_lossy().to_string(),
        raw,
        sections: build_sections(&parsed),
        config: parsed,
    })
}

fn save_config_to_path(path: &Path, raw: &str) -> Result<OpenclawConfigPayload, String> {
    if raw.len() > MAX_CONFIG_SIZE_BYTES {
        return Err("openclaw config is too large".to_string());
    }

    let parsed: Value =
        serde_json::from_str(raw).map_err(|err| format!("parse config failed: {err}"))?;
    validate_config_value(&parsed)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("create config dir failed: {err}"))?;
    }

    let normalized_raw = serde_json::to_string_pretty(&parsed)
        .map_err(|err| format!("serialize config failed: {err}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, normalized_raw.as_bytes())
        .map_err(|err| format!("write config temp failed: {err}"))?;
    fs::rename(&tmp, path).map_err(|err| format!("replace config failed: {err}"))?;

    read_config_from_path(path)
}

#[tauri::command]
pub fn openclaw_config_read() -> Result<OpenclawConfigPayload, String> {
    read_config_from_path(openclaw_config_path()?.as_path())
}

#[tauri::command]
pub fn openclaw_config_save(raw: String) -> Result<OpenclawConfigPayload, String> {
    save_config_to_path(openclaw_config_path()?.as_path(), raw.as_str())
}

#[cfg(test)]
mod tests {
    use super::{read_config_from_path, save_config_to_path};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_SEQ: AtomicU64 = AtomicU64::new(0);

    fn now_millis() -> u128 {
        match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(v) => v.as_millis(),
            Err(_) => 0,
        }
    }

    fn temp_path() -> PathBuf {
        let seq = TEST_SEQ.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "openclaw-config-{}-{}-{}.json",
            std::process::id(),
            now_millis(),
            seq
        ))
    }

    #[test]
    fn should_save_and_load_config() {
        let path = temp_path();
        let saved = save_config_to_path(
            path.as_path(),
            r#"{"gateway":{"port":18789,"auth":{"token":"abc"}},"channels":[]}"#,
        )
        .expect("save config failed");

        assert!(saved.found);
        assert!(!saved.sections.is_empty());

        let loaded = read_config_from_path(path.as_path()).expect("load config failed");
        assert!(loaded.found);
        assert!(loaded.raw.contains("\"gateway\""));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn should_reject_invalid_json() {
        let path = temp_path();
        let result = save_config_to_path(path.as_path(), r#"{"gateway":"#);
        assert!(result.is_err());
    }

    #[test]
    fn should_reject_non_object_json() {
        let path = temp_path();
        let result = save_config_to_path(path.as_path(), r#"["a","b"]"#);
        assert!(result.is_err());
    }
}

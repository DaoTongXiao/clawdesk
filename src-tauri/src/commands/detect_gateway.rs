use serde::Serialize;
use serde_json::Value;
use std::{env, fs, path::PathBuf};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DetectGatewayResponse {
    pub found: bool,
    pub url: Option<String>,
    pub token: Option<String>,
}

fn not_found() -> DetectGatewayResponse {
    DetectGatewayResponse {
        found: false,
        url: None,
        token: None,
    }
}

fn parse_gateway_from_value(value: &Value) -> DetectGatewayResponse {
    let gateway = match value.get("gateway") {
        Some(v) => v,
        None => return not_found(),
    };

    let token = match gateway
        .get("auth")
        .and_then(|auth| auth.get("token"))
        .and_then(Value::as_str)
        .map(str::trim)
    {
        Some(t) if !t.is_empty() => t.to_owned(),
        _ => return not_found(),
    };

    let port = gateway.get("port").and_then(Value::as_u64).unwrap_or(18789);
    let host = gateway
        .get("host")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("localhost");

    DetectGatewayResponse {
        found: true,
        url: Some(format!("ws://{host}:{port}")),
        token: Some(token),
    }
}

fn parse_gateway_from_raw(raw: &str) -> DetectGatewayResponse {
    let value: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return not_found(),
    };

    parse_gateway_from_value(&value)
}

fn openclaw_config_path() -> Option<PathBuf> {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))?;

    Some(home.join(".openclaw").join("openclaw.json"))
}

#[tauri::command]
pub fn detect_gateway() -> DetectGatewayResponse {
    let path = match openclaw_config_path() {
        Some(p) => p,
        None => return not_found(),
    };

    let raw = match fs::read_to_string(path) {
        Ok(r) => r,
        Err(_) => return not_found(),
    };

    parse_gateway_from_raw(&raw)
}

#[cfg(test)]
mod tests {
    use super::parse_gateway_from_raw;

    #[test]
    fn should_detect_gateway_with_valid_config() {
        let raw = r#"{"gateway":{"port":20001,"auth":{"token":"abc"}}}"#;
        let result = parse_gateway_from_raw(raw);

        assert!(result.found);
        assert_eq!(result.url, Some("ws://localhost:20001".to_string()));
        assert_eq!(result.token, Some("abc".to_string()));
    }

    #[test]
    fn should_return_not_found_when_token_missing() {
        let raw = r#"{"gateway":{"port":20001,"auth":{}}}"#;
        let result = parse_gateway_from_raw(raw);

        assert!(!result.found);
        assert_eq!(result.url, None);
        assert_eq!(result.token, None);
    }

    #[test]
    fn should_return_not_found_when_json_invalid() {
        let raw = r#"{"gateway""#;
        let result = parse_gateway_from_raw(raw);

        assert!(!result.found);
        assert_eq!(result.url, None);
        assert_eq!(result.token, None);
    }

    #[test]
    fn should_use_gateway_host_when_configured() {
        let raw = r#"{"gateway":{"host":"192.168.0.191","port":20001,"auth":{"token":"abc"}}}"#;
        let result = parse_gateway_from_raw(raw);

        assert!(result.found);
        assert_eq!(result.url, Some("ws://192.168.0.191:20001".to_string()));
        assert_eq!(result.token, Some("abc".to_string()));
    }
}

pub mod commands;
pub mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::detect_gateway::detect_gateway,
            commands::chat_store::desktop_store_get_settings,
            commands::chat_store::desktop_store_save_settings,
            commands::chat_store::desktop_store_update_theme,
            commands::chat_store::desktop_store_get_conversation,
            commands::chat_store::desktop_store_get_all_conversations,
            commands::chat_store::desktop_store_create_conversation,
            commands::chat_store::desktop_store_update_conversation_title,
            commands::chat_store::desktop_store_delete_conversation,
            commands::chat_store::desktop_store_delete_all_conversations,
            commands::chat_store::desktop_store_get_messages,
            commands::chat_store::desktop_store_add_message,
            commands::chat_store::desktop_store_search_conversations,
            commands::chat_store::desktop_store_search_messages,
            commands::openclaw_cli::openclaw_cli_query,
            commands::openclaw_cli::openclaw_cli_action,
            commands::openclaw_cli::openclaw_cli_version,
            commands::openclaw_config::openclaw_config_read,
            commands::openclaw_config::openclaw_config_save,
            commands::openclaw_runtime::openclaw_overview_read,
            commands::openclaw_runtime::openclaw_section_read,
            commands::openclaw_runtime::openclaw_logs_read,
            commands::openclaw_runtime::openclaw_config_validate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

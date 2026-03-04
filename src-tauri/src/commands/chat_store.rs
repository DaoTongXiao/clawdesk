use crate::db::model::{ConversationRecord, MessageRecord, SettingsRecord};
use crate::db::store;
use tauri::AppHandle;

#[tauri::command]
pub fn desktop_store_get_settings(app: AppHandle) -> Result<Option<SettingsRecord>, String> {
    store::get_settings(&app)
}

#[tauri::command]
pub fn desktop_store_save_settings(
    app: AppHandle,
    gateway_url: String,
    token: String,
    theme: String,
) -> Result<SettingsRecord, String> {
    store::save_settings(&app, gateway_url.as_str(), token.as_str(), theme.as_str())
}

#[tauri::command]
pub fn desktop_store_update_theme(app: AppHandle, theme: String) -> Result<(), String> {
    store::update_theme(&app, theme.as_str())
}

#[tauri::command]
pub fn desktop_store_get_conversation(
    app: AppHandle,
    id: String,
) -> Result<Option<ConversationRecord>, String> {
    store::get_conversation(&app, id.as_str())
}

#[tauri::command]
pub fn desktop_store_get_all_conversations(
    app: AppHandle,
) -> Result<Vec<ConversationRecord>, String> {
    store::get_all_conversations(&app)
}

#[tauri::command]
pub fn desktop_store_create_conversation(
    app: AppHandle,
    id: String,
    session_key: String,
    title: String,
) -> Result<ConversationRecord, String> {
    store::create_conversation(&app, id.as_str(), session_key.as_str(), title.as_str())
}

#[tauri::command]
pub fn desktop_store_update_conversation_title(
    app: AppHandle,
    id: String,
    title: String,
) -> Result<(), String> {
    store::update_conversation_title(&app, id.as_str(), title.as_str())
}

#[tauri::command]
pub fn desktop_store_delete_conversation(app: AppHandle, id: String) -> Result<(), String> {
    store::delete_conversation(&app, id.as_str())
}

#[tauri::command]
pub fn desktop_store_delete_all_conversations(app: AppHandle) -> Result<(), String> {
    store::delete_all_conversations(&app)
}

#[tauri::command]
pub fn desktop_store_get_messages(
    app: AppHandle,
    conversation_id: String,
) -> Result<Vec<MessageRecord>, String> {
    store::get_messages(&app, conversation_id.as_str())
}

#[tauri::command]
pub fn desktop_store_add_message(app: AppHandle, message: MessageRecord) -> Result<(), String> {
    store::add_message(&app, &message)
}

#[tauri::command]
pub fn desktop_store_search_conversations(
    app: AppHandle,
    query: String,
) -> Result<Vec<ConversationRecord>, String> {
    store::search_conversations(&app, query.as_str())
}

#[tauri::command]
pub fn desktop_store_search_messages(
    app: AppHandle,
    query: String,
    conversation_id: Option<String>,
) -> Result<Vec<MessageRecord>, String> {
    store::search_messages(&app, query.as_str(), conversation_id.as_deref())
}

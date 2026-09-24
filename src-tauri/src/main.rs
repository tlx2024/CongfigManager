#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{Datelike, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{path::BaseDirectory, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MatchedEntrySummary {
    pub prefix: String,
    pub schema_path: String,
    pub config_path: String,
    pub format: String, // "json" | "xml"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntryDetail {
    pub prefix: String,
    pub schema_path: String,
    pub config_path: String,
    pub format: String,
    pub schema_text: String,
    pub config_text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveResult {
    pub ok: bool,
    pub backup_path: Option<String>,
    pub written_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryLoadResult {
    pub ok: bool,
    pub history_path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SchemaSetupSuggestion {
    pub should_prompt: bool,
    pub reason: String,
    pub json_prefixes: Vec<String>,
    pub config_dir: String,
    pub schemas_dir: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenerateDefaultSchemasResult {
    pub ok: bool,
    pub schemas_dir: String,
    pub created: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<GenerateDefaultSchemaFailure>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenerateDefaultSchemaFailure {
    pub prefix: String,
    pub error: String,
}

fn is_within_root(root: &Path, target: &Path) -> bool {
    // Best-effort canonical comparison; if canonicalize fails, fallback to raw.
    // NOTE: On Windows path comparisons must be case-insensitive and verbatim prefixes (\\?\) may appear.
    let root_canon = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let target_canon = if target.exists() {
        fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf())
    } else {
        // For non-existent files (e.g. history backup path before copying), canonicalize the parent directory
        // so comparisons don't fail due to relative/absolute mismatch.
        match (target.parent(), target.file_name()) {
            (Some(parent), Some(file_name)) if parent.exists() => {
                let parent_canon = fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
                parent_canon.join(file_name)
            }
            _ => target.to_path_buf(),
        }
    };

    if cfg!(windows) {
        fn norm_components(p: &Path) -> Vec<String> {
            // Strip verbatim prefix if present to reduce mismatches between canonicalized paths.
            let s = p.to_string_lossy();
            let stripped = s.strip_prefix(r"\\?\\").unwrap_or(&s);
            Path::new(stripped)
                .components()
                .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
                .collect()
        }

        let r = norm_components(&root_canon);
        let t = norm_components(&target_canon);
        t.len() >= r.len() && t.iter().zip(r.iter()).all(|(a, b)| a == b)
    } else {
        target_canon.starts_with(&root_canon)
    }
}

fn ensure_within_root(root: &Path, target: &Path) -> Result<(), String> {
    if is_within_root(root, target) {
        Ok(())
    } else {
        Err(format!(
            "Path is outside workspace root. root={}, target={}",
            root.display(),
            target.display()
        ))
    }
}

fn schema_dirs(root: &Path) -> Vec<PathBuf> {
    // Workspace root is the config directory; schemas live in <root>/schemas.
    vec![schemas_dir(root)]
}

fn history_dir(root: &Path) -> PathBuf {
    root.join("history")
}

fn schemas_dir(root: &Path) -> PathBuf {
    root.join("schemas")
}

fn dir_has_json_or_xml(dir: &Path) -> Result<bool, String> {
    if !dir.exists() {
        return Ok(false);
    }
    if !dir.is_dir() {
        return Ok(false);
    }
    for path in read_dir_files_flat(dir)? {
        let Some(name) = path.file_name().and_then(OsStr::to_str) else {
            continue;
        };
        if extract_config_prefix_and_format(name).is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}

fn resolve_config_root(workspace_root: &Path) -> Result<PathBuf, String> {
    if !workspace_root.exists() {
        return Err(format!(
            "Workspace root does not exist: {}",
            workspace_root.display()
        ));
    }
    if !workspace_root.is_dir() {
        return Err(format!(
            "Workspace root is not a directory: {}",
            workspace_root.display()
        ));
    }

    // Preferred: workspace_root itself contains configs.
    if dir_has_json_or_xml(workspace_root)? {
        return Ok(workspace_root.to_path_buf());
    }

    // Fallback: workspace_root/config contains configs.
    let sub = workspace_root.join("config");
    if dir_has_json_or_xml(&sub)? {
        return Ok(sub);
    }

    // Default to workspace_root so caller can still create schemas/history there if desired.
    Ok(workspace_root.to_path_buf())
}

fn extract_schema_prefix(file_name: &str) -> Option<String> {
    if !file_name.ends_with(".schema.json") {
        return None;
    }
    Some(
        file_name
            .trim_end_matches(".schema.json")
            .to_string(),
    )
}

fn extract_config_prefix_and_format(file_name: &str) -> Option<(String, String)> {
    if file_name.ends_with(".json") {
        return Some((file_name.trim_end_matches(".json").to_string(), "json".to_string()));
    }
    if file_name.ends_with(".xml") {
        return Some((file_name.trim_end_matches(".xml").to_string(), "xml".to_string()));
    }
    None
}

fn list_json_config_prefixes(workspace_root: &Path) -> Result<Vec<String>, String> {
    let config_root = resolve_config_root(workspace_root)?;
    let config_files = read_dir_files_flat(&config_root)?;
    let mut out: Vec<String> = vec![];
    for path in config_files {
        let file_name = path
            .file_name()
            .and_then(OsStr::to_str)
            .ok_or_else(|| format!("Invalid config filename: {}", path.display()))?;
        if let Some((prefix, format)) = extract_config_prefix_and_format(file_name) {
            if format == "json" {
                out.push(prefix);
            }
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

fn is_array_of_objects(v: &serde_json::Value) -> bool {
    match v {
        serde_json::Value::Array(arr) => {
            if arr.is_empty() {
                return false;
            }
            arr.iter().all(|x| matches!(x, serde_json::Value::Object(_)))
        }
        _ => false,
    }
}

const DEFAULT_MAX_SCHEMA_DEPTH: usize = 6;
const DEFAULT_ARRAY_SAMPLE_LIMIT: usize = 20;

fn infer_primitive_field_from_value(key: &str, v: &serde_json::Value, order: i64) -> serde_json::Value {
    let mut field = json!({
        "key": key,
        "label": key,
        "order": order,
        "validation": { "required": false }
    });

    match v {
        serde_json::Value::Null => {
            field["type"] = json!("string");
            field["defaultValue"] = json!("");
        }
        serde_json::Value::Bool(b) => {
            field["type"] = json!("boolean");
            field["defaultValue"] = json!(*b);
        }
        serde_json::Value::Number(n) => {
            field["type"] = json!("number");
            field["defaultValue"] = json!(n);
        }
        serde_json::Value::String(s) => {
            field["type"] = json!("string");
            field["defaultValue"] = json!(s);
        }
        serde_json::Value::Array(arr) => {
            // 非对象数组作为字段处理；对象数组会提升为 group.type=array
            field["type"] = json!("array");
            field["defaultValue"] = json!(arr);
        }
        serde_json::Value::Object(_) => {
            // 兼容：对象字段回退为 JSON 编辑（更推荐用 group.type=object 深度展开）
            field["type"] = json!("object");
            field["defaultValue"] = json!({});
            field["fields"] = json!([]);
        }
    }

    field
}

fn merge_object_keys_from_array(arr: &[serde_json::Value], limit: usize) -> Vec<String> {
    let mut keys: BTreeMap<String, ()> = BTreeMap::new();
    for v in arr.iter().take(limit) {
        let Some(obj) = v.as_object() else { continue; };
        for k in obj.keys() {
            keys.insert(k.clone(), ());
        }
    }
    keys.keys().cloned().collect()
}

fn pick_representative_value<'a>(arr: &'a [serde_json::Value], key: &str) -> Option<&'a serde_json::Value> {
    for v in arr {
        let Some(obj) = v.as_object() else { continue; };
        if let Some(val) = obj.get(key) {
            if !val.is_null() {
                return Some(val);
            }
        }
    }
    None
}

fn infer_group_content_from_object(
    obj: &serde_json::Map<String, serde_json::Value>,
    depth: usize,
    max_depth: usize,
) -> (Vec<serde_json::Value>, Vec<serde_json::Value>) {
    let mut fields: Vec<serde_json::Value> = vec![];
    let mut groups: Vec<serde_json::Value> = vec![];

    let mut order: i64 = 1;
    for (k, v) in obj.iter() {
        if depth >= max_depth {
            fields.push(infer_primitive_field_from_value(k, v, order));
            order += 1;
            continue;
        }

        if is_array_of_objects(v) {
            let arr = v.as_array().map(|a| a.as_slice()).unwrap_or(&[]);
            let (tpl_fields, tpl_groups) = infer_item_template_from_array(arr, depth + 1, max_depth);
            groups.push(json!({
                "label": k,
                "name": k,
                "order": order,
                "type": "array",
                "ui": {
                    "addButtonText": "添加项",
                    "collapsible": true,
                    "itemLabel": "项",
                    "itemTemplate": {
                        "fields": tpl_fields,
                        "groups": tpl_groups
                    }
                }
            }));
            order += 1;
            continue;
        }

        if let serde_json::Value::Object(child) = v {
            let (child_fields, child_groups) = infer_group_content_from_object(child, depth + 1, max_depth);
            let default_collapsed = depth >= 2;
            groups.push(json!({
                "label": k,
                "name": k,
                "order": order,
                "type": "object",
                "collapsible": true,
                "defaultCollapsed": default_collapsed,
                "fields": child_fields,
                "groups": child_groups
            }));
            order += 1;
            continue;
        }

        fields.push(infer_primitive_field_from_value(k, v, order));
        order += 1;
    }

    (fields, groups)
}

fn infer_item_template_from_array(
    arr: &[serde_json::Value],
    depth: usize,
    max_depth: usize,
) -> (Vec<serde_json::Value>, Vec<serde_json::Value>) {
    if depth >= max_depth {
        return (vec![], vec![]);
    }

    let keys = merge_object_keys_from_array(arr, DEFAULT_ARRAY_SAMPLE_LIMIT);
    let mut fields: Vec<serde_json::Value> = vec![];
    let mut groups: Vec<serde_json::Value> = vec![];

    let mut order: i64 = 1;
    for k in keys {
        let v = pick_representative_value(arr, &k).unwrap_or(&serde_json::Value::Null);

        if is_array_of_objects(v) {
            let nested = v.as_array().map(|a| a.as_slice()).unwrap_or(&[]);
            let (tpl_fields, tpl_groups) = infer_item_template_from_array(nested, depth + 1, max_depth);
            groups.push(json!({
                "label": k,
                "name": k,
                "order": order,
                "type": "array",
                "ui": {
                    "addButtonText": "添加项",
                    "collapsible": true,
                    "itemLabel": "项",
                    "itemTemplate": {
                        "fields": tpl_fields,
                        "groups": tpl_groups
                    }
                }
            }));
            order += 1;
            continue;
        }

        if let serde_json::Value::Object(child) = v {
            let (child_fields, child_groups) = infer_group_content_from_object(child, depth + 1, max_depth);
            groups.push(json!({
                "label": k,
                "name": k,
                "order": order,
                "type": "object",
                "collapsible": true,
                "defaultCollapsed": true,
                "fields": child_fields,
                "groups": child_groups
            }));
            order += 1;
            continue;
        }

        fields.push(infer_primitive_field_from_value(&k, v, order));
        order += 1;
    }

    (fields, groups)
}

fn infer_field_from_value(key: &str, v: &serde_json::Value, order: i64, depth: usize) -> serde_json::Value {
    let mut field = json!({
        "key": key,
        "label": key,
        "order": order,
        "validation": { "required": false }
    });

    match v {
        serde_json::Value::Null => {
            field["type"] = json!("string");
            field["defaultValue"] = json!("");
        }
        serde_json::Value::Bool(b) => {
            field["type"] = json!("boolean");
            field["defaultValue"] = json!(*b);
        }
        serde_json::Value::Number(n) => {
            field["type"] = json!("number");
            field["defaultValue"] = json!(n);
        }
        serde_json::Value::String(s) => {
            field["type"] = json!("string");
            field["defaultValue"] = json!(s);
        }
        serde_json::Value::Array(arr) => {
            field["type"] = json!("array");
            field["defaultValue"] = json!(arr);
        }
        serde_json::Value::Object(obj) => {
            field["type"] = json!("object");
            field["defaultValue"] = json!({});
            if depth < 2 {
                let mut sub_fields: Vec<serde_json::Value> = vec![];
                let mut idx: i64 = 1;
                for (k, vv) in obj.iter() {
                    sub_fields.push(infer_field_from_value(k, vv, idx, depth + 1));
                    idx += 1;
                }
                field["fields"] = json!(sub_fields);
            } else {
                field["fields"] = json!([]);
            }
        }
    }

    field
}

fn build_default_schema(
    prefix: &str,
    json_root: &serde_json::Value,
    schema_version: u64,
) -> Result<serde_json::Value, String> {
    let obj = match json_root {
        serde_json::Value::Object(m) => m,
        _ => {
            return Err("Only JSON object root is supported for default schema generation".to_string());
        }
    };

    // 生成策略：
    // - 顶层 primitive/简单数组 -> 归入 General
    // - 顶层 object -> 生成 group.type=object（支持深度嵌入）
    // - 顶层 array-of-objects -> 生成 group.type=array（带 itemTemplate 深度嵌入）
    let mut general_fields: Vec<serde_json::Value> = vec![];
    let mut groups: Vec<serde_json::Value> = vec![];

    let mut order: i64 = 1;
    for (k, v) in obj.iter() {
        if is_array_of_objects(v) {
            let arr = v.as_array().map(|a| a.as_slice()).unwrap_or(&[]);
            let (tpl_fields, tpl_groups) = infer_item_template_from_array(arr, 1, DEFAULT_MAX_SCHEMA_DEPTH);
            groups.push(json!({
                "label": k,
                "name": k,
                "order": order,
                "type": "array",
                "ui": {
                    "addButtonText": "添加项",
                    "collapsible": true,
                    "itemLabel": "项",
                    "itemTemplate": {
                        "fields": tpl_fields,
                        "groups": tpl_groups
                    }
                }
            }));
            order += 1;
            continue;
        }

        if let serde_json::Value::Object(child) = v {
            let (child_fields, child_groups) = infer_group_content_from_object(child, 1, DEFAULT_MAX_SCHEMA_DEPTH);
            groups.push(json!({
                "label": k,
                "name": k,
                "order": order,
                "type": "object",
                "collapsible": true,
                "defaultCollapsed": false,
                "fields": child_fields,
                "groups": child_groups
            }));
            order += 1;
            continue;
        }

        general_fields.push(infer_primitive_field_from_value(k, v, order));
        order += 1;
    }

    if !general_fields.is_empty() {
        groups.insert(
            0,
            json!({
                "collapsible": true,
                "defaultCollapsed": false,
                "fields": general_fields,
                "label": "基础配置",
                "name": "General",
                "order": 0
            }),
        );
    }

    let now = chrono::Local::now().timestamp();
    Ok(json!({
        "version": "1.0.0",
        "schemaVersion": schema_version,
        "name": format!("{}_json", prefix),
        "description": "自动生成：未检测到 schemas 目录",
        "createdAt": now,
        "updatedAt": now,
        "createdBy": "config-manager",
        "updatedBy": "config-manager",
        "groups": groups
    }))
}

fn read_dir_files_flat(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let path = entry.path();
        if path.is_file() {
            out.push(path);
        }
    }
    Ok(out)
}

fn list_entries_impl(workspace_root: &Path) -> Result<Vec<MatchedEntrySummary>, String> {
    let config_root = resolve_config_root(workspace_root)?;

    // Ensure auxiliary directories exist for portability.
    let schemas = schemas_dir(&config_root);
    let history = history_dir(&config_root);
    if schemas.exists() && !schemas.is_dir() {
        return Err(format!(
            "Schemas path is not a directory: {}",
            schemas.display()
        ));
    }
    if history.exists() && !history.is_dir() {
        return Err(format!(
            "History path is not a directory: {}",
            history.display()
        ));
    }
    if !schemas.exists() {
        fs::create_dir_all(&schemas)
            .map_err(|e| format!("Failed to create schemas dir {}: {}", schemas.display(), e))?;
    }
    if !history.exists() {
        fs::create_dir_all(&history)
            .map_err(|e| format!("Failed to create history dir {}: {}", history.display(), e))?;
    }
    ensure_within_root(&config_root, &schemas)?;
    ensure_within_root(&config_root, &history)?;

    // Scan schemas from <root>/schemas.
    let mut schema_files: Vec<PathBuf> = vec![];
    for dir in schema_dirs(&config_root) {
        schema_files.extend(read_dir_files_flat(&dir)?);
    }

    // Scan config files directly under workspace root.
    let config_files = read_dir_files_flat(&config_root)?;

    let mut schemas: BTreeMap<String, PathBuf> = BTreeMap::new();
    for path in schema_files {
        let file_name = path
            .file_name()
            .and_then(OsStr::to_str)
            .ok_or_else(|| format!("Invalid schema filename: {}", path.display()))?;
        if let Some(prefix) = extract_schema_prefix(file_name) {
            // If duplicated prefixes exist across directories, keep the first one
            // (config/schemas has priority because it's scanned first).
            schemas.entry(prefix).or_insert(path);
        }
    }

    let mut configs: BTreeMap<String, (PathBuf, String)> = BTreeMap::new();
    for path in config_files {
        let file_name = path
            .file_name()
            .and_then(OsStr::to_str)
            .ok_or_else(|| format!("Invalid config filename: {}", path.display()))?;
        if let Some((prefix, format)) = extract_config_prefix_and_format(file_name) {
            configs.insert(prefix, (path, format));
        }
    }

    // NOTE: 过去这里要求“config 与 schema 同时存在”才会出现在列表中。
    // 但在支持 XML 后，很多场景（尤其是 XML-only 配置目录）可能根本没有 schema。
    // 为了让用户仍能打开/编辑配置（前端会做 schema 推导兜底），这里改为：
    // 只要存在 config，就列出；schema_path 用已存在的 schema 或默认候选路径。
    let schemas_dir = schemas_dir(&config_root);

    let mut out = vec![];
    for (prefix, (config_path, format)) in configs {
        let schema_path = match schemas.get(&prefix) {
            Some(p) => p.clone(),
            None => schemas_dir.join(format!("{}.schema.json", prefix)),
        };

        ensure_within_root(&config_root, &config_path)?;
        ensure_within_root(&config_root, &schema_path)?;

        out.push(MatchedEntrySummary {
            prefix,
            schema_path: schema_path.to_string_lossy().to_string(),
            config_path: config_path.to_string_lossy().to_string(),
            format,
        });
    }

    // Keep stable order.
    out.sort_by(|a, b| a.prefix.cmp(&b.prefix));

    Ok(out)
}

fn timestamp_suffix() -> String {
    let now = chrono::Local::now();
    format!(
        "{:04}{:02}{:02}_{:02}{:02}{:02}_{:03}",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        now.timestamp_subsec_millis()
    )
}

fn atomic_replace_windows_friendly(tmp_path: &Path, target_path: &Path) -> Result<(), String> {
    // Try direct rename first.
    match fs::rename(tmp_path, target_path) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Fallback for Windows when target exists and rename cannot overwrite.
            if target_path.exists() {
                let bak_path = target_path.with_extension(format!(
                    "{}.bak",
                    target_path
                        .extension()
                        .and_then(OsStr::to_str)
                        .unwrap_or("")
                ));

                fs::rename(target_path, &bak_path)
                    .map_err(|e| format!("Failed to rename existing file to bak: {}", e))?;

                fs::rename(tmp_path, target_path)
                    .map_err(|e| format!("Failed to rename tmp into place: {}", e))?;

                let _ = fs::remove_file(&bak_path);
                Ok(())
            } else {
                fs::rename(tmp_path, target_path)
                    .map_err(|e| format!("Failed to rename tmp into place: {}", e))
            }
        }
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("Source directory does not exist: {}", src.display()));
    }
    if !src.is_dir() {
        return Err(format!("Source path is not a directory: {}", src.display()));
    }

    fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir {}: {}", dst.display(), e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read dir {}: {}", src.display(), e))? {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
        let src_path = entry.path();
        let name = entry
            .file_name()
            .to_string_lossy()
            .to_string();
        let dst_path = dst.join(name);

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if src_path.is_file() {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create dir {}: {}", parent.display(), e))?;
            }
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {} -> {}: {}", src_path.display(), dst_path.display(), e))?;
        }
    }

    Ok(())
}

fn try_get_user_config_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    // Keep the existing Windows path so current users retain their configuration.
    #[cfg(target_os = "windows")]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        return Some(PathBuf::from(appdata).join("ConfigManager").join("config"));
    }

    app.path().app_config_dir().ok().map(|dir| dir.join("config"))
}

fn try_get_bundled_sample_config_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path = app.path().resolve("config", BaseDirectory::Resource).ok()?;
    path.is_dir().then_some(path)
}

fn write_atomic(target_path: &Path, content: &str) -> Result<(), String> {
    let tmp_path = PathBuf::from(format!("{}.tmp", target_path.to_string_lossy()));

    {
        let mut f = fs::File::create(&tmp_path)
            .map_err(|e| format!("Failed to create tmp file {}: {}", tmp_path.display(), e))?;
        f.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write tmp file {}: {}", tmp_path.display(), e))?;
        f.sync_all()
            .map_err(|e| format!("Failed to sync tmp file {}: {}", tmp_path.display(), e))?;
    }

    atomic_replace_windows_friendly(&tmp_path, target_path)
}

fn backup_existing(workspace_root: &Path, prefix: &str, config_path: &Path) -> Result<Option<PathBuf>, String> {
    if !config_path.exists() {
        return Ok(None);
    }

    let ext = config_path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("");

    let history = history_dir(workspace_root);
    fs::create_dir_all(&history)
        .map_err(|e| format!("Failed to create history dir {}: {}", history.display(), e))?;

    // 同一毫秒内两次保存会撞名，撞了就在时间戳后加序号（扩展名保持不变，历史扫描才认得）
    let stamp = timestamp_suffix();
    let name_for = |dup: usize| {
        let stem = if dup == 0 {
            format!("{}_{}", prefix, stamp)
        } else {
            format!("{}_{}_{}", prefix, stamp, dup)
        };
        if ext.is_empty() {
            stem
        } else {
            format!("{}.{}", stem, ext)
        }
    };

    let mut dup = 0;
    let mut backup_path = history.join(name_for(dup));
    while backup_path.exists() {
        dup += 1;
        backup_path = history.join(name_for(dup));
    }
    ensure_within_root(workspace_root, &backup_path)?;

    fs::copy(config_path, &backup_path)
        .map_err(|e| format!("Failed to backup {} -> {}: {}", config_path.display(), backup_path.display(), e))?;

    Ok(Some(backup_path))
}

fn latest_history_for_prefix(
    workspace_root: &Path,
    prefix: &str,
    ext: &str,
) -> Result<PathBuf, String> {
    let history = history_dir(workspace_root);
    if history.exists() && !history.is_dir() {
        return Err(format!(
            "History path is not a directory: {}",
            history.display()
        ));
    }

    if !history.exists() {
        fs::create_dir_all(&history)
            .map_err(|e| format!("Failed to create history dir {}: {}", history.display(), e))?;
    }
    ensure_within_root(workspace_root, &history)?;

    let prefix_marker = format!("{}_", prefix);
    let ext_suffix = if ext.is_empty() {
        String::new()
    } else {
        format!(".{}", ext)
    };

    let mut candidates: Vec<(String, PathBuf)> = vec![];
    for path in read_dir_files_flat(&history)? {
        let file_name = match path.file_name().and_then(OsStr::to_str) {
            Some(s) => s,
            None => continue,
        };

        if !file_name.starts_with(&prefix_marker) {
            continue;
        }

        if !ext_suffix.is_empty() && !file_name.ends_with(&ext_suffix) {
            continue;
        }

        candidates.push((file_name.to_string(), path));
    }

    candidates.sort_by(|a, b| a.0.cmp(&b.0));
    let (_, latest_path) = candidates
        .into_iter()
        .last()
        .ok_or_else(|| format!("No history backup found for prefix: {}", prefix))?;

    ensure_within_root(workspace_root, &latest_path)?;
    Ok(latest_path)
}

#[tauri::command]
fn list_entries(workspace_root: String) -> Result<Vec<MatchedEntrySummary>, String> {
    let root = PathBuf::from(workspace_root);
    list_entries_impl(&root)
}

#[tauri::command]
fn read_entry(workspace_root: String, prefix: String) -> Result<EntryDetail, String> {
    let root = PathBuf::from(workspace_root);
    let entries = list_entries_impl(&root)?;
    let entry = entries
        .into_iter()
        .find(|e| e.prefix == prefix)
        .ok_or_else(|| "Prefix not found".to_string())?;

    let schema_path = PathBuf::from(&entry.schema_path);
    let config_path = PathBuf::from(&entry.config_path);

    ensure_within_root(&root, &schema_path)?;
    ensure_within_root(&root, &config_path)?;

    // schema 允许不存在：不存在时 schema_text 置空，前端会使用推导 schema 兜底
    let schema_text = if schema_path.exists() {
        fs::read_to_string(&schema_path)
            .map_err(|e| format!("Failed to read schema {}: {}", schema_path.display(), e))?
    } else {
        String::new()
    };
    let config_text = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config {}: {}", config_path.display(), e))?;

    Ok(EntryDetail {
        prefix: entry.prefix,
        schema_path: entry.schema_path,
        config_path: entry.config_path,
        format: entry.format,
        schema_text,
        config_text,
    })
}

#[tauri::command]
fn save_entry_text(
    workspace_root: String,
    prefix: String,
    content: String,
    note: Option<String>,
    updated_by: Option<String>,
) -> Result<SaveResult, String> {
    save_entry_impl(
        &PathBuf::from(workspace_root),
        &prefix,
        &content,
        note,
        updated_by,
    )
}

#[tauri::command]
fn read_latest_history(workspace_root: String, prefix: String) -> Result<HistoryLoadResult, String> {
    let root = PathBuf::from(workspace_root);
    let config_root = resolve_config_root(&root)?;
    let entries = list_entries_impl(&root)?;
    let entry = entries
        .into_iter()
        .find(|e| e.prefix == prefix)
        .ok_or_else(|| "Prefix not found".to_string())?;

    let config_path = PathBuf::from(&entry.config_path);
    ensure_within_root(&config_root, &config_path)?;

    let ext = config_path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("");

    let history_path = latest_history_for_prefix(&config_root, &entry.prefix, ext)?;
    let content = fs::read_to_string(&history_path)
        .map_err(|e| format!("Failed to read history {}: {}", history_path.display(), e))?;

    Ok(HistoryLoadResult {
        ok: true,
        history_path: history_path.to_string_lossy().to_string(),
        content,
    })
}

#[tauri::command]
fn schema_setup_suggestion(workspace_root: String) -> Result<SchemaSetupSuggestion, String> {
    let root = PathBuf::from(workspace_root);
    let config_root = resolve_config_root(&root)?;

    let cfg = config_root.clone();
    let schemas = schemas_dir(&config_root);
    if schemas.exists() && !schemas.is_dir() {
        return Err(format!("Schemas path is not a directory: {}", schemas.display()));
    }
    if !schemas.exists() {
        fs::create_dir_all(&schemas)
            .map_err(|e| format!("Failed to create schemas dir {}: {}", schemas.display(), e))?;
    }

    let json_prefixes = list_json_config_prefixes(&root)?;

    let schema_files = read_dir_files_flat(&schemas)?;
    let has_any_schema_file = schema_files.iter().any(|p| {
        p.file_name()
            .and_then(OsStr::to_str)
            .map(|s| s.ends_with(".schema.json"))
            .unwrap_or(false)
    });

    Ok(SchemaSetupSuggestion {
        should_prompt: !has_any_schema_file,
        reason: if has_any_schema_file {
            "Schema files exist".to_string()
        } else {
            "No schema files found".to_string()
        },
        json_prefixes,
        config_dir: cfg.to_string_lossy().to_string(),
        schemas_dir: schemas.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn generate_default_schemas(workspace_root: String) -> Result<GenerateDefaultSchemasResult, String> {
    let root = PathBuf::from(workspace_root);
    let config_root = resolve_config_root(&root)?;

    let schemas_dir = schemas_dir(&config_root);
    fs::create_dir_all(&schemas_dir)
        .map_err(|e| format!("Failed to create schemas dir {}: {}", schemas_dir.display(), e))?;
    ensure_within_root(&config_root, &schemas_dir)?;

    let config_files = read_dir_files_flat(&config_root)?;
    let mut created: Vec<String> = vec![];
    let mut skipped: Vec<String> = vec![];
    let mut failed: Vec<GenerateDefaultSchemaFailure> = vec![];

    for path in config_files {
        let file_name = match path.file_name().and_then(OsStr::to_str) {
            Some(s) => s,
            None => continue,
        };
        let Some((prefix, format)) = extract_config_prefix_and_format(file_name) else {
            continue;
        };
        if format != "json" {
            continue;
        }

        let schema_path = schemas_dir.join(format!("{}.schema.json", prefix));
        ensure_within_root(&config_root, &schema_path)?;

        // 重新生成 = schema 演进一版；新建则从 1 开始
        let mut next_schema_version = 1u64;

        if schema_path.exists() {
            let existing_text = match fs::read_to_string(&schema_path) {
                Ok(t) => t,
                Err(e) => {
                    failed.push(GenerateDefaultSchemaFailure {
                        prefix,
                        error: format!(
                            "Failed to read existing schema {}: {}",
                            schema_path.display(),
                            e
                        ),
                    });
                    continue;
                }
            };

            let existing_json: serde_json::Value = serde_json::from_str(&existing_text).unwrap_or_else(|_| json!({}));
            let created_by = existing_json
                .get("createdBy")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let desc = existing_json
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let can_overwrite = created_by == "config-manager" && desc.starts_with("自动生成");

            if !can_overwrite {
                skipped.push(prefix);
                continue;
            }

            next_schema_version = existing_json
                .get("schemaVersion")
                .and_then(|v| v.as_u64())
                .unwrap_or(1)
                + 1;
        }

        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) => {
                failed.push(GenerateDefaultSchemaFailure {
                    prefix,
                    error: format!("Failed to read config {}: {}", path.display(), e),
                });
                continue;
            }
        };

        let json_root: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                failed.push(GenerateDefaultSchemaFailure {
                    prefix,
                    error: format!("JSON parse error: {}", e),
                });
                continue;
            }
        };

        let schema_value = match build_default_schema(&prefix, &json_root, next_schema_version) {
            Ok(v) => v,
            Err(e) => {
                failed.push(GenerateDefaultSchemaFailure { prefix, error: e });
                continue;
            }
        };

        let schema_text = serde_json::to_string_pretty(&schema_value)
            .map_err(|e| format!("Failed to serialize schema JSON: {}", e))?;

        // Use atomic write for safety.
        write_atomic(&schema_path, &schema_text)?;
        created.push(prefix);
    }

    Ok(GenerateDefaultSchemasResult {
        ok: true,
        schemas_dir: schemas_dir.to_string_lossy().to_string(),
        created,
        skipped,
        failed,
    })
}

#[tauri::command]
fn default_workspace_root(app: tauri::AppHandle) -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Failed to get current exe: {}", e))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "Failed to get exe parent directory".to_string())?;

    // Use a writable per-user directory; the bundled config may live beside the
    // executable in a read-only installation directory.
    if let Some(user_config_dir) = try_get_user_config_dir(&app) {
        let needs_sample = !user_config_dir.exists()
            || fs::read_dir(&user_config_dir)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false);
        fs::create_dir_all(&user_config_dir).map_err(|e| {
            format!(
                "Failed to create user config dir {}: {}",
                user_config_dir.display(),
                e
            )
        })?;
        if needs_sample {
            if let Some(sample_dir) = try_get_bundled_sample_config_dir(&app) {
                // Best-effort copy; if it fails, we still keep the empty dir.
                let _ = copy_dir_recursive(&sample_dir, &user_config_dir);
            }
        }

        return Ok(user_config_dir.to_string_lossy().to_string());
    }

    // Fallback for environments without a user config directory.
    let portable_config_dir = dir.join("config");
    if portable_config_dir.is_dir() {
        return Ok(portable_config_dir.to_string_lossy().to_string());
    }
    Ok(dir.to_string_lossy().to_string())
}

// ---------------- 版本化（schema / config） ----------------
// 设计见 docs/plans/schema-config-versioning.md：
// - schema 版本写在 schema 文件顶层 `schemaVersion`（单调递增整数，缺省 1）
// - config 版本写在旁路文件 `.meta/<prefix>.meta.json`，绝不注入配置文件本身
// - history 目录是事实来源，`<prefix>.index.json` 只承载备注等附加信息

const META_DIR: &str = ".meta";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntryMeta {
    pub prefix: String,
    pub config_version: u64,
    pub schema_version: u64,
    pub updated_at: i64,
    pub updated_by: String,
    pub hash: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub version: u64,
    pub file: String,
    pub at: i64,
    pub schema_version: u64,
    #[serde(default)]
    pub by: String,
    #[serde(default)]
    pub hash: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct HistoryIndex {
    #[serde(default)]
    pub entries: Vec<HistoryEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryListResult {
    pub prefix: String,
    pub current: Option<EntryMeta>,
    pub entries: Vec<HistoryEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaStatus {
    pub prefix: String,
    pub meta: Option<EntryMeta>,
    pub config_version: u64,
    pub config_schema_version: u64,
    pub schema_version: u64,
    /// ok | unmanaged | schema-newer | schema-older
    pub status: String,
    pub external_modified: bool,
    pub message: String,
}

fn meta_dir(config_root: &Path) -> PathBuf {
    config_root.join(META_DIR)
}

fn meta_path(config_root: &Path, prefix: &str) -> PathBuf {
    meta_dir(config_root).join(format!("{}.meta.json", prefix))
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

fn hash_file(path: &Path) -> String {
    match fs::read(path) {
        Ok(bytes) => sha256_hex(&bytes),
        Err(_) => String::new(),
    }
}

fn file_mtime_secs(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn read_meta(config_root: &Path, prefix: &str) -> Option<EntryMeta> {
    let text = fs::read_to_string(meta_path(config_root, prefix)).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_meta(config_root: &Path, meta: &EntryMeta) -> Result<(), String> {
    let dir = meta_dir(config_root);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create meta dir {}: {}", dir.display(), e))?;
    ensure_within_root(config_root, &dir)?;

    let path = meta_path(config_root, &meta.prefix);
    ensure_within_root(config_root, &path)?;
    let text = serde_json::to_string_pretty(meta)
        .map_err(|e| format!("Failed to serialize meta JSON: {}", e))?;
    write_atomic(&path, &text)
}

/// schema 版本：顶层 `schemaVersion`，缺省 1；schema 文件不存在返回 0（= 未知）。
fn schema_version_of(config_root: &Path, prefix: &str) -> u64 {
    let path = schemas_dir(config_root).join(format!("{}.schema.json", prefix));
    if !path.exists() {
        return 0;
    }
    let Ok(text) = fs::read_to_string(&path) else {
        return 0;
    };
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(v) => v.get("schemaVersion").and_then(|x| x.as_u64()).unwrap_or(1),
        Err(_) => 1,
    }
}

fn history_index_path(config_root: &Path, prefix: &str) -> PathBuf {
    history_dir(config_root).join(format!("{}.index.json", prefix))
}

/// 目录是事实来源：index 只是加速与备注载体，缺失/损坏时按目录扫描重建。
fn load_history_index(config_root: &Path, prefix: &str, ext: &str) -> Result<HistoryIndex, String> {
    let mut index: HistoryIndex = fs::read_to_string(history_index_path(config_root, prefix))
        .ok()
        .and_then(|t| serde_json::from_str::<HistoryIndex>(&t).ok())
        .unwrap_or_default();

    let known: std::collections::HashSet<String> =
        index.entries.iter().map(|e| e.file.clone()).collect();

    let prefix_marker = format!("{}_", prefix);
    let ext_suffix = if ext.is_empty() {
        String::new()
    } else {
        format!(".{}", ext)
    };

    for path in read_dir_files_flat(&history_dir(config_root))? {
        let Some(name) = path.file_name().and_then(OsStr::to_str) else {
            continue;
        };
        if !name.starts_with(&prefix_marker) {
            continue;
        }
        if !ext_suffix.is_empty() && !name.ends_with(&ext_suffix) {
            continue;
        }
        if known.contains(name) {
            continue;
        }
        index.entries.push(HistoryEntry {
            version: 0,
            file: name.to_string(),
            at: file_mtime_secs(&path),
            schema_version: 0,
            by: String::new(),
            hash: String::new(),
            note: String::new(),
        });
    }

    // 备份文件名带可排序时间戳，按文件名排序即时间序。
    index.entries.sort_by(|a, b| a.file.cmp(&b.file));
    index.entries.dedup_by(|a, b| a.file == b.file);
    Ok(index)
}

fn append_history_entry(
    config_root: &Path,
    prefix: &str,
    ext: &str,
    entry: HistoryEntry,
) -> Result<(), String> {
    let mut index = load_history_index(config_root, prefix, ext)?;
    index.entries.retain(|e| e.file != entry.file);
    index.entries.push(entry);
    index.entries.sort_by(|a, b| a.file.cmp(&b.file));

    let path = history_index_path(config_root, prefix);
    ensure_within_root(config_root, &path)?;
    let text = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("Failed to serialize history index JSON: {}", e))?;
    write_atomic(&path, &text)
}

fn find_entry(workspace_root: &Path, prefix: &str) -> Result<MatchedEntrySummary, String> {
    list_entries_impl(workspace_root)?
        .into_iter()
        .find(|e| e.prefix == prefix)
        .ok_or_else(|| "Prefix not found".to_string())
}

fn save_entry_impl(
    workspace_root: &Path,
    prefix: &str,
    content: &str,
    note: Option<String>,
    updated_by: Option<String>,
) -> Result<SaveResult, String> {
    let config_root = resolve_config_root(workspace_root)?;
    let entry = find_entry(workspace_root, prefix)?;

    let config_path = PathBuf::from(&entry.config_path);
    ensure_within_root(&config_root, &config_path)?;

    let ext = config_path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_string();

    let prev = read_meta(&config_root, prefix);
    let backup_path = backup_existing(&config_root, prefix, &config_path)?;

    if let Some(backup) = &backup_path {
        let file = backup
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_string();
        append_history_entry(
            &config_root,
            prefix,
            &ext,
            HistoryEntry {
                // 归档的是"保存前的那一版"，所以记的是旧 meta 的版本与备注
                version: prev.as_ref().map(|m| m.config_version).unwrap_or(0),
                file,
                at: chrono::Local::now().timestamp(),
                schema_version: prev.as_ref().map(|m| m.schema_version).unwrap_or(0),
                by: prev.as_ref().map(|m| m.updated_by.clone()).unwrap_or_default(),
                hash: hash_file(backup),
                note: prev.as_ref().map(|m| m.note.clone()).unwrap_or_default(),
            },
        )?;
    }

    write_atomic(&config_path, content)?;

    let meta = EntryMeta {
        prefix: prefix.to_string(),
        config_version: prev.as_ref().map(|m| m.config_version).unwrap_or(0) + 1,
        schema_version: schema_version_of(&config_root, prefix),
        updated_at: chrono::Local::now().timestamp(),
        updated_by: updated_by.unwrap_or_else(|| "user".to_string()),
        hash: sha256_hex(content.as_bytes()),
        note: note.unwrap_or_default(),
    };
    write_meta(&config_root, &meta)?;

    Ok(SaveResult {
        ok: true,
        backup_path: backup_path.map(|p| p.to_string_lossy().to_string()),
        written_path: config_path.to_string_lossy().to_string(),
    })
}

fn meta_status_impl(workspace_root: &Path, prefix: &str) -> Result<MetaStatus, String> {
    let config_root = resolve_config_root(workspace_root)?;
    let entry = find_entry(workspace_root, prefix)?;
    let config_path = PathBuf::from(&entry.config_path);
    ensure_within_root(&config_root, &config_path)?;

    let meta = read_meta(&config_root, prefix);
    let schema_version = schema_version_of(&config_root, prefix);
    let config_version = meta.as_ref().map(|m| m.config_version).unwrap_or(0);
    let config_schema_version = meta.as_ref().map(|m| m.schema_version).unwrap_or(0);

    let external_modified = match &meta {
        Some(m) if !m.hash.is_empty() => hash_file(&config_path) != m.hash,
        _ => false,
    };

    let (status, message) = if meta.is_none() {
        (
            "unmanaged",
            "尚未纳入版本管理：保存一次后开始记录版本".to_string(),
        )
    } else if schema_version == 0
        || config_schema_version == 0
        || schema_version == config_schema_version
    {
        ("ok", String::new())
    } else if config_schema_version < schema_version {
        (
            "schema-newer",
            format!(
                "schema 已升级 v{} → v{}：表单会按 schema 默认值补齐缺失字段，点击保存后才写回磁盘",
                config_schema_version, schema_version
            ),
        )
    } else {
        (
            "schema-older",
            format!(
                "配置按 schema v{} 保存，当前 schema 为 v{}（schema 可能被回退）：建议用源码模式编辑，避免表单丢字段",
                config_schema_version, schema_version
            ),
        )
    };

    Ok(MetaStatus {
        prefix: prefix.to_string(),
        meta,
        config_version,
        config_schema_version,
        schema_version,
        status: status.to_string(),
        external_modified,
        message,
    })
}

fn history_file_path(config_root: &Path, prefix: &str, file: &str) -> Result<PathBuf, String> {
    // 只接受 history 目录下的纯文件名，杜绝路径穿越
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err(format!("Invalid history file name: {}", file));
    }
    if !file.starts_with(&format!("{}_", prefix)) {
        return Err(format!("History file does not belong to prefix: {}", file));
    }
    let path = history_dir(config_root).join(file);
    ensure_within_root(config_root, &path)?;
    if !path.is_file() {
        return Err(format!("History file not found: {}", path.display()));
    }
    Ok(path)
}

#[tauri::command]
fn read_entry_meta(workspace_root: String, prefix: String) -> Result<MetaStatus, String> {
    meta_status_impl(&PathBuf::from(workspace_root), &prefix)
}

#[tauri::command]
fn list_history(workspace_root: String, prefix: String) -> Result<HistoryListResult, String> {
    let root = PathBuf::from(workspace_root);
    let config_root = resolve_config_root(&root)?;
    let entry = find_entry(&root, &prefix)?;
    let ext = PathBuf::from(&entry.config_path)
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_string();

    let mut index = load_history_index(&config_root, &prefix, &ext)?;
    index.entries.reverse(); // 新的在前

    Ok(HistoryListResult {
        current: read_meta(&config_root, &prefix),
        entries: index.entries,
        prefix,
    })
}

#[tauri::command]
fn read_history_file(
    workspace_root: String,
    prefix: String,
    file: String,
) -> Result<HistoryLoadResult, String> {
    let root = PathBuf::from(workspace_root);
    let config_root = resolve_config_root(&root)?;
    let path = history_file_path(&config_root, &prefix, &file)?;
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read history {}: {}", path.display(), e))?;
    Ok(HistoryLoadResult {
        ok: true,
        history_path: path.to_string_lossy().to_string(),
        content,
    })
}

// ---------------- Schema 创建 / 编辑 / 版本化 ----------------
// 设计见 docs/plans/schema-config-versioning.md 3.4 - 3.6。
// history 的那套 helper 按“文件名主干”工作，schema 直接复用它们，
// 只是把主干从 `<prefix>` 换成 `<prefix>.schema`：备份名 `algorithms.schema_<ts>.json`
// 不会被配置侧的 `algorithms_` 前缀扫描命中，两条历史线天然隔离。

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSummary {
    pub prefix: String,
    pub path: String,
    pub schema_version: u64,
    pub name: String,
    pub description: String,
    pub updated_at: i64,
    pub has_config: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDetail {
    pub prefix: String,
    pub path: String,
    pub text: String,
    pub schema_version: u64,
    pub exists: bool,
}

fn schema_stem(prefix: &str) -> String {
    format!("{}.schema", prefix)
}

fn schema_file_path(config_root: &Path, prefix: &str) -> PathBuf {
    schemas_dir(config_root).join(format!("{}.schema.json", prefix))
}

/// prefix 直接参与拼路径，是信任边界：只允许文件名安全字符。
fn validate_prefix(prefix: &str) -> Result<(), String> {
    if prefix.is_empty() {
        return Err("名称不能为空".to_string());
    }
    if prefix.len() > 100 {
        return Err("名称过长".to_string());
    }
    if prefix
        .chars()
        .any(|c| c == '/' || c == '\\' || c == ':' || c == '.' || c.is_control())
    {
        return Err(format!(
            "名称包含非法字符（不允许 / \\ : . 与控制字符）: {}",
            prefix
        ));
    }
    Ok(())
}

fn config_exists_for(config_root: &Path, prefix: &str) -> bool {
    config_root.join(format!("{}.json", prefix)).is_file()
        || config_root.join(format!("{}.xml", prefix)).is_file()
}

fn list_schemas_impl(workspace_root: &Path) -> Result<Vec<SchemaSummary>, String> {
    let config_root = resolve_config_root(workspace_root)?;
    let dir = schemas_dir(&config_root);

    let mut out = vec![];
    for path in read_dir_files_flat(&dir)? {
        let Some(name) = path.file_name().and_then(OsStr::to_str) else {
            continue;
        };
        let Some(prefix) = extract_schema_prefix(name) else {
            continue;
        };
        ensure_within_root(&config_root, &path)?;

        let json: serde_json::Value = fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_else(|| json!({}));

        out.push(SchemaSummary {
            schema_version: json.get("schemaVersion").and_then(|v| v.as_u64()).unwrap_or(1),
            name: json
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(&prefix)
                .to_string(),
            description: json
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
            updated_at: json
                .get("updatedAt")
                .and_then(|v| v.as_i64())
                .unwrap_or_else(|| file_mtime_secs(&path)),
            has_config: config_exists_for(&config_root, &prefix),
            path: path.to_string_lossy().to_string(),
            prefix,
        });
    }

    out.sort_by(|a, b| a.prefix.cmp(&b.prefix));
    Ok(out)
}

fn save_schema_impl(
    workspace_root: &Path,
    prefix: &str,
    text: &str,
    note: Option<String>,
    updated_by: Option<String>,
) -> Result<SaveResult, String> {
    validate_prefix(prefix)?;
    let config_root = resolve_config_root(workspace_root)?;

    // 非法 JSON 绝不落盘：schema 坏掉会让所有配置退化成源码编辑。
    let mut json: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("Schema 不是合法 JSON: {}", e))?;
    let obj = json
        .as_object_mut()
        .ok_or_else(|| "Schema 顶层必须是 JSON 对象".to_string())?;

    let dir = schemas_dir(&config_root);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create schemas dir {}: {}", dir.display(), e))?;
    let path = schema_file_path(&config_root, prefix);
    ensure_within_root(&config_root, &path)?;

    let existed = path.is_file();
    let prev_version = if existed {
        schema_version_of(&config_root, prefix).max(1)
    } else {
        0
    };
    let next_version = prev_version + 1;

    let stem = schema_stem(prefix);
    let backup_path = backup_existing(&config_root, &stem, &path)?;
    if let Some(backup) = &backup_path {
        let file = backup
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_string();
        append_history_entry(
            &config_root,
            &stem,
            "json",
            HistoryEntry {
                // 归档的是保存前那一版 schema，version 与 schemaVersion 都是旧版本号
                version: prev_version,
                file,
                at: chrono::Local::now().timestamp(),
                schema_version: prev_version,
                by: updated_by.clone().unwrap_or_else(|| "user".to_string()),
                hash: hash_file(backup),
                note: note.clone().unwrap_or_default(),
            },
        )?;
    }

    let now = chrono::Local::now().timestamp();
    let by = updated_by.unwrap_or_else(|| "user".to_string());
    obj.insert("schemaVersion".to_string(), json!(next_version));
    obj.entry("name").or_insert_with(|| json!(prefix));
    obj.entry("createdAt").or_insert_with(|| json!(now));
    obj.entry("createdBy").or_insert_with(|| json!(by));
    obj.insert("updatedAt".to_string(), json!(now));
    obj.insert("updatedBy".to_string(), json!(by));

    let pretty = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize schema JSON: {}", e))?;
    write_atomic(&path, &pretty)?;

    Ok(SaveResult {
        ok: true,
        backup_path: backup_path.map(|p| p.to_string_lossy().to_string()),
        written_path: path.to_string_lossy().to_string(),
    })
}

fn create_entry_impl(
    workspace_root: &Path,
    prefix: &str,
    format: &str,
    content: &str,
) -> Result<SaveResult, String> {
    validate_prefix(prefix)?;
    if format != "json" && format != "xml" {
        return Err(format!("不支持的格式: {}", format));
    }
    let config_root = resolve_config_root(workspace_root)?;
    let path = config_root.join(format!("{}.{}", prefix, format));
    ensure_within_root(&config_root, &path)?;
    if path.exists() {
        return Err(format!("配置已存在，不会覆盖: {}", path.display()));
    }

    write_atomic(&path, content)?;
    write_meta(
        &config_root,
        &EntryMeta {
            prefix: prefix.to_string(),
            config_version: 1,
            schema_version: schema_version_of(&config_root, prefix),
            updated_at: chrono::Local::now().timestamp(),
            updated_by: "user".to_string(),
            hash: sha256_hex(content.as_bytes()),
            note: "由 schema 创建".to_string(),
        },
    )?;

    Ok(SaveResult {
        ok: true,
        backup_path: None,
        written_path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn list_schemas(workspace_root: String) -> Result<Vec<SchemaSummary>, String> {
    list_schemas_impl(&PathBuf::from(workspace_root))
}

#[tauri::command]
fn read_schema(workspace_root: String, prefix: String) -> Result<SchemaDetail, String> {
    validate_prefix(&prefix)?;
    let config_root = resolve_config_root(&PathBuf::from(workspace_root))?;
    let path = schema_file_path(&config_root, &prefix);
    ensure_within_root(&config_root, &path)?;

    let exists = path.is_file();
    let text = if exists {
        fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read schema {}: {}", path.display(), e))?
    } else {
        String::new()
    };

    Ok(SchemaDetail {
        schema_version: if exists {
            schema_version_of(&config_root, &prefix)
        } else {
            0
        },
        path: path.to_string_lossy().to_string(),
        prefix,
        text,
        exists,
    })
}

#[tauri::command]
fn save_schema(
    workspace_root: String,
    prefix: String,
    text: String,
    note: Option<String>,
    updated_by: Option<String>,
) -> Result<SaveResult, String> {
    save_schema_impl(
        &PathBuf::from(workspace_root),
        &prefix,
        &text,
        note,
        updated_by,
    )
}

#[tauri::command]
fn delete_schema(workspace_root: String, prefix: String) -> Result<SaveResult, String> {
    validate_prefix(&prefix)?;
    let config_root = resolve_config_root(&PathBuf::from(workspace_root))?;
    let path = schema_file_path(&config_root, &prefix);
    ensure_within_root(&config_root, &path)?;
    if !path.is_file() {
        return Err(format!("Schema 不存在: {}", path.display()));
    }

    // 删除也留一份备份：这是配置管理工具，不做不可逆动作。
    let stem = schema_stem(&prefix);
    let backup_path = backup_existing(&config_root, &stem, &path)?;
    fs::remove_file(&path).map_err(|e| format!("Failed to delete schema: {}", e))?;

    Ok(SaveResult {
        ok: true,
        backup_path: backup_path.map(|p| p.to_string_lossy().to_string()),
        written_path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn list_schema_history(workspace_root: String, prefix: String) -> Result<HistoryListResult, String> {
    validate_prefix(&prefix)?;
    let config_root = resolve_config_root(&PathBuf::from(workspace_root))?;
    let mut index = load_history_index(&config_root, &schema_stem(&prefix), "json")?;
    index.entries.reverse(); // 新的在前

    Ok(HistoryListResult {
        current: None,
        entries: index.entries,
        prefix,
    })
}

#[tauri::command]
fn read_schema_history_file(
    workspace_root: String,
    prefix: String,
    file: String,
) -> Result<HistoryLoadResult, String> {
    validate_prefix(&prefix)?;
    let config_root = resolve_config_root(&PathBuf::from(workspace_root))?;
    let path = history_file_path(&config_root, &schema_stem(&prefix), &file)?;
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read history {}: {}", path.display(), e))?;
    Ok(HistoryLoadResult {
        ok: true,
        history_path: path.to_string_lossy().to_string(),
        content,
    })
}

#[tauri::command]
fn create_entry(
    workspace_root: String,
    prefix: String,
    format: String,
    content: String,
) -> Result<SaveResult, String> {
    create_entry_impl(&PathBuf::from(workspace_root), &prefix, &format, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_bumps_version_and_records_history() {
        let dir = std::env::temp_dir().join(format!("cm_ver_test_{}", timestamp_suffix()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("demo.json"), "{\"a\":1}").unwrap();

        save_entry_impl(&dir, "demo", "{\"a\":2}", Some("第一次".to_string()), None).unwrap();
        let m1 = read_meta(&dir, "demo").unwrap();
        assert_eq!(m1.config_version, 1);
        assert_eq!(m1.note, "第一次");

        save_entry_impl(&dir, "demo", "{\"a\":3}", None, None).unwrap();
        let m2 = read_meta(&dir, "demo").unwrap();
        assert_eq!(m2.config_version, 2);
        assert_eq!(m2.hash, sha256_hex(b"{\"a\":3}"));

        // 两次保存 = 两份备份，且第二条归档的是 v1（带 v1 的备注）
        let index = load_history_index(&dir, "demo", "json").unwrap();
        assert_eq!(index.entries.len(), 2);
        assert_eq!(index.entries[1].version, 1);
        assert_eq!(index.entries[1].note, "第一次");

        // index 丢失时按目录扫描重建，历史不丢
        fs::remove_file(history_index_path(&dir, "demo")).unwrap();
        assert_eq!(load_history_index(&dir, "demo", "json").unwrap().entries.len(), 2);

        // 外部改动可被 hash 检测出来
        assert!(!meta_status_impl(&dir, "demo").unwrap().external_modified);
        fs::write(dir.join("demo.json"), "{\"a\":99}").unwrap();
        assert!(meta_status_impl(&dir, "demo").unwrap().external_modified);

        // 路径穿越必须被拒绝
        assert!(history_file_path(&dir, "demo", "../demo.json").is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn schema_save_bumps_version_and_history_stays_separate() {
        let dir = std::env::temp_dir().join(format!("cm_schema_test_{}", timestamp_suffix()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("demo.json"), "{\"a\":1}").unwrap();

        // 新建 = v1，不产生历史（没有旧文件可备份）
        save_schema_impl(&dir, "demo", "{\"groups\":[]}", None, None).unwrap();
        assert_eq!(schema_version_of(&dir, "demo"), 1);
        assert!(load_history_index(&dir, &schema_stem("demo"), "json")
            .unwrap()
            .entries
            .is_empty());

        // 再存 = v2，归档的是 v1
        save_schema_impl(
            &dir,
            "demo",
            "{\"groups\":[],\"description\":\"x\"}",
            Some("加了描述".to_string()),
            None,
        )
        .unwrap();
        assert_eq!(schema_version_of(&dir, "demo"), 2);
        let sh = load_history_index(&dir, &schema_stem("demo"), "json").unwrap();
        assert_eq!(sh.entries.len(), 1);
        assert_eq!(sh.entries[0].version, 1);
        assert_eq!(sh.entries[0].note, "加了描述");

        // 非法 JSON 必须被拒，且不能落盘
        assert!(save_schema_impl(&dir, "demo", "{oops", None, None).is_err());
        assert_eq!(schema_version_of(&dir, "demo"), 2);

        // 非法名称（路径穿越）必须被拒
        assert!(save_schema_impl(&dir, "../evil", "{}", None, None).is_err());
        assert!(validate_prefix("a/b").is_err());

        // 配置历史与 schema 历史各走各的，互不串
        save_entry_impl(&dir, "demo", "{\"a\":2}", None, None).unwrap();
        assert_eq!(load_history_index(&dir, "demo", "json").unwrap().entries.len(), 1);
        assert_eq!(
            load_history_index(&dir, &schema_stem("demo"), "json")
                .unwrap()
                .entries
                .len(),
            1
        );

        // create_entry：已存在不覆盖，新建则直接是 v1
        assert!(create_entry_impl(&dir, "demo", "json", "{}").is_err());
        create_entry_impl(&dir, "fresh", "json", "{\"b\":1}").unwrap();
        assert_eq!(read_meta(&dir, "fresh").unwrap().config_version, 1);

        let _ = fs::remove_dir_all(&dir);
    }
}

fn main() {
    tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_entries,
            read_entry,
            save_entry_text,
            read_latest_history,
            schema_setup_suggestion,
            generate_default_schemas,
            default_workspace_root,
            read_entry_meta,
            list_history,
            read_history_file,
            list_schemas,
            read_schema,
            save_schema,
            delete_schema,
            list_schema_history,
            read_schema_history_file,
            create_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{Datelike, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

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

fn build_default_schema(prefix: &str, json_root: &serde_json::Value) -> Result<serde_json::Value, String> {
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

    let backup_name = if ext.is_empty() {
        format!("{}_{}", prefix, timestamp_suffix())
    } else {
        format!("{}_{}.{}", prefix, timestamp_suffix(), ext)
    };

    let backup_path = history.join(backup_name);
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
fn save_entry_text(workspace_root: String, prefix: String, content: String) -> Result<SaveResult, String> {
    let root = PathBuf::from(workspace_root);
    let entries = list_entries_impl(&root)?;
    let entry = entries
        .into_iter()
        .find(|e| e.prefix == prefix)
        .ok_or_else(|| "Prefix not found".to_string())?;

    let config_path = PathBuf::from(&entry.config_path);
    ensure_within_root(&root, &config_path)?;

    let backup_path = backup_existing(&root, &entry.prefix, &config_path)?;
    write_atomic(&config_path, &content)?;

    Ok(SaveResult {
        ok: true,
        backup_path: backup_path.map(|p| p.to_string_lossy().to_string()),
        written_path: config_path.to_string_lossy().to_string(),
    })
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

        let schema_value = match build_default_schema(&prefix, &json_root) {
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
fn default_workspace_root() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Failed to get current exe: {}", e))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "Failed to get exe parent directory".to_string())?;

    // New semantics: workspaceRoot is the *config directory* itself.
    // Prefer "<exe_dir>/config" if present; otherwise fallback to "<exe_dir>".
    let config_dir = dir.join("config");
    if config_dir.exists() && config_dir.is_dir() {
        Ok(config_dir.to_string_lossy().to_string())
    } else {
        Ok(dir.to_string_lossy().to_string())
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
            default_workspace_root
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

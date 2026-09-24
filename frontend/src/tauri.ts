import { invoke } from '@tauri-apps/api/core';

export type MatchedEntrySummary = {
    prefix: string;
    schema_path: string;
    config_path: string;
    format: 'json' | 'xml' | string;
};

export type EntryDetail = {
    prefix: string;
    schema_path: string;
    config_path: string;
    format: 'json' | 'xml' | string;
    schema_text: string;
    config_text: string;
};

export type SaveResult = {
    ok: boolean;
    backup_path?: string | null;
    written_path: string;
};

export type HistoryLoadResult = {
    ok: boolean;
    history_path: string;
    content: string;
};

export type EntryMeta = {
    prefix: string;
    configVersion: number;
    schemaVersion: number;
    updatedAt: number;
    updatedBy: string;
    hash: string;
    note: string;
};

export type HistoryEntry = {
    version: number;
    file: string;
    at: number;
    schemaVersion: number;
    by: string;
    hash: string;
    note: string;
};

export type HistoryListResult = {
    prefix: string;
    current?: EntryMeta | null;
    entries: HistoryEntry[];
};

export type MetaStatus = {
    prefix: string;
    meta?: EntryMeta | null;
    configVersion: number;
    configSchemaVersion: number;
    schemaVersion: number;
    status: 'ok' | 'unmanaged' | 'schema-newer' | 'schema-older' | string;
    externalModified: boolean;
    message: string;
};

export type SchemaSetupSuggestion = {
    should_prompt: boolean;
    reason: string;
    json_prefixes: string[];
    config_dir: string;
    schemas_dir: string;
};

export type GenerateDefaultSchemaFailure = {
    prefix: string;
    error: string;
};

export type GenerateDefaultSchemasResult = {
    ok: boolean;
    schemas_dir: string;
    created: string[];
    skipped: string[];
    failed: GenerateDefaultSchemaFailure[];
};

export async function listEntries(workspaceRoot: string): Promise<MatchedEntrySummary[]> {
    return invoke('list_entries', { workspaceRoot });
}

export async function readEntry(workspaceRoot: string, prefix: string): Promise<EntryDetail> {
    return invoke('read_entry', { workspaceRoot, prefix });
}

export async function saveEntryText(
    workspaceRoot: string,
    prefix: string,
    content: string,
    note?: string
): Promise<SaveResult> {
    return invoke('save_entry_text', { workspaceRoot, prefix, content, note: note || null });
}

export async function readEntryMeta(workspaceRoot: string, prefix: string): Promise<MetaStatus> {
    return invoke('read_entry_meta', { workspaceRoot, prefix });
}

export async function listHistory(workspaceRoot: string, prefix: string): Promise<HistoryListResult> {
    return invoke('list_history', { workspaceRoot, prefix });
}

export async function readHistoryFile(
    workspaceRoot: string,
    prefix: string,
    file: string
): Promise<HistoryLoadResult> {
    return invoke('read_history_file', { workspaceRoot, prefix, file });
}

export async function readLatestHistory(workspaceRoot: string, prefix: string): Promise<HistoryLoadResult> {
    return invoke('read_latest_history', { workspaceRoot, prefix });
}

export async function schemaSetupSuggestion(workspaceRoot: string): Promise<SchemaSetupSuggestion> {
    return invoke('schema_setup_suggestion', { workspaceRoot });
}

export async function generateDefaultSchemas(workspaceRoot: string): Promise<GenerateDefaultSchemasResult> {
    return invoke('generate_default_schemas', { workspaceRoot });
}

export async function defaultWorkspaceRoot(): Promise<string> {
    return invoke('default_workspace_root');
}

// ---------------- Schema 创建 / 编辑 / 版本化 ----------------

export type SchemaSummary = {
    prefix: string;
    path: string;
    schemaVersion: number;
    name: string;
    description: string;
    updatedAt: number;
    hasConfig: boolean;
};

export type SchemaDetail = {
    prefix: string;
    path: string;
    text: string;
    schemaVersion: number;
    exists: boolean;
};

export async function listSchemas(workspaceRoot: string): Promise<SchemaSummary[]> {
    return invoke('list_schemas', { workspaceRoot });
}

export async function readSchema(workspaceRoot: string, prefix: string): Promise<SchemaDetail> {
    return invoke('read_schema', { workspaceRoot, prefix });
}

export async function saveSchema(
    workspaceRoot: string,
    prefix: string,
    text: string,
    note?: string
): Promise<SaveResult> {
    return invoke('save_schema', { workspaceRoot, prefix, text, note: note || null });
}

export async function deleteSchema(workspaceRoot: string, prefix: string): Promise<SaveResult> {
    return invoke('delete_schema', { workspaceRoot, prefix });
}

export async function listSchemaHistory(workspaceRoot: string, prefix: string): Promise<HistoryListResult> {
    return invoke('list_schema_history', { workspaceRoot, prefix });
}

export async function readSchemaHistoryFile(
    workspaceRoot: string,
    prefix: string,
    file: string
): Promise<HistoryLoadResult> {
    return invoke('read_schema_history_file', { workspaceRoot, prefix, file });
}

export async function createEntry(
    workspaceRoot: string,
    prefix: string,
    format: 'json' | 'xml',
    content: string
): Promise<SaveResult> {
    return invoke('create_entry', { workspaceRoot, prefix, format, content });
}

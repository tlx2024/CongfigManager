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

export async function saveEntryText(workspaceRoot: string, prefix: string, content: string): Promise<SaveResult> {
    return invoke('save_entry_text', { workspaceRoot, prefix, content });
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

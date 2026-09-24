// Copyright (C) 2026 tlx2024
// SPDX-License-Identifier: AGPL-3.0-or-later
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Drawer, Empty, Input, Layout, List, Modal, Space, Tabs, Tag, Typography, message, theme } from 'antd';
import { open } from '@tauri-apps/plugin-dialog';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import DynamicForm from '../components/DynamicForm';
import SchemaEditor from './SchemaEditor';
import {
    EntryDetail,
    HistoryEntry,
    HistoryListResult,
    MatchedEntrySummary,
    MetaStatus,
    defaultWorkspaceRoot,
    generateDefaultSchemas,
    listEntries,
    listHistory,
    readEntry,
    readEntryMeta,
    readHistoryFile,
    schemaSetupSuggestion,
    saveEntryText
} from '../tauri';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const LAST_ROOT_KEY = 'config-manager:lastWorkspaceRoot';

type FormMeta = {
    schemaName: string;
    schema: { version: string; title: string; description: string };
    groups: any[];
};

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false
});

const xmlBuilder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    format: true,
    indentBy: '  ',
    suppressEmptyNode: true
});

function isPlainObject(v: any): v is Record<string, any> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function pickFirstObjectKey(obj: any): string | null {
    if (!isPlainObject(obj)) return null;
    const keys = Object.keys(obj);
    if (keys.length !== 1) return null;
    return keys[0] || null;
}

function inferFieldTypeFromValue(v: any): 'string' | 'number' | 'boolean' | 'array' | 'object' {
    if (v === null || v === undefined) return 'string';
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'object') return 'object';
    return 'string';
}

function mergeObjectKeysFromArray(items: any[], sampleLimit = 20): string[] {
    const out = new Set<string>();
    const limited = items.slice(0, sampleLimit);
    for (const it of limited) {
        if (!isPlainObject(it)) continue;
        for (const k of Object.keys(it)) out.add(k);
    }
    return Array.from(out);
}

function pickRepresentativeValue(items: any[], key: string) {
    for (const it of items) {
        if (isPlainObject(it) && it[key] !== undefined && it[key] !== null) return it[key];
    }
    return undefined;
}

function inferGroupContentFromObject(obj: Record<string, any>, depth: number, maxDepth: number) {
    const fields: any[] = [];
    const groups: any[] = [];
    let fieldOrder = 10;
    let groupOrder = 10;

    const keys = Object.keys(obj);
    for (const k of keys) {
        const v = obj[k];
        const t = inferFieldTypeFromValue(v);

        if (t === 'object' && isPlainObject(v) && depth < maxDepth) {
            const nested = inferGroupContentFromObject(v, depth + 1, maxDepth);
            groups.push({
                name: k,
                label: k,
                order: groupOrder,
                type: 'object',
                fields: nested.fields,
                groups: nested.groups
            });
            groupOrder += 10;
            continue;
        }

        if (t === 'array' && Array.isArray(v) && depth < maxDepth) {
            const arrayItems = v;
            const hasObjectItem = arrayItems.some((x) => isPlainObject(x));
            if (hasObjectItem) {
                const mergedKeys = mergeObjectKeysFromArray(arrayItems, 20);
                const templateObj: Record<string, any> = {};
                for (const mk of mergedKeys) {
                    templateObj[mk] = pickRepresentativeValue(arrayItems, mk);
                }
                const tpl = inferGroupContentFromObject(templateObj, depth + 1, maxDepth);
                groups.push({
                    name: k,
                    label: k,
                    order: groupOrder,
                    type: 'array',
                    ui: {
                        itemLabel: '项',
                        addButtonText: '添加',
                        itemTemplate: {
                            fields: tpl.fields,
                            groups: tpl.groups
                        }
                    }
                });
                groupOrder += 10;
            } else {
                fields.push({
                    key: k,
                    label: k,
                    type: 'array',
                    order: fieldOrder
                });
                fieldOrder += 10;
            }
            continue;
        }

        // primitive / unsupported depth: use a normal field
        fields.push({
            key: k,
            label: k,
            type: t === 'object' ? 'object' : t,
            order: fieldOrder
        });
        fieldOrder += 10;
    }

    return { fields, groups };
}

function inferTopLevelGroupsFromValues(prefix: string, values: Record<string, any>): FormMeta {
    const groups: any[] = [];
    let order = 10;
    const keys = Object.keys(values || {});
    for (const k of keys) {
        const v = values[k];
        const t = inferFieldTypeFromValue(v);

        if (t === 'object' && isPlainObject(v)) {
            const nested = inferGroupContentFromObject(v, 1, 6);
            groups.push({
                name: k,
                label: k,
                order,
                type: 'object',
                fields: nested.fields,
                groups: nested.groups
            });
            order += 10;
            continue;
        }

        if (t === 'array' && Array.isArray(v)) {
            const hasObjectItem = v.some((x) => isPlainObject(x));
            if (hasObjectItem) {
                const mergedKeys = mergeObjectKeysFromArray(v, 20);
                const templateObj: Record<string, any> = {};
                for (const mk of mergedKeys) {
                    templateObj[mk] = pickRepresentativeValue(v, mk);
                }
                const tpl = inferGroupContentFromObject(templateObj, 1, 6);
                groups.push({
                    name: k,
                    label: k,
                    order,
                    type: 'array',
                    ui: {
                        itemLabel: '项',
                        addButtonText: '添加',
                        itemTemplate: { fields: tpl.fields, groups: tpl.groups }
                    }
                });
                order += 10;
            } else {
                groups.push({
                    name: k,
                    label: k,
                    order,
                    type: 'normal',
                    fields: [{ key: k, label: k, type: 'array', order: 10 }]
                });
                order += 10;
            }
            continue;
        }

        // primitive
        groups.push({
            name: k,
            label: k,
            order,
            type: 'normal',
            fields: [{ key: k, label: k, type: t === 'object' ? 'object' : t, order: 10 }]
        });
        order += 10;
    }

    return {
        schemaName: prefix,
        schema: {
            version: 'inferred',
            title: prefix,
            description: '（自动推导：未找到可用的 groups schema，已根据当前内容生成表单结构）'
        },
        groups
    };
}

function parseXmlToObject(xmlText: string): any {
    const text = String(xmlText || '').trim();
    if (!text) return {};
    return xmlParser.parse(text);
}

function buildXmlFromValues(values: Record<string, any>, rootName?: string) {
    const payload = rootName ? { [rootName]: values } : values;
    return xmlBuilder.build(payload);
}

function parseFormMeta(prefix: string, schemaText: string): FormMeta {
    const raw = JSON.parse(schemaText);
    const description = typeof raw?.description === 'string' ? raw.description : '';
    const groups = Array.isArray(raw?.groups) ? raw.groups : [];
    return {
        schemaName: prefix,
        schema: { version: '', title: prefix, description },
        groups
    };
}

export default function App() {
    const { token } = theme.useToken();

    const [workspaceRoot, setWorkspaceRoot] = useState('');
    const [entries, setEntries] = useState<MatchedEntrySummary[]>([]);
    const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null);
    const [detail, setDetail] = useState<EntryDetail | null>(null);

    const [sourceText, setSourceText] = useState('');
    const [values, setValues] = useState<Record<string, any>>({});
    const [errors, setErrors] = useState<Array<{ field: string; message: string; code: string }>>([]);

    const [inferredMeta, setInferredMeta] = useState<FormMeta | null>(null);
    const [xmlRootName, setXmlRootName] = useState<string | undefined>(undefined);

    const [activeTab, setActiveTab] = useState<'form' | 'source'>('form');
    const [schemaPromptDismissed, setSchemaPromptDismissed] = useState(false);

    // 版本化：当前条目的 meta 状态 + 历史版本抽屉
    const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null);
    const [note, setNote] = useState('');
    const [historyOpen, setHistoryOpen] = useState(false);
    const [schemaEditorOpen, setSchemaEditorOpen] = useState(false);
    const [history, setHistory] = useState<HistoryListResult | null>(null);

    const formMeta = useMemo(() => {
        if (!detail) return null;
        try {
            return parseFormMeta(detail.prefix, detail.schema_text);
        } catch {
            return null;
        }
    }, [detail]);

    const effectiveFormMeta = formMeta || inferredMeta;

    const format = detail?.format || '';

    const reloadEntries = async (rootOverride?: string) => {
        const root = (rootOverride ?? workspaceRoot).trim();
        if (!root) {
            message.error('请先填写 workspaceRoot（工作区根目录）');
            return;
        }
        try {
            const list = await listEntries(root);
            localStorage.setItem(LAST_ROOT_KEY, root);
            setEntries(list);
            setSelectedPrefix(null);
            setDetail(null);
            setSourceText('');
            setValues({});
            setErrors([]);
            if (!list || list.length === 0) {
                message.warning('未匹配到条目：请确认当前目录或其 config 子目录下存在 .json 或 .xml 文件');

                if (!schemaPromptDismissed) {
                    try {
                        const hint = await schemaSetupSuggestion(root);
                        if (hint.should_prompt && hint.json_prefixes && hint.json_prefixes.length > 0) {
                            Modal.confirm({
                                title: '当前配置没有 schema',
                                content: `未检测到可用的 schema 文件。是否为当前目录下的 ${hint.json_prefixes.length} 个 JSON 配置生成默认 schema，并写入：${hint.schemas_dir}？`,
                                okText: '生成默认 schema',
                                cancelText: '暂不生成',
                                onOk: async () => {
                                    const res = await generateDefaultSchemas(root);
                                    const failCount = res.failed?.length || 0;
                                    if (failCount > 0) {
                                        message.warning(`已生成 ${res.created?.length || 0} 个，失败 ${failCount} 个（可在控制台/后端错误中查看细节）`);
                                    } else {
                                        message.success(`已生成 ${res.created?.length || 0} 个默认 schema`);
                                    }
                                    // 生成后重新加载条目
                                    await reloadEntries(root);
                                },
                                onCancel: () => setSchemaPromptDismissed(true)
                            });
                        }
                    } catch {
                        // ignore
                    }
                }
            }
        } catch (e: any) {
            const msg = e?.message || String(e);
            message.error(`加载失败: ${msg}`);
        }
    };

    const updateDefaultSchemas = async () => {
        const root = workspaceRoot.trim();
        if (!root) {
            message.error('请先填写 workspaceRoot（工作区根目录）');
            return;
        }
        Modal.confirm({
            title: '生成默认 schema',
            content: '将为当前目录下所有 JSON 配置生成/更新默认 schema（仅覆盖“自动生成”的 schema，不会覆盖手写 schema）。是否继续？',
            okText: '生成',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await generateDefaultSchemas(root);
                    const createdCount = res.created?.length || 0;
                    const failCount = res.failed?.length || 0;
                    if (failCount > 0) {
                        message.warning(`已更新/生成 ${createdCount} 个，失败 ${failCount} 个（可在控制台/后端错误中查看细节）`);
                    } else {
                        message.success(`已更新/生成 ${createdCount} 个默认 schema`);
                    }
                    await reloadEntries(root);
                } catch (e: any) {
                    message.error(`更新失败: ${e?.message || String(e)}`);
                }
            }
        });
    };

    const openPrefix = async (prefix: string, rootOverride?: string) => {
        const root = (rootOverride ?? workspaceRoot).trim();
        if (!root) return;
        try {
            const d = await readEntry(root, prefix);
            setSelectedPrefix(prefix);
            setDetail(d);
            setSourceText(d.config_text);
            setInferredMeta(null);
            setXmlRootName(undefined);
            setNote('');
            await refreshMeta(root, prefix);

            // MVP：JSON 尝试直接解析成 values；XML 暂仅支持源码编辑
            if (d.format === 'json') {
                try {
                    const obj = d.config_text ? JSON.parse(d.config_text) : {};
                    const nextValues = obj && typeof obj === 'object' ? obj : {};
                    setValues(nextValues);
                    setErrors([]);

                    if (!String(d.schema_text || '').trim()) {
                        setInferredMeta(inferTopLevelGroupsFromValues(prefix, isPlainObject(nextValues) ? nextValues : {}));
                    }
                } catch (e: any) {
                    setValues({});
                    setErrors([{ field: '$', code: 'json_parse_error', message: e?.message || 'JSON 解析失败' }]);
                }
            } else if (d.format === 'xml') {
                try {
                    let meta: FormMeta | null = null;
                    try {
                        meta = parseFormMeta(prefix, d.schema_text);
                    } catch {
                        meta = null;
                    }

                    const parsed = parseXmlToObject(d.config_text);
                    const rootKey = pickFirstObjectKey(parsed);

                    let nextValues: Record<string, any> = isPlainObject(parsed) ? parsed : {};
                    let nextXmlRoot: string | undefined = undefined;

                    if (rootKey && isPlainObject((parsed as any)[rootKey])) {
                        const schemaGroupNames = (meta?.groups || []).map((g: any) => String(g?.name || '')).filter(Boolean);
                        const childKeys = Object.keys((parsed as any)[rootKey] || {});
                        const schemaMatchesRoot = schemaGroupNames.includes(rootKey);
                        const schemaMatchesChild = schemaGroupNames.some((n) => childKeys.includes(n));

                        // 若 schema 更像是“解包后的结构”，则把 root 解包（保存时再包回去）
                        if (!schemaMatchesRoot && schemaMatchesChild) {
                            nextValues = (parsed as any)[rootKey];
                            nextXmlRoot = rootKey;
                        } else {
                            // 默认：保留 root（若只有一个 root，则保存时也用这个 root）
                            nextXmlRoot = rootKey;
                            nextValues = parsed as any;
                        }
                    }

                    setValues(isPlainObject(nextValues) ? nextValues : {});
                    setXmlRootName(nextXmlRoot);
                    setErrors([]);

                    if (!meta) {
                        const inferred = inferTopLevelGroupsFromValues(prefix, isPlainObject(nextValues) ? nextValues : {});
                        setInferredMeta(inferred);
                    }
                } catch (e: any) {
                    setValues({});
                    setXmlRootName(undefined);
                    setInferredMeta(null);
                    setErrors([{ field: '$', code: 'xml_parse_error', message: e?.message || 'XML 解析失败' }]);
                }
            } else {
                setValues({});
                setErrors([]);
            }
        } catch (e: any) {
            const msg = e?.message || String(e);
            message.error(`打开失败: ${msg}`);
        }
    };

    const onFormChange = (key: string, value: any) => {
        setValues((prev) => {
            const next = { ...prev, [key]: value };
            if (format === 'json') {
                setSourceText(JSON.stringify(next, null, 2));
            } else if (format === 'xml') {
                try {
                    const xml = buildXmlFromValues(next, xmlRootName);
                    setSourceText(String(xml || ''));
                } catch {
                    // ignore build errors while editing
                }
            }
            return next;
        });
    };

    const onSourceChange = (text: string) => {
        setSourceText(text);
        if (format === 'json') {
            try {
                const obj = text ? JSON.parse(text) : {};
                setValues(obj && typeof obj === 'object' ? obj : {});
                setErrors([]);
            } catch (e: any) {
                setErrors([{ field: '$', code: 'json_parse_error', message: e?.message || 'JSON 解析失败' }]);
            }
        }
        if (format === 'xml') {
            try {
                const parsed = parseXmlToObject(text);
                const rootKey = pickFirstObjectKey(parsed);

                let nextValues: Record<string, any> = isPlainObject(parsed) ? parsed : {};
                let nextXmlRoot: string | undefined = rootKey || undefined;

                if (rootKey && isPlainObject((parsed as any)[rootKey])) {
                    // 若当前 values 看起来是解包后的结构，则继续解包
                    const schemaGroupNames = (effectiveFormMeta?.groups || []).map((g: any) => String(g?.name || '')).filter(Boolean);
                    const childKeys = Object.keys((parsed as any)[rootKey] || {});
                    const schemaMatchesRoot = schemaGroupNames.includes(rootKey);
                    const schemaMatchesChild = schemaGroupNames.some((n) => childKeys.includes(n));
                    if (!schemaMatchesRoot && schemaMatchesChild) {
                        nextValues = (parsed as any)[rootKey];
                        nextXmlRoot = rootKey;
                    } else {
                        nextValues = parsed as any;
                        nextXmlRoot = rootKey;
                    }
                }

                if (isPlainObject(nextValues)) {
                    setValues(nextValues);
                    setXmlRootName(nextXmlRoot);
                    setErrors([]);

                    if (!formMeta) {
                        setInferredMeta(inferTopLevelGroupsFromValues(detail?.prefix || 'XML', nextValues));
                    }
                }
            } catch (e: any) {
                setErrors([{ field: '$', code: 'xml_parse_error', message: e?.message || 'XML 解析失败' }]);
            }
        }
    };

    const refreshMeta = async (root: string, prefix: string) => {
        try {
            setMetaStatus(await readEntryMeta(root, prefix));
        } catch {
            setMetaStatus(null);
        }
    };

    const save = async () => {
        const root = workspaceRoot.trim();
        if (!detail || !root) return;
        try {
            const content = sourceText;
            const res = await saveEntryText(root, detail.prefix, content, note.trim());
            if (res.ok) {
                setDetail((prev) => (prev ? { ...prev, config_text: content } : prev));
                setNote('');
                await refreshMeta(root, detail.prefix);
                message.success('已保存（已生成 history 备份并记录版本）');
            } else {
                message.error('保存失败');
            }
        } catch (e: any) {
            const msg = e?.message || String(e);
            message.error(`保存失败: ${msg}`);
        }
    };

    const openHistory = async () => {
        const root = workspaceRoot.trim();
        if (!detail || !root) return;
        try {
            setHistory(await listHistory(root, detail.prefix));
            setHistoryOpen(true);
        } catch (e: any) {
            message.error(`读取历史失败: ${e?.message || String(e)}`);
        }
    };

    // 只加载到编辑区，不写回磁盘：回滚也必须由用户点"保存"确认
    const loadHistoryIntoEditor = async (item: HistoryEntry) => {
        const root = workspaceRoot.trim();
        if (!detail || !root) return;
        try {
            const res = await readHistoryFile(root, detail.prefix, item.file);
            onSourceChange(res.content ?? '');
            setNote(`回滚自 ${item.file}`);
            setHistoryOpen(false);
            message.info('已加载到编辑区（未写回磁盘，点击"保存"才会写回）');
        } catch (e: any) {
            message.error(`加载失败: ${e?.message || String(e)}`);
        }
    };

    useEffect(() => {
        (async () => {
            try {
                // 上次打开的目录优先，没有再回退到后端给的默认目录
                const root = (localStorage.getItem(LAST_ROOT_KEY) || (await defaultWorkspaceRoot()) || '').trim();
                if (root) {
                    setWorkspaceRoot(root);
                    await reloadEntries(root);
                }
            } catch {
                // ignore: user can still manually pick a folder
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSchemaChanged = async () => {
        // schema 增删改会影响条目列表与版本横幅，改完就刷一次。
        // 这里不走 reloadEntries：它会清空当前打开的条目，编辑到一半被清掉很难受。
        const root = workspaceRoot.trim();
        if (!root) return;
        try {
            setEntries(await listEntries(root));
        } catch {
            // ignore
        }
        if (selectedPrefix) await refreshMeta(root, selectedPrefix);
    };

    // Schema 管理是整页全屏视图：主界面状态在期间完整保留，返回后无需重载
    if (schemaEditorOpen) {
        return (
            <SchemaEditor
                workspaceRoot={workspaceRoot}
                boundPrefix={detail?.prefix}
                onExit={() => setSchemaEditorOpen(false)}
                onSchemaChanged={handleSchemaChanged}
            />
        );
    }

    return (
        <Layout style={{ height: '100vh', background: token.colorBgLayout }}>
            <Header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    height: 'auto',
                    padding: '10px 16px',
                    lineHeight: 'normal',
                    backgroundColor: token.colorBgContainer,
                    backgroundImage: `linear-gradient(90deg, ${token.colorBgContainer} 0%, ${token.colorBgContainer} 65%, ${token.colorPrimaryBg} 100%)`,
                    borderBottom: `1px solid ${token.colorBorder}`
                }}
            >
                <Text style={{ fontSize: 16, fontWeight: 600, color: token.colorTextHeading, flex: '0 0 auto' }}>
                    通用配置可视化编辑器
                </Text>
                <Space
                    style={{
                        marginLeft: 16,
                        flex: 1,
                        background: token.colorBgContainer,
                        padding: 8,
                        borderRadius: token.borderRadiusLG,
                        border: `1px solid ${token.colorBorderSecondary}`
                    }}
                >
                    <Input
                        placeholder="配置目录（直接包含 *.json/*.xml；schemas/ 与 history/ 将在此目录下）"
                        value={workspaceRoot}
                        onChange={(e) => setWorkspaceRoot(e.target.value)}
                    />
                    <Button
                        onClick={async () => {
                            try {
                                const selected = await open({ directory: true, multiple: false });
                                if (typeof selected === 'string' && selected.trim()) {
                                    const root = selected.trim();
                                    setWorkspaceRoot(root);
                                    // 选完目录后直接加载一次，减少用户操作（使用 root 参数避免 setState 未生效）
                                    await reloadEntries(root);
                                }
                            } catch (e: any) {
                                message.error(e?.message || '打开文件夹失败');
                            }
                        }}
                    >
                        浏览...
                    </Button>
                    <Button onClick={() => reloadEntries()}>加载</Button>
                    <Button onClick={updateDefaultSchemas}>生成默认 schema</Button>
                    <Button onClick={() => setSchemaEditorOpen(true)} disabled={!workspaceRoot.trim()}>
                        Schema 管理
                    </Button>
                </Space>
            </Header>

            <Layout>
                <Sider width={280} theme="light" style={{ borderRight: `1px solid ${token.colorBorder}` }}>
                    <div style={{ padding: 12 }}>
                        <Text type="secondary">配置列表：</Text>
                    </div>
                    <List
                        size="small"
                        dataSource={entries}
                        renderItem={(item) => (
                            <List.Item
                                style={{
                                    cursor: 'pointer',
                                    paddingLeft: 12,
                                    paddingRight: 12,
                                    background: item.prefix === selectedPrefix ? token.controlItemBgActive : undefined
                                }}
                                onClick={() => openPrefix(item.prefix)}
                            >
                                <div style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Text>{item.prefix}</Text>
                                        <Text type="secondary">{String(item.format).toUpperCase()}</Text>
                                    </div>
                                </div>
                            </List.Item>
                        )}
                    />
                </Sider>

                <Content style={{ padding: 16 }}>
                    {!detail ? (
                        <Card size="small" style={{ borderRadius: token.borderRadiusLG }}>
                            <Text type="secondary">请选择左侧条目</Text>
                        </Card>
                    ) : (
                        <Card
                            size="small"
                            style={{ borderRadius: token.borderRadiusLG }}
                            styles={{ body: { padding: 16 } }}
                        >
                            <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <Space size={8}>
                                            <Text strong style={{ fontSize: 16 }}>
                                                {detail.prefix}
                                            </Text>
                                            {metaStatus && (
                                                <>
                                                    <Tag color="blue">
                                                        {metaStatus.configVersion > 0
                                                            ? `配置 v${metaStatus.configVersion}`
                                                            : '配置 未纳管'}
                                                    </Tag>
                                                    <Tag>
                                                        {metaStatus.schemaVersion > 0
                                                            ? `schema v${metaStatus.schemaVersion}`
                                                            : '无 schema'}
                                                    </Tag>
                                                </>
                                            )}
                                        </Space>
                                        <div>
                                            <Text type="secondary" ellipsis style={{ maxWidth: 760 }}>
                                                {detail.config_path}
                                            </Text>
                                        </div>
                                    </div>
                                    <Space>
                                        <Input
                                            placeholder="本次改动备注（可选）"
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            style={{ width: 220 }}
                                        />
                                        <Button onClick={() => setSchemaEditorOpen(true)} disabled={!detail}>
                                            Schema
                                        </Button>
                                        <Button onClick={openHistory} disabled={!detail}>
                                            历史版本
                                        </Button>
                                        <Button type="primary" onClick={save} disabled={!detail}>
                                            保存
                                        </Button>
                                    </Space>
                                </Space>

                                {metaStatus?.externalModified && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="文件已被本工具之外的程序修改（内容哈希与记录不一致）"
                                        description="当前显示的是磁盘内容；保存时会先备份现有文件，不会丢数据。"
                                    />
                                )}
                                {metaStatus && metaStatus.status !== 'ok' && metaStatus.message && (
                                    <Alert
                                        type={metaStatus.status === 'schema-older' ? 'error' : 'info'}
                                        showIcon
                                        message={metaStatus.message}
                                    />
                                )}

                                <Tabs
                                    activeKey={activeTab}
                                    onChange={(k) => setActiveTab(k as any)}
                                    items={[
                                        {
                                            key: 'form',
                                            label: '表单',
                                            children: effectiveFormMeta ? (
                                                <DynamicForm
                                                    formMeta={effectiveFormMeta as any}
                                                    values={values}
                                                    errors={errors}
                                                    onChange={onFormChange}
                                                />
                                            ) : (
                                                <Text type="secondary">Schema 解析失败或不存在（可在“源码”中修正/补充）</Text>
                                            )
                                        },
                                        {
                                            key: 'source',
                                            label: '源码',
                                            children: (
                                                <Input.TextArea
                                                    value={sourceText}
                                                    onChange={(e) => onSourceChange(e.target.value)}
                                                    autoSize={{ minRows: 20 }}
                                                />
                                            )
                                        }
                                    ]}
                                />
                            </Space>
                        </Card>
                    )}
                </Content>
            </Layout>

            <Drawer
                title={`历史版本 - ${detail?.prefix ?? ''}`}
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                width={520}
            >
                {history?.current && (
                    <Alert
                        style={{ marginBottom: 12 }}
                        type="success"
                        message={`当前：v${history.current.configVersion}（schema v${history.current.schemaVersion}）`}
                        description={history.current.note || '无备注'}
                    />
                )}
                {!history?.entries?.length ? (
                    <Empty description="暂无历史版本（保存一次后开始记录）" />
                ) : (
                    <List
                        size="small"
                        dataSource={history.entries}
                        renderItem={(item) => (
                            <List.Item
                                actions={[
                                    <Button key="load" type="link" onClick={() => loadHistoryIntoEditor(item)}>
                                        加载到编辑区
                                    </Button>
                                ]}
                            >
                                <List.Item.Meta
                                    title={
                                        <Space size={8}>
                                            <Text strong>{item.version > 0 ? `v${item.version}` : '未记录版本'}</Text>
                                            {item.schemaVersion > 0 && <Tag>schema v{item.schemaVersion}</Tag>}
                                            {item.by && <Text type="secondary">{item.by}</Text>}
                                        </Space>
                                    }
                                    description={
                                        <div>
                                            <div>{item.note || '无备注'}</div>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {item.file}
                                            </Text>
                                        </div>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                )}
            </Drawer>
        </Layout>
    );
}

// Copyright (C) 2026 tlx2024
// SPDX-License-Identifier: AGPL-3.0-or-later
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    Form,
    Input,
    InputNumber,
    List,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Switch,
    Tabs,
    Tag,
    Typography,
    message,
    theme
} from 'antd';
import DynamicForm from '../components/DynamicForm';
import { diffLines } from '../lib/diffLines';
import {
    HistoryListResult,
    SchemaSummary,
    createEntry,
    deleteSchema,
    listSchemaHistory,
    listSchemas,
    readSchema,
    readSchemaHistoryFile,
    saveSchema
} from '../tauri';

const { Text } = Typography;

/**
 * Schema 管理全屏编辑器：左栏版本列表 + 中栏结构/源码工作区 + 右栏实时预览。
 * 数据模型与 ConfigReader 的 SchemaDesigner 一致（groups / fields / itemTemplate）。
 * 设计见 docs/plans/schema-config-versioning.md §3.4 - §3.6。
 */

// 类型下拉必须以 DynamicForm 的 switch (widget) 为准，多给一个就是给用户挖坑。
const FIELD_TYPES = [
    { value: 'string', label: '文本' },
    { value: 'textarea', label: '多行文本' },
    { value: 'text', label: '只读文本' },
    { value: 'number', label: '数字' },
    { value: 'boolean', label: '开关' },
    { value: 'select', label: '下拉选择' },
    { value: 'autocomplete', label: '可输入下拉' },
    { value: 'date', label: '日期' },
    { value: 'datetime', label: '日期时间' },
    { value: 'file', label: '文件路径' },
    { value: 'image', label: '图片路径' },
    { value: 'object', label: '对象(JSON)' },
    { value: 'array', label: '数组(JSON)' },
    { value: 'map', label: '键值对' },
    { value: 'description', label: '说明(只读)' }
];

const GROUP_TYPES = [
    { value: 'normal', label: '普通（字段直接落在当前层级）' },
    { value: 'object', label: '对象（值嵌套在 name 下）' },
    { value: 'array', label: '数组（按条目模板重复）' }
];

type Path = (string | number)[];

const pathKey = (p: Path | null) => (p ? JSON.stringify(p) : '');

const getIn = (obj: any, path: Path): any => path.reduce((acc, k) => (acc == null ? acc : acc[k as any]), obj);

const setIn = (obj: any, path: Path, val: any): any => {
    if (path.length === 0) return val;
    const [k, ...rest] = path;
    const base = obj ?? (typeof k === 'number' ? [] : {});
    const clone: any = Array.isArray(base) ? [...base] : { ...base };
    clone[k as any] = setIn(base[k as any], rest, val);
    return clone;
};

const defaultForType = (t: string): any => {
    switch (t) {
        case 'number':
            return 0;
        case 'boolean':
            return false;
        case 'object':
        case 'map':
            return {};
        case 'array':
            return [];
        case 'description':
            return undefined;
        default:
            return '';
    }
};

const uniqueName = (existing: string[], base: string) => {
    let i = 1;
    let name = `${base}${i}`;
    while (existing.includes(name)) {
        i += 1;
        name = `${base}${i}`;
    }
    return name;
};

/** array 分组的子结构住在 ui.itemTemplate 里，其余分组就是自己。 */
const containerPathOf = (group: any, path: Path): Path =>
    group?.type === 'array' ? [...path, 'ui', 'itemTemplate'] : path;

/** 保存前把 order 按当前顺序重排，上移下移才是所见即所得。 */
const normalizeOrders = (container: any): any => {
    if (!container || typeof container !== 'object') return container;
    const out = { ...container };
    if (Array.isArray(out.fields)) {
        out.fields = out.fields.map((f: any, i: number) => ({ ...f, order: i * 10 }));
    }
    if (Array.isArray(out.groups)) {
        out.groups = out.groups.map((g: any, i: number) => {
            const next = { ...g, order: i * 10 };
            if (next.type === 'array') {
                next.ui = { ...(next.ui || {}), itemTemplate: normalizeOrders(next.ui?.itemTemplate || {}) };
            }
            return normalizeOrders(next);
        });
    }
    return out;
};

/** 按 defaultValue 生成一份初值，用于预览与「由 schema 创建配置」。 */
const buildDefaults = (container: any): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const f of container?.fields || []) {
        if (!f?.key || f.type === 'description') continue;
        out[f.key] = f.defaultValue !== undefined ? f.defaultValue : defaultForType(f.type);
    }
    for (const g of container?.groups || []) {
        if (!g?.name) continue;
        if (g.type === 'array') {
            out[g.name] = [];
        } else if (g.type === 'object') {
            out[g.name] = buildDefaults(g);
        } else {
            Object.assign(out, buildDefaults(g));
        }
    }
    return out;
};

const emptySchema = (prefix: string) => ({
    name: prefix,
    description: '',
    groups: [
        {
            name: 'General',
            label: '基础配置',
            order: 0,
            type: 'normal',
            collapsible: true,
            defaultCollapsed: false,
            fields: []
        }
    ]
});

type EditingField = { cpath: Path; index: number } | null;
type EditingGroup = { path: Path } | null;

const SchemaEditor: React.FC<{
    workspaceRoot: string;
    /** 初始选中的 schema（从某个配置条目进入时传入），不传则默认打开列表第一个 */
    boundPrefix?: string;
    onExit: () => void;
    onSchemaChanged?: () => void;
}> = ({ workspaceRoot, boundPrefix, onExit, onSchemaChanged }) => {
    const { token } = theme.useToken();

    const [list, setList] = useState<SchemaSummary[]>([]);
    const [prefix, setPrefix] = useState<string | null>(null);
    const [schema, setSchema] = useState<any>(null);
    const [savedVersion, setSavedVersion] = useState(0);
    const [note, setNote] = useState('');
    const [dirty, setDirty] = useState(false);
    const [tab, setTab] = useState<'structure' | 'source'>('structure');
    const [sourceText, setSourceText] = useState('');
    const [sourceError, setSourceError] = useState('');
    const [previewValues, setPreviewValues] = useState<Record<string, any>>({});
    const [previewOpen, setPreviewOpen] = useState(true);

    const [editingField, setEditingField] = useState<EditingField>(null);
    const [editingGroup, setEditingGroup] = useState<EditingGroup>(null);
    const [fieldForm] = Form.useForm();
    const [groupForm] = Form.useForm();

    const [history, setHistory] = useState<HistoryListResult | null>(null);
    const [diffAgainst, setDiffAgainst] = useState<{ file: string; text: string } | null>(null);

    // 「添加字段」统一放顶部，字段落到当前选中的容器里
    const [selectedCPath, setSelectedCPath] = useState<Path | null>(null);
    const [dragging, setDragging] = useState<{ cpath: Path; index: number } | null>(null);
    const [dragOver, setDragOver] = useState<{ cpath: Path; index: number } | null>(null);

    const sameContainer = (cpath: Path) => !!dragging && pathKey(dragging.cpath) === pathKey(cpath);
    const dropHint = (cpath: Path, index: number) =>
        !!dragOver && dragOver.index === index && pathKey(dragOver.cpath) === pathKey(cpath);

    const dropField = (cpath: Path, to: number) => {
        setDragOver(null);
        if (!sameContainer(cpath) || !dragging) return;
        const from = dragging.index;
        setDragging(null);
        if (from === to) return;
        const arr = (getIn(schema, [...cpath, 'fields']) || []).slice();
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        applySchema(setIn(schema, [...cpath, 'fields'], arr));
    };

    const root = workspaceRoot.trim();

    const reloadHistory = async (p = prefix) => {
        if (!root || !p) return;
        try {
            setHistory(await listSchemaHistory(root, p));
        } catch {
            // 还没保存过就没有 history 目录，静默即可
            setHistory(null);
        }
    };

    const reload = async (): Promise<SchemaSummary[]> => {
        if (!root) return [];
        try {
            const l = await listSchemas(root);
            setList(l);
            return l;
        } catch (e: any) {
            message.error(`加载 schema 列表失败: ${e?.message || String(e)}`);
            return [];
        }
    };

    const applySchema = (next: any, clean = false) => {
        setSchema(next);
        setSourceText(JSON.stringify(next, null, 2));
        setSourceError('');
        setDirty(!clean);
    };

    const openSchema = async (p: string) => {
        if (!root) return;
        try {
            const d = await readSchema(root, p);
            const parsed = d.text ? JSON.parse(d.text) : emptySchema(p);
            setPrefix(p);
            setSavedVersion(d.schemaVersion);
            setNote('');
            applySchema(parsed, true);
            // 默认选中第一个分组，省得用户点开就看到「请先选择分组」
            const first = parsed?.groups?.[0];
            setSelectedCPath(first ? containerPathOf(first, ['groups', 0]) : null);
            await reloadHistory(p);
        } catch (e: any) {
            message.error(`打开失败: ${e?.message || String(e)}`);
        }
    };

    useEffect(() => {
        (async () => {
            const l = await reload();
            // 绑定了配置就打开它；否则默认打开第一个，避免进来满屏空态
            const initial = boundPrefix || l[0]?.prefix;
            if (initial) await openSchema(initial);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root, boundPrefix]);

    /** 有未保存修改时先确认再执行：全屏视图里切换 schema / 加载历史很容易误触。 */
    const runIfNotDirty = (action: () => void, what: string) => {
        if (!dirty) {
            action();
            return;
        }
        Modal.confirm({
            title: '有未保存的修改',
            content: `当前 schema 的修改尚未保存，${what}后将丢失。确定继续吗？`,
            okText: '丢弃修改并继续',
            okButtonProps: { danger: true },
            cancelText: '继续编辑',
            onOk: action
        });
    };

    const exitEditor = () => runIfNotDirty(onExit, '返回');

    const onNew = () => {
        let name = '';
        Modal.confirm({
            title: '新建 Schema',
            content: (
                <Input
                    placeholder="名称（= 配置文件前缀，不含 / \\ : . ）"
                    onChange={(e) => {
                        name = e.target.value;
                    }}
                />
            ),
            okText: '创建',
            cancelText: '取消',
            onOk: () => {
                const p = name.trim();
                if (!p) {
                    message.error('名称不能为空');
                    return Promise.reject();
                }
                if (/[/\\:.]/.test(p)) {
                    message.error('名称不能包含 / \\ : .');
                    return Promise.reject();
                }
                if (list.some((s) => s.prefix === p)) {
                    message.error('同名 schema 已存在');
                    return Promise.reject();
                }
                setPrefix(p);
                setSavedVersion(0);
                setNote('');
                applySchema(emptySchema(p));
                setSelectedCPath(['groups', 0]);
                setHistory(null);
                message.info('已创建草稿，点击"保存"才会写入磁盘');
                return Promise.resolve();
            }
        });
    };

    const save = async () => {
        if (!root || !prefix || !schema) return;
        if (tab === 'source' && sourceError) {
            message.error('源码不是合法 JSON，已阻止保存');
            return;
        }
        try {
            const text = JSON.stringify(normalizeOrders(schema), null, 2);
            await saveSchema(root, prefix, text, note.trim());
            setNote('');
            await reload();
            await openSchema(prefix);
            onSchemaChanged?.();
            message.success('已保存（schema 版本 +1，旧版本已归档到 history）');
        } catch (e: any) {
            message.error(`保存失败: ${e?.message || String(e)}`);
        }
    };

    const onDelete = async () => {
        if (!root || !prefix) return;
        try {
            await deleteSchema(root, prefix);
            setPrefix(null);
            setSchema(null);
            setSavedVersion(0);
            setDirty(false);
            setHistory(null);
            await reload();
            onSchemaChanged?.();
            message.success('已删除（删除前已备份到 history）');
        } catch (e: any) {
            message.error(`删除失败: ${e?.message || String(e)}`);
        }
    };

    const createConfig = async () => {
        if (!root || !prefix || !schema) return;
        try {
            const content = JSON.stringify(buildDefaults(schema), null, 2);
            const res = await createEntry(root, prefix, 'json', content);
            await reload();
            onSchemaChanged?.();
            message.success(`已创建配置：${res.written_path}`);
        } catch (e: any) {
            message.error(`创建配置失败: ${e?.message || String(e)}`);
        }
    };

    const openDiff = async (file: string) => {
        if (!root || !prefix) return;
        try {
            const res = await readSchemaHistoryFile(root, prefix, file);
            setDiffAgainst({ file, text: res.content });
        } catch (e: any) {
            message.error(`读取历史失败: ${e?.message || String(e)}`);
        }
    };

    const loadHistory = (file: string) => {
        runIfNotDirty(async () => {
            if (!root || !prefix) return;
            try {
                const res = await readSchemaHistoryFile(root, prefix, file);
                applySchema(JSON.parse(res.content));
                setNote(`回滚自 ${file}`);
                message.info('已加载到编辑区（未写回磁盘，点击"保存"才会写回）');
            } catch (e: any) {
                message.error(`加载失败: ${e?.message || String(e)}`);
            }
        }, '加载历史版本');
    };

    // ---------------- 结构编辑 ----------------

    const addField = (cpath: Path, type = 'string') => {
        const fields = getIn(schema, [...cpath, 'fields']) || [];
        const key = uniqueName(fields.map((f: any) => f?.key), 'field');
        applySchema(
            setIn(schema, [...cpath, 'fields'], [
                ...fields,
                {
                    key,
                    label: key,
                    type,
                    defaultValue: defaultForType(type),
                    order: fields.length * 10,
                    validation: { required: false }
                }
            ])
        );
    };

    const addGroup = (cpath: Path) => {
        const groups = getIn(schema, [...cpath, 'groups']) || [];
        const name = uniqueName(groups.map((g: any) => g?.name), 'group');
        applySchema(
            setIn(schema, [...cpath, 'groups'], [
                ...groups,
                { name, label: name, type: 'normal', order: groups.length * 10, collapsible: true, fields: [], groups: [] }
            ])
        );
        setSelectedCPath([...cpath, 'groups', groups.length]);
    };

    const removeAt = (cpath: Path, kind: 'fields' | 'groups', index: number) => {
        const arr = (getIn(schema, [...cpath, kind]) || []).slice();
        arr.splice(index, 1);
        applySchema(setIn(schema, [...cpath, kind], arr));
    };

    const moveAt = (cpath: Path, kind: 'fields' | 'groups', index: number, delta: number) => {
        const arr = (getIn(schema, [...cpath, kind]) || []).slice();
        const to = index + delta;
        if (to < 0 || to >= arr.length) return;
        [arr[index], arr[to]] = [arr[to], arr[index]];
        applySchema(setIn(schema, [...cpath, kind], arr));
    };

    const openFieldModal = (cpath: Path, index: number) => {
        const f = getIn(schema, [...cpath, 'fields', index]) || {};
        fieldForm.setFieldsValue({
            key: f.key,
            label: f.label,
            type: f.type || 'string',
            description: f.description,
            required: !!f.validation?.required,
            placeholder: f.ui?.placeholder,
            defaultValue: f.defaultValue,
            optionsText: (f.options || []).map((o: any) => `${o.value}|${o.label ?? o.value}`).join('\n')
        });
        setEditingField({ cpath, index });
    };

    const submitField = async () => {
        if (!editingField) return;
        const v = await fieldForm.validateFields();
        const { cpath, index } = editingField;
        const prev = getIn(schema, [...cpath, 'fields', index]) || {};

        let defaultValue = v.defaultValue;
        if (['object', 'array', 'map'].includes(v.type)) {
            try {
                defaultValue = typeof v.defaultValue === 'string' ? JSON.parse(v.defaultValue || 'null') : v.defaultValue;
            } catch {
                message.error('默认值不是合法 JSON');
                return;
            }
        }
        if (defaultValue === undefined) defaultValue = defaultForType(v.type);

        const options = String(v.optionsText || '')
            .split('\n')
            .map((line: string) => line.trim())
            .filter(Boolean)
            .map((line: string) => {
                const [value, label] = line.split('|');
                return { value, label: label ?? value };
            });

        const next: any = {
            ...prev,
            key: v.key,
            label: v.label || v.key,
            type: v.type,
            description: v.description || undefined,
            defaultValue,
            validation: { ...(prev.validation || {}), required: !!v.required },
            ui: { ...(prev.ui || {}), placeholder: v.placeholder || undefined }
        };
        if (options.length) next.options = options;
        else delete next.options;

        applySchema(setIn(schema, [...cpath, 'fields', index], next));
        setEditingField(null);
    };

    const openGroupModal = (path: Path) => {
        const g = getIn(schema, path) || {};
        groupForm.setFieldsValue({
            name: g.name,
            label: g.label,
            type: g.type || 'normal',
            widget: g.ui?.widget,
            collapsible: !!g.collapsible,
            defaultCollapsed: !!g.defaultCollapsed,
            itemLabel: g.ui?.itemLabel,
            addButtonText: g.ui?.addButtonText
        });
        setEditingGroup({ path });
    };

    const submitGroup = async () => {
        if (!editingGroup) return;
        const v = await groupForm.validateFields();
        const prev = getIn(schema, editingGroup.path) || {};
        const next: any = {
            ...prev,
            name: v.name,
            label: v.label || v.name,
            type: v.type,
            collapsible: !!v.collapsible,
            defaultCollapsed: !!v.defaultCollapsed,
            ui: {
                ...(prev.ui || {}),
                widget: v.widget || undefined,
                itemLabel: v.itemLabel || undefined,
                addButtonText: v.addButtonText || undefined
            }
        };
        // 切成 array 时补一个空模板，否则 DynamicForm 渲染不出条目
        if (v.type === 'array' && !next.ui.itemTemplate) {
            next.ui.itemTemplate = { fields: [], groups: [] };
        }
        applySchema(setIn(schema, editingGroup.path, next));
        setEditingGroup(null);
    };

    const editingFieldType = Form.useWatch('type', fieldForm);
    const editingGroupType = Form.useWatch('type', groupForm);

    const renderContainer = (cpath: Path, depth: number): React.ReactNode => {
        const fields = getIn(schema, [...cpath, 'fields']) || [];
        const groups = getIn(schema, [...cpath, 'groups']) || [];

        return (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {fields.map((f: any, i: number) => (
                    <Row
                        key={`${f?.key}-${i}`}
                        align="middle"
                        gutter={8}
                        style={{
                            width: '100%',
                            cursor: 'grab',
                            borderTop: dropHint(cpath, i) ? `2px solid ${'#1677ff'}` : '2px solid transparent'
                        }}
                        draggable
                        onDragStart={() => setDragging({ cpath, index: i })}
                        onDragEnd={() => {
                            setDragging(null);
                            setDragOver(null);
                        }}
                        onDragOver={(e) => {
                            if (!sameContainer(cpath)) return;
                            e.preventDefault();
                            // dragover 每几毫秒就触发一次，位置没变就别重渲染
                            if (!dropHint(cpath, i)) setDragOver({ cpath, index: i });
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            dropField(cpath, i);
                        }}
                    >
                        <Col flex="auto">
                            <Space size={6}>
                                <Text type="secondary">⋮⋮</Text>
                                <Text strong>{f?.label || f?.key}</Text>
                                <Text type="secondary">{f?.key}</Text>
                                <Tag>{f?.type}</Tag>
                                {f?.validation?.required && <Tag color="red">必填</Tag>}
                            </Space>
                        </Col>
                        <Col>
                            <Space size={0}>
                                <Button type="link" size="small" onClick={() => moveAt(cpath, 'fields', i, -1)}>
                                    ↑
                                </Button>
                                <Button type="link" size="small" onClick={() => moveAt(cpath, 'fields', i, 1)}>
                                    ↓
                                </Button>
                                <Button type="link" size="small" onClick={() => openFieldModal(cpath, i)}>
                                    编辑
                                </Button>
                                <Popconfirm title="删除该字段？" onConfirm={() => removeAt(cpath, 'fields', i)}>
                                    <Button type="link" size="small" danger>
                                        删除
                                    </Button>
                                </Popconfirm>
                            </Space>
                        </Col>
                    </Row>
                ))}

                {groups.map((g: any, i: number) => {
                    const gpath = [...cpath, 'groups', i];
                    const inner = containerPathOf(g, gpath);
                    const selected = pathKey(inner) === pathKey(selectedCPath);
                    return (
                        <Card
                            key={`${g?.name}-${i}`}
                            size="small"
                            style={selected ? { outline: '2px solid #1677ff' } : undefined}
                            onClick={(e) => {
                                // 只认最内层那次点击，否则父分组会跟着被选中
                                e.stopPropagation();
                                setSelectedCPath(inner);
                            }}
                            title={
                                <Space size={6}>
                                    {selected && <Tag color="blue">已选</Tag>}
                                    <Text strong>{g?.label || g?.name}</Text>
                                    <Text type="secondary">{g?.name}</Text>
                                    <Tag color={g?.type === 'array' ? 'purple' : g?.type === 'object' ? 'blue' : undefined}>
                                        {g?.type || 'normal'}
                                    </Tag>
                                </Space>
                            }
                            extra={
                                <Space size={0}>
                                    <Button type="link" size="small" onClick={() => moveAt(cpath, 'groups', i, -1)}>
                                        ↑
                                    </Button>
                                    <Button type="link" size="small" onClick={() => moveAt(cpath, 'groups', i, 1)}>
                                        ↓
                                    </Button>
                                    <Button type="link" size="small" onClick={() => openGroupModal(gpath)}>
                                        编辑
                                    </Button>
                                    <Popconfirm title="删除该分组及其内容？" onConfirm={() => removeAt(cpath, 'groups', i)}>
                                        <Button type="link" size="small" danger>
                                            删除
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            }
                        >
                            {g?.type === 'array' && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    以下是「条目模板」，数组的每一项都按它渲染
                                </Text>
                            )}
                            {renderContainer(containerPathOf(g, gpath), depth + 1)}
                        </Card>
                    );
                })}

                <Space>
                    <Button size="small" onClick={() => addGroup(cpath)}>
                        + 分组
                    </Button>
                </Space>
            </Space>
        );
    };

    // 选中的容器可能是 array 分组的 ui.itemTemplate，回退两级才是分组本身
    const selectedGroupLabel = useMemo(() => {
        if (!schema || !selectedCPath) return '';
        const isTemplate = selectedCPath.slice(-2).join('/') === 'ui/itemTemplate';
        const gpath = isTemplate ? selectedCPath.slice(0, -2) : selectedCPath;
        const g = getIn(schema, gpath);
        if (!g) return '';
        const label = g.label || g.name || '';
        return isTemplate ? `${label} · 条目模板` : label;
    }, [schema, selectedCPath]);

    const previewMeta = useMemo(
        () =>
            schema
                ? {
                      schemaName: prefix || '',
                      schema: { version: '', title: schema.name || prefix || '', description: schema.description || '' },
                      groups: schema.groups || []
                  }
                : null,
        [schema, prefix]
    );

    useEffect(() => {
        if (schema) setPreviewValues(buildDefaults(schema));
    }, [schema]);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: token.colorBgLayout }}>
            {/* 顶栏：返回 / schema 切换 / 版本信息 / 保存等操作 */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    padding: '8px 16px',
                    background: token.colorBgContainer,
                    borderBottom: `1px solid ${token.colorBorder}`
                }}
            >
                <Button onClick={exitEditor}>← 返回</Button>
                <Select
                    showSearch
                    placeholder="选择 schema"
                    value={prefix ?? undefined}
                    onChange={(p) => runIfNotDirty(() => void openSchema(p), '切换 schema')}
                    style={{ minWidth: 220 }}
                    options={list.map((s) => ({
                        value: s.prefix,
                        label: s.schemaVersion > 0 ? `${s.prefix} · v${s.schemaVersion}` : s.prefix
                    }))}
                />
                <Button onClick={() => runIfNotDirty(onNew, '新建')}>新建</Button>
                <Button
                    onClick={() => {
                        void reload();
                        if (prefix) void reloadHistory(prefix);
                    }}
                >
                    刷新
                </Button>
                <Tag color="blue">{savedVersion > 0 ? `schema v${savedVersion}` : '未保存'}</Tag>
                {dirty && <Tag color="orange">有未保存修改</Tag>}
                <div style={{ flex: 1 }} />
                <Input
                    placeholder="本次改动备注（可选）"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={{ width: 200 }}
                />
                <Button onClick={() => void createConfig()} disabled={!schema}>
                    由 schema 创建配置
                </Button>
                <Popconfirm title="删除该 schema？（会先备份到 history）" onConfirm={() => void onDelete()}>
                    <Button danger disabled={savedVersion === 0}>
                        删除
                    </Button>
                </Popconfirm>
                <Button type="primary" onClick={() => void save()} disabled={!schema}>
                    保存
                </Button>
                <Button onClick={() => setPreviewOpen((v) => !v)}>{previewOpen ? '隐藏预览' : '显示预览'}</Button>
            </div>

            {/* 主体三栏：左版本列表 / 中工作区 / 右实时预览，各自独立滚动 */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                <div
                    style={{
                        width: 280,
                        flexShrink: 0,
                        overflowY: 'auto',
                        padding: 12,
                        background: token.colorBgContainer,
                        borderRight: `1px solid ${token.colorBorder}`
                    }}
                >
                    <Card size="small" style={{ marginBottom: 8 }}>
                        <Space size={6} wrap>
                            <Text strong>{prefix ?? '未选择 schema'}</Text>
                            <Tag color="blue">{savedVersion > 0 ? `当前 v${savedVersion}` : '未保存'}</Tag>
                        </Space>
                    </Card>
                    <List
                        size="small"
                        bordered
                        header={<Text strong>历史版本</Text>}
                        dataSource={history?.entries || []}
                        locale={{ emptyText: '暂无历史版本（保存第二次后开始记录）' }}
                        renderItem={(item) => (
                            <List.Item
                                actions={[
                                    <Button key="diff" type="link" size="small" onClick={() => void openDiff(item.file)}>
                                        对比
                                    </Button>,
                                    <Button key="load" type="link" size="small" onClick={() => loadHistory(item.file)}>
                                        加载
                                    </Button>
                                ]}
                            >
                                <List.Item.Meta
                                    title={<Text strong>{item.version > 0 ? `v${item.version}` : '未记录版本'}</Text>}
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
                </div>

                <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16 }}>
                    {!schema ? (
                        <Card size="small">
                            <Empty description="请从顶部选择 schema，或点击「新建」" />
                        </Card>
                    ) : (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            {savedVersion > 0 && (
                                <Alert
                                    type="info"
                                    showIcon
                                    message={`保存后 schema 将升到 v${savedVersion + 1}；已有配置不会被改写，下次打开配置时会提示版本差异。`}
                                />
                            )}
                            <Tabs
                                activeKey={tab}
                                onChange={(k) => setTab(k as 'structure' | 'source')}
                                items={[
                                    {
                                        key: 'structure',
                                        label: '结构',
                                        children: (
                                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                                <Space wrap>
                                                    <Input
                                                        addonBefore="名称"
                                                        value={schema.name || ''}
                                                        onChange={(e) => applySchema({ ...schema, name: e.target.value })}
                                                        style={{ width: 260 }}
                                                    />
                                                    <Input
                                                        addonBefore="描述"
                                                        value={schema.description || ''}
                                                        onChange={(e) =>
                                                            applySchema({ ...schema, description: e.target.value })
                                                        }
                                                        style={{ width: 420 }}
                                                    />
                                                </Space>
                                                <Card
                                                    size="small"
                                                    title="添加字段"
                                                    extra={
                                                        <Text type="secondary">
                                                            {selectedGroupLabel
                                                                ? `添加到：${selectedGroupLabel}`
                                                                : '请先在下方点选一个分组'}
                                                        </Text>
                                                    }
                                                >
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        {FIELD_TYPES.map((t) => (
                                                            <Button
                                                                key={t.value}
                                                                size="small"
                                                                disabled={!selectedGroupLabel}
                                                                onClick={() => addField(selectedCPath as Path, t.value)}
                                                            >
                                                                + {t.label}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </Card>
                                                {renderContainer([], 0)}
                                            </Space>
                                        )
                                    },
                                    {
                                        key: 'source',
                                        label: '源码',
                                        children: (
                                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                                {sourceError && <Alert type="error" showIcon message={sourceError} />}
                                                <Input.TextArea
                                                    value={sourceText}
                                                    autoSize={{ minRows: 24 }}
                                                    onChange={(e) => {
                                                        const text = e.target.value;
                                                        setSourceText(text);
                                                        setDirty(true);
                                                        try {
                                                            const parsed = JSON.parse(text);
                                                            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                                                setSourceError('顶层必须是 JSON 对象');
                                                                return;
                                                            }
                                                            setSchema(parsed);
                                                            setSourceError('');
                                                        } catch (err: any) {
                                                            setSourceError(err?.message || 'JSON 解析失败');
                                                        }
                                                    }}
                                                />
                                            </Space>
                                        )
                                    }
                                ]}
                            />
                        </Space>
                    )}
                </div>

                {previewOpen && (
                    <div
                        style={{
                            width: '38%',
                            minWidth: 380,
                            flexShrink: 0,
                            overflowY: 'auto',
                            padding: 16,
                            background: token.colorBgContainer,
                            borderLeft: `1px solid ${token.colorBorder}`
                        }}
                    >
                        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Space size={6}>
                                <Text strong>实时预览</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    随编辑实时更新
                                </Text>
                            </Space>
                            <Button
                                size="small"
                                disabled={!schema}
                                onClick={() => setPreviewValues(buildDefaults(schema))}
                            >
                                重置预览值
                            </Button>
                        </Space>
                        {previewMeta ? (
                            <DynamicForm
                                formMeta={previewMeta as any}
                                values={previewValues}
                                errors={[]}
                                onChange={(k, v) => setPreviewValues((prev) => ({ ...prev, [k]: v }))}
                            />
                        ) : (
                            <Empty description="先选择 schema 才能预览" />
                        )}
                    </div>
                )}
            </div>

            <Modal
                title="编辑字段"
                open={!!editingField}
                onCancel={() => setEditingField(null)}
                onOk={() => void submitField()}
                destroyOnClose
            >
                <Form form={fieldForm} layout="vertical" preserve={false}>
                    <Form.Item name="key" label="key（写进配置文件的键名）" rules={[{ required: true, message: '必填' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="label" label="显示名">
                        <Input />
                    </Form.Item>
                    <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                        <Select options={FIELD_TYPES} />
                    </Form.Item>
                    <Form.Item name="defaultValue" label={['object', 'array', 'map'].includes(editingFieldType) ? '默认值（JSON）' : '默认值'}>
                        {editingFieldType === 'boolean' ? (
                            <Switch />
                        ) : editingFieldType === 'number' ? (
                            <InputNumber style={{ width: '100%' }} />
                        ) : ['object', 'array', 'map'].includes(editingFieldType) ? (
                            <Input.TextArea autoSize={{ minRows: 3 }} />
                        ) : (
                            <Input />
                        )}
                    </Form.Item>
                    {['select', 'autocomplete'].includes(editingFieldType) && (
                        <Form.Item name="optionsText" label="选项（每行一条，value|label）">
                            <Input.TextArea autoSize={{ minRows: 3 }} />
                        </Form.Item>
                    )}
                    <Form.Item name="placeholder" label="占位提示">
                        <Input />
                    </Form.Item>
                    <Form.Item name="description" label="说明">
                        <Input />
                    </Form.Item>
                    <Form.Item name="required" label="必填" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="编辑分组"
                open={!!editingGroup}
                onCancel={() => setEditingGroup(null)}
                onOk={() => void submitGroup()}
                destroyOnClose
            >
                <Form form={groupForm} layout="vertical" preserve={false}>
                    <Form.Item name="name" label="name（对象/数组分组会用它作为配置里的键名）" rules={[{ required: true, message: '必填' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="label" label="显示名">
                        <Input />
                    </Form.Item>
                    <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                        <Select options={GROUP_TYPES} />
                    </Form.Item>
                    <Form.Item name="widget" label="展示方式">
                        <Select
                            allowClear
                            options={[
                                { value: 'card', label: 'card' },
                                { value: 'collapse', label: 'collapse' },
                                { value: 'tabs', label: 'tabs（子分组分页）' }
                            ]}
                        />
                    </Form.Item>
                    {editingGroupType === 'array' && (
                        <>
                            <Form.Item name="itemLabel" label="条目标签">
                                <Input placeholder="项" />
                            </Form.Item>
                            <Form.Item name="addButtonText" label="新增按钮文案">
                                <Input placeholder="添加项" />
                            </Form.Item>
                        </>
                    )}
                    <Form.Item name="collapsible" label="可折叠" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item name="defaultCollapsed" label="默认折叠" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={`版本对比：${diffAgainst?.file ?? ''} → 当前编辑区`}
                open={!!diffAgainst}
                onCancel={() => setDiffAgainst(null)}
                footer={null}
                width={900}
            >
                <Text type="secondary" style={{ fontSize: 12 }}>
                    红色 = 历史版本有、当前没有；绿色 = 当前新增
                </Text>
                <div
                    style={{
                        marginTop: 8,
                        maxHeight: '65vh',
                        overflow: 'auto',
                        fontFamily: 'Consolas, Menlo, monospace',
                        fontSize: 12,
                        border: '1px solid #f0f0f0'
                    }}
                >
                    {diffAgainst &&
                        diffLines(diffAgainst.text, JSON.stringify(schema, null, 2)).map((d, i) => (
                            <div
                                key={i}
                                style={{
                                    whiteSpace: 'pre-wrap',
                                    padding: '0 8px',
                                    background: d.tag === '+' ? '#f6ffed' : d.tag === '-' ? '#fff1f0' : undefined,
                                    color: d.tag === '+' ? '#237804' : d.tag === '-' ? '#a8071a' : undefined
                                }}
                            >
                                {d.tag}
                                {d.text}
                            </div>
                        ))}
                </div>
            </Modal>
        </div>
    );
};

export default SchemaEditor;

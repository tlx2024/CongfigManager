// Copyright (C) 2026 tlx2024
// SPDX-License-Identifier: AGPL-3.0-or-later
import React, { useMemo, useState } from 'react';
import {
    Alert,
    AutoComplete,
    Button,
    Card,
    Collapse,
    DatePicker,
    Form,
    Image,
    Input,
    InputNumber,
    Select,
    Space,
    Switch,
    Tabs,
    Typography,
    message
} from 'antd';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Text } = Typography;

/**
 * 没有条目模板时的兜底 JSON 编辑器。
 * 关键点：输入过程中 JSON 非法就不写回 —— 直接把文本塞回去会把一个对象变成字符串写进配置。
 */
const JsonTextArea: React.FC<{ value: any; disabled?: boolean; onCommit: (v: any) => void }> = ({
    value,
    disabled,
    onCommit
}) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
    const [draft, setDraft] = useState<string | null>(null);

    let invalid = false;
    if (draft !== null) {
        try {
            JSON.parse(draft);
        } catch {
            invalid = true;
        }
    }

    return (
        <>
            <TextArea
                value={draft ?? text}
                disabled={disabled}
                autoSize
                onChange={(e) => {
                    const raw = e.target.value;
                    setDraft(raw);
                    try {
                        onCommit(JSON.parse(raw));
                    } catch {
                        // 非法 JSON 期间只留在草稿里，不写回 values
                    }
                }}
                onBlur={() => setDraft(null)}
            />
            {invalid ? <Text type="danger">JSON 格式不正确，本次输入未写回</Text> : null}
        </>
    );
};

interface Field {
    key: string;
    type: string;
    label: string;
    description?: string;
    placeholder?: string;
    defaultValue?: any;
    fields?: Field[];
    ui?: {
        widget?: string;
        min?: number;
        max?: number;
        step?: number;
        readonly?: boolean;
        allowCustom?: boolean;
        customLabel?: string;
        level?: 'info' | 'warning' | 'error' | 'success';
        accept?: string;
        itemLabel?: string;      // type: 'map' / 'array' 的条目标签
        addButtonText?: string;  // type: 'map' / 'array' 的新增按钮文案
        // field 级 array 也可以带条目模板，语义与 group.ui.itemTemplate 相同
        itemTemplate?: {
            fields?: Field[];
            groups?: Group[];
        };
    };
    validation?: {
        required?: boolean;
        minimum?: number;
        maximum?: number;
        minLength?: number;
        maxLength?: number;
        pattern?: string;
        enum?: any[];
    };
    options?: Array<{ value: any; label: string }>;
    dependsOn?:
    | {
        field: string;
        value: any;
        operator?: string;
    }
    | null;
    order: number;
}

interface Group {
    name: string;
    order: number;
    label?: string;
    collapsible?: boolean;
    defaultCollapsed?: boolean;
    type?: 'normal' | 'array' | 'object';
    fields?: Field[];
    groups?: Group[];
    ui?: {
        widget?: 'tabs' | 'collapse' | 'card';
        itemLabel?: string;
        addButtonText?: string;
        collapsible?: boolean;
        itemTemplate?: {
            fields?: Field[];
            groups?: Group[];
        };
    };
}

interface FormMeta {
    schemaName: string;
    schema: {
        version: string;
        title: string;
        description: string;
    };
    groups: Group[];
}

interface DynamicFormProps {
    formMeta: FormMeta;
    values: Record<string, any>;
    errors: Array<{ field: string; message: string; code: string }>;
    onChange: (key: string, value: any) => void;
}

const DynamicForm: React.FC<DynamicFormProps> = ({ formMeta, values, errors, onChange }) => {
    const [collapsedKeys, setCollapsedKeys] = useState<Record<string, boolean>>({});

    const isCollapsed = (key: string) => !!collapsedKeys[key];
    const toggleCollapsed = (key: string) => {
        setCollapsedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const groupFieldKeys = (group: Group): string[] => {
        const out: string[] = [];
        const walkFields = (fields?: Field[]) => {
            if (!fields) return;
            for (const f of fields) {
                if (!f?.key) continue;
                if (f.type === 'description') continue;
                out.push(f.key);
                if (f.type === 'object') walkFields(f.fields);
            }
        };
        const walkGroups = (groups?: Group[]) => {
            if (!groups) return;
            for (const g of groups) {
                walkFields(g.fields);
                walkGroups(g.groups);
            }
        };

        walkFields(group.fields);
        walkGroups(group.groups);

        return Array.from(new Set(out));
    };

    const shouldHideGroup = (group: Group, ctxValues: Record<string, any>) => {
        const title = String(group.label || group.name || '');
        const isBase = title === '基础配置' || title.toLowerCase() === 'general';
        if (!isBase) return false;

        const hasContent = !!(group.fields && group.fields.length) || !!(group.groups && group.groups.length);
        if (!hasContent) return true;

        const keys = groupFieldKeys(group);
        if (keys.length === 0) return true;

        return keys.every((k) => {
            const v = ctxValues?.[k];
            return v === undefined || v === null || v === '';
        });
    };
    const shouldShowField = (field: Field, ctxValues: Record<string, any>): boolean => {
        if (!field.dependsOn) return true;

        const { field: depField, value: depValue, operator = '==' } = field.dependsOn;
        const actualValue = ctxValues[depField];

        if (actualValue === undefined) return false;

        switch (operator) {
            case '==':
                return actualValue === depValue;
            case '!=':
                return actualValue !== depValue;
            case '>':
                return actualValue > depValue;
            case '<':
                return actualValue < depValue;
            case '>=':
                return actualValue >= depValue;
            case '<=':
                return actualValue <= depValue;
            default:
                return true;
        }
    };

    const getFieldError = (key: string) => {
        return errors.find((e) => e.field === key);
    };

    const buildItemDefaultFromTemplate = (tpl?: { fields?: Field[]; groups?: Group[] }) => {
        const item: Record<string, any> = {};

        const addFieldDefaults = (fields?: Field[]) => {
            if (!fields) return;
            for (const f of fields) {
                if (!f?.key) continue;
                if (f.type === 'description') continue;
                if (f.defaultValue !== undefined) {
                    item[f.key] = f.defaultValue;
                } else {
                    switch (f.type) {
                        case 'boolean':
                            item[f.key] = false;
                            break;
                        case 'number':
                            item[f.key] = 0;
                            break;
                        case 'object':
                            item[f.key] = {};
                            break;
                        default:
                            item[f.key] = '';
                    }
                }
            }
        };

        const walkGroups = (groups?: Group[]) => {
            if (!groups) return;
            for (const g of groups) {
                addFieldDefaults(g.fields);
                if (g.groups && g.groups.length > 0) walkGroups(g.groups);
            }
        };

        addFieldDefaults(tpl?.fields);
        walkGroups(tpl?.groups);

        return item;
    };

    const renderFieldWithAccess = (
        field: Field,
        ctxValues: Record<string, any>,
        setValue: (key: string, value: any) => void,
        errorKeyOverride?: string
    ) => {
        if (!field?.key) return null;
        if (!shouldShowField(field, ctxValues)) return null;

        const value = ctxValues[field.key] ?? field.defaultValue;
        const error = getFieldError(errorKeyOverride || field.key);
        const widget = field.ui?.widget || field.type;
        const { min, max, step, readonly, allowCustom, customLabel, level } = field.ui || {};
        const { required } = field.validation || {};

        // field 级 array 的条目模板：ui.itemTemplate 优先，其次沿用 field.fields
        const rawArrayTpl = field.ui?.itemTemplate || (field.type === 'array' ? { fields: field.fields } : undefined);
        const arrayTpl =
            (rawArrayTpl?.fields || []).some((f) => !!f?.key && f.type !== 'description') ||
            (rawArrayTpl?.groups || []).length > 0
                ? rawArrayTpl
                : undefined;

        const commonProps = {
            value,
            disabled: readonly,
            onChange: (val: any) => setValue(field.key, val)
        };

        let control: React.ReactNode = null;

        const selectOptions: Array<{ value: any; label: string }> =
            field.options && field.options.length > 0
                ? field.options
                : (field.validation?.enum || []).map((v) => ({ value: v, label: String(v) }));

        switch (widget) {
            case 'text':
                control = (
                    <Input
                        {...commonProps}
                        placeholder={field.placeholder || undefined}
                        onChange={(e) => setValue(field.key, e.target.value)}
                    />
                );
                break;

            // Config Manager：不提供 Web 上传能力；仅保留路径/URL 手工输入
            case 'file': {
                const current = typeof value === 'string' ? value : '';
                control = (
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Input
                            value={current}
                            placeholder={field.placeholder || '文件路径/URL'}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            disabled={readonly}
                        />
                        <Space>
                            <Button onClick={() => setValue(field.key, '')} disabled={readonly}>
                                清除
                            </Button>
                            <Button
                                onClick={() => {
                                    if (!current) return;
                                    try {
                                        window.open(current, '_blank', 'noopener,noreferrer');
                                    } catch {
                                        // ignore
                                    }
                                }}
                                disabled={!current}
                            >
                                新窗口打开
                            </Button>
                        </Space>
                        {!current ? <Text type="secondary">未选择文件</Text> : null}
                    </Space>
                );
                break;
            }

            // Config Manager：不提供 Web 上传能力；保留 URL 输入 + 预览
            case 'image': {
                const current = typeof value === 'string' ? value : '';
                control = (
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Input
                            value={current}
                            placeholder={field.placeholder || '图片 URL'}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            disabled={readonly}
                        />
                        {current ? (
                            <Image src={current} alt={field.label} style={{ maxHeight: 240 }} />
                        ) : (
                            <Text type="secondary">未设置图片</Text>
                        )}
                    </Space>
                );
                break;
            }

            case 'string':
                control = (
                    <Input
                        {...commonProps}
                        placeholder={field.placeholder || undefined}
                        onChange={(e) => setValue(field.key, e.target.value)}
                    />
                );
                break;

            case 'textarea':
                control = (
                    <TextArea
                        {...commonProps}
                        placeholder={field.placeholder || undefined}
                        onChange={(e) => setValue(field.key, e.target.value)}
                        autoSize
                    />
                );
                break;

            case 'number':
                control = (
                    <InputNumber
                        {...commonProps}
                        style={{ width: '100%' }}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(val) => setValue(field.key, val)}
                    />
                );
                break;

            case 'date':
                control = (
                    <DatePicker
                        style={{ width: '100%' }}
                        value={value ? dayjs(value) : null}
                        onChange={(d) => setValue(field.key, d ? d.format('YYYY-MM-DD') : '')}
                        disabled={readonly}
                    />
                );
                break;

            case 'datetime':
                control = (
                    <DatePicker
                        showTime
                        style={{ width: '100%' }}
                        value={value ? dayjs(value) : null}
                        onChange={(d) => setValue(field.key, d ? d.format('YYYY-MM-DD HH:mm:ss') : '')}
                        disabled={readonly}
                    />
                );
                break;

            case 'boolean':
                control = <Switch checked={!!value} onChange={(checked) => setValue(field.key, checked)} disabled={readonly} />;
                break;

            case 'select':
                control = (
                    <Select
                        value={value}
                        options={selectOptions}
                        onChange={(val) => setValue(field.key, val)}
                        disabled={readonly}
                        style={{ width: '100%' }}
                    />
                );
                break;

            case 'autocomplete':
                control = (
                    <AutoComplete
                        value={value}
                        options={selectOptions.map((o) => ({ value: o.value, label: o.label }))}
                        onChange={(val) => setValue(field.key, val)}
                        onSelect={(val) => setValue(field.key, val)}
                        disabled={readonly}
                        style={{ width: '100%' }}
                        placeholder={field.placeholder || undefined}
                    />
                );
                break;

            case 'array': {
                const arr: any[] = Array.isArray(value) ? value : [];
                const itemLabel = field.ui?.itemLabel || field.label || '项';

                control = (
                    <Space direction="vertical" style={{ width: '100%' }}>
                        {arr.map((item, idx) => {
                            const itemValues = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
                            const onItemChange = (k: string, v: any) => {
                                const next = [...arr];
                                next[idx] = { ...itemValues, [k]: v };
                                setValue(field.key, next);
                            };

                            return (
                                <Card
                                    size="small"
                                    key={idx}
                                    title={`${itemLabel} #${idx + 1}`}
                                    extra={
                                        <Button
                                            danger
                                            size="small"
                                            onClick={() => {
                                                const next = [...arr];
                                                next.splice(idx, 1);
                                                setValue(field.key, next);
                                            }}
                                            disabled={readonly}
                                        >
                                            删除
                                        </Button>
                                    }
                                >
                                    {arrayTpl ? (
                                        renderGroupWithContext(
                                            {
                                                name: `${field.key}#${idx}`,
                                                order: 0,
                                                fields: arrayTpl.fields || [],
                                                groups: arrayTpl.groups || []
                                            },
                                            itemValues,
                                            onItemChange
                                        )
                                    ) : (
                                        <JsonTextArea
                                            value={item}
                                            disabled={readonly}
                                            onCommit={(v) => {
                                                const next = [...arr];
                                                next[idx] = v;
                                                setValue(field.key, next);
                                            }}
                                        />
                                    )}
                                </Card>
                            );
                        })}
                        <Button
                            onClick={() => {
                                setValue(field.key, [...arr, arrayTpl ? buildItemDefaultFromTemplate(arrayTpl) : '']);
                            }}
                            disabled={readonly}
                        >
                            {field.ui?.addButtonText || `添加${itemLabel}`}
                        </Button>
                    </Space>
                );
                break;
            }

            case 'object': {
                const obj: Record<string, any> = value && typeof value === 'object' ? value : {};
                const fields = field.fields || [];

                if (Array.isArray(fields) && fields.length > 0) {
                    control = (
                        <Space direction="vertical" style={{ width: '100%' }}>
                            {fields
                                .filter((f) => !!f?.key && f.type !== 'description')
                                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                                .map((f) => (
                                    // renderFieldWithAccess 自己就返回带 label 的 Form.Item，
                                    // 这里不能再包一层，否则标签渲染两遍（"日志目录：日志目录："）
                                    <React.Fragment key={f.key}>
                                        {renderFieldWithAccess(
                                            f,
                                            obj,
                                            (k, v) => {
                                                setValue(field.key, { ...obj, [k]: v });
                                            },
                                            `${field.key}.${f.key}`
                                        )}
                                    </React.Fragment>
                                ))}
                        </Space>
                    );
                } else {
                    // 对齐 apps/web：当 object 没有 fields schema 时，仍允许查看/编辑 JSON
                    control = (
                        <JsonTextArea
                            value={value && typeof value === 'object' ? value : {}}
                            disabled={readonly}
                            onCommit={(v) => setValue(field.key, v)}
                        />
                    );
                }
                break;
            }

            // 键是 id 的字典（如 camera-models 的 models、plc-points 的 tables）。
            // 和 array 的区别只在于"键名由人填"，其余照 field.fields 渲染子表单。
            case 'map': {
                const obj: Record<string, any> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
                const entries = Object.entries(obj);
                const tpl = (field.fields || []).filter((f) => !!f?.key && f.type !== 'description');
                const itemLabel = field.ui?.itemLabel || '条目';

                // Object.fromEntries 后面的键会吃掉前面的同名键，那就是静默丢一整条配置。
                // 改名撞车时直接不接受这次输入。
                const commit = (next: Array<[string, any]>) => {
                    const keys = next.map(([k]) => k);
                    if (new Set(keys).size !== keys.length) return;
                    setValue(field.key, Object.fromEntries(next));
                };

                control = (
                    <Space direction="vertical" style={{ width: '100%' }}>
                        {entries.map(([entryKey, entryValue], idx) => {
                            // 折叠键用下标而不是键名，改名时才不会重挂组件、输入框才不会掉焦点
                            const collapsedKey = `map:${field.key}:${idx}`;
                            const itemValues = entryValue && typeof entryValue === 'object' ? entryValue : {};

                            return (
                                <Collapse
                                    key={collapsedKey}
                                    activeKey={isCollapsed(collapsedKey) ? [] : [collapsedKey]}
                                    onChange={() => toggleCollapsed(collapsedKey)}
                                    items={[
                                        {
                                            key: collapsedKey,
                                            label: `${itemLabel} ${entryKey}`,
                                            extra: (
                                                <Button
                                                    danger
                                                    size="small"
                                                    disabled={readonly}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        commit(entries.filter((_, i) => i !== idx));
                                                    }}
                                                >
                                                    删除
                                                </Button>
                                            ),
                                            children: (
                                                <Space direction="vertical" style={{ width: '100%' }}>
                                                    <Form.Item label="键名" required>
                                                        <Input
                                                            value={entryKey}
                                                            disabled={readonly}
                                                            onChange={(e) => {
                                                                const next: Array<[string, any]> = [...entries];
                                                                next[idx] = [e.target.value, entryValue];
                                                                commit(next);
                                                            }}
                                                        />
                                                    </Form.Item>

                                                    {tpl.length > 0
                                                        ? tpl
                                                            .slice()
                                                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                                                            .map((f) => (
                                                                <React.Fragment key={f.key}>
                                                                    {renderFieldWithAccess(
                                                                        f,
                                                                        itemValues,
                                                                        (k, v) => {
                                                                            const next: Array<[string, any]> = [...entries];
                                                                            next[idx] = [entryKey, { ...itemValues, [k]: v }];
                                                                            commit(next);
                                                                        },
                                                                        `${field.key}.${entryKey}.${f.key}`
                                                                    )}
                                                                </React.Fragment>
                                                            ))
                                                        : (
                                                            // 值是标量的字典（如 logging.categories: 类别 -> 级别）
                                                            <Form.Item label="值">
                                                                <Input
                                                                    value={typeof entryValue === 'string' ? entryValue : JSON.stringify(entryValue)}
                                                                    disabled={readonly}
                                                                    onChange={(e) => {
                                                                        const next: Array<[string, any]> = [...entries];
                                                                        next[idx] = [entryKey, e.target.value];
                                                                        commit(next);
                                                                    }}
                                                                />
                                                            </Form.Item>
                                                        )}
                                                </Space>
                                            )
                                        }
                                    ]}
                                />
                            );
                        })}

                        <Button
                            disabled={readonly}
                            onClick={() => {
                                let n = entries.length + 1;
                                while (obj[`new-${n}`] !== undefined) n++;
                                commit([...entries, [`new-${n}`, tpl.length > 0 ? buildItemDefaultFromTemplate({ fields: tpl }) : '']]);
                                message.success(`已添加一${itemLabel}`);
                            }}
                        >
                            {field.ui?.addButtonText || `添加${itemLabel}`}
                        </Button>
                    </Space>
                );
                break;
            }

            case 'description':
                control = <Text type={level ? (level === 'error' ? 'danger' : level === 'warning' ? 'warning' : undefined) : undefined}>{field.description || value}</Text>;
                break;

            default:
                control = (
                    <Input
                        {...commonProps}
                        placeholder={field.placeholder || undefined}
                        onChange={(e) => setValue(field.key, e.target.value)}
                    />
                );
                break;
        }

        // 说明放在控件下方：跟在 label 后面会把 label 列撑得很宽
        const descriptionNode = field.description ? (
            <Text type="secondary" style={{ display: 'block', marginTop: 4, whiteSpace: 'normal', lineHeight: 1.5 }}>
                {field.description}
            </Text>
        ) : null;

        // 容器型字段（map / 带 fields 的 object / 带条目模板的 array）语义上就是一个分组，
        // 塞进 Form.Item 的控件位会把整棵子树挤在右半栏，这里改成整行 Card。
        const isContainer =
            widget === 'map' ||
            (widget === 'object' && (field.fields || []).length > 0) ||
            (widget === 'array' && !!arrayTpl);

        if (isContainer) {
            return (
                <Card
                    key={field.key}
                    size="small"
                    style={{ width: '100%' }}
                    title={
                        <Space size={4}>
                            {required ? <Text type="danger">*</Text> : null}
                            <Text strong>{field.label}</Text>
                        </Space>
                    }
                >
                    {control}
                    {descriptionNode}
                    {error ? <Text type="danger">{error.message}</Text> : null}
                </Card>
            );
        }

        return (
            <Form.Item
                key={field.key}
                label={field.label}
                required={!!required}
                validateStatus={error ? 'error' : undefined}
                help={error ? error.message : undefined}
                extra={descriptionNode}
            >
                {control}
            </Form.Item>
        );
    };

    const renderGroupWithContext = (group: Group, ctxValues: Record<string, any>, ctxOnChange: (k: string, v: any) => void): React.ReactNode => {
        const setValue = (k: string, v: any) => ctxOnChange(k, v);

        const sortedFields = (group.fields || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const sortedGroups = (group.groups || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const fieldNodes = sortedFields
            .filter((f) => !!f?.key && f.type !== 'description')
            .map((f) => renderFieldWithAccess(f, ctxValues, setValue));

        const descriptionNodes = sortedFields
            .filter((f) => !!f?.key && f.type === 'description')
            .map((f) => (
                <Alert
                    key={f.key}
                    type={(f.ui?.level as any) || 'info'}
                    message={f.label}
                    description={f.description || ''}
                    showIcon
                />
            ));

        const nestedGroupNodes = sortedGroups.map((g) => renderGroup(g, ctxValues, ctxOnChange));

        return (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {descriptionNodes}
                {fieldNodes}
                {nestedGroupNodes}
            </Space>
        );
    };

    const renderObjectGroup = (group: Group, ctxValues: Record<string, any>, ctxOnChange: (k: string, v: any) => void) => {
        const objKey = group.name;
        const obj: Record<string, any> =
            ctxValues && typeof ctxValues === 'object' && !Array.isArray(ctxValues) && ctxValues[objKey] && typeof ctxValues[objKey] === 'object'
                ? ctxValues[objKey]
                : {};

        const onObjChange = (k: string, v: any) => {
            ctxOnChange(objKey, { ...obj, [k]: v });
        };

        // 允许 object 分组继续使用 group.fields / group.groups 进行深度嵌入
        return renderGroupWithContext(
            {
                ...group,
                // name 用于 key，但内部字段仍按 field.key 写入 obj
                name: `${group.name}.__object__`,
                type: 'normal'
            },
            obj,
            onObjChange
        );
    };

    const renderArrayGroup = (group: Group, ctxValues: Record<string, any>, ctxOnChange: (k: string, v: any) => void) => {
        const arrayKey = group.name;
        const arr: any[] = Array.isArray(ctxValues[arrayKey]) ? ctxValues[arrayKey] : [];
        const tpl = group.ui?.itemTemplate;

        const arrayCollapsedKey = `group:${arrayKey}`;

        return (
            <Space direction="vertical" style={{ width: '100%' }}>
                <Collapse
                    activeKey={isCollapsed(arrayCollapsedKey) ? [] : [arrayCollapsedKey]}
                    onChange={() => toggleCollapsed(arrayCollapsedKey)}
                    items={[
                        {
                            key: arrayCollapsedKey,
                            label: group.label || group.name,
                            children: (
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    {arr.map((item, idx) => {
                                        const itemValues = item && typeof item === 'object' ? item : {};
                                        const title = group.ui?.itemLabel ? `${group.ui.itemLabel} ${idx + 1}` : `项 ${idx + 1}`;

                                        const itemCollapsedKey = `group:${arrayKey}:item:${idx}`;

                                        const onItemChange = (k: string, v: any) => {
                                            const next = [...arr];
                                            next[idx] = { ...itemValues, [k]: v };
                                            ctxOnChange(arrayKey, next);
                                        };

                                        return (
                                            <Collapse
                                                key={itemCollapsedKey}
                                                activeKey={isCollapsed(itemCollapsedKey) ? [] : [itemCollapsedKey]}
                                                onChange={() => toggleCollapsed(itemCollapsedKey)}
                                                items={[
                                                    {
                                                        key: itemCollapsedKey,
                                                        label: title,
                                                        extra: (
                                                            <Button
                                                                danger
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    const next = [...arr];
                                                                    next.splice(idx, 1);
                                                                    ctxOnChange(arrayKey, next);
                                                                }}
                                                            >
                                                                删除
                                                            </Button>
                                                        ),
                                                        children: renderGroupWithContext(
                                                            {
                                                                name: `${group.name}#${idx}`,
                                                                order: group.order,
                                                                fields: tpl?.fields || [],
                                                                groups: tpl?.groups || []
                                                            },
                                                            itemValues,
                                                            onItemChange
                                                        )
                                                    }
                                                ]}
                                            />
                                        );
                                    })}

                                    <Button
                                        onClick={() => {
                                            const next = [...arr];
                                            next.push(buildItemDefaultFromTemplate(tpl));
                                            ctxOnChange(arrayKey, next);
                                            message.success('已添加一项');
                                        }}
                                    >
                                        {group.ui?.addButtonText || '添加项'}
                                    </Button>
                                </Space>
                            )
                        }
                    ]}
                />
            </Space>
        );
    };

    const renderGroup = (group: Group, ctxValues: Record<string, any>, ctxOnChange: (k: string, v: any) => void): React.ReactNode => {
        if (shouldHideGroup(group, ctxValues)) return null;

        // array 分组自己就带了一个标题栏（Collapse），外面再包 Card/Collapse 会出现两三层同名标题
        if (group.type === 'array') {
            return <React.Fragment key={group.name}>{renderArrayGroup(group, ctxValues, ctxOnChange)}</React.Fragment>;
        }

        const content =
            group.type === 'object'
                    ? renderObjectGroup(group, ctxValues, ctxOnChange)
                    : renderGroupWithContext(group, ctxValues, ctxOnChange);

        const title = group.label || group.name;

        if (group.ui?.widget === 'card') {
            return (
                <Card key={group.name} title={title} size="small">
                    {content}
                </Card>
            );
        }

        if (group.ui?.widget === 'tabs' && group.groups && group.groups.length > 0) {
            return (
                <Tabs
                    key={group.name}
                    items={(group.groups || []).map((g) => ({
                        key: g.name,
                        label: g.label || g.name,
                        // tabs 作为容器时，子分组仍需走 renderGroup 才能支持 array/object 等复杂类型
                        children: renderGroup(g, ctxValues, (k, v) => ctxOnChange(k, v))
                    }))}
                />
            );
        }

        const collapsible = !!group.collapsible || !!group.ui?.collapsible;
        if (collapsible) {
            return (
                <Collapse
                    key={group.name}
                    defaultActiveKey={group.defaultCollapsed ? [] : [group.name]}
                    items={[{ key: group.name, label: title, children: content }]}
                />
            );
        }

        return (
            <Card key={group.name} title={title} size="small">
                {content}
            </Card>
        );
    };

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Card size="small" title={formMeta.schema?.title || formMeta.schemaName}>
                {formMeta.schema?.description ? <Text type="secondary">{formMeta.schema.description}</Text> : null}
            </Card>

            {(formMeta.groups || []).length > 0 ? (
                <Tabs
                    items={(formMeta.groups || [])
                        .slice()
                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                        .map((g) => ({
                            key: g.name,
                            label: g.label || g.name,
                            children: renderGroup(g, values, (k, v) => onChange(k, v))
                        }))}
                />
            ) : (
                <Card size="small">
                    <Text type="secondary">无可用分组（schema.groups 为空）</Text>
                </Card>
            )}
        </Space>
    );
};

export default DynamicForm;

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
                control = (
                    <Space direction="vertical" style={{ width: '100%' }}>
                        {arr.map((item, idx) => (
                            <Card
                                size="small"
                                key={idx}
                                title={field.label ? `${field.label} #${idx + 1}` : `项 #${idx + 1}`}
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
                                <TextArea
                                    value={typeof item === 'string' ? item : JSON.stringify(item, null, 2)}
                                    onChange={(e) => {
                                        const next = [...arr];
                                        next[idx] = e.target.value;
                                        setValue(field.key, next);
                                    }}
                                    autoSize
                                    disabled={readonly}
                                />
                            </Card>
                        ))}
                        <Button
                            onClick={() => {
                                const next = [...arr, ''];
                                setValue(field.key, next);
                            }}
                            disabled={readonly}
                        >
                            添加
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
                                    <Form.Item key={f.key} label={f.label} required={!!f.validation?.required}>
                                        {renderFieldWithAccess(
                                            f,
                                            obj,
                                            (k, v) => {
                                                setValue(field.key, { ...obj, [k]: v });
                                            },
                                            `${field.key}.${f.key}`
                                        )}
                                    </Form.Item>
                                ))}
                        </Space>
                    );
                } else {
                    // 对齐 apps/web：当 object 没有 fields schema 时，仍允许查看/编辑 JSON
                    control = (
                        <TextArea
                            value={typeof value === 'object' ? JSON.stringify(value ?? {}, null, 2) : '{}'}
                            onChange={(e) => {
                                try {
                                    const nextObj = JSON.parse(e.target.value);
                                    setValue(field.key, nextObj);
                                } catch {
                                    // typing... ignore invalid JSON
                                }
                            }}
                            rows={6}
                            disabled={readonly}
                        />
                    );
                }
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

        return (
            <Form.Item
                key={field.key}
                label={
                    <Space>
                        <Text>{field.label}</Text>
                        {field.description ? <Text type="secondary">{field.description}</Text> : null}
                    </Space>
                }
                required={!!required}
                validateStatus={error ? 'error' : undefined}
                help={error ? error.message : undefined}
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

        const content =
            group.type === 'array'
                ? renderArrayGroup(group, ctxValues, ctxOnChange)
                : group.type === 'object'
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

# Schema 与 Config 版本化方案

状态：阶段一、阶段二实施中
日期：2026-08-21（2026-08-21 补充 schema 创建/编辑）
适用仓库：ConfigManager（Tauri + React，`src-tauri/src/main.rs` + `frontend/`）

## 1. 现状

- 配置目录约定：`<configRoot>/<prefix>.json|xml`、`schemas/<prefix>.schema.json`、`history/`。
- 已有的"版本"能力仅为：保存前把旧配置复制到 `history/<prefix>__YYYYMMDD_HHMMSS_mmm.<ext>`（`backup_existing`），前端只能"加载最新备份"。
- 缺口：
  1. 无法知道某份配置是按哪一版 schema 写的；
  2. schema 改字段后，旧配置不会迁移，只能靠表单默认值兜底，且无提示；
  3. history 只有文件名时间戳，没有备注/作者/来源，无法列表、比对、指定回滚；
  4. schema 自身没有版本，`generate_default_schemas` 覆盖判断只靠 `createdBy` + 描述前缀，很脆弱。

## 2. 目标与非目标

目标：
- schema 有明确版本号，配置能记录"我是按哪版 schema 保存的"。
- schema 能在本工具内**创建与编辑**（不必手写 JSON 文件），每次保存自动升版并留历史。
- 版本不匹配时给出明确提示，可执行的升级路径。
- history 可列表、可加备注、可指定回滚，而不只是"最新一份"。

非目标（明确不做）：
- 不内嵌 git，不做分支/合并。
- 不做通用迁移 DSL 引擎（除非阶段三真的被需要）。
- 不改变配置文件本身的结构 —— 配置由外部程序（ConfigReader）消费，**任何 meta 字段都不写进配置文件**。
- schema 编辑器不做 ConfigReader Web 版 `SchemaDesigner` 的全套能力（拖拽排序、图片/文件上传预览、XSD 联动）。只做"结构树增删改 + 源码 + 预览"，其余留给源码模式。

## 3. 核心设计决策

### 3.1 schema 版本：写在 schema 文件里

`schemas/<prefix>.schema.json` 顶层新增两个字段（现有解析对未知字段是宽松的，向后兼容）：

```json
{
  "schemaVersion": 3,
  "schemaId": "algorithms",
  "createdAt": 1767860704,
  "createdBy": "tlx",
  "groups": [ ... ]
}
```

- `schemaVersion`：**单调递增整数**，不用 semver。理由：这里只需要"能不能比大小 / 要不要迁移"，semver 的 major/minor 语义在单机配置场景没有消费者去区分，反而增加解析与约定成本。
- 缺省视为 `1`，老 schema 无需改动即可工作。
- `generate_default_schemas` 重新生成时 `schemaVersion += 1`，并保留覆盖保护（仅覆盖自动生成的 schema）。

### 3.2 config 版本：旁路 meta 文件，不污染配置

新增 `<configRoot>/.meta/<prefix>.meta.json`：

```json
{
  "prefix": "algorithms",
  "configVersion": 12,
  "schemaVersion": 3,
  "updatedAt": 1767860704,
  "updatedBy": "tlx",
  "hash": "sha256:...",
  "note": "新增 RandomBox 算法"
}
```

- `configVersion`：每次保存 +1。
- `schemaVersion`：保存时当前 schema 的版本，这就是"配置按哪版 schema 写的"。
- `hash`：配置文件内容哈希，用于检测**绕过本工具的外部修改**（meta 与实际文件不符 → 提示"文件已被外部修改"）。
- meta 文件缺失 = 未纳管，按 `configVersion=0 / schemaVersion=unknown` 处理，不报错。
- `.meta/` 与 `history/` 一样受 `ensure_within_root` 边界校验。

> 为什么不写进配置文件：配置被外部程序按固定结构读取，注入 `_meta` 有破坏消费者的风险；XML 场景更麻烦。旁路文件零风险，代价只是多一个目录。

### 3.3 history 升级为版本清单

保留现有 `history/<prefix>__<ts>.<ext>` 文件命名（不迁移历史数据），新增 `history/<prefix>.index.json`：

```json
{
  "entries": [
    { "version": 11, "file": "algorithms__20260821_190812_331.json",
      "at": 1767860704, "by": "tlx", "schemaVersion": 3,
      "hash": "sha256:...", "note": "回滚前快照" }
  ]
}
```

- 保存时：先备份旧文件（现有逻辑）→ 追加一条 index 记录 → 写新配置 → 更新 meta。
- index 缺失或落后于目录中的实际文件时，**以目录扫描为准重建 index**（文件是事实来源，index 只是加速与备注载体）。这样即使 index 损坏也不会丢历史。
- 保留策略：默认保留最近 N=50 份 + 所有带 `note` 的版本，超出的旧文件在保存时清理。N 写进 `.meta/settings.json`，不做 UI 配置项。

### 3.4 Schema 创建与编辑

数据模型**沿用 ConfigReader `apps/web/frontend/src/pages/SchemaDesigner.tsx` 的 groups 模型**（本仓库 `DynamicForm.tsx` 消费的就是同一套结构），不另造一套：

```
schema := { schemaVersion, name, description, createdAt/By, updatedAt/By, groups: Group[] }
Group  := { name, label, order, type: normal|object|array,
            collapsible, defaultCollapsed,
            fields: Field[], groups: Group[],
            ui: { widget: tabs|collapse|card, itemLabel, addButtonText,
                  itemTemplate: { fields, groups } } }   // type=array 用 itemTemplate
Field  := { key, label, type, defaultValue, order, description,
            validation: { required, minimum, maximum, minLength, maxLength, pattern, enum },
            ui: { widget, placeholder, readonly, ... }, options, dependsOn }
```

编辑器只做三件事，刻意不追平 Web 版：

1. **结构**：groups/fields 的树形增删改 + 上移下移（`order` 重排），字段属性用一个 Modal 编辑。
2. **源码**：整份 schema JSON 的文本编辑，非法 JSON 不允许保存。
3. **预览**：直接把当前 schema 喂给 `DynamicForm` 渲染，看到的就是使用者看到的表单。

字段类型取 `DynamicForm` 实际支持的集合：`string / text / textarea / number / boolean / select / autocomplete / date / datetime / file / image / object / array / map / description`。**编辑器的类型下拉必须以 `DynamicForm` 的 `switch (widget)` 为准**，多给一个类型就是给用户挖一个渲染不出来的坑。

### 3.5 Schema 的保存语义

`save_schema(root, prefix, text, note)`：

1. 校验 `text` 是合法 JSON 且顶层是对象（不合法直接拒绝，绝不落盘）。
2. 读旧文件的 `schemaVersion`（缺省 1）→ 新版本 = 旧 + 1；文件不存在 = 新建，版本 1。
3. 旧文件备份到 `history/<prefix>.schema_<ts>.json`，并追加一条 `history/<prefix>.schema.index.json` 记录（带 note）。
4. 覆盖写入 `schemaVersion` / `updatedAt` / `updatedBy`，原子写。

复用配置那套 history 机制，只是把"键"从 `<prefix>` 换成 `<stem> = <prefix>.schema`。因为备份名是 `<stem>_<ts>.<ext>`，`algorithms.schema_...` 不会被 `algorithms_` 前缀扫描命中，两条历史线天然隔离，不需要新目录。

**schema 升版后不触碰任何配置文件**：配置的 `.meta` 仍记着旧 `schemaVersion`，下次打开该配置时由第 4 节的横幅提示用户，用户点保存才对齐。这是 §4 "升级永不静默改写磁盘"的直接推论。

### 3.6 新建 schema 之后

新 schema 若没有同名配置文件，条目列表（按配置文件扫描）看不到它。因此提供 `create_entry(root, prefix, format, content)`：文件不存在才创建，随后走正常保存路径（备份 + meta）。前端按 schema 的 `defaultValue` 生成初值，用户确认后创建。已存在同名配置则直接报错，不覆盖。

## 4. 版本不匹配的处理策略

打开条目时比较 `meta.schemaVersion` 与 schema 文件的 `schemaVersion`：

| 情况 | 处理 |
| --- | --- |
| 相等 | 正常渲染 |
| meta 缺失 | 正常渲染，保存时补建 meta |
| config 版本 < schema 版本 | 顶部黄条提示"schema 已升级 vN→vM"，渲染时按 schema 补齐缺失字段的 `defaultValue`（**只在表单层补，不自动写盘**），用户点保存才落地 |
| config 版本 > schema 版本 | 红条提示"配置比 schema 新，可能 schema 被回退"，只允许源码模式编辑，避免表单丢字段 |
| hash 与实际文件不符 | 提示"文件被外部修改"，以磁盘内容为准，保存前强制生成一次备份 |

关键约束：**升级永不静默改写磁盘**。这是配置管理工具，静默改写会毁掉用户对备份的信任。

## 5. 迁移脚本（阶段三，按需）

先不做迁移引擎。第 4 节的"默认值补齐 + 提示"能覆盖绝大多数演进（加字段、改默认值、加分组）。
只有当出现**重命名字段 / 结构搬迁**这类默认值救不了的场景，再引入最小迁移描述：

`schemas/migrations/<prefix>/v2-v3.json`
```json
{ "ops": [
  { "op": "rename", "from": "libPath", "to": "lib_path_windows" },
  { "op": "remove", "path": "legacyFlag" },
  { "op": "set",    "path": "enabled", "value": true }
] }
```

三个算子（rename / remove / set）足够，按版本号链式执行 v_config → v_schema。
迁移预览必须展示 diff 并需用户确认，不自动执行。

## 6. 分阶段实施

**阶段一：能看见版本（已完成）**
1. ~~Rust：`schemaVersion` 读取（缺省 1）；`.meta/<prefix>.meta.json` 读写；保存流程串起 backup → index → write → meta。~~
2. ~~Rust 新增命令：`read_entry_meta`、`list_history`、`read_history_file`（回滚只加载到编辑区，由用户点保存写回，回滚本身也留备份）。~~
3. ~~前端：标题栏显示 `configVersion / schemaVersion`；保存时可填 `note`。~~
4. ~~自检：Rust 单测覆盖"保存两次 → configVersion 1→2，history 两条，index 丢失可按目录重建，外部改动可被 hash 检出，路径穿越被拒"。~~

**阶段二：能操作历史（已完成 5、6）**
5. ~~历史抽屉：版本列表（时间、作者、备注、schemaVersion），加载指定版本到编辑区。~~
6. ~~版本不匹配横幅（第 4 节表格）+ 外部修改横幅。~~
7. history 保留策略清理（N=50 + 带 note 的全留）—— 未做，等历史真的多到影响使用再说。

**阶段二·补：schema 创建与编辑（本次）**
8. Rust：history 辅助函数由 `prefix` 泛化为 `stem`，`list_schemas` / `read_schema` / `save_schema` / `delete_schema` / `list_schema_history` / `read_schema_history_file` / `create_entry`。
9. 前端：Schema 编辑页 —— 列表（prefix + 版本 + 是否有配置）／结构树编辑／源码／预览／历史抽屉。
10. 自检：Rust 单测覆盖"新建 schema = v1，再保存 = v2，history 一条，非法 JSON 被拒，schema 历史与配置历史互不串"。

**阶段三：按需**
11. 迁移算子（第 5 节），只在真出现重命名需求时做。
12. 导出"配置包"（config + schema + meta 打包 zip）用于交付/分发。

## 7. 影响面

- `src-tauri/src/main.rs`：`backup_existing`、`save_entry_text`、`list_entries_impl`、`generate_default_schemas`；新增 meta/index 模块；schema CRUD 命令。
- `frontend/src/`：条目加载、保存按钮、历史 UI；新增 `pages/SchemaEditor.tsx`。
- 兼容性：所有新文件缺失时均按"未纳管"降级，老工作区可直接打开，不需要迁移动作。
- README 的"工作区约定"章节需补 `.meta/` 与 `history/*.index.json`。

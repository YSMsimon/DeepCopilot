# Deep Copilot v0.35.0 — Skills · 行内补全 · Plan 模式 · 项目规则

> 本版本集中交付五项新能力：技能系统升级为一等公民、DeepSeek FIM 行内补全、Plan 只读调查模式、项目级 AI 规则发现，以及一批稳定性修复。

---

## 🇨🇳 中文说明

### 一、技能（Skills）升级为一等公民 ⭐ (#61)

**背景**

早期的技能功能只是把 SKILL.md 的内容粗暴地拼入系统提示词，既无元数据解析、也无工作区门控，重复技能会互相覆盖，排序完全随机。

**本次改动**

- **三目录扫描**：按优先顺序依次扫描 `~/.deepcopilot/skills`、`~/.claude/skills`、`~/.copilot/skills`，同名技能以首个找到的为准（不覆盖）。
- **YAML 前置元数据**：每个技能目录下的 `SKILL.md` 支持标准 YAML frontmatter：
  ```yaml
  ---
  name: my-skill
  description: "一句话描述，模型用来判断何时唤起"
  argument-hint: "<工具名或关键词>"
  source: self | web | hybrid
  trust: trusted | untrusted
  applies_to: ["package.json:vue", "**/*.vue"]   # 工作区门控
  ---
  ```
- **稳定排序**：技能列表按名称字母序排列，确保每次加载顺序一致。
- **工作区门控（`applies_to`）**：支持 `package.json:key` 语法检测依赖，支持 Glob 检测文件，不匹配当前工作区的技能自动跳过。
- **`skill_invoke` 工具**：模型可主动调用 `skill_invoke` 来按需加载技能，技能内容以合成的 `read_file` tool_call + tool_result 对注入消息队列，与用户主动触发路径完全一致。
- **斜杠命令 `/skill <name>`**：在输入框直接键入 `/skill 技能名` 即可手动唤起技能（兼容原有斜杠命令体系）。

---

### 二、DeepSeek FIM 行内补全（Ghost Text）💡 (#60)

**默认关闭**，通过设置启用：
```json
"deepCopilot.inlineCompletion.enable": true
```

**工作方式**

- 在编辑器中停止输入约 350ms 后，自动以当前光标上下文（前缀最多 4000 字符、后缀最多 2000 字符）调用 DeepSeek `/beta/completions` FIM 接口。
- 建议以"幽灵文字"（ghost text）形式呈现，按 `Tab` 接受，继续输入直接丢弃。
- **静默失败**：任何 API 错误均不弹出通知，只是不提供补全建议，不干扰正常编辑。
- **自动取消**：每次击键都会取消上一个在途请求（AbortController），避免过时建议被展示。
- **安全**：API 主机严格校验（只允许 `api.deepseek.com`），FIM 错误日志脱敏（不打印完整 key）。

---

### 三、Plan 交互模式（只读调查）📋 (#66)

在输入框左侧的模式选择器中新增 **Plan** 模式。

**行为**

- Agent 进入 Plan 模式后，系统提示词追加只读约束：只允许读取文件、搜索代码、列目录，**禁止**调用 `write_file`、`run_shell`、`apply_patch`（会收到工具错误）。
- 适合在动手修改之前先彻底摸清代码结构、依赖关系、影响范围，做到"先谋后动"。
- 模式标识存在会话状态中，切换会话时自动恢复上次的模式设置。

**与其他模式的关系**

| 模式 | 读文件 | 写文件 | 执行命令 |
|------|--------|--------|---------|
| Ask  | ✅     | ❌     | ❌      |
| Plan | ✅     | ❌     | ❌      |
| Agent| ✅     | ✅（受审批）| ✅（受审批）|

> Ask 与 Plan 的区别：Plan 模式仍驱动完整的 Agent 工具循环，只是在工具层面拦截写操作；Ask 模式直接禁用工具调用，只做单轮对话。

---

### 四、项目级 AI 规则自动发现 📐 (#64)

Deep Copilot 现在会自动扫描工作区根目录下的主流 AI 规则文件，并将其内容注入系统提示词，让模型了解项目约定：

| 文件路径 | 来源工具 |
|---------|---------|
| `DEEPCOPILOT.md` | Deep Copilot 原生 |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `AGENTS.md` | OpenAI Codex |
| `.cursor/rules/*.mdc` | Cursor |
| `CLAUDE.md` | Claude Code |

多个文件同时存在时，按上表顺序全部注入（总量不超过 8 KB，超出自动截断）。

---

### 五、自动压缩通知 📢 (#82)

当对话上下文超出预算，触发自动压缩（AUTOCOMPACT）时，聊天界面中会出现一条**持久通知卡片**：

```
⚡ 上下文已自动压缩
   早期工具结果已移除以节省 token。当前对话仍可继续。
```

通知不可关闭（防止误删），始终显示在历史记录的对应位置，帮助用户理解"为什么模型似乎忘记了之前的工具输出"。

---

### 六、稳定性修复

| 修复编号 | 描述 |
|---------|------|
| #89/#91 | **Autopilot 跳过危险命令弹窗**：在 `autopilot` 模式下，高危命令（如 `rm -rf`）的确认对话框被静默放行，并加入每会话批准缓存，避免重复提示。 |
| #69/#84 | **Shell 卡死检测**：新增心跳超时机制，进程超时先发 SIGTERM，再发 SIGKILL；`timeout_ms` 输入值做合法性检查，防止非法值导致无限等待。 |
| #70/#83 | **会话存储孤立工具消息修复**：修复了会话回放时因 `tool_call_id` 悬挂导致的 HTTP 400 错误，自动愈合历史记录中的孤立工具消息。 |
| #71/#81 | **IME 输入法 Enter 防误触**：中文/日文输入法选词时按 Enter 不再误触发消息发送（popover 的 `applyPop()` 也同样修复）。 |

---

### 受影响文件

| 文件 | 变更内容 |
|------|---------|
| `package.json` | 版本升至 0.35.0；新增 `inlineCompletion.enable`、`interactionMode` 配置项 |
| `src/skills.js` | 全量重写：三目录扫描、YAML 解析、稳定排序、工作区门控 |
| `src/completion/provider.js` | 新文件：FIM 行内补全 Provider |
| `src/api/deepseek.js` | 新增 `fimComplete()`；主机校验收紧；FIM 错误日志脱敏 |
| `src/chat/agent-loop.js` | 注入 skill 合成消息、`skill_invoke` 工具处理 |
| `src/chat/provider.js` | Plan 模式状态持久化；interactionMode 切换逻辑 |
| `src/chat/compact.js` | AUTOCOMPACT 持久通知注入 |
| `src/prompts/system.js` | 项目规则文件发现；Plan 模式只读约束 |
| `src/tools/shell.js` | 危险命令 autopilot 放行 + 会话缓存 |
| `src/tools/exec.js` | Shell 心跳超时 + SIGKILL 兜底 |
| `src/chat/session-store.js` | 孤立工具消息自愈 |
| `media/chat.js` | IME composition Enter 防护；AUTOCOMPACT 通知渲染 |

---

## 🇺🇸 English Release Notes

### 1. Skills as a First-Class Agent Citizen ⭐ (#61)

**Background**

Previously, skills were simply concatenated into the system prompt with no metadata, no workspace gating, and no stable ordering — duplicate skill names silently overwrote each other.

**What changed**

- **Three-directory scan**: scanned in priority order — `~/.deepcopilot/skills`, `~/.claude/skills`, `~/.copilot/skills`. First match for a duplicate name wins; later directories cannot override it.
- **YAML frontmatter**: each skill's `SKILL.md` supports a standard header:
  ```yaml
  ---
  name: my-skill
  description: "One-line hint the model uses to decide when to invoke it"
  argument-hint: "<tool name or keyword>"
  source: self | web | hybrid
  trust: trusted | untrusted
  applies_to: ["package.json:vue", "**/*.vue"]   # workspace gating
  ---
  ```
- **Stable sort**: skills are listed alphabetically, guaranteeing a deterministic injection order every time.
- **Workspace gating (`applies_to`)**: supports `package.json:<key>` to detect installed dependencies and Glob patterns to detect files; skills that don't match the current workspace are silently skipped.
- **`skill_invoke` tool**: the model can proactively load a skill on demand; the skill body is injected as a synthetic `read_file` tool-call/result pair — identical to user-triggered invocation.
- **`/skill <name>` slash command**: users can manually trigger a skill from the input box (integrated with the existing slash-command system).

---

### 2. DeepSeek FIM Inline Completions (Ghost Text) 💡 (#60)

**Disabled by default.** Enable via VS Code settings:
```json
"deepCopilot.inlineCompletion.enable": true
```

**How it works**

- After ~350 ms of inactivity, the surrounding context (up to 4 000 chars prefix, 2 000 chars suffix) is sent to DeepSeek's `/beta/completions` FIM endpoint.
- The suggestion appears as **ghost text**; press `Tab` to accept, or keep typing to dismiss.
- **Silent failure**: any API error is swallowed — no toast, no disruption to normal editing.
- **Auto-cancel**: every keystroke cancels the in-flight request (`AbortController`) so stale suggestions are never shown.
- **Security**: API host is validated strictly (`api.deepseek.com` only); FIM error logs are sanitised — no full key ever printed.

---

### 3. Plan Interaction Mode (Read-Only Investigation) 📋 (#66)

A new **Plan** option is available in the mode selector on the left side of the input box.

**Behaviour**

- While in Plan mode, the system prompt appends a read-only constraint: only `read_file`, `grep_search`, `find_files`, and `list_dir` are permitted. Any attempt to call `write_file`, `run_shell`, or `apply_patch` returns a tool error.
- Ideal for mapping out a codebase, understanding dependencies, and estimating scope — *before* touching anything.
- Mode preference is persisted per session and restored on re-open.

**Comparison with other modes**

| Mode  | Read files | Write files | Run shell |
|-------|------------|-------------|-----------|
| Ask   | ✅          | ❌           | ❌         |
| Plan  | ✅          | ❌           | ❌         |
| Agent | ✅          | ✅ (approval)| ✅ (approval)|

> Plan vs Ask: Plan still drives the full agent tool loop (multi-turn, chained tool calls); Ask fires a single turn with no tools. Use Plan for structured investigation, Ask for quick Q&A.

---

### 4. Ecosystem AI-Rule File Discovery 📐 (#64)

Deep Copilot now automatically discovers project-level AI instruction files and injects their contents into the system prompt, so the model always knows your project conventions:

| File path | Origin tool |
|-----------|-------------|
| `DEEPCOPILOT.md` | Deep Copilot native |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `AGENTS.md` | OpenAI Codex |
| `.cursor/rules/*.mdc` | Cursor |
| `CLAUDE.md` | Claude Code |

When multiple files are present, all are injected in the order above (total capped at 8 KB; excess is silently truncated).

---

### 5. AUTOCOMPACT Persistent Notice 📢 (#82)

When context exceeds the budget and auto-compaction fires, a **persistent in-chat notice card** is inserted:

```
⚡ Context was automatically compacted
   Older tool results were dropped to save tokens. The conversation continues normally.
```

The card is permanent (cannot be dismissed) and appears at the correct position in the history, helping users understand why the model may appear to have "forgotten" earlier tool outputs.

---

### 6. Bug Fixes

| Fix | Description |
|-----|-------------|
| #89/#91 | **Skip danger-cmd modal in Autopilot**: in `autopilot` mode, the high-risk command confirmation dialog is silently bypassed. A per-session approval cache prevents repeated prompts. |
| #69/#84 | **Shell hung-process detection**: a heartbeat timeout mechanism sends SIGTERM then SIGKILL; `timeout_ms` input is validated to prevent infinite waits from invalid values. |
| #70/#83 | **Orphan tool message healing**: fixes HTTP 400 errors caused by dangling `tool_call_id` references during session replay; orphaned tool messages are automatically healed. |
| #71/#81 | **IME Enter guard**: pressing Enter during CJK IME composition no longer accidentally submits a message (also fixed in `applyPop()` for the `/` popover). |

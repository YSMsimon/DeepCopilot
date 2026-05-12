## Deep Copilot v0.30.2

### Install · 安装

Download **deep-copilot-0.30.2.vsix** from the Assets below, then:

```
code --install-extension deep-copilot-0.30.2.vsix --force
```

Or: VS Code Extensions panel → `⋯` → **Install from VSIX...**

---

## Highlights · 本次更新概览

**EN** v0.30.2 ships three major capability upgrades: native skill discovery (compatible with GitHub Copilot's `~/.claude/skills` layout), full image-attachment support via DeepSeek's vision API, and a comprehensive file-management cleanup that fixes path bugs and consolidates all logo assets.

**中文** v0.30.2 带来三项核心升级：原生 Skill 发现机制（兼容 GitHub Copilot 的 `~/.claude/skills` 目录约定）、通过 DeepSeek 视觉 API 实现完整图片附件支持，以及一次彻底的文件管理整治（修复路径 bug、统一 logo 资产位置）。

---

## What's New · 本版亮点

### 🧩 Skill Discovery · Skill 自动发现

**EN** DeepCopilot now scans `~/.claude/skills/` and `~/.copilot/skills/` at startup for `SKILL.md` files (same convention as GitHub Copilot). Discovered skills are merged into the `/` slash-command menu automatically — type `/` in the chat input to see all built-in commands plus your custom skills.

Each `SKILL.md` follows the same YAML frontmatter format:

```markdown
---
name: my-skill
description: What this skill does
argument-hint: "<topic>"
---
Use $ARGUMENTS as the user's input...
```

**中文** DeepCopilot 启动时自动扫描 `~/.claude/skills/` 和 `~/.copilot/skills/` 中的 `SKILL.md` 文件（与 GitHub Copilot 约定一致）。发现的 Skill 自动合并进 `/` 斜杠命令菜单，在输入框输入 `/` 即可看到内置命令与自定义 Skill 的完整列表。

---

### 🖼️ Image Attachment & Vision API · 图片附件与视觉 API

**EN** You can now attach images (PNG, JPG, GIF, WebP, etc.) by dragging them onto the chat input or clicking the attach button. Improvements include:

- **Thumbnail preview** in the chip bar — no more invisible attachments
- **Binary detection** — PDF, ZIP, EXE and other binary files show a friendly error instead of garbled text
- **Multimodal messages** — images are sent to DeepSeek using the standard `image_url` content-block format; text-only messages are unchanged
- **Absolute-path fix** — dragging a file from outside the workspace no longer produces a broken path

**中文** 现在可以通过拖拽或点击附件按钮将图片（PNG、JPG、GIF、WebP 等）添加到对话中：

- **缩略图预览** — chip 栏直接显示图片预览，附件状态一目了然
- **二进制检测** — PDF、ZIP、EXE 等二进制文件给出友好提示，不再显示乱码
- **多模态消息** — 图片以标准 `image_url` content-block 格式发送给 DeepSeek 视觉模型
- **绝对路径修复** — 从工作区外拖入文件不再生成错误路径

---

### 📁 Asset & Path Cleanup · 资产与路径整治

**EN** All logo/icon files have been consolidated under `imgs/` (previously scattered across `media/`). The webview `localResourceRoots` now correctly includes both `media/` and `imgs/`, so the panel icon and welcome-page logo load reliably. Duplicate files removed.

**中文** 所有 logo/图标文件统一移入 `imgs/` 目录（之前分散在 `media/` 中）。Webview 的 `localResourceRoots` 现已正确包含 `media/` 和 `imgs/` 两个目录，面板图标与欢迎页 logo 可稳定加载。删除了重复文件。

---

## Bug Fixes · 问题修复

| # | Fix |
|---|-----|
| 1 | `path.join(wsRoot, absPath)` 产生错误路径 → 改用 `resolvePath()` 正确处理绝对路径 |
| 2 | 图片文件被当作 UTF-8 文本读取 → 按扩展名分流，图片读为 base64 |
| 3 | `doSend` 过滤条件排除了图片附件（`content === null`）→ 修正为 `content !== null \|\| !!imageData` |
| 4 | Webview panel 图标路径指向已迁移的 `media/logo_black_bg.png` → 更新为 `imgs/` |
| 5 | README 顶部图片相对路径在扩展详情页无法解析 → 改用 GitHub raw URL |

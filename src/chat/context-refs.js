// Context-reference resolvers for the `#` picker in the chat input.
//
// Each resolver returns an attachment-shaped payload:
//   { path, content, startLine?, endLine?, lang? }
//
// The `path` field acts as a label for the chip *and* as the path attribute
// on the <attachment …> block sent to the model. For synthetic refs that do
// not point to a real file (diagnostics, git diff, terminal, fetch, …) we
// use angle-bracketed identifiers like `<diagnostics>` so the model can tell
// them apart from real file paths.
//
// Security:
//   - `file` is handled by the existing `fileContent` flow in provider.js
//     (which already validates paths via resolvePath / isInsideWorkspace).
//   - `fetch` defers to src/tools/web-fetch.js which enforces SSRF blocklists.
//   - `terminal` returns only what VS Code's public API exposes (no shell
//     history scraping); when the API is unavailable the chip resolves to a
//     short placeholder string instead of failing.
'use strict';

const vscode = require('vscode');
const path   = require('path');
const cp     = require('child_process');

const { wsRoot, isInsideWorkspace } = require('../utils/paths');
const { fetchAndExtractText } = require('../tools/web-fetch');

const MAX_CONTENT = 64 * 1024;

function truncate(s, max = MAX_CONTENT) {
    if (typeof s !== 'string') s = String(s == null ? '' : s);
    if (s.length <= max) return s;
    return s.slice(0, max) + '\n... [truncated]';
}

// ── selection / editor ────────────────────────────────────────────────

function resolveSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { error: 'No active editor' };
    const doc = editor.document;
    const sel = editor.selection;
    if (sel.isEmpty) return { error: 'No text selected in the active editor' };

    const abs  = doc.fileName;
    const root = wsRoot();
    const rel  = root && abs.startsWith(root)
        ? path.relative(root, abs).replace(/\\/g, '/')
        : path.basename(abs);
    return {
        path:      rel,
        content:   truncate(doc.getText(sel), 12000),
        startLine: sel.start.line + 1,
        endLine:   sel.end.line + 1,
        lang:      doc.languageId,
    };
}

function resolveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { error: 'No active editor' };
    const doc = editor.document;
    // Untitled / virtual documents: never expose fileName as a path; use a
    // synthetic label so the model sees "<untitled>" rather than a host path.
    if (doc.uri.scheme !== 'file') {
        return {
            path:    `<untitled:${doc.uri.scheme}>`,
            content: truncate(doc.getText()),
            lang:    doc.languageId,
        };
    }
    const abs = doc.fileName;
    if (!isInsideWorkspace(abs)) {
        return { error: 'Active file is outside the workspace' };
    }
    const root = wsRoot();
    const rel  = root && abs.startsWith(root)
        ? path.relative(root, abs).replace(/\\/g, '/')
        : path.basename(abs);
    return {
        path:    rel,
        content: truncate(doc.getText()),
        lang:    doc.languageId,
    };
}

// ── diagnostics ───────────────────────────────────────────────────────

function resolveProblems() {
    const root = wsRoot();
    const all  = vscode.languages.getDiagnostics();
    const sevName = { 0: 'error', 1: 'warning', 2: 'info', 3: 'hint' };
    const lines = [];
    let count = 0;
    for (const [uri, diags] of all) {
        if (!diags.length) continue;
        const rel = root && uri.fsPath.startsWith(root)
            ? path.relative(root, uri.fsPath).replace(/\\/g, '/')
            : uri.fsPath;
        for (const d of diags) {
            const ln = d.range.start.line + 1;
            const col = d.range.start.character + 1;
            const sev = sevName[d.severity] || 'info';
            const src = d.source ? `${d.source}` : '';
            lines.push(`${rel}:${ln}:${col} [${sev}] ${src ? src + ': ' : ''}${d.message}`);
            count++;
            if (count >= 200) break;
        }
        if (count >= 200) break;
    }
    if (!lines.length) return { error: 'No problems in the current workspace' };
    return {
        path:    '<problems>',
        content: truncate(lines.join('\n')),
    };
}

// ── git ───────────────────────────────────────────────────────────────

function gitDiff() {
    return new Promise(resolve => {
        const root = wsRoot();
        if (!root) return resolve({ error: 'No workspace folder' });
        cp.execFile('git', ['diff', '--no-color', '--', '.'], { cwd: root, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
            if (err) return resolve({ error: `git diff failed: ${err.message}` });
            const out = (stdout || '').toString();
            if (!out.trim()) return resolve({ error: 'No unstaged changes' });
            resolve({ path: '<git-changes>', content: truncate(out) });
        });
    });
}

// ── terminal (best-effort) ────────────────────────────────────────────

async function resolveTerminal() {
    const term = vscode.window.activeTerminal;
    if (!term) return { error: 'No active terminal' };

    // The clipboard round-trip below is opt-in (default off) because it can
    // permanently clobber the user's clipboard on failures and silently
    // drops non-text clipboard content (e.g. previously-copied images).
    // See PR #63 review (C7) and issue #62.
    const cfg = vscode.workspace.getConfiguration('deepseekAgent');
    const allowClipboard = !!cfg.get('contextRefs.terminalUseClipboard', false);
    if (!allowClipboard) {
        return {
            error: 'Enable "deepseekAgent.contextRefs.terminalUseClipboard" to capture terminal selection (it temporarily uses the system clipboard).',
        };
    }

    // VS Code does not expose terminal scrollback via the public API. We grab
    // the current terminal selection via copySelection → read clipboard,
    // then restore the previous clipboard content.
    let buffer = '';
    let prev = '';
    let prevReadOk = false;
    try {
        try { prev = await vscode.env.clipboard.readText(); prevReadOk = true; } catch { /* may be empty / non-text */ }
        await vscode.commands.executeCommand('workbench.action.terminal.copySelection').then(() => {}, () => {});
        // Give the OS clipboard a moment to settle before reading (issue G1).
        await new Promise(r => setTimeout(r, 50));
        const sel = await vscode.env.clipboard.readText().catch(() => '');
        // Only restore when we successfully captured the previous value AND
        // it differs from what we just read, to avoid wiping non-text content
        // we never saw.
        if (prevReadOk && prev !== sel) {
            await vscode.env.clipboard.writeText(prev).catch(() => {});
        }
        buffer = sel || '';
    } catch { /* ignore */ }
    if (!buffer.trim()) {
        return { error: 'Select text in the terminal first, then re-attach #terminal' };
    }
    return {
        path:    '<terminal>',
        content: truncate(buffer, 32 * 1024),
    };
}

// ── workspace symbol ──────────────────────────────────────────────────

async function resolveSymbol(query) {
    const q = String(query || '').trim();
    if (!q) return { error: 'Provide a symbol name, e.g. #symbol:MyClass' };
    let syms = [];
    try {
        syms = await vscode.commands.executeCommand(
            'vscode.executeWorkspaceSymbolProvider', q
        );
    } catch (e) {
        return { error: `Symbol search failed: ${e.message}` };
    }
    if (!syms || !syms.length) return { error: `No symbol matched "${q}"` };
    const root  = wsRoot();
    const lines = syms.slice(0, 20).map(s => {
        const uri = s.location && s.location.uri;
        const ln  = (s.location && s.location.range && s.location.range.start.line + 1) || 1;
        const rel = uri && root && uri.fsPath.startsWith(root)
            ? path.relative(root, uri.fsPath).replace(/\\/g, '/')
            : (uri ? uri.fsPath : '?');
        return `${rel}:${ln}  ${s.kind != null ? '[' + vscode.SymbolKind[s.kind] + ']' : ''} ${s.name}${s.containerName ? '  (' + s.containerName + ')' : ''}`;
    });
    return {
        path:    `<symbol:${q}>`,
        content: lines.join('\n'),
    };
}

// ── fetch ─────────────────────────────────────────────────────────────

async function resolveFetch(url, abortSignal) {
    const u = String(url || '').trim();
    if (!u) return { error: 'Provide a URL, e.g. #fetch:https://example.com' };
    const res = await fetchAndExtractText({ url: u }, { abortSignal });
    if (!res.ok) return { error: res.error };
    return {
        path:    `<fetch:${u}>`,
        content: truncate(res.body, 32 * 1024),
    };
}

// ── dispatch ──────────────────────────────────────────────────────────

const KNOWN_REFS = ['file', 'selection', 'editor', 'problems', 'changes', 'terminal', 'symbol', 'fetch'];

async function resolveContextRef(refType, value, ctx = {}) {
    switch (refType) {
        case 'selection': return resolveSelection();
        case 'editor':    return resolveEditor();
        case 'problems':  return resolveProblems();
        case 'changes':   return await gitDiff();
        case 'terminal':  return await resolveTerminal();
        case 'symbol':    return await resolveSymbol(value);
        case 'fetch':     return await resolveFetch(value, ctx.abortSignal);
        default:          return { error: `Unknown ref type: ${refType}` };
    }
}

module.exports = { resolveContextRef, KNOWN_REFS };

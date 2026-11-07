    // A full-width archive browser mounted through the host overlay slot. The host owns
    // Markdown rendering, directory picking, model selection and resumed conversations.
    let archiveCtx = null;
    let archiveOpen = null;
    let ArchiveMarkdown = null;
    try { ArchiveMarkdown = require("@deepseek-ai/dsh-client-ui-primitives").MarkdownText; }
    catch (_) { /* Older hosts can still read plain text. */ }

    async function archiveRequest(op, args = {}) {
      const result = await postJson("/api-import/chatgpt-archive", { op, ...args }, readJson, { "X-DSH-Archive": "1" });
      if (!result.ok) throw new Error(result.error || "档案服务不可用，请检查插件是否已启用。");
      return result.data.data;
    }

    function ArchiveText({ text, parts, archiveId, conversationKey, messageId }) {
      if (parts) return h("div", null, parts.map((part, i) => part.kind === "widget"
        ? h(ArchiveWidget, { key: messageId + ":" + i, initial: part, archiveId, conversationKey, messageId, part: i })
        : part.kind === "unsupported" ? h("details", { key: i, className: "cga-unsupported" }, h("summary", null, "此组件暂不支持完整还原 · 查看原始内容"), h("p", null, part.error), h("pre", null, part.source))
          : h(ArchiveText, { key: i, text: part.text })));
      // Only indexed local attachments may load automatically, never archived remote images.
      const safe = String(text || "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "[图片：$1]")
        .replace(/!\[([^\]]*)\](?:\[[^\]]*\])?/g, "[图片：$1]")
        .replace(/<img\b[^>]*>/gi, "[图片]");
      return ArchiveMarkdown ? h("div", { className: "cga-markdown" }, h(ArchiveMarkdown, { text: safe, streaming: false, labels: {
        code: { copyLabel: "复制代码", copiedLabel: "已复制", toolbarLabels: { codeLabel: "代码", wrapLabel: "自动换行", unwrapLabel: "取消换行" } }, footnotes: "引用",
      } })) : h("div", { className: "cga-plain" }, safe);
    }

    const archiveAssetPending = new Map();
    const archiveAssetQueue = [];
    let archiveAssetActive = 0;
    function pumpArchiveAssets() {
      while (archiveAssetActive < 3 && archiveAssetQueue.length) {
        archiveAssetActive++;
        archiveAssetQueue.shift()();
      }
    }
    function readArchiveAsset(archiveId, assetId) {
      const key = archiveId + ":" + assetId;
      if (archiveAssetPending.has(key)) return archiveAssetPending.get(key);
      const pending = new Promise((resolve, reject) => {
        archiveAssetQueue.push(async () => {
          try { resolve(await archiveRequest("asset", { archiveId, assetId })); }
          catch (err) { reject(err); }
          finally { archiveAssetActive--; pumpArchiveAssets(); }
        });
        pumpArchiveAssets();
      });
      archiveAssetPending.set(key, pending);
      pending.then(() => archiveAssetPending.delete(key), () => archiveAssetPending.delete(key));
      return pending;
    }

    function ArchiveAsset({ archiveId, asset, onOpen }) {
      const [data, setData] = useState(null);
      const [error, setError] = useState("");
      const [requested, setRequested] = useState(false);
      const [attempt, setAttempt] = useState(0);
      const assetRef = useRef(null);
      useEffect(() => {
        if (!asset.available || !asset.previewable) return undefined;
        if (!window.IntersectionObserver) { setRequested(true); return undefined; }
        const observer = new window.IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) { setRequested(true); observer.disconnect(); }
        }, { root: assetRef.current?.closest(".cga-messages") || null, rootMargin: "360px" });
        if (assetRef.current) observer.observe(assetRef.current);
        return () => observer.disconnect();
      }, [asset.available, asset.previewable]);
      useEffect(() => {
        if (!requested) return undefined;
        let alive = true;
        let url = null;
        setError(""); setData(null);
        readArchiveAsset(archiveId, asset.id).then((result) => {
          if (!alive) return;
          const bytes = Uint8Array.from(window.atob(result.base64), (c) => c.charCodeAt(0));
          url = URL.createObjectURL(new Blob([bytes], { type: result.mediaType }));
          setData({ url, name: result.name, image: result.mediaType.startsWith("image/") });
        }).catch((err) => { if (alive) setError(errorText(err)); });
        return () => { alive = false; if (url) URL.revokeObjectURL(url); };
      }, [archiveId, asset.id, requested, attempt]);
      const read = () => { setRequested(true); setAttempt((n) => n + 1); };
      const busy = requested && !data && !error;
      return h("div", { ref: assetRef, className: "cga-asset" + (asset.previewable ? " cga-asset-image" : "") },
        data?.image ? h("img", { src: data.url, alt: data.name, onError: () => setError("图片无法解码，可保存原文件后查看。") })
          : asset.available && asset.previewable && !data && h("div", { className: "cga-image-placeholder", role: "status" }, error ? "图片暂时无法显示" : "正在载入图片…"),
        h("div", { className: "cga-asset-meta" }, h("span", { className: "cga-asset-name", title: asset.name }, asset.name),
          h("span", { className: "cga-asset-actions" }, asset.available && onOpen && h("button", { onClick: () => onOpen({ id: "asset:" + asset.id, title: asset.name }) }, "打开"), !asset.available ? h("span", { className: "cga-muted" }, "导出中缺失")
            : data ? h(React.Fragment, null, data.image && h("a", { href: data.url, target: "_blank", rel: "noopener noreferrer" }, "查看大图"), h("a", { href: data.url, download: data.name }, "保存"))
              : h("button", { onClick: read, disabled: busy }, busy ? "读取中…" : error ? "重试" : "查看附件"))),
        data && asset.previewable && !data.image && h("p", { className: "cga-asset-error" }, "此文件无法预览，可保存后打开。"),
        error && h("p", { className: "cga-asset-error", role: "alert" }, error));
    }

    function ArchiveButton({ wide }) {
      return h("button", { type: "button", title: "ChatGPT 备份档案", "aria-label": "ChatGPT 备份档案",
        style: { border: 0, background: "transparent", color: COLORS.text, padding: "10px", borderRadius: "10px", cursor: "pointer", font: "inherit" },
        onClick: () => archiveOpen && archiveOpen(true) }, wide === false ? "◷" : "◷ ChatGPT 备份");
    }

    function ArchiveProject({ archiveId, project, expanded, onToggle, selectedKey, onSelect, onRename, renameForm }) {
      const [items, setItems] = useState([]);
      const [total, setTotal] = useState(project.count);
      const [offset, setOffset] = useState(0);
      const [shown, setShown] = useState(5);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      const [retry, setRetry] = useState(0);
      const [menu, setMenu] = useState(false);
      const loadedOffsets = useRef(new Set());
      const menuRef = useRef(null);
      const menuButtonRef = useRef(null);
      const groupId = "cga-project-" + archiveId + "-" + project.id;
      useEffect(() => {
        if (!expanded || loadedOffsets.current.has(offset)) return undefined;
        let alive = true;
        setLoading(true); setError("");
        archiveRequest("list", { archiveId, projectId: project.id, offset }).then((result) => {
          if (!alive) return;
          loadedOffsets.current.add(offset);
          setItems((previous) => offset ? [...previous, ...result.rows] : result.rows);
          setTotal(result.total);
        }).catch((err) => { if (alive) setError(errorText(err)); })
          .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
      }, [archiveId, project.id, expanded, offset, retry]);
      useEffect(() => {
        if (!menu) return undefined;
        menuRef.current?.querySelector("button")?.focus();
        const dismiss = (e) => { if (!menuRef.current?.contains(e.target) && !menuButtonRef.current?.contains(e.target)) setMenu(false); };
        document.addEventListener("pointerdown", dismiss);
        return () => document.removeEventListener("pointerdown", dismiss);
      }, [menu]);
      const more = () => {
        const next = shown + 5;
        setShown(next);
        if (next > items.length && items.length < total) setOffset(items.length);
      };
      const containsSelection = items.some((r) => r.key === selectedKey);
      return h("div", { className: "cga-project", "data-project-id": project.id },
        h("div", { className: "cga-project-heading" + (containsSelection && !expanded ? " cga-project-current" : "") },
          h("button", { className: "cga-project-toggle", "aria-expanded": expanded, "aria-controls": groupId,
            title: project.name + (project.nameSource === "conversation-title" ? "（原名未导出，暂用对话标题）" : ""),
            onClick: () => { setMenu(false); onToggle(); }, onKeyDown: (e) => {
              if (e.key === "ArrowRight" && !expanded || e.key === "ArrowLeft" && expanded) { e.preventDefault(); onToggle(); }
            } },
            h("span", { className: "cga-project-icon", "aria-hidden": true },
              h("svg", { className: "cga-folder", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6 }, h("path", { d: "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" })),
              h("svg", { className: "cga-chevron", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.7 }, h("path", { d: "m7 4 6 6-6 6" }))),
            h("span", { className: "cga-project-name" }, project.name), project.nameSource === "conversation-title" && h("span", { className: "cga-project-hint" }, "暂名")),
          h("button", { ref: menuButtonRef, className: "cga-project-more", "aria-label": "项目菜单：" + project.name, "aria-haspopup": "menu", "aria-expanded": menu,
            onClick: () => setMenu((v) => !v) }, "⋯"),
          menu && h("div", { className: "cga-project-menu", ref: menuRef, role: "menu", "aria-label": "项目操作", onKeyDown: (e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMenu(false); menuButtonRef.current?.focus(); }
            else if (e.key === "Tab") setMenu(false);
          } }, h("button", { role: "menuitem", onClick: () => { setMenu(false); onRename(); } }, "重命名项目"))),
        renameForm,
        h("div", { id: groupId, className: "cga-project-collapse", "data-expanded": expanded, "aria-hidden": !expanded, inert: expanded ? undefined : "" },
          h("div", { className: "cga-project-clip" }, h("div", { className: "cga-project-chats" },
            h("ul", { "aria-label": project.name + "中的会话" }, items.slice(0, shown).map((r) => h("li", { key: r.key },
              h("button", { className: "cga-project-chat" + (selectedKey === r.key ? " cga-selected" : ""), title: r.title,
                "aria-current": selectedKey === r.key ? "page" : undefined, onClick: () => onSelect(r) }, h("span", null, r.title))))),
            loading && h("p", { className: "cga-project-status", role: "status" }, "正在读取会话…"),
            error && h("div", { className: "cga-project-status", role: "alert" }, error, h("button", { onClick: () => setRetry((n) => n + 1) }, "重试")),
            !loading && !error && total === 0 && h("p", { className: "cga-project-status" }, "此项目没有对话"),
            !error && shown < total && h("button", { className: "cga-project-show-more", disabled: loading, onClick: more }, "显示更多")))));
    }

    function ChatgptArchiveOverlay() {
      const [open, setOpen] = useState(false);
      const [importOpen, setImportOpen] = useState(false);
      const [path, setPath] = useState("");
      const [saved, setSaved] = useState([]);
      const [summary, setSummary] = useState(null);
      const [query, setQuery] = useState("");
      const [project, setProject] = useState("__general");
      const [expandedProjects, setExpandedProjects] = useState({});
      const [archiveRevision, setArchiveRevision] = useState(0);
      const [renameProject, setRenameProject] = useState(null);
      const [rename, setRename] = useState("");
      const [rows, setRows] = useState({ rows: [], total: 0 });
      const [offset, setOffset] = useState(0);
      const [selection, setSelection] = useState(null);
      const [detail, setDetail] = useState(null);
      const [visibleCount, setVisibleCount] = useState(60);
      const [busy, setBusy] = useState("");
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      const [note, setNote] = useState("");
      const [documentView, setDocumentView] = useState(null);
      const [searchView, setSearchView] = useState(null);
      const bodyRef = useRef(null);
      useEffect(() => { archiveOpen = setOpen; return () => { archiveOpen = null; }; }, []);
      useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape" && !busy && !searchView) { if (renameProject) setRenameProject(null); else setOpen(false); } };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [open, busy, renameProject, searchView]);
      useEffect(() => {
        if (!open || summary) return;
        let alive = true;
        archiveRequest("status").then(async (s) => {
          if (!alive) return;
          setSaved(s.archives);
          if (s.last) {
            setBusy("正在读取上次的备份…");
            const a = await archiveRequest("summary", { archiveId: s.last });
            if (alive) { setSummary(a); setPath(a.path); }
          }
        }).catch((err) => { if (alive) setError(errorText(err)); }).finally(() => { if (alive) setBusy(""); });
        return () => { alive = false; };
      }, [open, summary]);
      useEffect(() => {
        if (!open || !summary) return undefined;
        let alive = true;
        setLoading(true); setRows({ rows: [], total: 0 });
        const timer = setTimeout(() => {
          archiveRequest("list", { archiveId: summary.id, query, projectId: query.trim() ? "" : project, offset })
            .then((r) => { if (alive) setRows(r); }).catch((err) => { if (alive) setError(errorText(err)); })
            .finally(() => { if (alive) setLoading(false); });
        }, query ? 180 : 0);
        return () => { alive = false; clearTimeout(timer); };
      }, [open, summary, query, project, offset]);
      useEffect(() => {
        if (!selection || !summary) { setDetail(null); return undefined; }
        let alive = true;
        setDetail(null); setVisibleCount(60);
        archiveRequest("conversation", { archiveId: summary.id, ...selection })
          .then((d) => { if (alive) { setDetail(d); if (bodyRef.current) bodyRef.current.scrollTop = 0; } })
          .catch((err) => { if (alive) setError(errorText(err)); });
        return () => { alive = false; };
      }, [summary, selection]);
      const readDirectory = async (value = path) => {
        setBusy("正在建立备份索引…"); setError(""); setNote("");
        try {
          const a = await archiveRequest("open", { path: value });
          setSummary(a); setPath(a.path); setProject("__general"); setOffset(0); setSelection(null); setDocumentView(null); setImportOpen(false);
          setExpandedProjects({}); setArchiveRevision((n) => n + 1); setRenameProject(null);
          setSaved((await archiveRequest("status")).archives);
        } catch (err) { setError(errorText(err)); }
        finally { setBusy(""); }
      };
      const pickDirectory = async () => {
        try {
          const picker = window.__DSH_DIRECTORY_PICKER__;
          const chosen = picker ? await picker.pick() : await archiveCtx.get("uiWorkspace")?.pickDirectory();
          if (chosen) { setPath(chosen); await readDirectory(chosen); }
          else if (chosen === undefined) setError("此宿主未提供目录选择器，请粘贴已解压文件夹的完整路径。");
        } catch (err) { setError(errorText(err)); }
      };
      const pickProject = (id) => { setProject(id); setOffset(0); setQuery(""); };
      const selectRow = (row) => {
        if (row.kind === "project") {
          pickProject(row.projectId); setExpandedProjects(current => ({ ...current, [row.projectId]: true })); setSelection(null); setDocumentView(null); return;
        }
        if (row.kind && row.kind !== "chat") { setDocumentView(row); return; }
        setSelection({ key: row.key }); setDocumentView(null);
        if (row.projectId) setExpandedProjects((current) => ({ ...current, [row.projectId]: true }));
      };
      const doRename = async () => {
        setBusy("正在保存项目名称…"); setError("");
        try { setSummary(await archiveRequest("rename", { archiveId: summary.id, projectId: renameProject, name: rename })); setRename(""); setRenameProject(null); }
        catch (err) { setError(errorText(err)); } finally { setBusy(""); }
      };
      const continueChat = async () => {
        setBusy("正在导入所选分支…"); setError("");
        try {
          const result = await archiveRequest("continue", { archiveId: summary.id, key: selection.key, nodeId: detail.selectedNode });
          const ui = archiveCtx.get("uiWorkspace");
          if (!ui || typeof ui.openSession !== "function") throw new Error("对话已导入，请在 Harness 侧栏打开：" + result.title);
          ui.openSession(result.sessionId); setOpen(false);
          showAppToast("已导入所选分支。可在输入框旁切换模型后继续对话。", [{ label: "返回档案", onClick: () => setOpen(true) }]);
          setNote(result.note);
        } catch (err) { setError(errorText(err)); }
        finally { setBusy(""); }
      };
      if (!open) return null;
      const queryTerms = rows.terms || highlightTerms(query);
      const hasDetail = !!selection || !!documentView;
      const showProject = (p) => h(ArchiveProject, { key: summary.id + ":" + archiveRevision + ":" + p.id, archiveId: summary.id, project: p,
        expanded: !!expandedProjects[p.id], onToggle: () => setExpandedProjects((current) => ({ ...current, [p.id]: !current[p.id] })),
        selectedKey: selection?.key, onSelect: selectRow, onRename: () => { setRenameProject(p.id); setRename(p.name); },
        renameForm: renameProject === p.id && h("form", { className: "cga-rename", onSubmit: (e) => { e.preventDefault(); if (rename.trim() && !busy) doRename(); } },
          h("input", { value: rename, autoFocus: true, maxLength: 120, "aria-label": "项目名称", onChange: (e) => setRename(e.target.value) }),
          h("button", { type: "button", onClick: () => setRenameProject(null) }, "取消"), h("button", { type: "submit", disabled: !rename.trim() || !!busy }, "保存")) });
      const roleName = (m) => m.role === "user" ? "你" : m.role === "assistant" ? "ChatGPT" : m.role;
      return h("div", { className: "cga-overlay", role: "dialog", "aria-modal": true, "aria-label": "ChatGPT 备份档案" },
        h("style", { "data-plugin": "dsh-chat-import", "data-plugin-css": "dsh-chat-import/archive.css" }, ARCHIVE_CSS + ARCHIVE_LIBRARY_CSS),
        searchView && summary && h(ArchiveSearchDialog, { archiveId: summary.id, initialScope: searchView, onClose: () => setSearchView(null), onSelect: selectRow }),
        h("header", { className: "cga-head" }, h("strong", null, "ChatGPT 档案"), h("span", { className: "cga-tagline" }, "在本机重访历史，让对话继续"), h("span", { className: "cga-spacer" }),
          h("div", { className: "cga-head-actions" }, summary && h("span", { className: "cga-muted cga-total" }, summary.conversations + " 个对话 · " + summary.assets + " 个附件"),
            summary && h("button", { onClick: () => setSearchView("all"), "aria-label": "搜索备份" }, "搜索"),
            h("button", { onClick: () => setImportOpen((v) => !v), "aria-expanded": importOpen || !summary }, "备份管理"), h("button", { onClick: () => setOpen(false), disabled: !!busy, "aria-label": "关闭档案" }, "关闭"))),
        (!summary || importOpen) && h("div", { className: "cga-import" }, h("input", { value: path, placeholder: "粘贴 ChatGPT 导出备份的解压文件夹路径", "aria-label": "备份文件夹路径", onChange: (e) => setPath(e.target.value), onKeyDown: (e) => { if (e.key === "Enter" && !busy) readDirectory(); } }),
          h("button", { onClick: pickDirectory, disabled: !!busy }, "选择文件夹"), h("button", { className: "cga-primary", onClick: () => readDirectory(), disabled: !!busy || !path }, "读取备份"),
          saved.length > 0 && h("select", { value: "", "aria-label": "最近的备份", disabled: !!busy, onChange: (e) => readDirectory(e.target.value) }, h("option", { value: "" }, "最近的备份"), saved.map((s) => h("option", { key: s.id, value: s.path }, s.label)))),
        busy && h("div", { className: "cga-alert", role: "status" }, busy),
        error && h("div", { className: "cga-alert", role: "alert" }, error, h("button", { onClick: () => setError("") }, "收起")),
        note && h("div", { className: "cga-alert" }, note, h("button", { onClick: () => setNote("") }, "收起")),
        !summary ? h("div", { className: "cga-empty" }, h("h2", null, "让过去的对话，继续有用。"), h("p", null, "选择官方下载并解压的 ChatGPT 备份文件夹。支持单文件与分片导出，原始备份保持不变。"), h("p", null, "查看、搜索和附件预览均在本机完成。只有你在续聊界面发送消息时，才会调用所选模型。"))
          : h("div", { className: "cga-layout", "data-detail": hasDetail },
            h("div", { className: "cga-sidebar" },
              h("div", { className: "cga-search" }, h("button", { className: "cga-open-search", onClick: () => setSearchView("all") }, h("span", { "aria-hidden": true }, "⌕"), "搜索聊天与文件")),
              h("div", { className: "cga-sidebar-scroll" },
                h("aside", { className: "cga-projects" },
                  h("div", { className: "cga-navigation" },
                    h("button", { className: project === "" && !query.trim() ? "cga-selected" : "", onClick: () => pickProject("") }, "全部对话", h("span", { className: "cga-project-count" }, summary.conversations)),
                    h("button", { className: project === "__general" && !query.trim() ? "cga-selected" : "", onClick: () => pickProject("__general") }, "未分组对话")),
                  h("div", { className: "cga-library-links" }, h("button", { onClick: () => setSearchView("documents") }, "▤ 文档与研究报告", h("span", { className: "cga-project-count" }, summary.reports ? summary.reports + " 份研究" : "")),
                    h("button", { onClick: () => setSearchView("attachments") }, "⌁ 附件库")),
                  h("div", { hidden: !!query.trim(), className: "cga-project-section" }, h("div", { className: "cga-label" }, "项目"), summary.projects.map(showProject),
                    summary.projects.some((p) => p.nameSource === "conversation-title") && h("p", { className: "cga-project-help" }, "项目暂名可通过 ⋯ 修改")),
                  summary.warnings.length > 0 && h("details", null, h("summary", null, summary.warnings.length + " 项读取提示"), summary.warnings.map((w, i) => h("p", { key: i }, w)))),
                h("section", { className: "cga-list", "aria-label": query.trim() ? "搜索结果" : "历史对话列表" },
                  h("div", { className: "cga-label cga-count" }, h("span", null, query.trim() ? "搜索结果" : project === "__general" ? "你的聊天" : "全部聊天"), h("span", null, loading ? "读取中…" : rows.total)),
                  rows.rows.map((r) => h("button", { key: r.key, className: "cga-row " + (selection?.key === r.key ? "cga-selected" : ""), "aria-current": selection?.key === r.key ? "page" : undefined, onClick: () => selectRow(r) },
                    h("div", { className: "cga-row-title", title: r.title }, h(Highlight, { text: r.title, terms: query.trim() ? queryTerms : [] })),
                    query.trim() && h("div", { className: "cga-match-info" }, typeof r.matchedTermCount === "number" && h("span", { className: "cga-match-score" }, "命中 " + r.matchedTermCount + "/" + queryTerms.length + " 词"), h("span", null, fmtTime(r.updated * 1000))),
                    query.trim() && r.matchedTerms?.length > 0 && h("div", { className: "cga-matched-terms", "aria-label": "命中的关键词" }, r.matchedTerms.map((term) => h("span", { key: term }, term))),
                    (r.snippets || (r.snippet ? [r.snippet] : [])).map((text, i) => h("div", { key: i, className: "cga-snippet" }, h(Highlight, { text, terms: queryTerms }))))),
                  !loading && !rows.total && h("p", { className: "cga-empty" }, query.trim() ? "没有匹配的对话" : "暂无对话"),
                  (offset > 0 || offset + 80 < rows.total) && h("div", { className: "cga-foot" }, h("button", { disabled: offset === 0, onClick: () => setOffset(Math.max(0, offset - 80)) }, "上一页"), h("span", { className: "cga-spacer" }), h("button", { disabled: offset + 80 >= rows.total, onClick: () => setOffset(offset + 80) }, "下一页"))),
                !query.trim() && summary.documents.length > 0 && h("div", { className: "cga-projects cga-documents" }, h("div", { className: "cga-label" }, "页面与网站"),
                  summary.documents.map((d) => h("button", { key: d.id, title: d.title, onClick: () => { setDocumentView(d); setSelection(null); } }, h("span", { "aria-hidden": true }, d.kind === "sites" ? "◈" : "▤"), h("span", { className: "cga-project-title" }, d.title)))))),
            h("section", { className: "cga-reader" },
              documentView ? h(ArchiveDocumentReader, { key: summary.id + ":" + documentView.id, archiveId: summary.id, item: documentView, onClose: () => setDocumentView(null), onConversation: selectRow })
                : detail ? h(React.Fragment, null,
                  h("div", { className: "cga-reader-head" }, h("button", { className: "cga-back", onClick: () => setSelection(null) }, "返回"), h("strong", { title: detail.title }, detail.title),
                    detail.branches.length > 1 && h("select", { value: detail.selectedNode, "aria-label": "对话分支", onChange: (e) => setSelection({ key: selection.key, nodeId: e.target.value }) }, detail.branches.map((b, i) => h("option", { key: b.id, value: b.id }, (b.id === detail.currentNode ? "当前分支" : "分支 " + (i + 1)) + " · " + b.text)))),
                  h("div", { className: "cga-messages", ref: bodyRef }, detail.reports?.length > 0 && h("div", { className: "cga-related-reports" }, h("p", { className: "cga-muted" }, "此会话的研究报告"), detail.reports.map(report => h(ArchiveReportCard, { key: report.id, archiveId: summary.id, report, onOpen: setDocumentView }))), detail.messages.slice(0, visibleCount).map((m) => {
                    const body = h(React.Fragment, null, m.reports?.map(report => h(ArchiveReportCard, { key: report.id, archiveId: summary.id, report, onOpen: setDocumentView })),
                      h("div", { className: "cga-message-body" }, h(ArchiveText, { text: m.text, parts: m.parts, archiveId: summary.id, conversationKey: selection.key, messageId: m.id })),
                      m.assets.map((asset) => h(ArchiveAsset, { key: summary.id + ":" + asset.id, archiveId: summary.id, asset, onOpen: setDocumentView })), h(ArchiveSources, { refs: m.refs }));
                    return m.reasoning ? h("details", { key: m.id, className: "cga-reasoning" }, h("summary", null, "思考记录"), body)
                      : h("article", { key: m.id, className: "cga-message " + (m.role === "user" ? "cga-message-user" : "") }, h("div", { className: "cga-role" }, roleName(m) + (m.model ? " · " + m.model : "")), body);
                  }), visibleCount < detail.messages.length && h("button", { onClick: () => setVisibleCount((n) => n + 60) }, "加载后续消息（还有 " + (detail.messages.length - visibleCount) + " 条）")),
                  h("div", { className: "cga-foot" }, h("small", null, "将当前分支及关联研究报告带到 Harness。其他图片与文件需重新附加。"), h("button", { className: "cga-primary", disabled: !!busy, onClick: continueChat }, "继续这段对话 →")))
                  : h("div", { className: "cga-empty" }, h("h2", null, selection ? "正在读取对话…" : "重访你的思考"), h("p", null, "从左侧选择一个对话。你可以查看不同分支，并在选定的位置继续。")))));
    }

    function registerArchiveClient(ctx) {
      archiveCtx = ctx;
      ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({ name: "sidebar.footer.action", id: "chatgpt-archive", order: 1 }, ArchiveButton));
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "chatgpt-archive", inject: () => ({}) }, ChatgptArchiveOverlay));
    }

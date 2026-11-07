    function ArchiveWidget({ initial, archiveId, conversationKey, messageId, part }) {
      const [view, setView] = useState(initial);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      const [draft, setDraft] = useState("");
      const [copyText, setCopyText] = useState("");
      const [copied, setCopied] = useState(false);
      const alive = useRef(true);
      useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
      const copy = async (text) => {
        setCopyText(text);
        try { await window.navigator.clipboard.writeText(text); if (alive.current) setCopied(true); }
        catch (_) { if (alive.current) setCopied(false); /* Keep a selectable copy when clipboard access is unavailable. */ }
      };
      const act = async (id, value) => {
        if (busy || !id) return;
        setBusy(true); setError(""); setCopied(false);
        try {
          const next = await archiveRequest("widget", { archiveId, key: conversationKey, messageId, part, state: view.state, action: { id, value } });
          if (!alive.current) return;
          setView(next);
          for (const effect of next.effects || []) {
            if (effect.type === "copy") await copy(effect.text);
            if (effect.type === "draft") setDraft(effect.text);
          }
        } catch (err) { if (alive.current) setError(errorText(err)); }
        finally { if (alive.current) setBusy(false); }
      };
      let control = 0;
      const unit = (value, fallback = 0) => Math.max(0, Math.min(8, Number(value) || fallback)) * 6;
      const render = (node, key, radio = null) => {
        if (node.tag === "#text") return node.text.trim() ? h("div", { key, className: "cga-rich-text" }, h(ArchiveText, { text: node.text.trim() })) : null;
        const p = node.props || {}, actions = node.actions || {};
        const style = {};
        if (p.gap !== undefined) style.gap = unit(p.gap);
        if (p.padding !== undefined) style.padding = unit(p.padding);
        if (p.flex === "1") style.flex = "1 1 0";
        if (/^\d{1,3}%$/.test(p.width || "")) style.width = p.width;
        if (p.columns) style.gridTemplateColumns = "repeat(" + Math.max(1, Math.min(4, Number(p.columns) || 2)) + ", minmax(0, 1fr))";
        if (p.align === "center") style.textAlign = "center";
        if (["left", "center", "right", "start", "end"].includes(p.textAlign)) style.textAlign = p.textAlign;
        const className = "cga-rich-" + node.tag + (p.border ? " cga-rich-bordered" : "")
          + (p.color === "secondary" ? " cga-rich-secondary" : "") + (p.background ? " cga-rich-surface" : "")
          + (p.weight === "medium" ? " cga-rich-medium" : "") + (p.tabularNums ? " cga-rich-numbers" : "")
          + (["xs", "sm", "lg", "xl"].includes(p.size) ? " cga-rich-size-" + p.size : "");
        const child = (context = radio) => (node.children || []).map((n, i) => render(n, key + ":" + i, context));
        if (node.tag === "checkbox") return h("input", { key, type: "checkbox", className: "cga-rich-checkbox", checked: !!p.checked, disabled: busy || p.disabled,
          "aria-label": "切换分组 " + (++control), onChange: e => act(actions.onChange, e.target.checked) });
        if (node.tag === "slider") return h("input", { key, type: "range", className: "cga-rich-slider", min: p.min, max: p.max, step: p.step, value: p.value,
          "aria-label": "调整数值 " + (++control), disabled: busy, onChange: e => act(actions.onChange, Number(e.target.value)) });
        if (node.tag === "radio-group") return h("div", { key, className, role: "radiogroup", style }, child({ value: p.value, action: actions.onChange, name: messageId + ":" + part + ":" + key }));
        if (node.tag === "radio") return h("label", { key, className }, h("input", { type: "radio", name: radio?.name, value: p.value, checked: radio?.value === p.value,
          disabled: busy, onChange: () => act(radio?.action, p.value) }), child());
        if (node.tag === "button") return h("button", { key, className, type: p.submit ? "submit" : "button", disabled: busy || p.disabled,
          onClick: p.submit ? undefined : () => act(actions.onClick), "data-variant": p.variant }, child());
        if (node.tag === "form") return h("form", { key, className, style, onSubmit: e => { e.preventDefault(); act(actions.onSubmit); } }, child());
        if (node.tag === "icon") return h("span", { key, className, "aria-hidden": true }, ({ copy: "⧉", "arrow-right": "→", "check-circle": "✓", "alert-triangle": "△", search: "⌕" })[p.name] || "◇");
        if (node.tag === "divider") return h("hr", { key, className });
        if (node.tag === "table") return h("div", { key, className: "cga-rich-table-scroll" }, h("table", { className }, h("tbody", null, child())));
        const tag = ({ "table-row": "tr", "table-cell": "td", title: "div", label: "div" })[node.tag] || "div";
        return h(tag, { key, className, style, "data-align": p.align, "data-justify": p.justify }, child());
      };
      return h("div", { className: "cga-widget", "aria-busy": busy }, view.tree.map((n, i) => render(n, String(i))),
        error && h("p", { className: "cga-asset-error", role: "alert" }, error),
        copyText && h("div", { className: "cga-widget-copy", role: "status" }, copied ? "已复制当前选择" : "可选中下方内容复制", !copied && h("textarea", { readOnly: true, value: copyText, "aria-label": "待复制内容" })),
        draft && h("div", { className: "cga-widget-draft" }, h("p", null, "已生成续聊提示词，尚未发送。"), h("textarea", { readOnly: true, value: draft, "aria-label": "续聊提示词" }), h("button", { onClick: () => copy(draft) }, "复制提示词")));
    }

    function ArchiveSources({ refs = [] }) {
      return refs.length > 0 && h("details", { className: "cga-source" }, h("summary", null, "来源 · " + refs.length),
        refs.map((r, i) => h("div", { key: r.url }, h("a", { href: r.url, target: "_blank", rel: "noreferrer noopener" }, (i + 1) + ". " + r.title))));
    }

    function useArchiveDocument(archiveId, id) {
      const [document, setDocument] = useState(null);
      const [error, setError] = useState("");
      const [attempt, setAttempt] = useState(0);
      useEffect(() => {
        let alive = true;
        setDocument(null); setError("");
        archiveRequest("document", { archiveId, id }).then(d => { if (alive) setDocument(d); }).catch(err => { if (alive) setError(errorText(err)); });
        return () => { alive = false; };
      }, [archiveId, id, attempt]);
      return { document, error, retry: () => setAttempt(n => n + 1) };
    }

    function ArchiveMarkdownDownload({ document }) {
      const [url, setUrl] = useState("");
      useEffect(() => {
        if (!document?.text) return undefined;
        const sources = document.refs?.length ? "\n\n## 来源\n\n" + document.refs.map((r, i) => (i + 1) + ". [" + r.title + "](" + r.url + ")").join("\n") : "";
        const next = URL.createObjectURL(new Blob([document.text + sources], { type: "text/markdown;charset=utf-8" }));
        setUrl(next); return () => URL.revokeObjectURL(next);
      }, [document]);
      return url && h("a", { href: url, className: "cga-document-download", download: document.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 120) + ".md", title: "保存 Markdown", "aria-label": "保存 Markdown" }, "↓");
    }

    function ArchiveReportCard({ archiveId, report, onOpen }) {
      const { document, error, retry } = useArchiveDocument(archiveId, report.id);
      return h("section", { className: "cga-report-card", "aria-label": report.title },
        h("div", { className: "cga-report-toolbar" }, h("span", { className: "cga-report-icon", "aria-hidden": true }, "▤"), h("strong", null, report.title),
          h(ArchiveMarkdownDownload, { document }), h("button", { onClick: () => onOpen(report), "aria-label": "展开研究报告", title: "展开阅读" }, "⛶")),
        h("div", { className: "cga-report-body cga-message-body", tabIndex: 0 }, error ? h("p", { role: "alert" }, error, h("button", { onClick: retry }, "重试"))
          : document ? h(ArchiveText, { text: document.text }) : h("p", { className: "cga-muted", role: "status" }, "正在读取研究报告…")),
        h("div", { className: "cga-report-footer" }, h("span", null, "深度研究 · " + (document?.refs?.length || 0) + " 个来源"), h("button", { onClick: () => onOpen(report) }, "阅读全文 →")));
    }

    function ArchiveDocumentReader({ archiveId, item, onClose, onConversation }) {
      const { document, error, retry } = useArchiveDocument(archiveId, item.id || item.key);
      return h(React.Fragment, null,
        h("div", { className: "cga-reader-head cga-document-head" }, h("button", { onClick: onClose }, "返回"), h("strong", null, document?.title || item.title),
          document?.research && h(ArchiveMarkdownDownload, { document }), document?.conversationKey && h("button", { onClick: () => onConversation({ key: document.conversationKey }) }, "查看原会话")),
        h("div", { className: "cga-messages cga-document-reader" }, error ? h("p", { role: "alert" }, error, h("button", { onClick: retry }, "重试"))
          : !document ? h("p", { role: "status" }, "正在读取文档…") : h(React.Fragment, null,
            document.research && h("div", { className: "cga-document-kicker" }, "深度研究报告"),
            document.indexNote && h("p", { className: "cga-index-note" }, document.indexNote),
            document.text && h("div", { className: "cga-message-body" }, document.format === "markdown" ? h(ArchiveText, { text: document.text }) : h("div", { className: "cga-plain" }, document.text)),
            h(ArchiveSources, { refs: document.refs }), document.asset && h(ArchiveAsset, { archiveId, asset: document.asset }),
            /^https?:\/\//.test(document.url || "") && h("a", { href: document.url, target: "_blank", rel: "noreferrer noopener" }, "访问原网站（联网）"))));
    }

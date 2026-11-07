    const ARCHIVE_SEARCH_SCOPES = [["all", "全部"], ["chats", "聊天"], ["attachments", "附件"], ["images", "图片"], ["documents", "文档"], ["pages", "页面"], ["projects", "项目"]];
    const ARCHIVE_KIND_LABELS = { chat: "聊天", document: "文档", image: "图片", attachment: "附件", page: "页面", project: "项目" };
    function ArchiveSearchDialog({ archiveId, initialScope = "all", onClose, onSelect }) {
      const [query, setQuery] = useState("");
      const [scope, setScope] = useState(initialScope);
      const [matchIn, setMatchIn] = useState("all");
      const [offset, setOffset] = useState(0);
      const [data, setData] = useState({ rows: [], total: 0, counts: {} });
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState("");
      const [refresh, setRefresh] = useState(0);
      const box = useRef(null);
      const search = useRef(null);
      useEffect(() => {
        const previous = document.activeElement;
        search.current?.focus();
        const keyboard = e => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
          if (e.key === "Tab") {
            const controls = [...(box.current?.querySelectorAll("button:not(:disabled),input,select,[tabindex='0']") || [])];
            const first = controls[0], last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
          }
        };
        document.addEventListener("keydown", keyboard, true);
        return () => { document.removeEventListener("keydown", keyboard, true); previous?.focus(); };
      }, []);
      useEffect(() => {
        let alive = true;
        setLoading(true); setError("");
        const timer = setTimeout(() => archiveRequest("search", { archiveId, scope, query, matchIn, offset })
          .then(result => { if (alive) setData(result); })
          .catch(err => { if (alive) { setError(errorText(err)); setData({ rows: [], total: 0, counts: {} }); } })
          .finally(() => { if (alive) setLoading(false); }), query ? 180 : 0);
        return () => { alive = false; clearTimeout(timer); };
      }, [archiveId, query, scope, matchIn, offset, refresh]);
      useEffect(() => {
        if (!data.indexing?.pending) return undefined;
        const timer = setTimeout(() => setRefresh(n => n + 1), 1500);
        return () => clearTimeout(timer);
      }, [data]);
      const chooseScope = value => { setScope(value); setOffset(0); };
      const terms = data.terms || highlightTerms(query);
      return h("div", { className: "cga-search-backdrop", onPointerDown: e => { if (e.target === e.currentTarget) onClose(); } },
        h("section", { className: "cga-search-dialog", ref: box, role: "dialog", "aria-modal": true, "aria-label": "搜索备份内容" },
          h("div", { className: "cga-search-bar" }, h("span", { "aria-hidden": true }, "⌕"), h("input", { ref: search, value: query, placeholder: "用记得的关键词搜索，空格分隔", "aria-label": "搜索历史对话",
            onChange: e => { setQuery(e.target.value); setOffset(0); } }), query && h("button", { onClick: () => { setQuery(""); setOffset(0); search.current?.focus(); } }, "清除"), h("button", { onClick: onClose, "aria-label": "关闭搜索" }, "×")),
          h("div", { className: "cga-search-tabs", role: "tablist", "aria-label": "搜索范围" }, ARCHIVE_SEARCH_SCOPES.map(([id, label]) => h("button", {
            key: id, role: "tab", "aria-selected": scope === id, className: scope === id ? "cga-active-tab" : "", onClick: () => chooseScope(id),
          }, label, typeof data.counts?.[id] === "number" && h("span", null, data.counts[id])))),
          h("div", { className: "cga-search-options" }, h("select", { value: matchIn, "aria-label": "匹配位置", onChange: e => { setMatchIn(e.target.value); setOffset(0); } },
            h("option", { value: "all" }, "标题和正文"), h("option", { value: "title" }, "仅标题 / 文件名"), h("option", { value: "body" }, "仅正文")),
            h("span", null, query.trim() ? "命中关键词越多，排序越靠前" : "输入关键词，查找聊天和本地资料")),
          data.indexing?.pending > 0 && h("div", { className: "cga-index-progress", role: "status" }, "正在索引文档正文 · 剩余 " + data.indexing.pending + " 个文件，结果会自动更新"),
          error && h("div", { className: "cga-alert", role: "alert" }, error),
          h("div", { className: "cga-search-results", "aria-busy": loading }, loading && !data.rows.length ? h("p", { className: "cga-empty", role: "status" }, "正在搜索…") : data.rows.map(row => h("button", {
            key: row.key, className: "cga-search-result", disabled: loading, onClick: () => { onSelect(row); onClose(); },
          }, h("span", { className: "cga-search-kind-icon", "aria-hidden": true }, ({ chat: "○", document: "▤", image: "▧", attachment: "⌁", page: "▣", project: "▱" })[row.kind]),
            h("div", { className: "cga-search-result-text" }, h("div", { className: "cga-search-result-title" }, h(Highlight, { text: row.title, terms })),
              h("div", { className: "cga-search-result-meta" }, row.research ? "深度研究" : ARCHIVE_KIND_LABELS[row.kind],
                row.indexStatus && " · " + ({ indexed: "正文可检索", partial: "部分正文", pending: "正文索引中", failed: "正文未能读取", "name-only": "仅文件名" })[row.indexStatus],
                query.trim() && " · 命中 " + row.matchedTermCount + "/" + terms.length + " 词"),
              row.snippets?.map((text, i) => h("div", { className: "cga-search-result-snippet", key: i }, h(Highlight, { text, terms }))),
              row.indexNote && h("div", { className: "cga-search-result-note" }, row.indexNote)),
            row.updated > 0 && h("time", null, new Date(row.updated * 1000).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })))),
            !loading && !data.total && !error && h("div", { className: "cga-empty" }, "没有找到匹配内容", h("p", null, "试试更短的关键词，或切换搜索范围。"))),
          h("div", { className: "cga-search-bottom" }, h("span", null, loading ? "正在搜索…" : data.total + " 个结果"), h("span", { className: "cga-spacer" }),
            offset > 0 && h("button", { onClick: () => setOffset(Math.max(0, offset - 80)) }, "上一页"), offset + 80 < data.total && h("button", { onClick: () => setOffset(offset + 80) }, "下一页"))));
    }

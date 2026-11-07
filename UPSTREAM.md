# Upstream provenance / 上游来源

GPT2DSH is a derivative of **[Nwflower/dsh-chat-import](https://github.com/Nwflower/dsh-chat-import)**, not a clean-room replacement.

- Public base commit: [`c1c4f627d03d95a60dd8bade12212150ed8af276`](https://github.com/Nwflower/dsh-chat-import/commit/c1c4f627d03d95a60dd8bade12212150ed8af276).
- Release lineage: upstream `0.26.4`, including the public main-branch fixes in that snapshot.
- License: MIT. Copyright notices for **Nwflower** and **Scarlett** remain in [LICENSE](LICENSE).
- The public upstream Git history is preserved. Internal `dsh-chat-import` identifiers remain for installation/state compatibility.

## Inherited implementation

Upstream provides most of the general import/export plugin, conversion engine, persistence and deduplication behavior, host integration, UI framework, synthetic fixtures and tests. Historical [CHANGELOG.md](CHANGELOG.md) entries, general import/export guides, source icons and original import-panel images are inherited public material. Their historical comparison links continue to point to upstream.

## GPT2DSH changes

- A local ChatGPT archive browser with projects, branches, image previews and native Harness continuation.
- Keyword-coverage ranking, typed search and title/body filters.
- Deep Research report recovery, citations, reading and continuation context.
- Local PDF/Office/text extraction and bounded in-memory indexing.
- A bounded declarative-component parser and renderer for exported cards, tables and controls.
- ChatGPT conversion fixes for selected branches, image-only messages and orphan tool output.
- Synthetic tests, documentation, privacy exclusions and third-party attribution.

Most additions are in `lib/chatgpt-archive*.mjs`, `lib/chatgpt-rich*.mjs` and `src/client/chatgpt-*.js`. `lib/client.js` is generated from source fragments.

## 中文说明

GPT2DSH 明确基于上述公开提交改造，复用上游通用导入导出、转换、去重和宿主持久化能力。原作者版权、公开提交历史及第三方素材来源全部保留。新增部分集中于 ChatGPT 本地档案、分类检索、研究报告、文档索引和特殊组件渲染。

历史文档、品牌图标和原版导入面板图片来自公开上游，不来自用户的私人备份。本仓库不分发 Harness 程序、运行时文件或真实聊天导出。更多依赖与素材说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

# GPT2DSH

**在本机重现 ChatGPT 历史，查找旧对话与研究报告，再用你选择的模型在 DeepSeek Harness 中接着聊。**

[English](README.md) · [简体中文](README.zh-CN.md) · [使用指南](docs/CHATGPT-ARCHIVE.md) · [开源来源与许可证](THIRD_PARTY_NOTICES.md)

GPT2DSH 是基于 **[Nwflower/dsh-chat-import](https://github.com/Nwflower/dsh-chat-import)** 改造、独立维护的 MIT 开源项目。它复用上游的导入、转换、去重及持久化引擎，新增接近 ChatGPT 的档案浏览界面。保留上游作者版权声明与公开 Git 历史。本项目与 OpenAI、DeepSeek 无官方关联。

## 功能

- 原位读取已解压的 ChatGPT 官方备份，兼容分片导出；浏览历史、项目分组与对话分支。
- 按 **全部 / 聊天 / 附件 / 图片 / 文档 / 页面 / 项目** 分类搜索，可限定标题、文件名或正文。空格分隔关键词，命中的不同词越多，结果越靠前。
- 恢复 **Deep Research** 报告卡片，支持展开阅读、来源链接、全文检索和 Markdown 下载。
- 自动预览本地图片；读取 PDF、DOCX、XLSX、PPTX 及常见文本文件的正文。
- 将支持的参数卡片、勾选矩阵、表单与滑块还原为可操作组件。
- 把选中分支及关联研究报告带入原生 Harness 会话，通过 Harness 配置 API、管理密钥、切换模型继续聊。
- 保留上游通用会话导入 / 导出工具。支持格式见 [导入指南](docs/IMPORT-GUIDE.zh-CN.md)。

## 安装

需要 **DeepSeek Harness 0.2 桌面版 / Web**。开发环境要求 **Node.js 22.13+**。请使用与桌面应用版本一致的 Harness CLI。

从本仓库构建插件包：

```sh
git clone https://github.com/coolcoldplay/GPT2DSH.git
cd GPT2DSH
npm ci
npm run build
npm pack
```

在 Harness 的插件页面选择生成的包，或通过 CLI 安装：

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-chat-import-0.26.4-chatgpt.5.tgz
```

Web 版将 `desktop` 改为 `web`。重启 Harness 后，从侧栏打开 **ChatGPT 备份**。

为兼容已有安装和本地状态，npm 包标识、插件及状态目录的内部标识仍保留 `dsh-chat-import`。**不要同时加载原版插件与 GPT2DSH。** npm 上的 `dsh-chat-import` 属于上游，安装它不会得到本分支。仓库已禁止向 npm 发布，当前通过源码构建分发。

## 使用

1. 将官方下载的 ChatGPT ZIP 解压到本地文件夹。
2. 打开 **ChatGPT 备份**，选择该目录并读取备份。
3. 展开项目、打开会话，或点击 **搜索聊天与文件** 进行分类检索。
4. 选择对话分支，点击 **继续这段对话** 创建或打开对应的 Harness 续聊。
5. 在 Harness 中选择已配置的模型，发送新消息。

档案界面当前使用中文，继承的通用导入工具保留上游多语言支持。文件格式、报告恢复规则与范围详见 [使用指南](docs/CHATGPT-ARCHIVE.md)。

## 隐私

查看档案和搜索在本机运行。原始备份只读，全文索引仅保存在内存；持久化内容包括目录引用、本地项目名称及续聊引用。点击继续对话时，所选历史才保存为 Harness 会话。

发送新消息会使用你选定的模型提供方，相关上下文（包括恢复的研究报告）可能随请求发出。API 凭据由 Harness 管理。外部引用只有点击才打开，档案中的远程图片不会自动加载。

**请勿提交聊天备份、附件、个人截图、API Key 或本地状态。** 本仓库仅包含合成测试夹具和继承自公开上游的素材。参见 [隐私与贡献约定](docs/PRIVACY.md)。

## 范围限制

- 没有导出的项目名和附件无法凭空恢复；项目暂名可在本地修改。
- 图片、扫描版 PDF 目前仅支持文件名搜索，不含 OCR。
- 文档索引限制为单文件 32 MB、100 万字符、PDF 前 300 页；部分提取和失败状态会明确显示。
- Pages 展示导出文字，Sites 展示元数据与链接，不重建在线编辑器。
- 不支持的组件保留可读源码和原因；归档表单仅生成未发送的提示词。
- 其他二进制附件需要交给续聊模型时请重新附加；上下文长度由 Harness 和模型决定。

## 开发

```sh
npm ci
npm test
npm run lint
npm run check:linux
npm run check:leaks
npm run check:links
npm run check:tests
npm run build
```

浏览器代码在 `src/client/` 中维护，修改后执行 `npm run build:client`，不要手改生成的 `lib/client.js`。宿主模块是纯 ESM。GitHub Actions 负责验证，也可生成可安装的构建产物，不会向 npm 发布。

## 致谢与许可证

| 开源项目 | 本项目使用内容 | 许可证 |
| --- | --- | --- |
| [dsh-chat-import](https://github.com/Nwflower/dsh-chat-import) | 基础插件、导入导出引擎、宿主集成及测试 | MIT；保留原作者版权 |
| [Acorn](https://github.com/acornjs/acorn) | 解析导出组件中的受限表达式 | MIT |
| [fflate](https://github.com/101arrowz/fflate) | 读取 Office 文档的 ZIP 容器 | MIT |
| [fzstd](https://github.com/101arrowz/fzstd) | 继承的压缩会话导入支持 | MIT |
| [PDF.js](https://github.com/mozilla/pdf.js) | 通过 `pdfjs-dist` 提取本地 PDF 文字 | Apache-2.0 |
| [Lobe Icons](https://github.com/lobehub/lobe-icons) 及上游品牌素材 | 继承的来源与提供方图标 | 见逐项素材说明 |

完整来源、锁定版本、可选依赖及许可证副本见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [third_party/licenses](third_party/licenses)。[UPSTREAM.md](UPSTREAM.md) 记录公开上游基准提交和 GPT2DSH 新增部分。DeepSeek Harness 是外部宿主，不包含在本仓库分发中，其组件遵循各自许可证。第三方图形与商标不因本项目的 [MIT 许可证](LICENSE) 而被重新授权。

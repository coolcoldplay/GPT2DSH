# GPT2DSH

**Read your ChatGPT export locally, find old conversations and research reports, then continue them in DeepSeek Harness with the model you choose.**

[English](README.md) · [简体中文](README.zh-CN.md) · [User guide](docs/CHATGPT-ARCHIVE.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

GPT2DSH is an independently maintained, MIT-licensed derivative of **[Nwflower/dsh-chat-import](https://github.com/Nwflower/dsh-chat-import)**. It reuses the upstream import, conversion, deduplication and persistence engine, and adds a ChatGPT-style archive browser. The upstream authors' copyright notices and public Git history are preserved. This project is not affiliated with OpenAI or DeepSeek.

## Features

- Open an extracted official ChatGPT backup in place, including sharded exports. Browse history, project groups and conversation branches.
- Search **All / Chats / Attachments / Images / Documents / Pages / Projects**, with title/filename-only and body-only filters. Space-separated keywords rank by how many distinct terms match.
- Restore exported **Deep Research** reports as inline cards, expand them, follow sources, search their text and download Markdown.
- Preview local images automatically; read text from PDF, DOCX, XLSX, PPTX and common text formats.
- Render supported exported cards, checkbox matrices, forms and sliders as interactive controls.
- Continue the selected branch and its associated research reports in a native Harness chat. Configure providers, API keys and model switching through Harness.
- Retain upstream's general conversation import/export tools. Supported-format details remain in the [import guide](docs/IMPORT-GUIDE.md).

## Install

Requires **DeepSeek Harness 0.2 Desktop/Web**. Development requires **Node.js 22.13+**. Use the Harness CLI bundled with the same desktop application version.

Build the plugin package from this repository:

```sh
git clone https://github.com/coolcoldplay/GPT2DSH.git
cd GPT2DSH
npm ci
npm run build
npm pack
```

Install the resulting package through the Harness Plugins page, or use its CLI:

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-chat-import-0.26.4-chatgpt.5.tgz
```

For Harness Web, replace `desktop` with `web`. Restart Harness, then open **ChatGPT 备份** in its sidebar.

The npm package identifier and internal plugin/state identifiers remain `dsh-chat-import` for compatibility with existing installations. **Do not load the original plugin and GPT2DSH simultaneously.** The `dsh-chat-import` package on npm belongs to upstream and does not install this fork. This repository is marked private for npm publishing; source builds are the distribution route.

## Use

1. Extract your official ChatGPT export ZIP into a local folder.
2. Open **ChatGPT 备份**, choose that folder, and read the backup.
3. Expand projects, open a conversation, or choose **搜索聊天与文件** for scoped search.
4. Select a conversation branch, then click **继续这段对话** to create or reopen its Harness continuation.
5. Choose a configured model in Harness and send a new message.

The archive interface is currently in Chinese; the inherited general import tools retain their upstream localization. See the [detailed guide](docs/CHATGPT-ARCHIVE.md) for file types, report handling and limits.

## Privacy

Archive browsing and search run locally. Original backup files are read-only; full-text indexes live in memory. Only directory references, local project names and continuation references are persisted. The selected transcript is stored in Harness when you continue a chat.

Sending a new message uses your chosen model provider and may transmit that conversation's context, including restored research reports. Model credentials are managed by Harness. External source links open only when you choose them; remote archive images are not automatically fetched.

**Never commit exports, attachments, personal screenshots, API keys or local state.** This repository contains synthetic test fixtures and inherited public upstream assets only. See [privacy and contribution rules](docs/PRIVACY.md).

## Limits

- Missing project names or files cannot be recovered from absent export data. Provisional project names can be renamed locally.
- Images and scanned PDFs are searchable by filename; OCR is not included.
- Document indexing is bounded to 32 MB per file, one million text characters and 300 PDF pages. Partial or failed extraction is labeled.
- Pages expose exported text; Sites expose metadata and links. Their online editors are not recreated.
- Unsupported exported widgets retain readable source and an explanation. Archived form actions prepare unsent drafts.
- Binary attachments must be attached again if the continuation model needs them. Context size remains subject to Harness and the chosen model.

## Development

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

Edit browser code under `src/client/`, then run `npm run build:client`; `lib/client.js` is generated. Host modules are plain ESM. GitHub Actions validates the project and can build an installable artifact without publishing to npm.

## Credits and licenses

| Project | What GPT2DSH uses | License |
| --- | --- | --- |
| [dsh-chat-import](https://github.com/Nwflower/dsh-chat-import) | Foundational plugin, import/export engine, host integration and tests | MIT; original copyright retained |
| [Acorn](https://github.com/acornjs/acorn) | Parse bounded expressions in exported UI components | MIT |
| [fflate](https://github.com/101arrowz/fflate) | Read ZIP containers in Office documents | MIT |
| [fzstd](https://github.com/101arrowz/fzstd) | Inherited compressed-session import support | MIT |
| [PDF.js](https://github.com/mozilla/pdf.js) | Extract local PDF text through `pdfjs-dist` | Apache-2.0 |
| [Lobe Icons](https://github.com/lobehub/lobe-icons) and upstream brand assets | Inherited source/provider icons | See per-asset notices |

The complete attribution, pinned dependency versions, optional dependencies and copied license texts are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [third_party/licenses](third_party/licenses). [UPSTREAM.md](UPSTREAM.md) records the public base commit and the changes made by GPT2DSH. DeepSeek Harness is the external host, not redistributed here; its components retain their own licenses. Third-party artwork and trademarks are not relicensed by this project's [MIT license](LICENSE).

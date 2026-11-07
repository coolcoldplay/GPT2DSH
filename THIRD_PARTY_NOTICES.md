# Third-party notices / 开源来源与许可证

GPT2DSH's own changes and the upstream plugin code use the [MIT license](LICENSE). Third-party dependencies and assets retain their respective licenses, copyrights and trademark rights.

## Foundational project / 基础项目

**[Nwflower/dsh-chat-import](https://github.com/Nwflower/dsh-chat-import)** — MIT; Copyright (c) 2026 Nwflower and Copyright (c) 2026 Scarlett. GPT2DSH reuses and modifies its code, tests, documentation and assets. [UPSTREAM.md](UPSTREAM.md) identifies the exact public source snapshot and this derivative's additions. Original notices remain in [LICENSE](LICENSE).

## Runtime libraries / 运行时库

Exact resolutions and integrity hashes are in [package-lock.json](package-lock.json). These packages are dependencies, not vendored source trees.

| Component | Locked version | Use | License copy |
| --- | --- | --- | --- |
| [Acorn](https://github.com/acornjs/acorn) | 8.19.0 | Parse exported UI expressions into an AST for a restricted data evaluator | [MIT](third_party/licenses/acorn-MIT.txt) |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | Extract Office XML from ZIP containers | [MIT](third_party/licenses/fflate-MIT.txt) |
| [fzstd](https://github.com/101arrowz/fzstd) | 0.1.1 | Inherited compressed-session support | [MIT](third_party/licenses/fzstd-MIT.txt) |
| [PDF.js / pdfjs-dist](https://github.com/mozilla/pdf.js) | 6.5.438 | Local PDF text extraction in a worker | [Apache-2.0](third_party/licenses/pdfjs-Apache-2.0.txt) |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) | 1.1.0 | Optional platform dependency of `pdfjs-dist` | [MIT](third_party/licenses/canvas-MIT.txt) |

The optional `@napi-rs/canvas-*` binaries are selected by the package manager, not vendored here. Their native dependencies retain notices supplied in upstream distributions.

## Artwork / 图形素材

Source/provider icons in `assets/agents/` and `src/client/logos.js` are inherited from dsh-chat-import. [scripts/gen-logos.mjs](scripts/gen-logos.mjs) records source URLs and upstream normalization, scaling and recoloring. `lib/client.js` includes the generated icon data. `assets/dci-promo.png` and `docs/panel-*.png` are inherited public promotional/demo assets, not personal backup screenshots.

| Source | Material and attribution | License / terms |
| --- | --- | --- |
| [Lobe Icons](https://github.com/lobehub/lobe-icons), including `@lobehub/icons-static-svg` | AI/provider brand SVGs; Copyright (c) 2023 LobeHub. The exact historical icon-package version was not recorded upstream; provenance is the retained snapshot and generator | [MIT](third_party/licenses/lobe-icons-MIT.txt); trademarks remain with their owners |
| [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/desktop/build/appicon.svg) | Reasonix icon; Copyright (c) 2026 Reasonix Contributors | [MIT](third_party/licenses/reasonix-MIT.txt) |
| [Continue](https://github.com/continuedev/continue/blob/main/docs/logo/light.svg) | Continue icon; Copyright 2023 Continue Dev, Inc.; normalized/recolored by upstream | [Apache-2.0](third_party/licenses/continue-Apache-2.0.txt) |
| [Zed](https://github.com/zed-industries/zed/blob/main/assets/images/zed_logo.svg) | Zed icon from its repository, normalized/recolored by upstream | Repository [GPL-3.0 text](third_party/licenses/zed-GPL-3.0.txt), with components otherwise marked upstream; [brand usage terms](https://zed.dev/brand) apply to the logo and trademark |
| dsh-chat-import | Remaining original badges and generic artwork | Upstream [MIT](LICENSE) |

The Zed icon is a separately identified third-party item, not an MIT-relicensed asset. Its editable SVG and transformation source are included; no Zed application source is incorporated. Brand marks identify compatible sources, do not serve as GPT2DSH's logo and do not imply endorsement.

## Host and development dependencies / 宿主与开发依赖

- **DeepSeek Harness** and `@deepseek-ai/*` APIs are external host/peer dependencies. The desktop application, SDK package contents and runtime are not vendored. Their own distributions and terms apply; this notice does not assert a blanket open-source license for the Harness product.
- **[React](https://github.com/facebook/react)** is supplied by the host under MIT. GPT2DSH uses host React/Markdown components instead of bundling another frontend runtime.
- **[ESLint](https://github.com/eslint/eslint)** and its dependencies are development tools with their own package licenses; exact versions are in the lockfile. They are not bundled in the plugin tarball.
- CI uses **[actions/checkout](https://github.com/actions/checkout)**, **[actions/setup-node](https://github.com/actions/setup-node)** and **[actions/upload-artifact](https://github.com/actions/upload-artifact)** under MIT. They are not bundled in the plugin.

## 中文摘要

本项目是对 dsh-chat-import 的衍生改造，并非从零实现导入引擎。上表分别列明直接使用的库、可选依赖、继承的图形和外部宿主。许可证副本随源码和安装包分发；第三方图形及商标继续适用自身条款，根目录 MIT 许可证不对第三方素材重新授权。

# Privacy and contributions / 隐私与贡献约定

## Runtime data

Archive browsing reads the chosen export folder locally and adds no upload or analytics service. The full-text index lives in memory. Persisted references contain local paths, optional project renames and continuation IDs. Continuing creates a native Harness session; sending a later message can transmit context to the selected API provider.

Exports, credentials, native Harness state and personal screenshots are not part of this repository or plugin package. Host applications and providers have their own data handling policies.

## Reporting a problem

Use a minimal **synthetic** example. Invent names, IDs, file names and text. Avoid editing a real export into a fixture: nested metadata and image content can retain private information.

Do not post raw backups, user profile JSON, project metadata, API keys, authorization headers, filesystem paths, downloaded attachments or screenshots of personal conversations. Inspect logs before sharing them. A report normally needs the plugin version, OS, expected/actual behavior and an artificial schema example.

## Publication checks

- Keep exports and local test state outside the publishable tree. Local tools, dependencies and common export/state paths are ignored.
- Review staged files and `git diff --cached --stat` before committing.
- Run `npm run check:leaks` and inspect `npm pack --dry-run`. Pattern scans supplement human review and cannot prove that arbitrary personal data is safe.
- New binaries require public or deliberately synthetic provenance. User screenshots are not documentation assets by default.
- Use GitHub noreply authorship when personal email must remain private.
- Publish only the intended branch/artifact, never the backup parent directory.

## 中文说明

档案浏览和索引在本地运行；续聊会保存所选分支，发送新消息则可能把上下文交给所选模型提供方。仓库不包含真实聊天导出、附件、个人验收截图、API 密钥或本地状态。

问题报告请从零编写合成示例，不要上传真实备份或仅做表面脱敏的副本。维护者发布前应核对暂存文件、包清单、日志、提交署名和新增二进制文件，运行泄漏扫描。公开示例应与真实用户内容无关。

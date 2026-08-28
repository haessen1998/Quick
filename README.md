# Quick

Quick 是一个基于 Wails 3、Go、React 和 shadcn/ui 构建的跨平台开发者工具箱。

项目以本地优先为原则，把日常开发中零散、高频的格式化、转换、校验、网络和加密操作集中到一个轻量桌面应用中。功能会随着实际使用持续补充。

## 功能

- 字符串格式化：JSON、YAML、XML、HTML、CSS、JavaScript 的格式化与压缩。
- 数据转换：命名风格、JSON/YAML/XML/CSV/TOML、字符串编码、字节、代码模型和进制转换。
- 时间与标识符：Unix 时间戳、时区、日期差值、Cron、UUID、ULID、雪花 ID 和随机内容生成。
- 校验工具：JSONPath、XPath 和支持常用 flags 的正则表达式匹配。
- 加密与验证：MD5、SHA、HMAC、AES-GCM、RSA 和 JWT。
- 网络工具：Ping、DNS、TCP 端口、CIDR、HTTP/cURL 双向转换及本地进程查询。
- 文本工作台：Markdown 与 Mermaid 图表预览，以及行级、单词级和字符级文本差异比较。
- 文件工具：选择文件夹或拖入文件，预览并执行批量编号、替换、前缀和后缀重命名，支持撤销最近一次操作。
- 站点导航：按分组保存常用站点，支持 `1x1`、`2x2`、`4x2` 卡片和拖拽排序。
- AI 对话与小Q：通过 AI SDK 接入 OpenAI、Azure OpenAI、Anthropic、Gemini、Open Responses 和 OpenAI Compatible Provider，支持 Markdown、思考过程与工具步骤渲染。
- 浅色与深色主题、HTTP 代理策略。

## 技术栈

- [Wails 3](https://v3.wails.io/) + Go
- React 19 + TypeScript + Vite
- AI SDK + Comark
- Tailwind CSS 4 + shadcn/ui
- Wails 自动生成的 TypeScript 前后端绑定

## 环境要求

- Go 1.25 或兼容版本
- Wails CLI `v3.0.0-beta.14`
- Node.js 和 npm
- 对应平台的 Wails 构建依赖

可以使用下面的命令检查 Wails 环境：

```powershell
wails3 doctor
```

## 本地开发

```powershell
git clone https://github.com/haessen1998/Quick.git
cd Quick
npm install --prefix frontend
wails3 task dev
```

开发服务器默认使用 `127.0.0.1:9245`。完整功能需要在 Wails 桌面窗口中运行；直接用浏览器访问 Vite 地址只能预览前端界面。

Quick 的开发与桌面发布构建默认启用 Wails 3 的实验性应用 MCP 服务。应用启动后会在 `http://127.0.0.1:9099/mcp` 提供 Streamable HTTP Endpoint，设置页内置的“Quick App MCP”配置可以直接连接。该服务仅监听本机回环地址，但具备窗口、DOM 和已绑定 Go 服务的操作能力，请不要通过端口转发或反向代理暴露到外网。详见 [Wails MCP Service 指南](https://v3.wails.io/guides/mcp-service/)。

## 构建与打包

构建当前平台的应用：

```powershell
wails3 task build
```

生成当前平台的分发包：

```powershell
wails3 task package
```

产物默认写入 `bin/`。平台相关任务和签名配置位于 `build/` 目录。

## Windows Microsoft Store 包

Windows 商店版本使用 MSIX。推送形如 `v0.3.0` 的版本 Tag，或手动运行 `Windows Store MSIX` GitHub Actions 工作流时，会完成测试、构建，并生成带版本号的 Windows `.exe` 与供 Partner Center 上传的未签名 `.msix`，二者都附带 SHA-256 校验文件。Tag 构建会把这些文件加入对应的 GitHub Release；Microsoft Store 会在认证通过后使用 Microsoft 证书重新签名商店包。

商店产品为 [QuickDev](https://apps.microsoft.com/detail/9P084NQXKDMQ)，Store ID 是 `9P084NQXKDMQ`。Partner Center 分配的包标识已固化在构建配置中，不需要配置 GitHub Secret、仓库变量或签名证书。Actions 产物保留 30 天；其中的 `.msix` 可以直接上传到 Partner Center。GitHub Release 中的 Store MSIX 是未签名提交包，主要用于留档和商店上传，最终用户应从 Microsoft Store 安装已经过商店签名的版本。

发布新版本前先更新 `build/config.yml` 中的版本，然后创建并推送 Tag：

```powershell
git tag v0.3.0
git push origin v0.3.0
```

GitHub Release 中的独立 `.exe` 当前也没有 Authenticode 签名，Windows 可能显示 SmartScreen 提示。若以后把它作为商店外的正式分发渠道，需要再接入受信任的 Windows 代码签名服务。

## macOS 发布包

macOS 版本使用 Apple Developer ID 在 Mac App Store 之外分发。发布任务会构建同时支持 Apple Silicon 和 Intel Mac 的 Universal App，开启 Hardened Runtime 并使用 `Developer ID Application` 证书签名，对 App 和最终 DMG 分别提交 Apple 公证并 staple 票据，最后生成带版本号的 DMG 和 SHA-256 校验文件。

首次在发布 Mac 上配置公证凭据：

```bash
xcrun notarytool store-credentials quick-notary \
  --apple-id "<APPLE_ID>" \
  --team-id "FRR4S244RD"
```

`notarytool` 会通过终端安全提示输入 Apple 专用密码，不要把密码写入命令、代码或仓库。

然后执行：

```bash
wails3 task darwin:release:universal
```

产物为 `bin/Quick-<version>-macos-universal.dmg` 及同名 `.sha256` 文件。发布前需先更新 `build/config.yml` 中的版本，并确保 `build/darwin/Info.plist` 的版本已同步。

GitHub Actions 可以在推送版本 Tag 时自动执行相同流程，并将公证后的 Universal DMG 发布到 GitHub Release。先在仓库的 `Settings > Secrets and variables > Actions` 中配置：

- `APPLE_CERTIFICATE_P12_BASE64`：包含私钥的 Developer ID Application `.p12` 文件的 Base64 内容。
- `APPLE_CERTIFICATE_PASSWORD`：导出 `.p12` 时设置的密码。
- `APPLE_NOTARY_APPLE_ID`：用于 Apple 公证的 Apple ID。
- `APPLE_NOTARY_PASSWORD`：该 Apple ID 的应用专用密码。

在 macOS 上可用 `base64 < DeveloperIDApplication.p12 | pbcopy` 将证书编码并复制到剪贴板。证书、私钥和密码只能保存为 GitHub Actions Secret，不应提交到仓库。

以上 Secrets 配置完成后，先手动运行一次 `macOS Release` 工作流验证签名和公证。验证成功后再推送 `v0.3.0` Tag；同一个 Tag 会串行汇总 Windows EXE、Store MSIX、macOS DMG 及各自校验文件到同一个 GitHub Release，避免不同平台同时创建 Release 时发生竞争。

## 常用检查

```powershell
# 前端类型检查与生产构建
npm run build --prefix frontend

# Go 测试（包含发布构建启用的 Wails MCP 代码）
go test -tags mcp ./...

# 重新生成 Wails TypeScript 绑定
wails3 generate bindings -clean -ts -i
```

## 项目结构

```text
Quick/
├─ frontend/                 React 前端、组件和生成绑定
├─ build/                    跨平台构建、打包和签名配置
├─ main.go                   Wails 应用入口
├─ services/                 网络、MCP、进程和文件重命名后台服务
└─ Taskfile.yml              开发、构建和打包任务入口
```

## 项目状态

Quick 目前处于持续开发阶段，功能和界面仍会迭代。欢迎通过 [Issues](https://github.com/haessen1998/Quick/issues) 提交问题或建议。

## License

本项目采用仓库中 [LICENSE](./LICENSE) 文件所声明的许可证。

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
- 文本工作台：Markdown 安全预览，以及行级、单词级和字符级文本差异比较。
- 浅色与深色主题、HTTP 代理策略。

## 技术栈

- [Wails 3](https://v3.wails.io/) + Go
- React 18 + TypeScript + Vite
- Tailwind CSS 4 + shadcn/ui
- Wails 自动生成的 TypeScript 前后端绑定

## 环境要求

- Go 1.25 或兼容版本
- Wails CLI `v3.0.0-beta.9`
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

Windows 商店版本使用 MSIX。推送形如 `v0.1.0` 的版本 Tag，或手动运行 `Windows Store MSIX` GitHub Actions 工作流时，会完成测试、构建并生成供 Partner Center 直接上传的未签名 `.msix`。Microsoft Store 会在认证通过后使用 Microsoft 证书重新签名。

商店产品为 [QuickDev](https://apps.microsoft.com/detail/9P084NQXKDMQ)，Store ID 是 `9P084NQXKDMQ`。Partner Center 分配的包标识已固化在构建配置中，不需要配置 GitHub Secret、仓库变量或签名证书。工作流产物保留 30 天；下载并解压 Actions 产物后，把其中的 `.msix` 直接上传到 Partner Center。

发布新版本前先更新 `build/config.yml` 中的版本，然后创建并推送 Tag：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

MSIX 商店包不会发布到 GitHub Release，因为未经过 Microsoft Store 签名的包不适合直接提供给最终用户。若以后需要在商店之外分发 Windows 安装包，再单独接入受信任的代码签名服务。

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

以上 Secrets 配置完成后，先手动运行一次 `macOS Release` 工作流验证签名和公证。验证成功后再推送 `v0.1.0` Tag；同一个 Tag 会生成 Windows Store MSIX 构建产物，并创建包含 macOS DMG 与校验文件的 GitHub Release。

## 常用检查

```powershell
# 前端类型检查与生产构建
npm run build --prefix frontend

# Go 测试
go test ./...

# 重新生成 Wails TypeScript 绑定
wails3 generate bindings -clean -ts -i
```

## 项目结构

```text
Quick/
├─ frontend/                 React 前端、组件和生成绑定
├─ build/                    跨平台构建、打包和签名配置
├─ main.go                   Wails 应用入口
├─ networkservice.go         网络与本地进程后台服务
├─ process_windows.go        Windows 进程查询实现
├─ process_unix.go           macOS/Linux 进程查询实现
└─ Taskfile.yml              开发、构建和打包任务入口
```

## 项目状态

Quick 目前处于持续开发阶段，功能和界面仍会迭代。欢迎通过 [Issues](https://github.com/haessen1998/Quick/issues) 提交问题或建议。

## License

本项目采用仓库中 [LICENSE](./LICENSE) 文件所声明的许可证。

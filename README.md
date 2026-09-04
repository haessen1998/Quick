# Quick

Quick 是一个基于 Wails 3、Go、React 和 shadcn/ui 构建的跨平台开发者工具箱。

项目以本地优先为原则，把日常开发中零散、高频的格式化、转换、校验、网络和加密操作集中到一个轻量桌面应用中。功能会随着实际使用持续补充。

## 功能

- 字符串格式化：JSON、YAML、XML、HTML、CSS、JavaScript 的格式化与压缩。
- 智能粘贴：应用重新获得焦点时识别新的剪贴板内容，经 Toast 确认后分流到对应工具；复制输出优先使用桌面原生剪贴板。
- 数据转换：文本与行清理、命名风格、JSON/YAML/XML/CSV/TOML、字符串编码、字节、代码模型和进制转换；CSV 导入导出使用原生文件对话框。
- 时间与标识符：Unix 时间戳、多时区对照、日期差值、时间段双向转换、Cron，以及由 Go 安全随机源生成的 UUID、ULID、雪花 ID 和随机内容。
- 校验工具：JSONPath、JSON Schema、XPath、CSS Selector、Glob，以及带匹配高亮、替换预览、批量测试和 AI 多语言代码生成的正则表达式。
- 加密与验证：由本地 Go Service 执行 MD5、SHA、HMAC、AES-GCM、RSA 和 JWT 操作。
- 网络工具：Ping、DNS、TCP 端口、CIDR、URL/Query 编辑、HTTP/cURL 双向转换及本地进程查询；关闭进程使用应用内确认对话框。
- 文本工作台：Markdown 与 Mermaid 图表预览，以及行级、单词级和字符级文本差异比较。
- 文件工具：文件摘要与元信息检查，以及带安全预览和撤销的批量重命名。
- 颜色与前端：HEX/RGB/HSL/OKLCH、对比度、渐变、阴影、CSS 单位和 SVG Data URL。
- 站点导航：按分组保存常用站点，支持 `1x1`、`2x2`、`4x2` 卡片和拖拽排序；远程图标验证后缓存到配置目录，本地图标通过原生对话框导入。
- AI 对话与小Q：通过 AI SDK 接入 OpenAI、Azure OpenAI、Anthropic、Gemini、Open Responses 和 OpenAI Compatible Provider；外部请求由受限的本机 Go 代理转发，并支持 Markdown、思考过程与工具步骤渲染。
- 浅色与深色主题、HTTP 代理策略。
- 简体中文与英文界面，可在设置中即时切换并长期保存。

## 技术栈

- [Wails 3](https://v3.wails.io/) + Go
- React 19 + TypeScript + Vite
- AI SDK + Comark
- Tailwind CSS 4 + shadcn/ui
- Wails 自动生成的 TypeScript 前后端绑定

## 本地能力边界

React 负责界面、文本格式化和可安全运行在 WebView 内的确定性转换；Go 负责设备与系统相关能力，包括原生剪贴板、安全随机数和密码学操作、文件对话框与受限文件读写、站点图标校验缓存、网络诊断、进程操作及 AI Provider 请求转发。这样可以统一桌面端行为，并避免把 CORS、浏览器权限或随机源差异暴露给功能按钮。

AI 网络代理只在应用内部创建带会话凭据的回环地址，校验目标 Provider 与请求路径，并遵循设置页的代理策略；它不是对外提供的通用 HTTP 代理。CSV 和本地图标等文件操作始终由用户通过原生对话框明确选择目标。

## 环境要求

- Go 1.25 或兼容版本
- Wails CLI `v3.0.0-beta.16`
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

Quick 开发服务器默认使用专用地址 `127.0.0.1:43121`，可通过 `QUICK_APP_PORT` 覆盖。完整功能需要在桌面窗口中运行；直接用浏览器访问 Vite 地址只能预览前端界面。

正式构建关闭 Wails 调试用应用 MCP。需要 A/B 调试时，显式运行 `wails3 build DEV=true QUICK_DEBUG_MCP=true`，然后在设置中启用 Quick App MCP（`http://127.0.0.1:43122/mcp`）。禁止在正式构建中同时启用 `production,mcp`；编译保护会阻止该组合。普通第三方 MCP 客户端不受此限制。

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

## 常用检查

```powershell
# 前端类型检查与生产构建
npm run build --prefix frontend

# 前端核心测试（不需要真实 AI/MCP）
npm test --prefix frontend

# Playwright CLI 行为测试：先启动前端开发服务器
npm run test:ui --prefix frontend

# 正式产物排除测试入口
npm run check:release --prefix frontend

# Go 正式配置测试
go test -tags production ./...

# 重新生成 Wails TypeScript 绑定
wails3 generate bindings -clean -ts -i
```

## 开发分支与配置隔离

`dev` 用于待验收功能，验收通过后再合并 `main`。不带 `production` 标签的应用名为 Quick Dev，持久配置与导航图标写入 Quick/dev 子目录；正式版本继续使用原 Quick 目录。首次开发启动不会复制正式配置，需单独填写测试配置。AI/MCP 凭据使用系统凭据存储中的随机密钥加密，旧格式在成功取得系统密钥后迁移。

页面卸载时保留会话内 ViewModel 和文档数据，关闭应用后清除工作文档与对话；敏感工作内容不写入草稿文件。详细范围、验收路径和发布注意事项见 [dev 交付记录](docs/dev-plan.md)。

## 项目结构

```text
Quick/
├─ frontend/                 React 前端、组件和生成绑定
├─ build/                    跨平台构建、打包和签名配置
├─ main.go                   Wails 应用入口
├─ internal/                 AI、加密、配置、网络、MCP、导航和文件后台模块
└─ Taskfile.yml              开发、构建和打包任务入口
```

## 项目状态

Quick 目前处于持续开发阶段，功能和界面仍会迭代。欢迎通过 [Issues](https://github.com/haessen1998/Quick/issues) 提交问题或建议。

## License

本项目采用仓库中 [LICENSE](./LICENSE) 文件所声明的许可证。

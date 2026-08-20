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

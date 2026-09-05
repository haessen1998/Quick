import { Button } from "@/components/ui/button"
import { writeClipboard } from "@/lib/clipboard"
import { uiText } from "@/lib/i18n"
import { QUICK_APP_MCP_URL,type MCPTransportType } from "@/lib/saved-connections"
import { cn } from "@/lib/utils"
import { INPUT_CLASS,JsonValue,SchemaField,TEXTAREA_CLASS,ToolResultView,useMCPInspectorPageViewModel } from "@/models/MCPInspectorPageModel"
import {
Braces,
Check,
CircleAlert,
CircleStop,
Clock3,
Copy,
History,
LoaderCircle,
Play,
PlugZap,
RefreshCw,
Save,
Search,
Server,
ShieldCheck,
Sparkles,
Trash2,
Wrench,
} from "lucide-react"
import { toast } from "sonner"

export default function MCPInspectorPage() {
 const { profiles, proxy, selectedProfileID, setSelectedProfileID, transportType, setTransportType, serverURL, setServerURL, headersText, setHeadersText, connectionMode, setConnectionMode, command, setCommand, argsJSON, setArgsJSON, envText, setEnvText, cwd, setCwd, connecting, connected, server, tools, toolSearch, setToolSearch, selectedName, setSelectedName, argumentsValue, rawArguments, setRawArguments, rawMode, setRawMode, calling, result, history, setHistory, showHistory, setShowHistory, applyProfile, saveProfile, selectedTool, filteredTools, closeConnection, loadTools, connect, updateArgument, callTool, inputSchema, requiredNames } = useMCPInspectorPageViewModel()
return (
    <section className="page-shell mcp-inspector-page-shell" data-wails-no-drag>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4" />{uiText("开发工具")}</div>
            <h1 className="text-3xl font-semibold tracking-tight">{uiText("MCP Server 测试")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{uiText("通过 Streamable HTTP、旧版 SSE 或本地 STDIO 连接，检查 Tools 并实际调用。")}</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : connecting ? "animate-pulse bg-amber-500" : "bg-muted-foreground/40")} />
            {connected ? `${server?.name ?? "MCP Server"} 已连接` : connecting ? uiText("正在建立连接") : uiText("尚未连接")}
          </div>
        </div>

        <article className="mb-4 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3.5">
            <Server className="size-4" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">{uiText("连接配置")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{uiText("可直接选择设置页中长期保存的 MCP 配置")}</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              {uiText("可保存为长期配置")}</div>
          </div>

          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-4">
              <label className="block space-y-1.5 text-xs font-medium">
                <span>{uiText("已保存的 MCP")}</span>
                <select className={INPUT_CLASS} value={selectedProfileID} disabled={connected || connecting} onChange={(event) => {
                  const id = event.target.value
                  setSelectedProfileID(id)
                  const profile = profiles.find((item) => item.id === id)
                  if (profile) applyProfile(profile)
                }}>
                  <option value="">{uiText("临时自定义（不会保存）")}</option>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <label className="block space-y-1.5 text-xs font-medium">
                  <span>Transport</span>
                  <select className={INPUT_CLASS} value={transportType} disabled={connected || connecting} onChange={(event) => setTransportType(event.target.value as MCPTransportType)}>
                    <option value="streamable-http">Streamable HTTP</option>
                    <option value="sse">{uiText("SSE（旧版兼容）")}</option>
                    <option value="stdio">{uiText("STDIO（本地进程）")}</option>
                  </select>
                </label>
                {transportType === "stdio" ? (
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span>{uiText("启动命令")}</span>
                    <input className={INPUT_CLASS} value={command} disabled={connected || connecting} onChange={(event) => setCommand(event.target.value)} placeholder={uiText("npx、uvx 或可执行文件路径")} />
                  </label>
                ) : (
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span>Server URL</span>
                    <input className={INPUT_CLASS} value={serverURL} disabled={connected || connecting} onChange={(event) => setServerURL(event.target.value)} placeholder={transportType === "sse" ? "http://127.0.0.1:3001/sse" : QUICK_APP_MCP_URL} />
                  </label>
                )}
              </div>
              {transportType === "stdio" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-xs font-medium"><span>{uiText("参数（JSON 字符串数组）")}</span><textarea className={`${TEXTAREA_CLASS} h-24`} value={argsJSON} disabled={connected || connecting} onChange={(event) => setArgsJSON(event.target.value)} placeholder={'["-y", "@example/mcp-server"]'} /></label>
                  <label className="block space-y-1.5 text-xs font-medium"><span>{uiText("环境变量（每行 KEY=value）")}</span><textarea className={`${TEXTAREA_CLASS} h-24`} value={envText} disabled={connected || connecting} onChange={(event) => setEnvText(event.target.value)} placeholder={"API_KEY=…\nLOG_LEVEL=error"} /></label>
                  <label className="block space-y-1.5 text-xs font-medium sm:col-span-2"><span>{uiText("工作目录（可选）")}</span><input className={INPUT_CLASS} value={cwd} disabled={connected || connecting} onChange={(event) => setCwd(event.target.value)} placeholder={uiText("留空使用 Quick 的当前目录")} /></label>
                </div>
              ) : (
                <label className="block space-y-1.5 text-xs font-medium">
                  <span className="flex items-center justify-between gap-2"><span>{uiText("自定义请求头")}</span><span className="font-normal text-muted-foreground">{uiText("每行填写一个 Header: value")}</span></span>
                  <textarea className={`${TEXTAREA_CLASS} h-24`} value={headersText} disabled={connected || connecting} onChange={(event) => setHeadersText(event.target.value)} placeholder={"Authorization: Bearer …\nX-API-Key: …"} />
                </label>
              )}
            </div>

            {transportType !== "stdio" ? <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">{uiText("连接方式")}</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {([
                  { id: "quick-proxy" as const, label: uiText("Quick 本地代理"), description: uiText("规避 WebView CORS，并使用设置页代理") },
                  { id: "direct" as const, label: uiText("直接连接"), description: uiText("适合已经允许 CORS 的 Server") },
                ]).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={cn(
                      "app-interactive rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                      connectionMode === option.id && "border-primary bg-muted ring-1 ring-primary",
                    )}
                    disabled={connected || connecting}
                    onClick={() => setConnectionMode(option.id)}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium">
                      <span className={cn("size-2 rounded-full border", connectionMode === option.id && "border-primary bg-primary")} />
                      {option.label}
                    </span>
                    <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">{option.description}</span>
                  </button>
                ))}
              </div>
            </fieldset> : (
              <div className="rounded-lg border bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mb-2 size-4 text-emerald-600 dark:text-emerald-400" />
                {uiText("STDIO 由 Quick 后端使用官方 Go SDK 启动，不经过 shell；命令必须是本机可执行程序。")}</div>
            )}
          </div>

          {server && (
            <div className="mx-4 mb-4 flex flex-col gap-3 rounded-lg border bg-muted/25 p-3 text-xs sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-2 font-medium"><Server className="size-3.5 shrink-0" /><span className="truncate">{server.name}</span><span className="font-normal text-muted-foreground">{server.version}</span></div>
              <div className="flex flex-wrap gap-1 sm:ml-auto">{server.capabilities.map((capability) => <span key={capability} className="rounded border bg-background px-1.5 py-0.5 text-[10px]">{capability}</span>)}</div>
              {server.instructions && <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground sm:max-w-sm">{server.instructions}</p>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t bg-muted/10 p-4 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{transportType === "stdio" ? uiText("本地进程：环境变量和工作目录仅用于本次启动") : `网络代理：${proxy.mode === "system" ? uiText("跟随系统/环境") : proxy.mode === "none" ? uiText("不使用") : proxy.url || uiText("自定义代理尚未填写")}`}</p>
            {connected ? (
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void closeConnection()}><CircleStop />{uiText("断开连接")}</Button>
            ) : (
              <div className="flex w-full gap-2 sm:w-auto">
                <Button type="button" variant="outline" className="flex-1 sm:flex-none" disabled={connecting} onClick={saveProfile}><Save />{uiText("保存配置")}</Button>
                <Button type="button" className="flex-1 sm:flex-none" disabled={connecting} onClick={() => void connect()}>{connecting ? <LoaderCircle className="animate-spin" /> : <PlugZap />}{connecting ? uiText("正在连接") : uiText("连接 Server")}</Button>
              </div>
            )}
          </div>
        </article>

        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm lg:max-h-[calc(100svh-12rem)]">
            <div className="flex items-center gap-2 border-b px-4 py-3.5">
              <Wrench className="size-4" />
              <h2 className="text-sm font-medium">Tools</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{tools.length}</span>
              <Button type="button" variant="ghost" size="icon-xs" className="ml-auto" disabled={!connected} onClick={() => void loadTools()} aria-label={uiText("重新读取工具")}><RefreshCw className="size-3.5" /></Button>
            </div>
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input className={`${INPUT_CLASS} pl-8`} value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder={uiText("搜索 Tools")} />
              </div>
            </div>
            <div className="grid max-h-72 gap-1 overflow-y-auto p-2 sm:grid-cols-2 lg:max-h-[calc(100svh-20rem)] lg:grid-cols-1">
              {!connected ? (
                <div className="p-5 text-center text-xs leading-5 text-muted-foreground sm:col-span-2 lg:col-span-1">{uiText("连接 Server 后显示可用 Tools")}</div>
              ) : filteredTools.length === 0 ? (
                <div className="p-5 text-center text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">{uiText("没有匹配的 Tool")}</div>
              ) : filteredTools.map((tool) => (
                <button
                  key={tool.name}
                  type="button"
                  className={cn(
                    "app-interactive rounded-lg border border-transparent p-3 text-left transition-colors hover:bg-muted",
                    selectedName === tool.name && "border-primary bg-muted ring-1 ring-primary",
                  )}
                  onClick={() => setSelectedName(tool.name)}
                >
                  <div className="flex items-center gap-2 text-xs font-medium"><Wrench className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{tool.title || tool.name}</span></div>
                  {tool.title && <code className="mt-1 block truncate text-[10px] text-muted-foreground">{tool.name}</code>}
                  {tool.description && <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{tool.description}</p>}
                </button>
              ))}
            </div>
          </aside>

          <article className="min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
            {!selectedTool ? (
              <div className="grid min-h-72 place-items-center p-8 text-center">
                <div><Braces className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{uiText("选择一个 Tool")}</p><p className="mt-1 text-xs text-muted-foreground">{uiText("查看参数 Schema 并实际调用")}</p></div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{selectedTool.title || selectedTool.name}</h2>
                    <code className="text-[11px] text-muted-foreground">{selectedTool.name}</code>
                    {selectedTool.description && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{selectedTool.description}</p>}
                  </div>
                  <Button type="button" className="w-full sm:w-auto" disabled={calling || !connected} onClick={() => void callTool()}>{calling ? <LoaderCircle className="animate-spin" /> : <Play />}{calling ? uiText("调用中") : uiText("调用 Tool")}</Button>
                </div>

                <div className="grid xl:grid-cols-2">
                  <section className="min-w-0 border-b p-4 xl:border-r xl:border-b-0">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-medium text-muted-foreground">{uiText("参数")}</h3>
                      <div className="flex rounded-lg border p-0.5 text-[10px]"><button type="button" className={cn("app-interactive rounded-md px-2 py-1", !rawMode && "bg-muted font-medium")} onClick={() => setRawMode(false)}>{uiText("表单")}</button><button type="button" className={cn("app-interactive rounded-md px-2 py-1", rawMode && "bg-muted font-medium")} onClick={() => setRawMode(true)}>JSON</button></div>
                    </div>
                    {rawMode ? (
                      <textarea className={`${TEXTAREA_CLASS} h-64`} value={rawArguments} onChange={(event) => setRawArguments(event.target.value)} spellCheck={false} />
                    ) : Object.keys(inputSchema.properties ?? {}).length > 0 ? (
                      <div className="grid gap-4">{Object.entries(inputSchema.properties ?? {}).map(([name, schema]) => <SchemaField key={name} name={name} schema={schema} required={requiredNames.has(name)} value={argumentsValue[name]} onChange={(value, remove) => updateArgument(name, value, remove)} />)}</div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">{uiText("这个 Tool 没有声明输入参数")}</div>
                    )}
                  </section>

                  <section className="min-w-0 p-4">
                    <div className="mb-3 flex h-7 items-center justify-between gap-2"><h3 className="text-xs font-medium text-muted-foreground">{uiText("调用结果")}</h3>{result && <Button type="button" variant="ghost" size="xs" onClick={async () => { await writeClipboard(JSON.stringify(result, null, 2)); toast.success(uiText("结果 JSON 已复制")) }}><Copy className="size-3" />{uiText("复制")}</Button>}</div>
                    {result ? <ToolResultView result={result} /> : <div className="grid min-h-52 place-items-center rounded-lg bg-muted/25 p-5 text-center text-xs text-muted-foreground">{uiText("调用完成后在这里显示结果")}</div>}
                  </section>
                </div>
              </>
            )}
          </article>
        </div>

        <article className="mt-4 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center gap-2 border-b px-4 py-3.5">
            <History className="size-4" /><h2 className="text-sm font-medium">{uiText("调用历史")}</h2><span className="text-[10px] text-muted-foreground">{history.length}</span>
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setShowHistory((value) => !value)}>{showHistory ? uiText("收起") : uiText("展开")}</Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={!history.length} onClick={() => setHistory([])} aria-label={uiText("清空调用历史")}><Trash2 className="size-3.5" /></Button>
          </div>
          {showHistory && (
            <div className="max-h-64 overflow-y-auto p-2">
              {history.length === 0 ? <div className="p-8 text-center text-xs text-muted-foreground">{uiText("暂无请求")}</div> : history.map((entry) => (
                <details key={entry.id} className="group mb-1 rounded-lg border bg-muted/15 text-[11px] last:mb-0">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                    {entry.success ? <Check className="size-3 text-emerald-500" /> : <CircleAlert className="size-3 text-destructive" />}
                    <code>{entry.method}</code><span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.detail}</span><Clock3 className="size-3 text-muted-foreground" /><span className="tabular-nums text-muted-foreground">{entry.duration} ms</span><span className="hidden text-muted-foreground sm:inline">{entry.at.toLocaleTimeString()}</span>
                  </summary>
                  {entry.payload !== undefined && <div className="border-t p-2"><JsonValue value={entry.payload} /></div>}
                </details>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

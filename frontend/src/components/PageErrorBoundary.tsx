import { uiText } from "@/lib/i18n"
import { Component, type ErrorInfo, type ReactNode } from "react"
export class PageErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page failed", error, info.componentStack)
  }
  render() {
    return this.state.error ? (
      <div role="alert" className="p-6">
        <p>{uiText("页面加载失败，文档数据仍保留。")}</p>
        <pre className="my-3 whitespace-pre-wrap text-xs">{this.state.error}</pre>
        <button className="rounded border px-3 py-2" onClick={() => this.setState({ error: "" })}>
          {uiText("重试")}
        </button>
      </div>
    ) : (
      this.props.children
    )
  }
}

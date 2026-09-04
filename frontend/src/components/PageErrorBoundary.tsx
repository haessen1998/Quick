import { Button } from "@/components/ui/button"
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
      <div role="alert" className="m-5 space-y-4 rounded-xl border bg-card p-6 text-sm">
        <p>{uiText("页面加载失败，文档数据仍保留。")}</p>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs leading-5">
          {this.state.error}
        </pre>
        <Button variant="outline" onClick={() => this.setState({ error: "" })}>
          {uiText("重试")}
        </Button>
      </div>
    ) : (
      this.props.children
    )
  }
}

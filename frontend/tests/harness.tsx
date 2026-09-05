import { ToolRunHistory } from "../src/components/ToolRunHistory"
import ValidationPage from "../src/pages/ValidationPage"
import { writeClipboard } from "../src/lib/clipboard"
import { clipboardObserver } from "../src/lib/clipboard-observer"
import { AssistantContextPreview } from "../src/components/AssistantContextPreview"
import { PageErrorBoundary } from "../src/components/PageErrorBoundary"
import "../src/styles/globals.css"
// Test-only entrypoint. Production has a single index.html entry and never imports this file.
import { createRoot } from "react-dom/client"
import { useState } from "react"
import { AssistantCapabilityProvider, useAssistantCapabilityRegistry } from "../src/lib/assistant-capabilities"
import { LanguageProvider } from "../src/lib/i18n"
import { ToolModels } from "../src/models/ToolModels"
import { runWorkflow } from "../src/lib/workflow"
import { recordManualOperation, recordToolRun, replayDetails, clearToolRuns, findToolRun } from "../src/lib/tool-results"

function BrokenPage() {
  throw new Error("UI review: " + "long-error-detail/".repeat(30))
  return null
}
function Harness() {
  const [showValidation, setShowValidation] = useState(false)
  const [broken, setBroken] = useState(false)
  const registry = useAssistantCapabilityRegistry()
  const [status, setStatus] = useState("ready")
  const workflow = async () => {
    try {
      if (registry.catalog().length < 20) throw new Error("Tools depend on page loading")
      const result = await runWorkflow(
        [
          {
            page: "converter",
            action: "convert",
            input: { module: "encoding", source: "base64", target: "text", input: btoa('{"items":[{"name":"Quick"}]}') },
          },
          { page: "formatter", action: "run", input: { operation: "json-format" }, fromPrevious: true },
          { page: "validation", action: "run", input: { mode: "jsonpath", expression: "$.items[0].name" }, fromPrevious: true },
        ],
        registry.execute,
      )
      if (!result.success || result.completed.length !== 3 || !result.artifactId || !findToolRun(result.artifactId)?.text.includes("Quick"))
        throw new Error(JSON.stringify(result))
      setStatus("headless workflow passed")
    } catch (error) {
      setStatus(`FAILED: ${String(error)}`)
    }
  }
  const permission = async () => {
    const result = (await registry.execute("network", "run", {
      operation: "http-execute",
      url: "https://example.invalid",
      method: "GET",
      operationAutoApproved: true,
    })) as { cancelled?: boolean }
    setStatus(result.cancelled ? "approval cancellation passed" : "FAILED: permission bypass")
  }
  return (
    <>
      <ToolRunHistory onNavigate={() => {}} />
      <button onClick={async () => {
        clearToolRuns()
        await recordManualOperation("network", "cidr", () => "native result visible", { input: { operation: "cidr", cidr: "192.168.1.0/24" }, replayAction: "run" })
        setStatus("native history ready")
      }}>Seed native history</button>
      <button onClick={() => {
        clearToolRuns()
        recordToolRun({page:"network", action:"run", startedAt:Date.now(), durationMs:1, success:true, text:"prior HTTP result", result:{success:true}}, {
          input:{operation:"http-execute", method:"POST", url:"https://example.invalid", body:"saved body"}, result:"prior HTTP result",
          replay:replayDetails("run", {operation:"http-execute", method:"POST", url:"https://example.invalid", body:"saved body", operationAutoApproved:true}),
        })
        setStatus("approval history ready")
      }}>Seed approval history</button>
      <button onClick={async () => {
        try {
          await registry.execute("validation", "run", {mode:"regex", expression:"foo", input:"foo", flags:"m"})
          const result = await registry.execute("validation", "run", {action:"show-code", mode:"jsonpath", language:"python", code:'import re\nprint(re.findall(r"foo", "foo"))', explanation:"Python example"}) as {success?: boolean}
          const context = registry.getPageContext("validation")
          if (!result.success || context?.mode !== "regex" || context?.flags !== "m" || context?.expression !== "foo" || !context?.hasGeneratedCode) throw Error("Code sync changed source or did not select visible mode")
          setShowValidation(true)
          setStatus("code sync passed")
        } catch (error) { setStatus(`FAILED: ${String(error)}`) }
      }}>Show generated code</button>
      {showValidation && <ValidationPage />}
      <button onClick={workflow}>Run headless workflow</button>
      <button onClick={permission}>Check permission</button>
      <button
        onClick={async () => {
          try {
            const previous = await navigator.clipboard.readText()
            try {
              await writeClipboard('{"from":"Quick clipboard regression"}')
              const value = await navigator.clipboard.readText()
              if (value !== '{"from":"Quick clipboard regression"}' || clipboardObserver.observe(value))
                throw Error("Local copy triggered detection")
              setStatus("local clipboard suppression passed")
            } finally {
              await navigator.clipboard.writeText(previous)
            }
          } catch (error) {
            setStatus(`FAILED: ${String(error)}`)
          }
        }}
      >
        Check local clipboard
      </button>
      <p role="status">{status}</p>
      <div className="mx-auto mt-8 max-w-sm p-4">
        <AssistantContextPreview context={{ input: "long-text/".repeat(100), operation: "json-format" }} />
      </div>
      <button onClick={() => setBroken(true)}>Show page error</button>
      {broken && (
        <PageErrorBoundary>
          <BrokenPage />
        </PageErrorBoundary>
      )}
    </>
  )
}
createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <AssistantCapabilityProvider>
      <ToolModels proxy={{ mode: "none", url: "" }} profiles={[]} onSaveProfile={() => {}}>
        <Harness />
      </ToolModels>
    </AssistantCapabilityProvider>
  </LanguageProvider>,
)

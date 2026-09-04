// Test-only entrypoint. Production has a single index.html entry and never imports this file.
import { createRoot } from "react-dom/client"
import { useState } from "react"
import { AssistantCapabilityProvider, useAssistantCapabilityRegistry } from "../src/lib/assistant-capabilities"
import { LanguageProvider } from "../src/lib/i18n"
import { ToolModels } from "../src/models/ToolModels"
import { runWorkflow } from "../src/lib/workflow"
import { findToolRun } from "../src/lib/tool-results"

function Harness() {
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
      <button onClick={workflow}>Run headless workflow</button>
      <button onClick={permission}>Check permission</button>
      <p role="status">{status}</p>
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

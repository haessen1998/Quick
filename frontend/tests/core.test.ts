import test from "node:test"
import assert from "node:assert/strict"
import { minify } from "html-minifier-terser"
import Papa from "papaparse"
import { formatJSON, parseJSONForConversion } from "../src/lib/data-integrity"
import { runRegexJob } from "../src/lib/regex-engine"
import { runWorkflow } from "../src/lib/workflow"
import { shouldSendOnEnter } from "../src/lib/chat-input"
import {scopedStorage} from "../src/lib/app-storage"

test("development storage never reads or clears release credentials", () => {
  const data = new Map<string,string>([['ai-profiles','release-value']])
  const backend = {getItem:(key:string)=>data.get(key) ?? null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}}
  const dev = scopedStorage(()=>backend,'quick-dev:')
  assert.equal(dev.getItem('ai-profiles'),null)
  dev.setItem('ai-profiles','development-value');dev.removeItem('ai-profiles')
  assert.equal(data.get('ai-profiles'),'release-value')
})

test("IME confirmation Enter and Shift+Enter never submit chat", () => {
  const event = (composing: boolean, keyCode = 13, shiftKey = false) =>
    ({ key: "Enter", keyCode, shiftKey, nativeEvent: { isComposing: composing, keyCode } }) as Parameters<typeof shouldSendOnEnter>[0]
  assert.equal(shouldSendOnEnter(event(true)), false)
  assert.equal(shouldSendOnEnter(event(false, 229)), false)
  assert.equal(shouldSendOnEnter(event(false, 13, true)), false)
  assert.equal(shouldSendOnEnter(event(false)), true)
})
import { redactToolData, toolEffect } from "../src/lib/tool-policy"
import { modelResult, recordToolRun, findToolRun, clearToolRuns } from "../src/lib/tool-results"
import { validateToolInput, toolDefinition } from "../src/lib/tool-definition"
import {
  addWorkspaceDocument,
  closeWorkspaceDocument,
  getActiveDocument,
  readWorkspaceFields,
  restoreWorkspaceDocument,
  selectWorkspaceDocument,
  updateWorkspaceFields,
} from "../src/lib/workspace-store"

test("JSON formatting preserves large IDs, decimal precision and exponent spelling", () => {
  const input = '{"id":9223372036854775807,"decimal":0.12345678901234567890,"exponent":1e100}'
  assert.equal(formatJSON(input, 0), input)
  assert.match(formatJSON('{"data":"{\\"id\\":9223372036854775807}"}', 2, true), /9223372036854775807/)
})
test("conversion rejects silent precision loss, including exponent notation", () => {
  for (const raw of ["9007199254740993", "9.007199254740993e15", "0.12345678901234567890", "1e400"])
    assert.throws(() => parseJSONForConversion(`[${raw}]`))
  assert.deepEqual(parseJSONForConversion("[0.1,1e3,1.2300,-0.00012]"), [0.1, 1000, 1.23, -0.00012])
})
test("CSV preserves identifier strings and boolean-looking text", () => {
  assert.deepEqual(Papa.parse("id,flag\n00123,true", { header: true, dynamicTyping: false }).data, [{ id: "00123", flag: "true" }])
})
test("HTML minifier preserves inline space and preformatted text", async () => {
  const html = '<span>Hello</span> <span>world</span><pre>  a\n   b </pre><script>const s = "a  b";</script>'
  const output = await minify(html, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    minifyJS: false,
    minifyCSS: false,
  })
  assert.match(output, /<\/span> <span>/)
  assert.match(output, /<pre>  a\n   b <\/pre>/)
  assert.match(output, /"a  b"/)
})
test("regex zero-width matches terminate and test cases do not share lastIndex", () => {
  assert.equal(JSON.parse(runRegexJob({ kind: "matches", expression: "(?=a)", flags: "g", input: "aaa" }) as string).length, 3)
  const results = runRegexJob({
    kind: "tests",
    expression: "a",
    flags: "g",
    input: "",
    cases: [
      { input: "a", expected: true },
      { input: "a", expected: true },
    ],
  }) as { passed: boolean }[]
  assert.ok(results.every((r) => r.passed))
  assert.throws(() => runRegexJob({ kind: "matches", expression: "x", flags: "g", input: "x".repeat(1_000_001) }))
})
test("sensitive context redaction covers objects, raw JSON, headers and private keys", () => {
  const data = {
    apiKey: "needle",
    env: { SECRET: "needle" },
    input: '{"apiKey":"needle"}',
    headers: "Authorization: Bearer needle",
    key: "-----BEGIN PRIVATE KEY-----\nneedle\n-----END PRIVATE KEY-----",
  }
  assert.ok(!JSON.stringify(redactToolData(data)).includes("needle"))
})
test("permission classification cannot be bypassed with automatic approval input", () => {
  assert.equal(toolEffect("network", "run", { operation: "http-execute", operationAutoApproved: true }), "network")
  assert.equal(toolEffect("file-tools", "execute", {}), "files")
  assert.equal(toolEffect("navigation", "batch-update", {}), "navigation")
  assert.equal(toolEffect("formatter", "run", {}), "local")
})
test("registry validates shared schema and strips untrusted approval", () => {
  assert.throws(() => validateToolInput("formatter", "run", { operation: "delete-all", input: "x" }))
  assert.throws(() => validateToolInput("converter", "convert", { module: "standard", source: "json", target: "yaml" }))
  assert.deepEqual(validateToolInput("formatter", "run", { operation: "json-format", input: "{}", operationAutoApproved: true }), {
    operation: "json-format",
    input: "{}",
  })
  assert.ok(toolDefinition("formatter", "run").inputSchema.properties)
})
test("workflow transfers an artifact ID locally and stops at failures", async () => {
  const inputs: Record<string, unknown>[] = []
  const result = await runWorkflow(
    [
      { page: "formatter", action: "run", input: {} },
      { page: "converter", action: "convert", input: {}, fromPrevious: true },
      { page: "formatter", action: "run", input: {} },
    ],
    async (_p, _a, input) => {
      inputs.push(input)
      return inputs.length === 1 ? { success: true, artifactId: "first" } : { success: false }
    },
  )
  assert.equal(inputs.length, 2)
  assert.equal(inputs[1].sourceResultId, "first")
  assert.equal(result.success, false)
})
test("workflow cancellation or prepared sensitive operation prevents later execution", async () => {
  const abort = new AbortController()
  let calls = 0
  const steps = [
    { page: "formatter" as const, action: "run", input: {} },
    { page: "converter" as const, action: "convert", input: {} },
  ]
  await runWorkflow(
    steps,
    async () => {
      calls++
      abort.abort()
      return { success: true }
    },
    abort.signal,
  )
  assert.equal(calls, 1)
  calls = 0
  const result = await runWorkflow(steps, async () => {
    calls++
    return { success: true, prepared: true, executed: false }
  })
  assert.equal(calls, 1)
  assert.equal(result.success, false)
})
test("document contents remain isolated, close supports undo", () => {
  const scope = "test-documents"
  updateWorkspaceFields(scope, { input: "first" })
  addWorkspaceDocument(scope)
  const second = getActiveDocument(scope)
  updateWorkspaceFields(scope, { input: "second" })
  selectWorkspaceDocument(scope, "default")
  assert.equal(readWorkspaceFields(scope).input, "first")
  closeWorkspaceDocument(scope, second)
  restoreWorkspaceDocument(scope)
  assert.equal(readWorkspaceFields(scope).input, "second")
})
test("result references retain full local text while model summaries are bounded", () => {
  clearToolRuns()
  const raw = "x".repeat(30000)
  const result = recordToolRun({
    page: "formatter",
    action: "run",
    startedAt: 0,
    durationMs: 1,
    success: true,
    text: raw,
    result: { result: raw },
  })
  assert.equal(findToolRun(result.id)?.text.length, 30000)
  assert.equal((modelResult(result.result) as { truncated: boolean }).truncated, true)
  assert.doesNotThrow(() => modelResult(undefined))
  clearToolRuns()
  assert.equal(findToolRun(result.id), undefined)
})

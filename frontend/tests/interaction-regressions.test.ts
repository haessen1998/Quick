import test from "node:test"
import assert from "node:assert/strict"
import { ClipboardObserver } from "../src/lib/clipboard-observer"
import { detectSmartInput } from "../src/lib/smart-input-detection"
import { checkInput } from "../src/lib/input-preflight"
import { addWorkspaceDocument, closeWorkspaceDocument, restoreWorkspaceDocument, getWorkspaceDocuments } from "../src/lib/workspace-store"
import { clearToolRuns, getToolRuns, recordManualOperation } from "../src/lib/tool-results"

test("document numbering never reuses closed names, including undo", () => {
  const scope = "monotonic-documents"
  addWorkspaceDocument(scope)
  closeWorkspaceDocument(scope, "default")
  addWorkspaceDocument(scope)
  assert.deepEqual(
    getWorkspaceDocuments(scope).map((d) => d.title),
    ["文档 2", "文档 3"],
  )
  restoreWorkspaceDocument(scope)
  addWorkspaceDocument(scope)
  const titles = getWorkspaceDocuments(scope).map((d) => d.title)
  assert.equal(new Set(titles).size, titles.length)
  assert.equal(titles.at(-1), "文档 4")
})

test("clipboard ignores startup, local copies, repeat focus and stale asynchronous reads", () => {
  const observer = new ClipboardObserver()
  assert.equal(observer.observe("startup"), false)
  assert.equal(observer.observe("external"), true)
  assert.equal(observer.observe("external"), false)
  const pending = observer.revision
  observer.rememberLocal('{"from":"Quick"}')
  assert.equal(observer.observe("stale external read", pending), false)
  assert.equal(observer.observe('{"from":"Quick"}'), false)
  assert.equal(observer.observe("another external value"), true)
})

test("smart detection routes URLs before YAML and declines ambiguous text", () => {
  for (const url of ["https://go.dev", "https://example.com/a?name=Quick#test"]) assert.equal(detectSmartInput(url)[0]?.page, "network")
  for (const value of [
    "hello world this is a test",
    "1700000000",
    "example.go.dev",
    "abcdefgh",
    "name: Quick",
    "https://bad url",
    '{"broken":',
    "<a><b></a>",
  ])
    assert.deepEqual(detectSmartInput(value), [], value)
  assert.equal(detectSmartInput('{"id":9223372036854775807}')[0]?.payload.input, '{"id":9223372036854775807}')
  assert.equal(detectSmartInput("<root />")[0]?.payload.operation, "xml-format")
  assert.equal(detectSmartInput("SGVsbG8=")[0]?.page, "converter")
  assert.deepEqual(detectSmartInput("/////w=="), [])
})

test("input preflight checks syntax without transforming input or executing regex", () => {
  assert.equal(checkInput({ format: "json", input: '{"id":9223372036854775807}' }), null)
  assert.match(checkInput({ format: "jsonpath", input: "<root />", expression: "$.name" })!, /jsonpath/)
  assert.match(checkInput({ format: "xml", input: '{"x":1}' })!, /XML/)
  assert.ok(checkInput({ format: "regex", input: "text", expression: "[" }))
  assert.equal(checkInput({ format: "regex", input: "a".repeat(30000) + "!", expression: "(a+)+$" }), null)
  assert.ok(checkInput({ format: "base64", input: "not base64!" }))
  assert.ok(checkInput({ format: "2", input: "123" }))
  assert.equal(checkInput({ format: "16", input: "0xFF_FF" }), null)
  assert.ok(checkInput({ format: "json-schema", input: "{}", expression: "[]" }))
  assert.match(checkInput({ format: "json", input: "x".repeat(200001) })!, /跳过自动检查/)
})

test("manual history counts successes and failures without exporting sensitive results", async () => {
  clearToolRuns()
  assert.equal(await recordManualOperation("crypto", "decrypt", () => "private plaintext"), "private plaintext")
  assert.equal(getToolRuns().length, 1)
  assert.equal(getToolRuns()[0].transferable, false)
  assert.ok(!JSON.stringify(getToolRuns()).includes("private plaintext"))
  await recordManualOperation("network", "ping", () => ({ success: false }))
  assert.equal(getToolRuns()[0].success, false)
  await assert.rejects(
    recordManualOperation("crypto", "decrypt", () => {
      throw Error("secret failure detail")
    }),
  )
  assert.equal(getToolRuns().length, 3)
  assert.equal(getToolRuns()[0].success, false)
  assert.ok(!JSON.stringify(getToolRuns()).includes("secret failure detail"))
})

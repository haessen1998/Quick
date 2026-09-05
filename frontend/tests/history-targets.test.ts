import test from "node:test"
import assert from "node:assert/strict"
import { historyTargets } from "../src/lib/history-targets"

test("history routing recognizes structured formats without treating plain text as YAML", () => {
  const targets = (text: string) => historyTargets({text, success:true})
  const json = '{"id":9007199254740993}'
  assert.deepEqual(targets(json).map(t => t.label), ["发送到 JSON 格式化", "JSON → YAML"])
  assert.equal(targets(json)[1].payload.input, json)
  assert.deepEqual(targets("name: Quick\nversion: 1").map(t => t.label), ["发送到 YAML 格式化", "YAML → JSON"])
  assert.deepEqual(targets("<root><name>Quick</name></root>").map(t => t.label), ["发送到 XML 格式化"])
  for (const text of ["plain output", "https://example.com", "{broken", "name: [", ""]) assert.deepEqual(targets(text), [])
  assert.deepEqual(historyTargets({text:json, success:false}), [])
  assert.deepEqual(historyTargets({text:json, success:true, transferable:false}), [])
})

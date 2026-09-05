import test from "node:test"
import assert from "node:assert/strict"
import { clearToolRuns, getToolRuns, recordManualOperation, recordToolRun, replayDetails, toolRunDetails } from "../src/lib/tool-results"

test("manual history captures parameters and results without exporting native output to workflows", async () => {
  clearToolRuns()
  const input = { operation: "cidr", cidr: "192.168.1.0/24" }
  const output = { success: true, output: "192.168.1.255" }
  await recordManualOperation("network", "cidr", () => output, { input, replayAction: "run" })
  const run = getToolRuns()[0]
  input.cidr = "changed"
  output.output = "changed"
  assert.equal(run.transferable, false)
  assert.deepEqual(run.result, { success: true })
  assert.equal(toolRunDetails(run.id)?.input.cidr, "192.168.1.0/24")
  assert.deepEqual(toolRunDetails(run.id)?.result, { success: true, output: "192.168.1.255" })
  assert.equal(toolRunDetails(run.id)?.replay?.input.cidr, "192.168.1.0/24")
})

test("manual failures retain the actual error and sensitive arguments cannot be replayed", async () => {
  clearToolRuns()
  await assert.rejects(
    recordManualOperation(
      "crypto",
      "AES",
      () => {
        throw new Error("Invalid key length")
      },
      {
        input: { password: "private-value" },
        replayAction: "run",
      },
    ),
  )
  const run = getToolRuns()[0]
  assert.equal(run.success, false)
  assert.deepEqual(toolRunDetails(run.id)?.result, { error: "Invalid key length" })
  assert.deepEqual(toolRunDetails(run.id)?.input, { password: "[已隐藏]" })
  assert.equal(toolRunDetails(run.id)?.replay, undefined)
})

test("replay snapshots detach input and strip obsolete source references and approval", () => {
  const input = { input: "resolved full source", sourceResultId: "expired", operationAutoApproved: true, nested: { value: 1 } }
  const replay = replayDetails("run", input)!
  input.nested.value = 2
  assert.deepEqual(replay.input, { input: "resolved full source", nested: { value: 1 } })
})

test("history eviction and clearing release local parameters and results", () => {
  clearToolRuns()
  const add = () =>
    recordToolRun(
      { page: "formatter", action: "run", startedAt: 0, durationMs: 1, success: true, text: "ok", result: "ok" },
      { input: { input: "original" }, result: "ok" },
    )
  const first = add()
  for (let i = 0; i < 40; i++) add()
  assert.equal(getToolRuns().length, 40)
  assert.equal(toolRunDetails(first.id), undefined)
  const last = getToolRuns()[0]
  clearToolRuns()
  assert.equal(toolRunDetails(last.id), undefined)
  assert.equal(getToolRuns().length, 0)
})

test("local history retains full lists while still masking sensitive fields", async () => {
  clearToolRuns()
  await recordManualOperation("file-tools", "inspect", () => Array.from({ length: 150 }, (_, index) => ({ index, token: "secret" })), {
    input: { paths: ["sample"] },
  })
  const result = toolRunDetails(getToolRuns()[0].id)?.result as { index: number; token: string }[]
  assert.equal(result.length, 150)
  assert.equal(result[149].index, 149)
  assert.equal(result[149].token, "[已隐藏]")
})

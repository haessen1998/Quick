// Independent, ephemeral CLI browser. Never import test fixtures from application code.
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"

const require = createRequire(import.meta.url)
const cli = require.resolve("@playwright/cli/playwright-cli.js")
const root = fileURLToPath(new URL("../../", import.meta.url))
const output = path.join(root, "output/playwright")
fs.mkdirSync(output, { recursive: true })
const session = `quick-history-${process.pid}`
function run(...args) {
  const result = spawnSync(process.execPath, [cli, `-s=${session}`, ...args], { cwd: root, encoding: "utf8", env: process.env })
  fs.appendFileSync(path.join(output, "history-regressions.log"), result.stdout + result.stderr)
  if (result.status !== 0 || result.stdout.includes("### Error")) throw new Error(result.stderr || result.stdout)
  return result.stdout
}
function code(callback) {
  return run("run-code", callback.toString())
}
try {
  run("open", process.env.QUICK_UI_URL || "http://127.0.0.1:43121")
  run("resize", "1000", "618")
  run("snapshot")
  code(async (page) => {
    await page.getByRole("button", { name: "校验工具", exact: true }).click()
    await page.getByRole("button", { name: "执行校验", exact: true }).click()
    await page.getByRole("textbox", { name: "表达式", exact: true }).fill("$.changed")
    await page.getByRole("textbox", { name: "待校验数据", exact: true }).fill('{"changed":"wrong current input"}')
    await page.getByRole("button", { name: "执行记录", exact: true }).click()
    const dialog = page.getByRole("dialog")
    const parameters = await dialog.getByLabel("执行参数", { exact: true }).textContent()
    if (!parameters.includes("store") || parameters.includes("wrong current input")) throw Error("History did not capture original input")
    await dialog.getByRole("button", { name: "重放", exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] article').length === 2)
    const results = await page.getByRole("dialog").getByLabel("执行结果", { exact: true }).allTextContents()
    if (results[0] !== results[1] || !results[0].includes("Go")) throw Error("Replay used current state instead of saved parameters")
    await page.screenshot({ path: "output/playwright/history-parameters-replay.png", animations: "disabled" })
    await page.keyboard.press("Escape")
    if (!(await page.getByRole("textbox", { name: "待校验数据", exact: true }).inputValue()).includes("store"))
      throw Error("Replay did not restore tool input")
  })
  run("goto", (process.env.QUICK_UI_URL || "http://127.0.0.1:43121") + "/tests/harness.html")
  run("snapshot")
  code(async (page) => {
    await page.getByRole("button", { name: "Seed native history", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "native history ready" }).waitFor()
    await page.getByRole("button", { name: "执行记录", exact: true }).click()
    const dialog = page.getByRole("dialog")
    if (!(await dialog.getByLabel("执行参数", { exact: true }).textContent()).includes("192.168.1.0/24"))
      throw Error("Native parameters absent")
    if ((await dialog.getByLabel("执行结果", { exact: true }).textContent()) !== "native result visible")
      throw Error("Native result replaced with status")
    await dialog.getByRole("button", { name: "重放", exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] article').length === 2)
    if (!(await page.getByRole("dialog").getByLabel("执行结果", { exact: true }).first().textContent()).includes("192.168.1.255"))
      throw Error("Native replay failed")
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Seed approval history", exact: true }).click()
    await page.getByRole("button", { name: "执行记录", exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "重放", exact: true }).click()
    await page.getByRole("heading", { name: "允许此次操作？", exact: true }).waitFor()
    if (!(await page.getByRole("dialog").textContent()).includes("saved body")) throw Error("Approval missing saved parameters")
    await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click()
    await page.getByRole("heading", { name: "执行记录", exact: true }).waitFor()
    if ((await page.getByRole("dialog").locator("article").count()) !== 1) throw Error("Cancelled replay created a run")
  })
  run("resize", "480", "520")
  run("snapshot")
  code(async (page) => {
    const size = await page.getByRole("dialog").boundingBox()
    if (!size || size.x < 0 || size.x + size.width > 480) throw Error("History overflows narrow window")
    await page.screenshot({ path: "output/playwright/history-narrow.png", animations: "disabled" })
  })
  console.log("History parameters, native results, replay, restored input, approval cancellation, and narrow layout passed")
} finally {
  run("close")
}

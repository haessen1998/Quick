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
const session = `quick-regression-${process.pid}`
function run(...args) {
  const result = spawnSync(process.execPath, [cli, `-s=${session}`, ...args], { cwd: root, encoding: "utf8", env: process.env })
  fs.appendFileSync(path.join(output, "interaction-regressions.log"), result.stdout + result.stderr)
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
    await page.getByRole("heading", { name: "校验工具", exact: true }).waitFor()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    if (await page.getByRole("button", { name: "取消预览", exact: true }).count()) throw Error("Non-regex mode has preview controls")
    await page.getByRole("button", { name: "执行校验", exact: true }).click()
    await page.getByRole("button", { name: "执行记录", exact: true }).click()
    await page.getByRole("dialog").getByText('[\n  "Go"\n]', { exact: true }).waitFor()
    if ((await page.getByRole("dialog").locator("article").count()) !== 1)
      throw Error("Manual validation must create exactly one history entry")
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "XPath", exact: true }).click()
    await page.getByText("输入格式提醒", { exact: true }).waitFor()
    await page.locator('[data-slot="input-preflight"]').filter({ hasText: "XML" }).waitFor()
    if (!(await page.getByRole("textbox", { name: "待校验数据", exact: true }).inputValue()).startsWith('{"store"'))
      throw Error("Switch overwrote input")
    await page.screenshot({ animations: "disabled", path: "output/playwright/validation-before-run.png" })
    await page.getByRole("button", { name: "载入示例", exact: true }).click()
    await page.locator('[data-slot="input-preflight"]').waitFor({ state: "hidden" })
    await page.getByRole("button", { name: "正则表达式", exact: true }).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    for (const name of ["载入示例", "取消预览", "执行校验"]) {
      const bounds = await page.getByRole("button", { name, exact: true }).boundingBox()
      if (!bounds || bounds.width > 160 || bounds.height > 40) throw Error("Validation toolbar button stretched")
    }
    await page.getByRole("textbox", { name: "表达式", exact: true }).fill("[")
    await page.locator('[data-slot="input-preflight"]').filter({ hasText: "regex:" }).waitFor()
    if (!(await page.getByRole("button", { name: "取消预览", exact: true }).isDisabled())) throw Error("Invalid regex started a preview")
    await page.getByRole("textbox", { name: "待校验数据", exact: true }).fill("a".repeat(30000) + "!")
    await page.getByRole("textbox", { name: "表达式", exact: true }).fill("(a+)+$")
    await page.getByRole("button", { name: "取消预览", exact: true }).click()
    if (!(await page.getByRole("button", { name: "取消预览", exact: true }).isDisabled())) throw Error("Preview was not cancelled")
    await page.getByRole("button", { name: "执行记录", exact: true }).click()
    if ((await page.getByRole("dialog").locator("article").count()) !== 1) throw Error("Live previews polluted history")
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "载入示例", exact: true }).click()
  })
  run("resize", "640", "520")
  code(async (page) => {
    for (const name of ["载入示例", "取消预览", "执行校验"]) {
      const bounds = await page.getByRole("button", { name, exact: true }).boundingBox()
      if (!bounds || bounds.width > 160 || bounds.x + bounds.width > 640) throw Error("Narrow toolbar overflow")
    }
    await page.getByRole("button", { name: "执行校验", exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ animations: "disabled", path: "output/playwright/validation-toolbar-narrow.png" })
  })
  run("resize", "1000", "618")
  code(async (page) => {
    await page.getByRole("button", { name: "字符串格式化", exact: true }).click()
    await page.getByRole("button", { name: "新建文档", exact: true }).click()
    await page.getByRole("tab", { name: "文档 1", exact: true }).click()
    await page.getByRole("button", { name: "关闭 文档 1", exact: true }).click()
    await page.getByRole("button", { name: "新建文档", exact: true }).click()
    await page.getByRole("tab", { name: "文档 3", exact: true }).waitFor()
    if ((await page.getByRole("tab", { name: "文档 2", exact: true }).count()) !== 1) throw Error("Duplicate document number")
    await page.getByRole("textbox", { name: "输入", exact: true }).fill("<root />")
    await page.locator('[data-slot="input-preflight"]').filter({ hasText: "json:" }).waitFor()
    await page.getByRole("combobox", { name: "选择工具", exact: true }).selectOption("xml-format")
    await page.getByText("已切换工具，原有输入仍保留。请确认数据和表达式适用于当前工具，或点击载入示例。", { exact: true }).waitFor()
    await page.getByRole("button", { name: "数据转换", exact: true }).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    await page.getByRole("textbox", { name: "输入", exact: true }).fill("not-json")
    await page.locator('[data-slot="input-preflight"]').filter({ hasText: "json:" }).waitFor()
    await page.screenshot({ animations: "disabled", path: "output/playwright/conversion-before-run.png" })
  })
  run("goto", new URL("/tests/harness.html", process.env.QUICK_UI_URL || "http://127.0.0.1:43121").href)
  run("snapshot")
  code(async (page) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
    await page.getByRole("button", { name: "Check local clipboard", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "local clipboard suppression passed" }).waitFor()
  })
  console.log("PASS: manual validation history, preview cancellation/toolbar, preflight across three tools, unique document names.")
} finally {
  run("close")
}

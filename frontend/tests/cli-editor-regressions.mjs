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
const session = `quick-editor-regression-${process.pid}`
function run(...args) {
  const result = spawnSync(process.execPath, [cli, `-s=${session}`, ...args], { cwd: root, encoding: "utf8", env: process.env })
  fs.appendFileSync(path.join(output, "editor-regressions.log"), result.stdout + result.stderr)
  if (result.status !== 0 || result.stdout.includes("### Error")) throw new Error(result.stderr || result.stdout)
  return result.stdout
}
function code(callback) {
  return run("run-code", callback.toString())
}
try {
  run("open", process.env.QUICK_UI_URL || "http://127.0.0.1:43121")
  run("resize", "1100", "800")
  run("snapshot")
  code(async (page) => {
    await page.getByRole("button", { name: "字符串格式化", exact: true }).click()
    await page
      .getByRole("textbox", { name: "输入", exact: true })
      .fill(Array.from({ length: 100 }, (_, i) => `${i}:` + "long text ".repeat(100)).join("\n"))
    await page.getByRole("textbox", { name: "输入", exact: true }).press("Control+End")
    const boxes = await page.getByRole("textbox", { name: "输入", exact: true }).evaluate((el) => {
      const gutter = el.parentElement.querySelector('[data-slot="editor-gutter"]')
      return {
        left: el.getBoundingClientRect().left,
        gutterRight: gutter.getBoundingClientRect().right,
        horizontal: el.scrollLeft,
        vertical: el.scrollTop,
        gutterScroll: el.getBoundingClientRect().top + 16 - gutter.firstElementChild.firstElementChild.getBoundingClientRect().top,
      }
    })
    if (
      boxes.horizontal <= 0 ||
      boxes.vertical <= 0 ||
      boxes.gutterRight > boxes.left + 1 ||
      Math.abs(boxes.vertical - boxes.gutterScroll) > 1
    )
      throw Error("Gutter overlaps text or loses vertical sync")
    await page.screenshot({ path: "output/playwright/editor-long-scroll.png" })
    await page.getByRole("button", { name: "设置", exact: true }).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    const toggle = page.getByRole("switch", { name: "显示编辑器行号", exact: true })
    if ((await toggle.getAttribute("aria-checked")) !== "true") throw Error("Line numbers not enabled by default")
    await toggle.click()
    await page.getByRole("button", { name: "字符串格式化", exact: true }).click()
    if (await page.locator('[data-slot="editor-gutter"]').count()) throw Error("Line numbers remain visible")
    await page.reload()
    await page.getByRole("button", { name: "字符串格式化", exact: true }).click()
    if (await page.locator('[data-slot="editor-gutter"]').count()) throw Error("Setting did not persist")
    await page.getByRole("button", { name: "设置", exact: true }).click()
    await page.getByRole("switch", { name: "显示编辑器行号", exact: true }).click()
    await page.getByRole("button", { name: "文本工作台", exact: true }).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    await page.getByRole("textbox", { name: "Markdown", exact: true }).fill("```mermaid\nflowchart LR\n  A[Start] --> B[End]\n```")
    await page.locator(".quick-mermaid svg").waitFor({ timeout: 15000 })
    const canvas = page.locator(".mermaid-canvas")
    await canvas.scrollIntoViewIfNeeded()
    const box = await canvas.boundingBox()
    if (box.height > 350) throw Error("Small Mermaid has oversized canvas")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 25, { steps: 6 })
    await page.mouse.up()
    if (!(await canvas.locator(":scope > div").getAttribute("style")).includes("translate(50px, 25px)"))
      throw Error("Mermaid cannot pan when it fits")
    await page.screenshot({ path: "output/playwright/mermaid-adaptive-pan.png" })
    await page.getByRole("button", { name: "重置缩放与位置", exact: true }).click()
    if (!(await canvas.locator(":scope > div").getAttribute("style")).includes("translate(0px, 0px)")) throw Error("Pan reset failed")
    await page.getByRole("button", { name: "校验工具", exact: true }).click()
    await page.getByRole("button", { name: "JSON Schema", exact: true }).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
    const previous = await page.evaluate(() => navigator.clipboard.readText())
    try {
      await page.evaluate(() => navigator.clipboard.writeText('{"type":"object","properties":{"name":{"type":"string"}}}'))
      const schema = page.getByRole("textbox", { name: "表达式", exact: true })
      await schema.focus()
      await schema.press("Control+a")
      await schema.press("Control+v")
      await page.waitForFunction(() => document.querySelector('textarea[aria-label="表达式"]').value.includes('\n  "type"'))
      if ((await schema.boundingBox()).height < 180) throw Error("Schema editor too small")
      await page.screenshot({ path: "output/playwright/schema-paste.png" })
      await page.evaluate(() => navigator.clipboard.writeText("{broken"))
      await schema.press("Control+a")
      await schema.press("Control+v")
      await page.getByText("JSON Schema 格式化失败，已保留粘贴内容。可请小Q修复。", { exact: true }).waitFor()
      if ((await schema.inputValue()) !== "{broken") throw Error("Invalid paste was lost")
    } finally {
      await page.evaluate((text) => navigator.clipboard.writeText(text), previous)
    }
    await page.getByRole("button", { name: "正则表达式", exact: true }).click()
    await page.getByRole("button", { name: "载入示例", exact: true }).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    const preview = page.locator('pre[aria-label="替换结果预览"]')
    await page.waitForFunction(
      () => document.querySelector('pre[aria-label="替换结果预览"]')?.textContent === "访问 github.com/haessen1998/Quick 或 go.dev",
    )
    await page.getByRole("textbox", { name: "替换为", exact: true }).fill("[$<host>]")
    await page.waitForFunction(
      () => document.querySelector('pre[aria-label="替换结果预览"]')?.textContent === "访问 [github.com]/haessen1998/Quick 或 [go.dev]",
    )
    await page.getByRole("button", { name: "执行替换", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('pre[aria-label="替换结果"]')?.textContent === "访问 [github.com]/haessen1998/Quick 或 [go.dev]")
    const source = page.getByRole("textbox", { name: "待校验数据", exact: true })
    const expression = page.getByRole("textbox", { name: "表达式", exact: true })
    const replacement = page.getByRole("textbox", { name: "替换为", exact: true })
    await expression.fill("foo")
    await source.fill("foo foo")
    await replacement.fill("bar")
    await page.getByRole("button", { name: "执行替换", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('pre[aria-label="替换结果"]')?.textContent === "bar bar")
    if (await source.inputValue() !== "foo foo") throw Error("Replace modified original text")
    await page.getByRole("checkbox", { name: "g", exact: true }).uncheck()
    await page.getByRole("button", { name: "执行替换", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('pre[aria-label="替换结果"]')?.textContent === "bar foo")
    await replacement.fill("")
    await source.fill("foo")
    await page.getByRole("button", { name: "执行替换", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('pre[aria-label="替换结果"]')?.textContent === "替换结果为空")
    await page.getByRole("button", { name: "查找匹配", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('pre[aria-label="匹配结果"]')?.textContent.includes('"value": "foo"'))
    await source.fill("foo foo")
    await replacement.fill("bar")
    await page.getByRole("button", { name: "执行替换", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('pre[aria-label="替换结果"]')?.textContent === "bar foo")
    await page.getByRole("textbox", { name: "表达式", exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: "output/playwright/regex-replacement-form.png" })
    await page.setViewportSize({ width: 640, height: 800 })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error("Replacement form overflows")
    await page.screenshot({ path: "output/playwright/regex-replacement-narrow.png" })
    await preview.scrollIntoViewIfNeeded()
    await page.screenshot({ path: "output/playwright/regex-replacement-visible.png" })
  })
  console.log(
    "PASS: gutter scroll/toggle/persistence, adaptive Mermaid panning, schema paste success/failure, named-group replacement preview.",
  )
} finally {
  run("close")
}

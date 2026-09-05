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
    await page.getByRole("textbox", { name: "替换为", exact: true }).fill("[$<host>]")
    if (await page.getByRole("textbox", { name: "替换为", exact: true }).evaluate(el => getComputedStyle(el).resize) !== "none") throw Error("Replacement input can resize")
    const replaceGroup = page.getByRole("region", { name: "替换结果", exact: true })
    const cells = await page.locator('[data-slot="regex-row"] > section').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, name:el.getAttribute("aria-label") } }))
    if (cells.map(c => c.name).join("|") !== "原始文本|匹配结果|匹配高亮与替换|替换结果") throw Error("Wrong quadrant order")
    if (Math.abs(cells[0].y-cells[1].y)>1 || Math.abs(cells[2].y-cells[3].y)>1 || cells[1].x<=cells[0].x || cells[2].y<=cells[0].y) throw Error("Not a 2x2 grid")
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
    if (await page.locator('pre[aria-label="替换结果"]').textContent() !== "替换结果为空") throw Error("Find overwrote replacement result")
    const previousMatches = await page.locator('pre[aria-label="匹配结果"]').textContent()
    await source.fill("foo foo")
    await replacement.fill("bar")
    await page.getByRole("button", { name: "执行替换", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('pre[aria-label="替换结果"]')?.textContent === "bar foo")
    if (await page.locator('pre[aria-label="匹配结果"]').textContent() !== previousMatches) throw Error("Replacement overwrote matches")
    const vertical = page.getByRole("separator", { name: "调整匹配行列宽", exact: true })
    const horizontal = page.getByRole("separator", { name: "调整匹配行高度", exact: true })
    const otherVertical = page.getByRole("separator", { name: "调整替换行列宽", exact: true })
    const otherHorizontal = page.getByRole("separator", { name: "调整替换行高度", exact: true })
    for (const [handle, dx, dy] of [[vertical, 50, 0], [horizontal, 0, 50], [otherVertical, -50, 0], [otherHorizontal, 0, 50]]) {
      const otherRow = page.locator(`[data-slot="regex-row"][data-row="${handle === vertical || handle === horizontal ? "replace" : "match"}"]`)
      const otherBefore = await otherRow.boundingBox()
      const otherWidthBefore = await otherRow.locator(":scope > section").first().boundingBox()
      await handle.scrollIntoViewIfNeeded()
      const before = Number(await handle.getAttribute("aria-valuenow"))
      const box = await handle.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, {steps:6})
      await page.mouse.up()
      if (Math.abs(Number(await handle.getAttribute("aria-valuenow")) - before) < 3) throw Error("Row divider did not move")
      const otherAfter = await otherRow.boundingBox()
      const otherWidthAfter = await otherRow.locator(":scope > section").first().boundingBox()
      if (Math.abs(otherAfter.height - otherBefore.height) > 1 || Math.abs(otherWidthAfter.width - otherWidthBefore.width) > 1) throw Error("Resizing changed the other row")
    }
    await vertical.focus()
    const beforeKey = Number(await vertical.getAttribute("aria-valuenow"))
    await vertical.press("ArrowLeft")
    if (Number(await vertical.getAttribute("aria-valuenow")) >= beforeKey) throw Error("Keyboard resize failed")
    const widths = await page.locator('[data-slot="regex-row"] > section').evaluateAll(els => els.map(el => el.getBoundingClientRect().width))
    if (Math.abs(widths[0] - widths[2]) < 20) throw Error("Independent column widths were not retained")
    await page.getByRole("textbox", { name: "表达式", exact: true }).scrollIntoViewIfNeeded()
    await page.waitForFunction(() => document.querySelector('pre[aria-label="匹配高亮"]')?.textContent === "foo foo")
    await source.focus()
    const focusStyle = await source.evaluate(el => ({ radius: getComputedStyle(el).borderRadius, border: getComputedStyle(el).borderWidth, wrapperShadow: getComputedStyle(el.parentElement).boxShadow }))
    if (focusStyle.radius !== "0px" || focusStyle.border !== "0px" || focusStyle.wrapperShadow !== "none") throw Error("Nested editor focus decoration returned")
    await page.screenshot({ path: "output/playwright/regex-replacement-form.png" })
    await page.locator('[data-slot="regex-grid"]').screenshot({ path: "output/playwright/regex-quadrants.png" })
    await page.setViewportSize({ width: 640, height: 800 })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error("Replacement form overflows")
    await page.screenshot({ path: "output/playwright/regex-replacement-narrow.png" })
    await replaceGroup.scrollIntoViewIfNeeded()
    await page.screenshot({ path: "output/playwright/regex-replacement-visible.png" })
  })
  run("goto", new URL("/tests/harness.html", process.env.QUICK_UI_URL || "http://127.0.0.1:43121").href)
  run("snapshot")
  code(async page => {
    await page.getByRole("button", {name:"Show generated code", exact:true}).click()
    await page.getByRole("status").filter({hasText:"code sync passed"}).waitFor()
    const generated = page.locator('pre[aria-label="生成代码"]')
    await generated.waitFor()
    if (!(await generated.textContent()).includes('import re')) throw Error("Generated code not rendered")
    await page.getByRole("button", {name:"JSONPath", exact:true}).click()
    await page.getByRole("button", {name:"正则表达式", exact:true}).click()
    if (!(await generated.textContent()).includes('import re')) throw Error("Mode switching erased generated code")
    await generated.scrollIntoViewIfNeeded()
    await page.screenshot({path:"output/playwright/regex-generated-code.png"})
  })
  console.log(
    "PASS: gutter scroll/toggle/persistence, adaptive Mermaid panning, schema paste success/failure, two independent regex rows, unified editor focus, fixed replacement input, independent matching/replacement results, independent column and height dividers, headless generated-code display/persistence.",
  )
} finally {
  run("close")
}

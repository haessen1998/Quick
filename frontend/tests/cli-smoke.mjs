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
const session = `quick-smoke-${process.pid}`
function run(...args) {
  const result = spawnSync(process.execPath, [cli, `-s=${session}`, ...args], { cwd: root, encoding: "utf8", env: process.env })
  fs.appendFileSync(path.join(output, "smoke.log"), result.stdout + result.stderr)
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
    await page.getByRole("button", { name: "字符串格式化", exact: true }).click()
    await page.getByRole("heading", { name: "字符串格式化", exact: true }).waitFor()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    const input = page.getByRole("textbox", { name: "输入", exact: true })
    const expected = '{"id":9223372036854775807}'
    await input.fill(expected)
    await page.getByRole("button", { name: "执行", exact: true }).click()
    await page.waitForFunction(() => document.querySelector("textarea[readonly]")?.value.includes("9223372036854775807"))
    await page.getByRole("combobox", { name: "选择工具", exact: true }).selectOption("json-minify")
    if ((await input.inputValue()) !== expected) throw new Error("Operation erased input")
    await page.getByRole("button", { name: "首页", exact: true }).click()
    await page.getByRole("button", { name: "字符串格式化", exact: true }).click()
    if ((await input.inputValue()) !== expected) throw new Error("Page state lost")
    await page.getByRole("button", { name: "新建文档", exact: true }).click()
    await input.fill('{"document":2}')
    await page.getByRole("button", { name: "文档 1", exact: true }).click()
    if ((await input.inputValue()) !== expected) throw new Error("Document state leaked")
    await page.getByRole("button", { name: "文档 2", exact: true }).click()
    if ((await input.inputValue()) !== '{"document":2}') throw new Error("Second document lost")
    await page.getByRole("button", { name: "展开小Q侧边栏", exact: true }).click()
    await page.waitForFunction(() => document.querySelector(".assistant-panel").getBoundingClientRect().right <= innerWidth + 1)
    const width = await page.evaluate(() => ({
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
      drawer: document.querySelector(".assistant-panel").getBoundingClientRect().width,
    }))
    if (width.scroll > width.viewport + 1 || width.drawer < 280) throw new Error("Narrow layout overflow")
    await page.getByRole("button", { name: "收起小Q", exact: true }).click()
    await page.keyboard.press("Control+k")
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    await page.getByRole("button", { name: "regex 校验", exact: true }).click()
    await page.getByRole("heading", { name: "校验工具", exact: true }).waitFor()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    await page.getByRole("textbox", { name: "regex 表达式", exact: true }).fill("(a+)+$")
    await page.getByRole("textbox", { name: "待校验数据", exact: true }).fill("a".repeat(40) + "!")
    await page.getByRole("button", { name: "执行校验", exact: true }).click()
    await page.getByText("正则执行超时，已终止。请简化表达式或缩小输入。", { exact: true }).first().waitFor({ timeout: 10000 })
    await page.getByRole("button", { name: "首页", exact: true }).click()
    await page.getByRole("heading", { name: "QUICK", exact: true }).waitFor()
    return "PASS: regex timeout leaves the UI responsive"
  })
  code(async page => {
    await page.getByRole("button", {name:"字符串格式化",exact:true}).click()
    await page.getByRole("textbox", {name:"输入",exact:true}).fill('{"首页":"设置"}')
    await page.getByRole("button", {name:"设置",exact:true}).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async page => {
    await page.getByRole("button", {name:"English English interface",exact:true}).click()
    await page.getByRole("button", {name:"Formatter",exact:true}).click()
    if(await page.getByRole("textbox", {name:"Input",exact:true}).inputValue() !== '{"首页":"设置"}') throw new Error("Translation modified document")
    await page.getByRole("button", {name:"Settings",exact:true}).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async page => {
    await page.getByRole("button", {name:"Simplified Chinese Chinese interface",exact:true}).click()
  })
  run("goto", new URL("/tests/harness.html", process.env.QUICK_UI_URL || "http://127.0.0.1:43121").href)
  run("snapshot")
  code(async (page) => {
    await page.getByRole("button", { name: "Run headless workflow", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "headless workflow passed" }).waitFor()
    await page.getByRole("button", { name: "Check permission", exact: true }).click()
    return await page.locator("body").ariaSnapshot()
  })
  code(async (page) => {
    await page.getByRole("button", { name: "取消", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "approval cancellation passed" }).waitFor()
  })
  console.log(
    "PASS: precision, page cache, document isolation, 1000×618 drawer, command palette, regex timeout, headless 3-step workflow, approval cancellation",
  )
} finally {
  run("close")
}

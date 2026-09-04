import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const directory = fileURLToPath(new URL("../dist/", import.meta.url))
const forbidden = [
  "Quick isolated test harness",
  "Run headless workflow",
  "approval cancellation passed",
  "quick-smoke-",
  "quick-editor-regression-",
  "quick-regression-",
  "Check local clipboard",
  "quick-ui-audit-",
  "Show page error",
  "PWTEST_DAEMON_SESSION_DIR",
]
function inspect(folder) {
  for (const file of fs.readdirSync(folder, { withFileTypes: true })) {
    const target = path.join(folder, file.name)
    if (file.isDirectory()) inspect(target)
    else if (/\.(js|html|map)$/.test(file.name)) {
      const text = fs.readFileSync(target, "utf8")
      for (const marker of forbidden)
        if (text.includes(marker)) throw new Error(`Test fixture included in production: ${marker} in ${target}`)
    }
  }
}
inspect(directory)
console.log("PASS: production assets exclude integration harness and CLI fixtures")

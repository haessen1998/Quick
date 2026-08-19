import net from "node:net"

const frontendURL = process.env.FRONTEND_DEVSERVER_URL
const timeoutMs = Number(process.env.WAILS_FRONTEND_WAIT_TIMEOUT_MS || 60_000)
const retryDelayMs = 200

if (!frontendURL) {
  console.error("FRONTEND_DEVSERVER_URL is not set")
  process.exit(1)
}

let target
try {
  target = new URL(frontendURL)
} catch {
  console.error(`Invalid FRONTEND_DEVSERVER_URL: ${frontendURL}`)
  process.exit(1)
}

const port = Number(target.port || (target.protocol === "https:" ? 443 : 80))
const host = target.hostname === "localhost" ? "127.0.0.1" : target.hostname
const deadline = Date.now() + timeoutMs

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function canConnect() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    let settled = false

    const finish = (ready) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ready)
    }

    socket.setTimeout(1_000)
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
    socket.once("timeout", () => finish(false))
  })
}

console.log(`Waiting for frontend dev server at ${frontendURL}...`)

while (Date.now() < deadline) {
  if (await canConnect()) {
    console.log("Frontend dev server is ready.")
    process.exit(0)
  }
  await delay(retryDelayMs)
}

console.error(`Frontend dev server did not become ready within ${timeoutMs}ms.`)
process.exit(1)

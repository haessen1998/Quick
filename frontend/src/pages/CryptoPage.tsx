import { useCallback, useState } from "react"
import { Braces, CheckCircle2, Copy, Eye, EyeOff, FileKey2, KeyRound, LockKeyhole, Play, RefreshCw, ShieldCheck, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { CryptoService } from "@/../bindings/github.com/haessen1998/Quick/internal/crypto"
import { Button } from "@/components/ui/button"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { writeClipboard } from "@/lib/clipboard"
import { useSmartInput } from "@/lib/smart-input"

const inputClass = "app-interactive w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
const textAreaClass = `${inputClass} resize-none font-mono leading-6`
function SecretInput({ value, onChange, placeholder, disabled = false }: { value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean }) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return <div className="relative"><input className={`${inputClass} pr-10`} type={visible ? "text" : "password"} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><button type="button" className="app-interactive absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={disabled} onClick={() => setVisible((current) => !current)} aria-label={visible ? `隐藏${placeholder}` : `显示${placeholder}`}><Icon className="size-4" /></button></div>
}

export default function CryptoPage() {
  const [hashInput, setHashInput] = useState("Quick developer tools")
  const [hashAlgorithm, setHashAlgorithm] = useState("SHA-256")
  const [hmacEnabled, setHmacEnabled] = useState(false)
  const [hmacSecret, setHmacSecret] = useState("quick-secret")
  const [hashOutput, setHashOutput] = useState("")
  const [aesMode, setAesMode] = useState<"encrypt" | "decrypt">("encrypt")
  const [aesInput, setAesInput] = useState("Quick AES-GCM message")
  const [aesPassword, setAesPassword] = useState("change-this-password")
  const [aesOutput, setAesOutput] = useState("")
  const [rsaUsage, setRsaUsage] = useState<"encrypt" | "sign">("encrypt")
  const [rsaAction, setRsaAction] = useState<"encrypt" | "decrypt" | "sign" | "verify">("encrypt")
  const [rsaInput, setRsaInput] = useState("Quick RSA message")
  const [rsaSignature, setRsaSignature] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [rsaOutput, setRsaOutput] = useState("")
  const [jwtMode, setJwtMode] = useState<"parse" | "sign" | "verify">("sign")
  const [jwtInput, setJwtInput] = useState('{"sub":"quick-user","role":"developer"}')
  const [jwtSecret, setJwtSecret] = useState("replace-with-a-long-random-secret")
  const [jwtOutput, setJwtOutput] = useState("")
  const [error, setError] = useState("")

  useSmartInput("crypto", useCallback((values) => {
    if (values.operation !== "jwt-parse") return
    setJwtMode("parse"); setJwtInput(String(values.input ?? "")); setJwtOutput(""); setError("")
  }, []))

  const runSafely = async (action: () => Promise<void>) => {
    try { setError(""); await action() } catch (caught) { const message = caught instanceof Error ? caught.message : String(caught); setError(message); toast.error("操作失败", { description: message }) }
  }

  const copy = async (value: string) => { await writeClipboard(value); toast.success("已复制") }

  const runHash = () => runSafely(async () => {
    setHashOutput(await CryptoService.Hash(hashInput, hashAlgorithm, hmacEnabled, hmacSecret))
  })

  const runAes = () => runSafely(async () => setAesOutput(await CryptoService.AES(aesMode, aesInput, aesPassword)))

  const createKeys = () => runSafely(async () => { const keys = await CryptoService.GenerateRSA(rsaUsage); setPublicKey(keys.publicKey); setPrivateKey(keys.privateKey); setRsaOutput(`${rsaUsage === "encrypt" ? "RSA-OAEP" : "RSA-PSS"} 2048 位密钥已生成`) })

  const runRsa = () => runSafely(async () => {
    const result = await CryptoService.RSA(rsaAction, rsaInput, rsaSignature, publicKey, privateKey)
    if (rsaAction === "sign") setRsaSignature(result.output)
    setRsaOutput(rsaAction === "verify" ? result.valid ? "签名有效" : "签名无效" : result.output)
  })

  const runJwt = () => runSafely(async () => {
    setJwtOutput(await CryptoService.JWT(jwtMode, jwtInput, jwtSecret))
  })

  useAssistantCapability({
    page: "crypto",
    getContext: () => ({
      hash: { algorithm: hashAlgorithm, hmac: hmacEnabled, input: hashInput.slice(0, 4000), output: hashOutput },
      aes: { mode: aesMode, inputLength: aesInput.length, hasPassword: Boolean(aesPassword), hasOutput: Boolean(aesOutput) },
      rsa: { usage: rsaUsage, action: rsaAction, inputLength: rsaInput.length, hasPublicKey: Boolean(publicKey), hasPrivateKey: Boolean(privateKey), hasSignature: Boolean(rsaSignature), outputStatus: rsaOutput ? "已有结果" : "" },
      jwt: { mode: jwtMode, inputLength: jwtInput.length, hasSecret: Boolean(jwtSecret), output: jwtMode === "parse" ? jwtOutput.slice(0, 8000) : jwtOutput ? "已有敏感结果（不暴露）" : "" },
      error,
    }),
    actions: {
      run: async (values) => {
        const operation = String(values.operation ?? "")
        const nextInput = String(values.input ?? "")
        const algorithm = String(values.algorithm ?? "SHA-256")
        setError("")
        try {
          if (operation === "hash") {
            if (!["MD5", "SHA-1", "SHA-256", "SHA-512"].includes(algorithm)) throw new Error(`不支持的 Hash 算法：${algorithm}`)
            const result = await CryptoService.Hash(nextInput, algorithm, false, "")
            setHashInput(nextInput); setHashAlgorithm(algorithm); setHmacEnabled(false); setHashOutput(result)
            return { success: true, operation, algorithm, result, executed: true }
          }
          if (operation === "jwt-parse") {
            const result = await CryptoService.JWT("parse", nextInput, "")
            setJwtMode("parse"); setJwtInput(nextInput); setJwtOutput(result)
            return { success: true, operation, result, executed: true }
          }
          if (operation === "rsa-generate-encryption" || operation === "rsa-generate-signing") {
            const usage = operation === "rsa-generate-encryption" ? "encrypt" : "sign"
            const keys = await CryptoService.GenerateRSA(usage)
            setRsaUsage(usage); setPublicKey(keys.publicKey); setPrivateKey(keys.privateKey); setRsaOutput(`${usage === "encrypt" ? "RSA-OAEP" : "RSA-PSS"} 2048 位密钥已生成`)
            toast.success("RSA 密钥已生成，仅显示在 Quick 页面")
            return { success: true, operation, result: "密钥已生成，仅显示在 Quick 页面", sensitive: true, executed: true }
          }
          if (operation === "hmac") {
            setHashInput(nextInput); setHashAlgorithm(algorithm === "MD5" ? "SHA-256" : algorithm); setHmacEnabled(true); setHashOutput("")
          } else if (operation === "aes-encrypt" || operation === "aes-decrypt") {
            setAesMode(operation === "aes-encrypt" ? "encrypt" : "decrypt"); setAesInput(nextInput); setAesOutput("")
          } else if (operation.startsWith("rsa-")) {
            const action = operation.slice(4) as "encrypt" | "decrypt" | "sign" | "verify"
            if (!["encrypt", "decrypt", "sign", "verify"].includes(action)) throw new Error(`不支持的 RSA 操作：${operation}`)
            setRsaAction(action); setRsaUsage(action === "encrypt" || action === "decrypt" ? "encrypt" : "sign"); setRsaInput(nextInput); setRsaOutput("")
            if (typeof values.signature === "string") setRsaSignature(values.signature)
            if (typeof values.publicKey === "string") setPublicKey(values.publicKey)
          } else if (operation === "jwt-sign" || operation === "jwt-verify") {
            setJwtMode(operation === "jwt-sign" ? "sign" : "verify"); setJwtInput(nextInput); setJwtOutput("")
          } else throw new Error(`不支持的加密操作：${operation}`)
          toast.success("小Q已准备加密操作；请检查密钥并手动执行")
          return { success: true, operation, executed: false, confirmationRequired: true, message: "非敏感字段已填写；密钥或密码需由用户在页面输入并确认执行" }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          setError(message)
          return { success: false, operation, error: message, executed: operation === "hash" || operation === "jwt-parse" }
        }
      },
    },
  })

  return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />开发工具</div><h1 className="text-3xl font-semibold tracking-tight">加密与验证</h1><p className="mt-2 text-sm text-muted-foreground">哈希、HMAC、AES-GCM、RSA 与 JWT。敏感密钥仅在当前页面内存中处理。</p></div>
        {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4" />哈希与 HMAC</div>
            <textarea className={`${textAreaClass} mt-4 h-28`} value={hashInput} onChange={(event) => setHashInput(event.target.value)} />
            <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_auto_1fr_auto]">
              <select className={inputClass} value={hashAlgorithm} onChange={(event) => setHashAlgorithm(event.target.value)}><option>MD5</option><option>SHA-1</option><option>SHA-256</option><option>SHA-512</option></select>
              <label className="flex items-center gap-2 rounded-lg border px-3 text-sm"><input type="checkbox" checked={hmacEnabled} onChange={(event) => setHmacEnabled(event.target.checked)} />HMAC</label>
              <SecretInput disabled={!hmacEnabled} value={hmacSecret} onChange={setHmacSecret} placeholder="HMAC 密钥" />
              <Button onClick={runHash}><Play />计算</Button>
            </div>
            <div className="mt-3 flex gap-2"><div className="min-h-10 min-w-0 flex-1 rounded-lg border bg-muted/40 p-3 font-mono text-xs break-all">{hashOutput || "等待计算"}</div><Button variant="outline" size="icon" disabled={!hashOutput} onClick={() => copy(hashOutput)}><Copy /></Button></div>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><LockKeyhole className="size-4" />AES-256-GCM 加密/解密</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[9rem_1fr_auto]"><select className={inputClass} value={aesMode} onChange={(event) => setAesMode(event.target.value as typeof aesMode)}><option value="encrypt">加密</option><option value="decrypt">解密</option></select><SecretInput value={aesPassword} onChange={setAesPassword} placeholder="AES 密码" /><Button onClick={runAes}><Play />执行</Button></div>
            <textarea className={`${textAreaClass} mt-3 h-28`} value={aesInput} onChange={(event) => setAesInput(event.target.value)} placeholder={aesMode === "encrypt" ? "明文" : "加密载荷"} />
            <textarea className={`${textAreaClass} mt-3 h-24 bg-muted/30`} readOnly value={aesOutput} placeholder="输出" />
            <p className="mt-2 text-xs text-muted-foreground">PBKDF2-SHA256（210,000 次）派生密钥；每次使用随机 Salt 与 IV，并带 GCM 完整性验证。</p>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm xl:col-span-2">
            <div className="flex flex-wrap items-center gap-2 font-medium"><FileKey2 className="size-4" />RSA 密钥、加密与签名验证<span className="ml-auto text-xs font-normal text-muted-foreground">RSA-OAEP / RSA-PSS · SHA-256 · 2048 bit</span></div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <select className={`${inputClass} min-w-0`} value={rsaUsage} onChange={(event) => setRsaUsage(event.target.value as typeof rsaUsage)}><option value="encrypt">加密密钥</option><option value="sign">签名密钥</option></select>
                <Button className="w-auto whitespace-nowrap" variant="outline" onClick={createKeys}><RefreshCw />生成密钥</Button>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <select className={`${inputClass} min-w-0`} value={rsaAction} onChange={(event) => setRsaAction(event.target.value as typeof rsaAction)}><option value="encrypt">公钥加密</option><option value="decrypt">私钥解密</option><option value="sign">私钥签名</option><option value="verify">公钥验签</option></select>
                <Button className="w-auto whitespace-nowrap" onClick={runRsa}><KeyRound />执行</Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><textarea className={`${textAreaClass} h-36`} value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder="PUBLIC KEY PEM" /><textarea className={`${textAreaClass} h-36`} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder="PRIVATE KEY PEM" /></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><textarea className={`${textAreaClass} h-28`} value={rsaInput} onChange={(event) => setRsaInput(event.target.value)} placeholder="明文、密文或待签名内容" /><textarea className={`${textAreaClass} h-28`} value={rsaSignature} onChange={(event) => setRsaSignature(event.target.value)} placeholder="验签时输入 Base64 签名" /></div>
            <div className="mt-3 rounded-lg border bg-muted/30 p-3 font-mono text-xs break-all">{rsaOutput || "输出"}</div>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm xl:col-span-2">
            <div className="flex items-center gap-2 font-medium"><Braces className="size-4" />JWT 解析、签名与验证</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[9rem_1fr_auto]"><select className={inputClass} value={jwtMode} onChange={(event) => setJwtMode(event.target.value as typeof jwtMode)}><option value="parse">仅解析</option><option value="sign">HS256 签名</option><option value="verify">HS256 验证</option></select><SecretInput value={jwtSecret} onChange={setJwtSecret} placeholder="HS256 密钥" /><Button onClick={runJwt}><CheckCircle2 />执行</Button></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><textarea className={`${textAreaClass} h-40`} value={jwtInput} onChange={(event) => setJwtInput(event.target.value)} placeholder="JSON 载荷或 JWT" /><textarea className={`${textAreaClass} h-40 bg-muted/30`} readOnly value={jwtOutput} placeholder="结果" /></div>
            <p className="mt-2 text-xs text-muted-foreground">“仅解析”不会验证签名；安全判断请使用“验证”。</p>
          </article>
        </div>
      </div>
    </section>
  )
}

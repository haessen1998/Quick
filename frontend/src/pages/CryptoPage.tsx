import { useState } from "react"
import { Braces, CheckCircle2, Copy, Eye, EyeOff, FileKey2, KeyRound, LockKeyhole, Play, RefreshCw, ShieldCheck, Sparkles } from "lucide-react"
import { md5 } from "hash-wasm"
import { decodeJwt, decodeProtectedHeader, jwtVerify, SignJWT } from "jose"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

const inputClass = "app-interactive w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
const textAreaClass = `${inputClass} resize-none font-mono leading-6`
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function SecretInput({ value, onChange, placeholder, disabled = false }: { value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean }) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return <div className="relative"><input className={`${inputClass} pr-10`} type={visible ? "text" : "password"} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><button type="button" className="app-interactive absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={disabled} onClick={() => setVisible((current) => !current)} aria-label={visible ? `隐藏${placeholder}` : `显示${placeholder}`}><Icon className="size-4" /></button></div>
}

function bytesToBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value.replace(/\s/g, ""))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function toHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function hashText(input: string, algorithm: string) {
  if (algorithm === "MD5") return md5(input)
  return toHex(await crypto.subtle.digest(algorithm, encoder.encode(input)))
}

async function hmacText(input: string, secret: string, algorithm: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: algorithm }, false, ["sign"])
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(input)))
}

async function deriveAesKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"])
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 210_000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
}

async function encryptAes(input: string, password: string) {
  if (!password) throw new Error("请输入 AES 密码")
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(password, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(input))
  return bytesToBase64(encoder.encode(JSON.stringify({ v: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(ciphertext) })))
}

async function decryptAes(input: string, password: string) {
  if (!password) throw new Error("请输入 AES 密码")
  const payload = JSON.parse(decoder.decode(base64ToBytes(input))) as { salt: string; iv: string; data: string }
  const salt = base64ToBytes(payload.salt)
  const iv = base64ToBytes(payload.iv)
  const key = await deriveAesKey(password, salt)
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(payload.data))
  return decoder.decode(plaintext)
}

function arrayBufferToPem(value: ArrayBuffer, label: "PUBLIC KEY" | "PRIVATE KEY") {
  const content = bytesToBase64(value).match(/.{1,64}/g)?.join("\n") ?? ""
  return `-----BEGIN ${label}-----\n${content}\n-----END ${label}-----`
}

function pemToBytes(pem: string) {
  return base64ToBytes(pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, ""))
}

async function generateRsa(usage: "encrypt" | "sign") {
  const algorithm = usage === "encrypt" ? "RSA-OAEP" : "RSA-PSS"
  const keys = await crypto.subtle.generateKey({ name: algorithm, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, usage === "encrypt" ? ["encrypt", "decrypt"] : ["sign", "verify"])
  return {
    publicKey: arrayBufferToPem(await crypto.subtle.exportKey("spki", keys.publicKey), "PUBLIC KEY"),
    privateKey: arrayBufferToPem(await crypto.subtle.exportKey("pkcs8", keys.privateKey), "PRIVATE KEY"),
  }
}

async function rsaEncrypt(input: string, publicKey: string) {
  const key = await crypto.subtle.importKey("spki", pemToBytes(publicKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"])
  return bytesToBase64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, encoder.encode(input)))
}

async function rsaDecrypt(input: string, privateKey: string) {
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(privateKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"])
  return decoder.decode(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, base64ToBytes(input)))
}

async function rsaSign(input: string, privateKey: string) {
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(privateKey), { name: "RSA-PSS", hash: "SHA-256" }, false, ["sign"])
  return bytesToBase64(await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 32 }, key, encoder.encode(input)))
}

async function rsaVerify(input: string, signature: string, publicKey: string) {
  const key = await crypto.subtle.importKey("spki", pemToBytes(publicKey), { name: "RSA-PSS", hash: "SHA-256" }, false, ["verify"])
  return crypto.subtle.verify({ name: "RSA-PSS", saltLength: 32 }, key, base64ToBytes(signature), encoder.encode(input))
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

  const runSafely = async (action: () => Promise<void>) => {
    try { setError(""); await action() } catch (caught) { const message = caught instanceof Error ? caught.message : String(caught); setError(message); toast.error("操作失败", { description: message }) }
  }

  const copy = async (value: string) => { await navigator.clipboard.writeText(value); toast.success("已复制") }

  const runHash = () => runSafely(async () => {
    if (hmacEnabled && hashAlgorithm === "MD5") throw new Error("Web Crypto 不支持 HMAC-MD5，请选择 SHA 系列")
    setHashOutput(hmacEnabled ? await hmacText(hashInput, hmacSecret, hashAlgorithm) : await hashText(hashInput, hashAlgorithm))
  })

  const runAes = () => runSafely(async () => setAesOutput(aesMode === "encrypt" ? await encryptAes(aesInput, aesPassword) : await decryptAes(aesInput, aesPassword)))

  const createKeys = () => runSafely(async () => { const keys = await generateRsa(rsaUsage); setPublicKey(keys.publicKey); setPrivateKey(keys.privateKey); setRsaOutput(`${rsaUsage === "encrypt" ? "RSA-OAEP" : "RSA-PSS"} 2048 位密钥已生成`) })

  const runRsa = () => runSafely(async () => {
    if (rsaAction === "encrypt") setRsaOutput(await rsaEncrypt(rsaInput, publicKey))
    if (rsaAction === "decrypt") setRsaOutput(await rsaDecrypt(rsaInput, privateKey))
    if (rsaAction === "sign") { const signature = await rsaSign(rsaInput, privateKey); setRsaSignature(signature); setRsaOutput(signature) }
    if (rsaAction === "verify") setRsaOutput((await rsaVerify(rsaInput, rsaSignature, publicKey)) ? "签名有效" : "签名无效")
  })

  const runJwt = () => runSafely(async () => {
    if (jwtMode === "parse") {
      setJwtOutput(JSON.stringify({ header: decodeProtectedHeader(jwtInput), payload: decodeJwt(jwtInput) }, null, 2)); return
    }
    const secret = encoder.encode(jwtSecret)
    if (secret.length < 32) throw new Error("HS256 密钥建议至少 32 字节")
    if (jwtMode === "sign") {
      const payload = JSON.parse(jwtInput)
      setJwtOutput(await new SignJWT(payload).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime("2h").sign(secret)); return
    }
    const verified = await jwtVerify(jwtInput, secret, { algorithms: ["HS256"] })
    setJwtOutput(JSON.stringify({ protectedHeader: verified.protectedHeader, payload: verified.payload }, null, 2))
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
            <div className="mt-4 grid gap-3 sm:grid-cols-[11rem_auto_11rem_auto]">
              <select className={inputClass} value={rsaUsage} onChange={(event) => setRsaUsage(event.target.value as typeof rsaUsage)}><option value="encrypt">加密密钥</option><option value="sign">签名密钥</option></select>
              <Button variant="outline" onClick={createKeys}><RefreshCw />生成密钥</Button>
              <select className={inputClass} value={rsaAction} onChange={(event) => setRsaAction(event.target.value as typeof rsaAction)}><option value="encrypt">公钥加密</option><option value="decrypt">私钥解密</option><option value="sign">私钥签名</option><option value="verify">公钥验签</option></select>
              <Button onClick={runRsa}><KeyRound />执行</Button>
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

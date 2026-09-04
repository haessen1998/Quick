import { Button } from "@/components/ui/button"
import { uiText } from "@/lib/i18n"
import { inputClass,SecretInput,textAreaClass,useCryptoPageViewModel } from "@/models/CryptoPageModel"
import { Braces,CheckCircle2,Copy,FileKey2,KeyRound,LockKeyhole,Play,RefreshCw,ShieldCheck,Sparkles } from "lucide-react"

export default function CryptoPage() {
 const { hashInput, setHashInput, hashAlgorithm, setHashAlgorithm, hmacEnabled, setHmacEnabled, hmacSecret, setHmacSecret, hashOutput, aesMode, setAesMode, aesInput, setAesInput, aesPassword, setAesPassword, aesOutput, rsaUsage, setRsaUsage, rsaAction, setRsaAction, rsaInput, setRsaInput, rsaSignature, setRsaSignature, publicKey, setPublicKey, privateKey, setPrivateKey, rsaOutput, jwtMode, setJwtMode, jwtInput, setJwtInput, jwtSecret, setJwtSecret, jwtOutput, error, copy, runHash, runAes, createKeys, runRsa, runJwt } = useCryptoPageViewModel()
return (
    <section className="page-shell">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-4" />{uiText("开发工具")}</div><h1 className="text-3xl font-semibold tracking-tight">{uiText("加密与验证")}</h1><p className="mt-2 text-sm text-muted-foreground">{uiText("哈希、HMAC、AES-GCM、RSA 与 JWT。敏感密钥仅在当前页面内存中处理。")}</p></div>
        {error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4" />{uiText("哈希与 HMAC")}</div>
            <textarea className={`${textAreaClass} mt-4 h-28`} value={hashInput} onChange={(event) => setHashInput(event.target.value)} />
            <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_auto_1fr_auto]">
              <select className={inputClass} value={hashAlgorithm} onChange={(event) => setHashAlgorithm(event.target.value)}><option>MD5</option><option>SHA-1</option><option>SHA-256</option><option>SHA-512</option></select>
              <label className="flex items-center gap-2 rounded-lg border px-3 text-sm"><input type="checkbox" checked={hmacEnabled} onChange={(event) => setHmacEnabled(event.target.checked)} />HMAC</label>
              <SecretInput disabled={!hmacEnabled} value={hmacSecret} onChange={setHmacSecret} placeholder={uiText("HMAC 密钥")} />
              <Button onClick={runHash}><Play />{uiText("计算")}</Button>
            </div>
            <div className="mt-3 flex gap-2"><div className="min-h-10 min-w-0 flex-1 rounded-lg border bg-muted/40 p-3 font-mono text-xs break-all">{hashOutput || uiText("等待计算")}</div><Button variant="outline" size="icon" disabled={!hashOutput} onClick={() => copy(hashOutput)}><Copy /></Button></div>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><LockKeyhole className="size-4" />{uiText("AES-256-GCM 加密/解密")}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[9rem_1fr_auto]"><select className={inputClass} value={aesMode} onChange={(event) => setAesMode(event.target.value as typeof aesMode)}><option value="encrypt">{uiText("加密")}</option><option value="decrypt">{uiText("解密")}</option></select><SecretInput value={aesPassword} onChange={setAesPassword} placeholder={uiText("AES 密码")} /><Button onClick={runAes}><Play />{uiText("执行")}</Button></div>
            <textarea className={`${textAreaClass} mt-3 h-28`} value={aesInput} onChange={(event) => setAesInput(event.target.value)} placeholder={aesMode === "encrypt" ? uiText("明文") : uiText("加密载荷")} />
            <textarea className={`${textAreaClass} mt-3 h-24 bg-muted/30`} readOnly value={aesOutput} placeholder={uiText("输出")} />
            <p className="mt-2 text-xs text-muted-foreground">{uiText("PBKDF2-SHA256（210,000 次）派生密钥；每次使用随机 Salt 与 IV，并带 GCM 完整性验证。")}</p>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm xl:col-span-2">
            <div className="flex flex-wrap items-center gap-2 font-medium"><FileKey2 className="size-4" />{uiText("RSA 密钥、加密与签名验证")}<span className="ml-auto text-xs font-normal text-muted-foreground">RSA-OAEP / RSA-PSS · SHA-256 · 2048 bit</span></div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <select className={`${inputClass} min-w-0`} value={rsaUsage} onChange={(event) => setRsaUsage(event.target.value as typeof rsaUsage)}><option value="encrypt">{uiText("加密密钥")}</option><option value="sign">{uiText("签名密钥")}</option></select>
                <Button className="w-auto whitespace-nowrap" variant="outline" onClick={createKeys}><RefreshCw />{uiText("生成密钥")}</Button>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <select className={`${inputClass} min-w-0`} value={rsaAction} onChange={(event) => setRsaAction(event.target.value as typeof rsaAction)}><option value="encrypt">{uiText("公钥加密")}</option><option value="decrypt">{uiText("私钥解密")}</option><option value="sign">{uiText("私钥签名")}</option><option value="verify">{uiText("公钥验签")}</option></select>
                <Button className="w-auto whitespace-nowrap" onClick={runRsa}><KeyRound />{uiText("执行")}</Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><textarea className={`${textAreaClass} h-36`} value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder="PUBLIC KEY PEM" /><textarea className={`${textAreaClass} h-36`} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder="PRIVATE KEY PEM" /></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><textarea className={`${textAreaClass} h-28`} value={rsaInput} onChange={(event) => setRsaInput(event.target.value)} placeholder={uiText("明文、密文或待签名内容")} /><textarea className={`${textAreaClass} h-28`} value={rsaSignature} onChange={(event) => setRsaSignature(event.target.value)} placeholder={uiText("验签时输入 Base64 签名")} /></div>
            <div className="mt-3 rounded-lg border bg-muted/30 p-3 font-mono text-xs break-all">{rsaOutput || uiText("输出")}</div>
          </article>

          <article className="rounded-xl border bg-card p-5 shadow-sm xl:col-span-2">
            <div className="flex items-center gap-2 font-medium"><Braces className="size-4" />{uiText("JWT 解析、签名与验证")}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[9rem_1fr_auto]"><select className={inputClass} value={jwtMode} onChange={(event) => setJwtMode(event.target.value as typeof jwtMode)}><option value="parse">{uiText("仅解析")}</option><option value="sign">{uiText("HS256 签名")}</option><option value="verify">{uiText("HS256 验证")}</option></select><SecretInput value={jwtSecret} onChange={setJwtSecret} placeholder={uiText("HS256 密钥")} /><Button onClick={runJwt}><CheckCircle2 />{uiText("执行")}</Button></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2"><textarea className={`${textAreaClass} h-40`} value={jwtInput} onChange={(event) => setJwtInput(event.target.value)} placeholder={uiText("JSON 载荷或 JWT")} /><textarea className={`${textAreaClass} h-40 bg-muted/30`} readOnly value={jwtOutput} placeholder={uiText("结果")} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{uiText("“仅解析”不会验证签名；安全判断请使用“验证”。")}</p>
          </article>
        </div>
      </div>
    </section>
  )
}

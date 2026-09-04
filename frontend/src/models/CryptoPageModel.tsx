import { CryptoService } from "@/../bindings/github.com/haessen1998/Quick/internal/crypto"
import { useAssistantCapability } from "@/lib/assistant-capabilities"
import { writeClipboard } from "@/lib/clipboard"
import { useSmartInput } from "@/lib/smart-input"
import { useDraftState } from "@/lib/workspace-store"
import { Eye, EyeOff } from "lucide-react"
import { createContext, useContext, type ReactNode } from "react"
import { toast } from "sonner"

export const inputClass =
  "app-interactive w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

export const textAreaClass = `${inputClass} resize-none font-mono leading-6`

export function SecretInput({
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
}) {
  const [visible, setVisible] = useDraftState("crypto", "visible", false)
  const Icon = visible ? EyeOff : Eye
  return (
    <div className="relative">
      <input
        className={`${inputClass} pr-10`}
        type={visible ? "text" : "password"}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="app-interactive absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? `隐藏${placeholder}` : `显示${placeholder}`}
      >
        <Icon className="size-4" />
      </button>
    </div>
  )
}

function useCryptoPageModel() {
  const [hashInput, setHashInput] = useDraftState("crypto", "hashInput", "Quick developer tools")
  const [hashAlgorithm, setHashAlgorithm] = useDraftState("crypto", "hashAlgorithm", "SHA-256")
  const [hmacEnabled, setHmacEnabled] = useDraftState("crypto", "hmacEnabled", false)
  const [hmacSecret, setHmacSecret] = useDraftState("crypto", "hmacSecret", "quick-secret")
  const [hashOutput, setHashOutput] = useDraftState("crypto", "hashOutput", "")
  const [aesMode, setAesMode] = useDraftState<"encrypt" | "decrypt">("crypto", "aesMode", "encrypt")
  const [aesInput, setAesInput] = useDraftState("crypto", "aesInput", "Quick AES-GCM message")
  const [aesPassword, setAesPassword] = useDraftState("crypto", "aesPassword", "change-this-password")
  const [aesOutput, setAesOutput] = useDraftState("crypto", "aesOutput", "")
  const [rsaUsage, setRsaUsage] = useDraftState<"encrypt" | "sign">("crypto", "rsaUsage", "encrypt")
  const [rsaAction, setRsaAction] = useDraftState<"encrypt" | "decrypt" | "sign" | "verify">("crypto", "rsaAction", "encrypt")
  const [rsaInput, setRsaInput] = useDraftState("crypto", "rsaInput", "Quick RSA message")
  const [rsaSignature, setRsaSignature] = useDraftState("crypto", "rsaSignature", "")
  const [publicKey, setPublicKey] = useDraftState("crypto", "publicKey", "")
  const [privateKey, setPrivateKey] = useDraftState("crypto", "privateKey", "")
  const [rsaOutput, setRsaOutput] = useDraftState("crypto", "rsaOutput", "")
  const [jwtMode, setJwtMode] = useDraftState<"parse" | "sign" | "verify">("crypto", "jwtMode", "sign")
  const [jwtInput, setJwtInput] = useDraftState("crypto", "jwtInput", '{"sub":"quick-user","role":"developer"}')
  const [jwtSecret, setJwtSecret] = useDraftState("crypto", "jwtSecret", "replace-with-a-long-random-secret")
  const [jwtOutput, setJwtOutput] = useDraftState("crypto", "jwtOutput", "")
  const [error, setError] = useDraftState("crypto", "error", "")

  useSmartInput("crypto", (values) => {
    if (values.operation !== "jwt-parse") return
    setJwtMode("parse")
    setJwtInput(String(values.input ?? ""))
    setJwtOutput("")
    setError("")
  })

  const runSafely = async (action: () => Promise<void>) => {
    try {
      setError("")
      await action()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      toast.error("操作失败", { description: message })
    }
  }

  const copy = async (value: string) => {
    await writeClipboard(value)
    toast.success("已复制")
  }

  const runHash = () =>
    runSafely(async () => {
      setHashOutput(await CryptoService.Hash(hashInput, hashAlgorithm, hmacEnabled, hmacSecret))
    })

  const runAes = () => runSafely(async () => setAesOutput(await CryptoService.AES(aesMode, aesInput, aesPassword)))

  const createKeys = () =>
    runSafely(async () => {
      const keys = await CryptoService.GenerateRSA(rsaUsage)
      setPublicKey(keys.publicKey)
      setPrivateKey(keys.privateKey)
      setRsaOutput(`${rsaUsage === "encrypt" ? "RSA-OAEP" : "RSA-PSS"} 2048 位密钥已生成`)
    })

  const runRsa = () =>
    runSafely(async () => {
      const result = await CryptoService.RSA(rsaAction, rsaInput, rsaSignature, publicKey, privateKey)
      if (rsaAction === "sign") setRsaSignature(result.output)
      setRsaOutput(rsaAction === "verify" ? (result.valid ? "签名有效" : "签名无效") : result.output)
    })

  const runJwt = () =>
    runSafely(async () => {
      setJwtOutput(await CryptoService.JWT(jwtMode, jwtInput, jwtSecret))
    })

  useAssistantCapability({
    page: "crypto",
    getContext: () => ({
      hash: { algorithm: hashAlgorithm, hmac: hmacEnabled, input: hashInput.slice(0, 4000), output: hashOutput },
      aes: { mode: aesMode, inputLength: aesInput.length, hasPassword: Boolean(aesPassword), hasOutput: Boolean(aesOutput) },
      rsa: {
        usage: rsaUsage,
        action: rsaAction,
        inputLength: rsaInput.length,
        hasPublicKey: Boolean(publicKey),
        hasPrivateKey: Boolean(privateKey),
        hasSignature: Boolean(rsaSignature),
        outputStatus: rsaOutput ? "已有结果" : "",
      },
      jwt: {
        mode: jwtMode,
        inputLength: jwtInput.length,
        hasSecret: Boolean(jwtSecret),
        output: jwtMode === "parse" ? jwtOutput.slice(0, 8000) : jwtOutput ? "已有敏感结果（不暴露）" : "",
      },
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
            setHashInput(nextInput)
            setHashAlgorithm(algorithm)
            setHmacEnabled(false)
            setHashOutput(result)
            return { success: true, operation, algorithm, result, executed: true }
          }
          if (operation === "jwt-parse") {
            const result = await CryptoService.JWT("parse", nextInput, "")
            setJwtMode("parse")
            setJwtInput(nextInput)
            setJwtOutput(result)
            return { success: true, operation, result, executed: true }
          }
          if (operation === "rsa-generate-encryption" || operation === "rsa-generate-signing") {
            const usage = operation === "rsa-generate-encryption" ? "encrypt" : "sign"
            const keys = await CryptoService.GenerateRSA(usage)
            setRsaUsage(usage)
            setPublicKey(keys.publicKey)
            setPrivateKey(keys.privateKey)
            setRsaOutput(`${usage === "encrypt" ? "RSA-OAEP" : "RSA-PSS"} 2048 位密钥已生成`)
            toast.success("RSA 密钥已生成，仅显示在 Quick 页面")
            return { success: true, operation, result: "密钥已生成，仅显示在 Quick 页面", sensitive: true, executed: true }
          }
          if (operation === "hmac") {
            setHashInput(nextInput)
            setHashAlgorithm(algorithm === "MD5" ? "SHA-256" : algorithm)
            setHmacEnabled(true)
            setHashOutput("")
          } else if (operation === "aes-encrypt" || operation === "aes-decrypt") {
            setAesMode(operation === "aes-encrypt" ? "encrypt" : "decrypt")
            setAesInput(nextInput)
            setAesOutput("")
          } else if (operation.startsWith("rsa-")) {
            const action = operation.slice(4) as "encrypt" | "decrypt" | "sign" | "verify"
            if (!["encrypt", "decrypt", "sign", "verify"].includes(action)) throw new Error(`不支持的 RSA 操作：${operation}`)
            setRsaAction(action)
            setRsaUsage(action === "encrypt" || action === "decrypt" ? "encrypt" : "sign")
            setRsaInput(nextInput)
            setRsaOutput("")
            if (typeof values.signature === "string") setRsaSignature(values.signature)
            if (typeof values.publicKey === "string") setPublicKey(values.publicKey)
          } else if (operation === "jwt-sign" || operation === "jwt-verify") {
            setJwtMode(operation === "jwt-sign" ? "sign" : "verify")
            setJwtInput(nextInput)
            setJwtOutput("")
          } else throw new Error(`不支持的加密操作：${operation}`)
          toast.success("小Q已准备加密操作；请检查密钥并手动执行")
          return {
            success: true,
            operation,
            executed: false,
            confirmationRequired: true,
            message: "非敏感字段已填写；密钥或密码需由用户在页面输入并确认执行",
          }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          setError(message)
          return { success: false, operation, error: message, executed: operation === "hash" || operation === "jwt-parse" }
        }
      },
    },
  })

  return {
    hashInput,
    setHashInput,
    hashAlgorithm,
    setHashAlgorithm,
    hmacEnabled,
    setHmacEnabled,
    hmacSecret,
    setHmacSecret,
    hashOutput,
    aesMode,
    setAesMode,
    aesInput,
    setAesInput,
    aesPassword,
    setAesPassword,
    aesOutput,
    rsaUsage,
    setRsaUsage,
    rsaAction,
    setRsaAction,
    rsaInput,
    setRsaInput,
    rsaSignature,
    setRsaSignature,
    publicKey,
    setPublicKey,
    privateKey,
    setPrivateKey,
    rsaOutput,
    jwtMode,
    setJwtMode,
    jwtInput,
    setJwtInput,
    jwtSecret,
    setJwtSecret,
    jwtOutput,
    error,
    copy,
    runHash,
    runAes,
    createKeys,
    runRsa,
    runJwt,
  }
}

const ModelContext = createContext<ReturnType<typeof useCryptoPageModel> | null>(null)
export function CryptoPageModelProvider(props: { children: ReactNode }) {
  const model = useCryptoPageModel()
  return <ModelContext.Provider value={model}>{props.children}</ModelContext.Provider>
}
export function useCryptoPageViewModel() {
  const value = useContext(ModelContext)
  if (!value) throw new Error("CryptoPageModelProvider missing")
  return value
}

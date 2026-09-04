import { runRegexJob,type RegexJob } from "./regex-engine"
self.onmessage = (event: MessageEvent<RegexJob>) => {
  try { self.postMessage({ result: runRegexJob(event.data) }) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}

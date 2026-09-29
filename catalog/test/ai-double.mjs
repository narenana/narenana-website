// A test double for the Workers AI binding (env.AI). Per-model responders
// return what the real binding returns (OpenAI-shape strings, llama-3.3's
// already-parsed objects, fenced JSON, invalid JSON, schema violations) or
// throw its errors (5028, 3036, 3040, 5035) or never answer (timeouts). Every
// call is recorded.
//
//   const ai = aiDouble({ '@cf/google/gemma-4-26b-a4b-it': (body, call) => openai({...}) })
//   env.AI = ai; …; ai.calls.length

export function aiDouble(responders = {}) {
  const calls = []
  return {
    calls,
    responders,
    async run(model, body, opts) {
      const call = { model, body, opts, n: calls.length + 1 }
      calls.push(call)
      const f = responders[model] ?? responders['*']
      if (!f) throw aiError(5007, `No such model ${model} or task`)
      return f(body, call)
    },
  }
}

export function aiError(code, msg = 'error') {
  const e = new Error(`${code}: ${msg}`)
  e.name = 'AiError'
  return e
}

const usage = (u = {}) => ({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, ...u })

// gemma-4 / glm-4.7: choices[0].message.content is a JSON string.
export const openai = (obj, { finish = 'stop', u } = {}) => ({
  choices: [{ index: 0, finish_reason: finish, message: { role: 'assistant', content: typeof obj === 'string' || obj === null ? obj : JSON.stringify(obj) } }],
  usage: usage(u),
})
// llama-3.3 with a JSON schema: `response` arrives already parsed.
export const legacy = (obj, { u } = {}) => ({ response: obj, usage: usage(u) })
export const fenced = (obj) => openai('```json\n' + JSON.stringify(obj) + '\n```')
export const never = () => new Promise(() => {})

// The user message the curator sent in a call.
export const userOf = (call) => call.body.messages.find((m) => m.role === 'user')?.content ?? ''
export const taskOf = (call) => call.body.response_format?.json_schema?.name ?? (call.body.response_format?.json_schema?.properties?.verdict ? 'pair' : null)

// Answers a probe-v1 call; returns null for anything else.
export const probeReply = (body, shape = 'openai') => {
  const u = body.messages?.at(-1)?.content ?? ''
  if (!/\{"ok": true\}/.test(u)) return null
  return shape === 'legacy' ? legacy({ ok: true }) : openai({ ok: true })
}

// bge-m3: {shape, data}
export const embedReply = (body, dims = 8) => ({ shape: [body.text.length, dims], data: body.text.map((t, i) => Array.from({ length: dims }, (_, k) => Math.sin(i + k + t.length))), meta: { neurons: 0.01 } })

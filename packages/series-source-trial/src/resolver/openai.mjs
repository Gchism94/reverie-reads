import { performance } from 'node:perf_hooks'
import { RESOLVER_PROMPT_VERSION, resolverInstructions, resolverOutputSchema } from './schema.mjs'

const outputText = (response) => {
  if (typeof response.output_text === 'string') return response.output_text
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  return null
}

export async function resolveEvidencePacket(
  packet,
  {
    apiKey = process.env.OPENAI_API_KEY,
    apiUrl = process.env.BOOK_RESOLVER_API_URL ?? 'https://api.openai.com/v1/responses',
    model = process.env.BOOK_RESOLVER_MODEL ?? 'gpt-5.6-luna',
    reasoningEffort = process.env.BOOK_RESOLVER_REASONING ?? 'none',
    fetchImpl = fetch,
  } = {},
) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for the resolver shadow trial')
  const started = performance.now()
  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: 800,
      instructions: resolverInstructions,
      input: JSON.stringify(packet),
      text: {
        format: {
          type: 'json_schema',
          name: 'reverie_evidence_resolution',
          strict: true,
          schema: resolverOutputSchema,
        },
      },
      metadata: { prompt_version: RESOLVER_PROMPT_VERSION, case_id: packet.caseId },
    }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      `Resolver API ${response.status}: ${body?.error?.message ?? response.statusText}`,
    )
  }
  const text = outputText(body)
  if (!text) throw new Error('Resolver API returned no structured output text')

  return {
    output: JSON.parse(text),
    responseId: body.id ?? null,
    responseModel: body.model ?? model,
    usage: body.usage ?? null,
    latencyMs: Math.round(performance.now() - started),
    promptVersion: RESOLVER_PROMPT_VERSION,
  }
}

import type { Context } from 'cordis'
import {
    getEncodingNameForModel,
    Tiktoken,
    TiktokenBPE,
    TiktokenEncoding,
    TiktokenModel
} from 'js-tiktoken/lite'
import { Request } from '@chatluna/core/src/service'
import { fetch } from 'undici'

globalThis.chatluna_tiktoken_cache = globalThis.chatluna_tiktoken_cache ?? {}

export async function getEncoding(
    encoding: TiktokenEncoding,
    options?: {
        signal?: AbortSignal
        extendedSpecialTokens?: Record<string, number>
        request?: Request
        force?: boolean
    }
) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crossFetch = (input: any, init?: any) => {
        const request = options.request
        if (request) {
            request.fetch(input, init)
        }

        return fetch(input, init)
    }

    const cache = globalThis.chatluna_tiktoken_cache

    if (!(encoding in cache) || options?.force) {
        cache[encoding] = await crossFetch(
            `https://tiktoken.pages.dev/js/${encoding}.json`,
            {
                signal: options?.signal
            }
        )
            .then((res) => res.json() as unknown as TiktokenBPE)
            .catch((e) => {
                delete cache[encoding]
                throw e
            })
    }

    return new Tiktoken(cache[encoding], options?.extendedSpecialTokens)
}

export async function encodingForModel(
    model: TiktokenModel,
    options?: {
        signal?: AbortSignal
        extendedSpecialTokens?: Record<string, number>
        ctx?: Context
        request?: Request
        force?: boolean
    }
) {
    options = options ?? {}

    let timeout: NodeJS.Timeout

    if (options.signal == null) {
        const abortController = new AbortController()

        options.signal = abortController.signal

        timeout = setTimeout(() => abortController.abort(), 1000 * 10)
    }

    if (options.ctx != null) {
        options.request = options.ctx.chatluna_request.root
    }

    const result = await getEncoding(getEncodingNameForModel(model), options)

    if (timeout != null) {
        clearTimeout(timeout)
    }

    return result
}

declare global {
    // https://stackoverflow.com/questions/59459312/using-globalthis-in-typescript
    // eslint-disable-next-line no-var, @typescript-eslint/naming-convention
    var chatluna_tiktoken_cache: Record<string, TiktokenBPE>
}

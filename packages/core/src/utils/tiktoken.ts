import type { Context } from 'cordis'
import {
    getEncodingNameForModel,
    Tiktoken,
    TiktokenBPE,
    TiktokenEncoding,
    TiktokenModel
} from 'js-tiktoken/lite'
import {} from '@chatluna/core/src/service'
import { fetch } from 'undici'

const cache: Record<string, TiktokenBPE> = {}

export async function getEncoding(
    encoding: TiktokenEncoding,
    options?: {
        signal?: AbortSignal
        extendedSpecialTokens?: Record<string, number>
        ctx?: Context
        force?: boolean
    }
) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crossFetch = (input: any, init?: any) => {
        const rootRequest = options.ctx?.chatluna_request?.root
        if (rootRequest) {
            rootRequest.fetch(input, init)
        }

        return fetch(input, init)
    }

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

    const result = await getEncoding(getEncodingNameForModel(model), options)

    if (timeout != null) {
        clearTimeout(timeout)
    }

    return result
}

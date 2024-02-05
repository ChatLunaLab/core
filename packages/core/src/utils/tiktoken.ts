import { Context } from '@cordisjs/core'
import {
    getEncodingNameForModel,
    Tiktoken,
    TiktokenBPE,
    TiktokenEncoding,
    TiktokenModel
} from 'js-tiktoken/lite'
import { Request } from '@chatluna/core/service'
import { fetch } from 'undici'
import {
    ChatLunaError,
    ChatLunaErrorCode,
    withResolver
} from '@chatluna/core/utils'

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
        const request = options?.request
        if (request) {
            return request.fetch(input, init)
        }

        return fetch(input, init)
    }

    const cache = globalThis.chatluna_tiktoken_cache

    if (cache[encoding] == null || options?.force) {
        const tiktokenBPE = await crossFetch(
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

        const tiktoken = new Tiktoken(
            tiktokenBPE,
            options?.extendedSpecialTokens
        )

        cache[encoding] = tiktoken
    }

    return cache[encoding]
}

export async function encodingForModel(
    model: TiktokenModel,
    options?: {
        timeout?: number
        extendedSpecialTokens?: Record<string, number>
        ctx?: Context
        request?: Request
        force?: boolean
    }
) {
    options = options ?? {}

    const { promise, resolve, reject } = withResolver<Tiktoken>()

    ;(async () => {
        const abortController = new AbortController()

        const signal = abortController.signal

        const timeout = setTimeout(
            () => {
                abortController.abort()
                reject(new ChatLunaError(ChatLunaErrorCode.NETWORK_ERROR))
            },
            options?.timeout ?? 1000 * 6
        )

        if (options.ctx != null) {
            options.request = options.ctx.chatluna_request.root
        }

        try {
            const result = await getEncoding(getEncodingNameForModel(model), {
                signal,
                ...options
            })

            if (timeout != null) {
                clearTimeout(timeout)
            }

            resolve(result)
        } catch (e) {
            reject(e)
        }
    })()

    return promise
}

declare global {
    // https://stackoverflow.com/questions/59459312/using-globalthis-in-typescript
    // eslint-disable-next-line no-var, @typescript-eslint/naming-convention
    var chatluna_tiktoken_cache: Record<string, Tiktoken>
}

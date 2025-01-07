import { Request } from '@chatluna/core/service'
import { ChatLunaError, ChatLunaErrorCode, withResolver } from '@chatluna/utils'
import { Context } from 'cordis'
import {
    getEncodingNameForModel,
    Tiktoken,
    TiktokenBPE,
    TiktokenEncoding,
    TiktokenModel
} from 'js-tiktoken/lite'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

globalThis.chatluna_tiktoken_cache = globalThis.chatluna_tiktoken_cache ?? {}

export async function getEncoding(
    encoding: TiktokenEncoding,
    options?: {
        signal?: AbortSignal
        extendedSpecialTokens?: Record<string, number>
        request?: Request
    }
) {
    const cache = globalThis.chatluna_tiktoken_cache

    // pwd + data/chathub/tmps
    const cacheDir = path.resolve(os.tmpdir(), 'chatluna', 'tiktoken')
    const cachePath = path.join(cacheDir, `${encoding}.json`)

    if (cache[encoding]) {
        return cache[encoding]
    }

    await fs.mkdir(cacheDir, { recursive: true })

    try {
        const cacheContent = await fs.readFile(cachePath, 'utf-8')

        const tiktoken = new Tiktoken(
            JSON.parse(cacheContent),
            options?.extendedSpecialTokens
        )
        cache[encoding] = tiktoken
        return tiktoken
    } catch (e) {
        // ignore
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crossFetch = (input: any, init?: any) => {
        const request = options?.request
        if (request) {
            return request.fetch(input, init)
        }

        // switch to default nodejs fetch
        return fetch(input, init)
    }

    if (cache[encoding] == null) {
        const url =
            (options?.request?.proxyAddress?.length ?? 0) > 0
                ? `https://tiktoken.pages.dev/js/${encoding}.json`
                : `https://jsd.onmicrosoft.cn/npm/tiktoken@latest/encoders/${encoding}.json`

        const tiktokenBPE = await crossFetch(url, {
            signal: options?.signal
        })
            .then((res) => res.json() as unknown as TiktokenBPE)
            .catch((e) => {
                delete cache[encoding]
                throw e
            })

        await fs.writeFile(cachePath, JSON.stringify(cache[encoding]))

        cache[encoding] = new Tiktoken(
            tiktokenBPE,
            options?.extendedSpecialTokens
        )
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

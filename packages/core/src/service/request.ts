import type * as fetchType from 'undici/types'
import type { ClientOptions, WebSocket } from 'ws'
import { ClientRequestArgs } from 'http'
// eslint-disable-next-line @typescript-eslint/naming-convention
import UserAgents from 'user-agents'
import useragent from 'useragent'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { Context, Inject, Service } from 'cordis'
import { Logger } from '@cordisjs/logger'
import type {} from '@cordisjs/plugin-http'

export class DefaultRequest implements Request {
    private _logger: Logger
    private _cordis: boolean

    constructor(private ctx?: Context) {
        this._logger = ctx?.logger('chatluna_request')
        this._cordis = ctx != null
    }

    private _proxyAddress: string = undefined

    set proxyAddress(url: string | undefined) {
        if (url == null) {
            this._proxyAddress = undefined
            return
        }

        // match socks4/socks4a/socks5/socks5h/http/https
        if (url.match(/^socks[4a|4|5|5h]?:\/\//) || url.match(/^https?:\/\//)) {
            this._proxyAddress = url

            this.importProxyAgent()
            return
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.UNSUPPORTED_PROXY_PROTOCOL,
            'Unsupported proxy protocol'
        )
    }

    get proxyAddress() {
        return this._proxyAddress
    }

    /**
     * package ws, and with proxy support
     */
    async ws(url: string, options?: ClientOptions | ClientRequestArgs) {
        if (!this._cordis) {
            const ws = await this.importWs()
            // eslint-disable-next-line new-cap
            return new ws.default(url, options)
        }

        return this.ctx.http.ws(
            url,
            Object.assign(options || {}, {
                headers: options?.headers,
                proxyAgent: this._proxyAddress
            }) as never
        ) as WebSocket
    }

    /**
     * package undici, and with proxy support
     * @returns
     */
    async fetch(info: string, init?: RequestInit): Promise<Response> {
        if (!this._cordis) {
            try {
                // ???
                return (await fetch(info, init)) as unknown as Response
            } catch (e) {
                if (e instanceof Error && e.cause) {
                    this._logger?.error(e.stack)
                }

                throw new ChatLunaError(
                    ChatLunaErrorCode.NETWORK_ERROR,
                    e as Error | string
                )
            }
        }

        try {
            // ???
            const response = await this.ctx.http(
                info,
                Object.assign(init, {
                    responseType: 'raw',
                    method: init?.method ?? 'GET',
                    proxyAgent: this._proxyAddress
                }) as {
                    responseType: 'raw'
                    proxyAgent: string
                }
            )

            return response.data.data
        } catch (e) {
            if (e instanceof Error && e.cause) {
                this._logger?.error(e.stack)
            }

            throw new ChatLunaError(
                ChatLunaErrorCode.NETWORK_ERROR,
                e as Error | string
            )
        }
    }

    randomUA() {
        let result: string | null = null

        let count = 0
        while (result == null && count < 20) {
            const generated = UserAgents.random((rawUA) => {
                const parsedUA = useragent.parse(rawUA.userAgent)
                return (
                    useragent.is(rawUA.userAgent).chrome &&
                    (count < 15 || parseFloat(parsedUA.major) >= 90)
                )
            })

            if (generated != null) {
                result = generated.toString()
            }

            count++
        }

        return result
    }

    async importProxyAgent() {
        try {
            await import('@cordisjs/plugin-proxy-agent')
        } catch (e) {
            const message =
                'Please install @cordisjs/plugin-proxy-agent to use proxy, e.g. npm install @cordisjs/plugin-proxy-agent.'

            if (this._logger) {
                this._logger.warn(message)
            } else {
                console.warn(message)
            }
        }

        if (!this._cordis) {
            const message =
                'Please use plugin-proxy-agent in Cordis environment.'

            if (this._logger) {
                this._logger.warn(message)
            } else {
                console.warn(message)
            }
        }
    }

    async importWs() {
        try {
            return await import('ws')
        } catch (e) {
            const message =
                'Please install ws to use WebSocket, e.g. npm install ws'

            throw new ChatLunaError(ChatLunaErrorCode.NETWORK_ERROR, message)
        }
    }
}

export class RequestService extends Service {
    private _root: Request

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(ctx: Context, config: any) {
        super(ctx, 'chatluna_request', false)
        this._root = new DefaultRequest(ctx)

        ctx.http.decoder('raw', (raw) => {
            return {
                data: raw,
                url: raw.url,
                status: raw.status,
                statusText: raw.statusText,
                headers: raw.headers
            }
        })
    }

    get root() {
        return this._root
    }

    create(ctx: Context, proxyAddress?: string) {
        const request = new DefaultRequest(ctx)

        request.proxyAddress = proxyAddress ?? this._root.proxyAddress

        return request
    }

    static inject = {
        '@cordisjs/plugin-http': {
            required: false
        },
        '@cordisjs/plugin-proxy-agent': {
            required: false
        }
    } satisfies Inject
}

export type RequestInfo = fetchType.RequestInfo

export type RequestInit = fetchType.RequestInit

export interface Request {
    set proxyAddress(url: string | undefined)
    get proxyAddress()

    ws(
        url: string,
        options?: ClientOptions | ClientRequestArgs
    ): Promise<WebSocket>

    fetch(info: string, init?: RequestInit): Promise<Response>

    randomUA(): string
}

declare module '@cordisjs/plugin-http' {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    export namespace HTTP {
        export interface ResponseTypes {
            raw: Response
        }
    }
}

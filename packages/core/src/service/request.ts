import { fetch, ProxyAgent } from 'undici'
import * as fetchType from 'undici/types'
import { ClientOptions, WebSocket } from 'ws'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { socksDispatcher } from 'fetch-socks'
import { ClientRequestArgs } from 'http'
// eslint-disable-next-line @typescript-eslint/naming-convention
import UserAgents from 'user-agents'
import useragent from 'useragent'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { Context, Service } from '@cordisjs/core'
import { Logger } from '@cordisjs/logger'

export class DefaultRequest implements Request {
    constructor(private _logger?: Logger) {}

    private _proxyAddress: string = undefined

    set proxyAddress(url: string | undefined) {
        if (url == null) {
            this._proxyAddress = undefined
            return
        }

        if (url.startsWith('socks://') || url.match(/^https?:\/\//)) {
            this._proxyAddress = url
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
    ws(url: string, options?: ClientOptions | ClientRequestArgs) {
        if (this._proxyAddress && !options?.agent) {
            options = options || {}
            options.agent = createProxyAgent(this._proxyAddress)
        }
        return new WebSocket(url, options)
    }

    /**
     * package undici, and with proxy support
     * @returns
     */
    async fetch(info: RequestInfo, init?: RequestInit): Promise<Response> {
        if (this._proxyAddress != null && !init?.dispatcher) {
            init = createProxyAgentForFetch(init || {}, this._proxyAddress)
        }

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
}

export class RequestService extends Service {
    private _root: Request

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(ctx: Context, config: any) {
        super(ctx, 'chatluna_request', false)
        this._root = new DefaultRequest(ctx.logger('chatluna_root_request'))
    }

    get root() {
        return this._root
    }

    create(ctx: Context, proxyAddress?: string) {
        const request = new DefaultRequest(ctx.logger('chatluna_request'))

        request.proxyAddress = proxyAddress ?? this._root.proxyAddress

        return request
    }
}

export function createProxyAgentForFetch(
    init: fetchType.RequestInit,
    proxyAddress?: string
): fetchType.RequestInit {
    if (init.dispatcher || proxyAddress == null) {
        return init
    }

    const proxyAddressURL = new URL(proxyAddress)

    if (proxyAddress.startsWith('socks://')) {
        init.dispatcher = socksDispatcher({
            type: 5,
            host: proxyAddressURL.hostname,
            port: proxyAddressURL.port ? parseInt(proxyAddressURL.port) : 1080
        })
        // match http/https
    } else if (proxyAddress.match(/^https?:\/\//)) {
        init.dispatcher = new ProxyAgent({
            uri: proxyAddress
        })
    }

    return init
}

function createProxyAgent(
    proxyAddress: string
): HttpsProxyAgent<string> | SocksProxyAgent {
    if (proxyAddress.startsWith('socks://')) {
        return new SocksProxyAgent(proxyAddress)
    } else if (proxyAddress.match(/^https?:\/\//)) {
        return new HttpsProxyAgent(proxyAddress)
    }
}

export type RequestInfo = fetchType.RequestInfo

export type RequestInit = fetchType.RequestInit

export interface Request {
    set proxyAddress(url: string | undefined)
    get proxyAddress()

    ws(url: string, options?: ClientOptions | ClientRequestArgs): WebSocket

    fetch(info: RequestInfo, init?: RequestInit): Promise<Response>

    randomUA(): string
}

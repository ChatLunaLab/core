import { fetch, ProxyAgent } from 'undici'
import * as fetchType from 'undici/types/fetch'
import { ClientOptions, WebSocket } from 'ws'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { socksDispatcher } from 'fetch-socks'
import { ClientRequestArgs } from 'http'
// eslint-disable-next-line @typescript-eslint/naming-convention
import UserAgents from 'user-agents'
import useragent from 'useragent'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/core/src/utils'
import { Context, Service } from 'cordis'
import { Logger } from '@cordisjs/logger'

class Request {
    constructor(private _logger: Logger) {}

    private _proxyAddress: string = null

    set proxyAddress(url: string | undefined) {
        if (url == null) {
            this._proxyAddress = null
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
    async fetch(info: fetchType.RequestInfo, init?: fetchType.RequestInit) {
        if (this._proxyAddress != null && !init?.dispatcher) {
            init = createProxyAgentForFetch(init || {}, this._proxyAddress)
        }

        try {
            return await fetch(info, init)
        } catch (e) {
            if (e.cause) {
                this._logger?.error(e.cause)
            }

            throw new ChatLunaError(ChatLunaErrorCode.NETWORK_ERROR, e)
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
        super(ctx, 'chatluna_request')
        this._root = new Request(ctx.logger('chatluna_root_request'))
    }

    get root() {
        return this._root
    }

    create(ctx: Context, proxyAddress?: string) {
        const request = new Request(ctx.logger('chatluna_request'))

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
        console.error(`http ${proxyAddress}`)
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

declare module 'cordis' {
    interface Context {
        chatluna_request: RequestService
    }
}

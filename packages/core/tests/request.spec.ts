import { Context } from 'cordis'
import chai, { expect, should } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { describe, it } from 'mocha'
import { loadChatLunaCore } from '@chatluna/core/src'
import { IncomingMessage, Server, ServerResponse, createServer } from 'http'
import { ProxyServer, createProxy } from 'proxy'
import { withResolver } from '@chatluna/core/src/utils'
import { waitServiceLoad } from './mock/utils'
import * as logger from '@cordisjs/logger'
import net from 'net'
import { buildSock5Proxy } from './mock/mock_sock'
import { WebSocket } from 'ws'
import { createProxyAgentForFetch } from '../src/service'

const app = new Context()

chai.use(chaiAsPromised)

should()

describe('Http Proxy', () => {
    it('should request http normally when not proxy', async () => {
        // funny
        createProxyAgentForFetch({}, undefined)

        await waitServiceLoad(app, ['chatluna_request'])

        const response = await app.chatluna_request.root.fetch(serverUrl)

        expect(response.status).to.equal(200)
        expect(response.json()).to.eventually.deep.equal({ hello: 'world' })
    })

    it('should request http normally with proxy', async () => {
        await waitServiceLoad(app, ['chatluna_request'])

        const subRequest = app.chatluna_request.create(app, httpProxyUrl)

        const response = await subRequest.fetch(serverUrl)

        expect(response.status).to.equal(200)
        expect(response.json()).to.eventually.deep.equal({ hello: 'world' })
    })

    it('should throw error when set unsupported proxy url', async () => {
        await waitServiceLoad(app, ['chatluna_request'])

        expect(() => {
            app.chatluna_request.root.proxyAddress = '127.0.0.1:7890'
        }).throw(
            '使用 ChatLuna 时出现错误，错误码为 2。请联系开发者以解决此问题。'
        )
    })

    it('should request websocket normally when not proxy', async () => {
        const { promise, resolve } = withResolver()
        await waitServiceLoad(app, ['chatluna_request'])

        const subRequest = app.chatluna_request.create(app)

        const connection = subRequest.ws(webSocketUrl)

        connection.on('open', () => {
            expect(connection.readyState).to.equal(WebSocket.OPEN)
            connection.send(JSON.stringify({ content: 'hello' }))
        })

        connection.on('message', (data) => {
            expect(JSON.parse(data.toString()))
                .to.property('content')
                .equal('world')

            connection.close()
            resolve()
        })

        return promise
    })

    it('should request websocket normally with proxy', async () => {
        const { promise, resolve } = withResolver()
        await waitServiceLoad(app, ['chatluna_request'])

        const subRequest = app.chatluna_request.create(app, httpProxyUrl)

        const connection = subRequest.ws(webSocketUrl)

        connection.on('open', () => {
            expect(connection.readyState).to.equal(WebSocket.OPEN)
            connection.send(JSON.stringify({ content: 'hello' }))
        })

        connection.on('message', (data) => {
            expect(JSON.parse(data.toString()))
                .to.property('content')
                .equal('world')

            connection.close()

            resolve()
        })
        return promise
    })
})

describe('Socks Proxy', () => {
    it('should request http normal with socks proxy', async () => {
        await waitServiceLoad(app, ['chatluna_request'])

        const subRequest = app.chatluna_request.create(app, socket5ProxyUrl)

        const response = await subRequest.fetch(serverUrl)

        expect(response.status).to.equal(200)
        expect(response.json()).to.eventually.deep.equal({ hello: 'world' })
    })

    it('should request websocket normal with socks proxy', async () => {
        const { promise, resolve } = withResolver()
        await waitServiceLoad(app, ['chatluna_request'])

        const subRequest = app.chatluna_request.create(app, socket5ProxyUrl)

        const connection = subRequest.ws(webSocketUrl)

        connection.on('open', () => {
            expect(connection.readyState).to.equal(WebSocket.OPEN)
            connection.send(JSON.stringify({ content: 'hello' }))
        })

        connection.on('message', (data) => {
            expect(JSON.parse(data.toString()))
                .to.property('content')
                .equal('world')

            resolve()

            connection.close()
        })

        return promise
    })
})

describe('Other', () => {
    it('should throw a error when request fake url', async () => {
        await waitServiceLoad(app, ['chatluna_request'])

        const subRequest = app.chatluna_request.create(app)

        try {
            await subRequest.fetch(
                'https://1sdfokjfsdjkfkaldsfkalafklsfdjfjadksl1.cxxxz'
            )
        } catch (e) {
            expect(e.toString()).to.be.equal(
                '使用 ChatLuna 时出现错误，错误码为 1。请联系开发者以解决此问题。'
            )
        }
    })

    it('should return a chrome user agent', async () => {
        await waitServiceLoad(app, ['chatluna_request'])

        expect(app.chatluna_request.root.randomUA()).to.string('Chrome')
    })
})

app.on('ready', async () => {
    // load logger
    app.plugin(logger)
    loadChatLunaCore(app)
})

before(async () => {
    await readyMockResource()
    await app.start()
})

after(async () => {
    await app.stop()

    httpServer?.close()
    proxyServer?.close()
    socket5ProxyServer?.close()
    webSocketServer?.close()
})

let httpServer: Server<typeof IncomingMessage, typeof ServerResponse>
let proxyServer: ProxyServer
let socket5ProxyServer: net.Server
let webSocketServer: Server

let serverUrl: string
let httpProxyUrl: string
let socket5ProxyUrl: string
let webSocketUrl: string

async function readyMockResource() {
    httpServer = await buildHttpServer()
    proxyServer = await buildHttpProxy()
    socket5ProxyServer = await buildSock5Proxy()
    webSocketServer = await buildWebSocketServer()

    const httpServerPort = (httpServer.address() as { port: number }).port
    const httpProxyPort = (proxyServer.address() as { port: number }).port
    const socket5ProxyPort = (socket5ProxyServer.address() as { port: number })
        .port

    const webSocketServerPort = (webSocketServer.address() as { port: number })
        .port

    serverUrl = `http://127.0.0.1:${httpServerPort}`
    httpProxyUrl = `http://127.0.0.1:${httpProxyPort}`
    socket5ProxyUrl = `socks://127.0.0.1:${socket5ProxyPort}`
    webSocketUrl = `ws://127.0.0.1:${webSocketServerPort}`

    httpServer.on('request', (req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ hello: 'world' }))
    })
}

function buildHttpServer() {
    const { promise, resolve } =
        withResolver<Server<typeof IncomingMessage, typeof ServerResponse>>()

    const server = createServer()
    server.listen(0, () => {
        resolve(server)
    })

    return promise
}

function buildWebSocketServer() {
    const { promise, resolve } = withResolver<Server>()
    const server = createServer()

    server.listen(0, () => {
        const wss = new WebSocket.Server({ server })

        server.on('close', () => {
            wss.close()
        })

        wss.on('connection', function connection(ws) {
            ws.on('error', console.error)

            ws.on('message', function message(data) {
                const message: { content: string } = JSON.parse(data.toString())

                if (message.content === 'hello') {
                    ws.send(JSON.stringify({ content: 'world' }))
                }
            })
        })

        resolve(server)
    })

    return promise
}

function buildHttpProxy() {
    const { promise, resolve } = withResolver<ProxyServer>()

    const service = createProxy(createServer())

    service.listen(0, () => {
        resolve(service)
    })

    return promise
}

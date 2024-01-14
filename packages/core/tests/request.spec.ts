import { Context } from 'cordis'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { describe, it } from 'mocha'
import { loadChatLunaCore } from '@chatluna/core/src'
import { IncomingMessage, Server, ServerResponse, createServer } from 'http'
import { ProxyServer, createProxy } from 'proxy'
import { withResolver } from '@chatluna/core/src/utils'
import { waitService as waitServiceLoad } from './mock/utils'
import * as logger from '@cordisjs/logger'

const app = new Context()

chai.use(chaiAsPromised)

describe('Http Proxy', () => {
    it('should respond normal without proxy', async function () {
        await waitServiceLoad(app, ['chatluna_request'])

        const response = await app.chatluna_request.root.fetch(serverUrl)

        expect(response.status).to.equal(200)
        expect(response.json()).to.eventually.deep.equal({ hello: 'world' })
    })

    it('should respond normal with proxy', async function () {
        await waitServiceLoad(app, ['chatluna_request'])

        const subRequest = app.chatluna_request.create(app, proxyUrl)

        const response = await subRequest.fetch(serverUrl)

        expect(response.status).to.equal(200)
        expect(response.json()).to.eventually.deep.equal({ hello: 'world' })
    })

    it('should throw error when set unsupported proxy url', async function () {
        await waitServiceLoad(app, ['chatluna_request'])

        expect(() => {
            app.chatluna_request.root.proxyAddress = 'http5://'
        }).throw(
            '使用 ChatLuna 时出现错误，错误码为 2。请联系开发者以解决此问题。'
        )
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

    server?.close()
    proxyServer?.close()
})

let server: Server<typeof IncomingMessage, typeof ServerResponse>
let proxyServer: ProxyServer

let serverUrl: string
let proxyUrl: string

async function readyMockResource() {
    server = await buildServer()
    proxyServer = await buildProxy()

    const serverPort = (server.address() as { port: number }).port
    const proxyPort = (proxyServer.address() as { port: number }).port

    serverUrl = `http://127.0.0.1:${serverPort}`
    proxyUrl = `http://127.0.0.1:${proxyPort}`

    server.on('request', (req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ hello: 'world' }))
    })
}

function buildServer() {
    const { promise, resolve } =
        withResolver<Server<typeof IncomingMessage, typeof ServerResponse>>()

    const server = createServer()
    server.listen(0, () => {
        resolve(server)
    })

    return promise
}

function buildProxy() {
    const { promise, resolve } = withResolver<ProxyServer>()

    const service = createProxy(createServer())

    service.listen(0, () => {
        resolve(service)
    })

    return promise
}

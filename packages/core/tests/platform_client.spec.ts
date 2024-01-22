import chai, { expect, should } from 'chai'
import { describe, it } from 'mocha'
import * as logger from '@cordisjs/logger'
import { Context } from 'cordis'
import {
    MockEmbeddingsRequester,
    MockModelRequester
} from './mock/mock_requester'
import {
    AIMessage,
    FunctionMessage,
    HumanMessage,
    SystemMessage
} from '@langchain/core/messages'
import chaiAsPromised from 'chai-as-promised'
import { ChatLunaChatModel, ChatLunaEmbeddings } from '@chatluna/core/src/model'
import { ModelType } from '@chatluna/core/src/platform'
import { MockTool } from './mock/mock_tool'
import { z } from 'zod'
import { withResolver } from '../src/utils/promise'
import { ChatLunaError, ChatLunaErrorCode } from '../src/utils'
import { loadChatLunaCore } from '@chatluna/core'
import { waitServiceLoad } from './mock/utils'
import os from 'os'
import {
    MockPlatformEmbeddingsClient,
    MockPlatformMixClient
} from './mock/mock_platform_client'

chai.use(chaiAsPromised)

should()

const app = new Context()

should()

describe('ChatLuna Base Client', () => {
    it('request llm model', async function () {
        this.timeout(15000)

        await waitServiceLoad(app, ['chatluna_request'])

        const client = new MockPlatformMixClient(
            {
                apiKey: 'chatluna_111',
                platform: 'mock'
            },
            'mock',
            app
        )

        await client.init()

        await client.clearContext()

        const llmModelInfo = (await client.getModels()).find(
            (m) => m.type === ModelType.llm
        )

        const model = client.createModel(llmModelInfo.name) as ChatLunaChatModel

        const messages = [new SystemMessage('我好'), new HumanMessage('你好？')]

        expect(await model.invoke(messages)).to.be.have.property(
            'content',
            '我好！'
        )
    })

    it('request embeddings model', async function () {
        const client = new MockPlatformEmbeddingsClient(
            {
                apiKey: 'chatluna_111',
                platform: 'mock'
            },
            'mock'
        )

        await client.init()

        const llmModelInfo = (await client.getModels()).find(
            (m) => m.type === ModelType.embeddings
        )

        const model = client.createModel(llmModelInfo.name)

        expect(
            await model.embedQuery('Hello. Are you eat today?')
        ).to.deep.equal([
            72, 101, 108, 108, 111, 46, 32, 65, 114, 101, 32, 121, 111, 117, 32,
            101, 97, 116, 32, 116, 111, 100, 97, 121, 63
        ])

        expect(
            await model.embedDocuments(['Hello. Are you eat today?'])
        ).to.deep.equal([
            [
                72, 101, 108, 108, 111, 46, 32, 65, 114, 101, 32, 121, 111, 117,
                32, 101, 97, 116, 32, 116, 111, 100, 97, 121, 63
            ]
        ])
    })

    it('available = true', async () => {
        const client = new MockPlatformEmbeddingsClient(
            {
                apiKey: 'chatluna_111',
                platform: 'mock'
            },
            'mock'
        )

        expect(await client.isAvailable()).to.eql(true)

        expect(await client.isAvailable()).to.eql(true)

        expect(await client.getModels()).to.deep.equal([
            {
                name: 'mock_embeddings',
                type: ModelType.embeddings
            }
        ])
    })

    it('available = false', async function () {
        const client = new MockPlatformEmbeddingsClient(
            {
                apiKey: 'chatluna_111',
                platform: 'mock',
                maxRetries: 3
            },
            'mock'
        )

        client.initError = new ChatLunaError(
            ChatLunaErrorCode.API_REQUEST_FAILED,
            '???'
        )

        expect(await client.isAvailable()).to.eql(false)

        expect(await client.isAvailable()).to.eql(false)
    })
})

app.on('ready', async () => {
    // load logger
    app.plugin(logger)
    loadChatLunaCore(app)

    await setProxyAddress()
})

before(async () => {
    await app.start()
})

after(async () => {
    await app.stop()
})

async function setProxyAddress() {
    await waitServiceLoad(app, ['chatluna_request'])
    if (os.homedir()?.includes('dingyi') && os.platform() === 'win32') {
        app.chatluna_request.root.proxyAddress = 'http://127.0.0.1:7890'
    } else {
        app.chatluna_request.root.proxyAddress = undefined
    }
}

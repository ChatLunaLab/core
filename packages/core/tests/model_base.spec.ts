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

chai.use(chaiAsPromised)

should()

const app = new Context()

should()

describe('ChatLuna Base Model', () => {
    it('Request Model', async function () {
        this.timeout(5000)

        const requester = new MockModelRequester(app)

        const model = new ChatLunaChatModel({
            model: 'test',
            modelInfo: {
                name: 'test',
                type: ModelType.llm,
                maxTokens: 20
            },
            requester
        })

        const messages = [new SystemMessage('我好'), new HumanMessage('你好？')]

        expect(await model.invoke(messages)).to.be.have.property(
            'content',
            '我好！'
        )
    })

    it('Request Model With Stream', async function () {
        this.timeout(5000)

        const requester = new MockModelRequester(app)

        const model = new ChatLunaChatModel({
            model: 'test',
            modelInfo: {
                name: 'test',
                type: ModelType.llm,
                maxTokens: 20
            },
            requester
        })

        const messages = [new SystemMessage('你好'), new HumanMessage('你好？')]

        const stream = await model.stream(messages)

        for await (const chunk of stream) {
            expect(chunk).to.be.have.property('content', '我好！')
        }

        expect(
            await model.invoke(messages, {
                stream: true,
                maxTokens: 90000
            })
        ).to.be.have.property('content', '我好！')
    })

    it('Request Model With Tool', async function () {
        this.timeout(5000)

        const requester = new MockModelRequester(app)

        const model = new ChatLunaChatModel({
            model: 'gpt-3.5-turbo-0301',
            modelInfo: {
                name: 'gpt-3.5-turbo-0301',
                type: ModelType.llm,
                maxTokens: 200
            },
            requester
        })

        const messages = [
            new SystemMessage('你好'),
            new FunctionMessage({
                content: '',
                name: '',
                additional_kwargs: {
                    function_call: {
                        name: 'test',
                        arguments: '{}'
                    }
                }
            }),
            new FunctionMessage({
                name: 'test',
                content: '{}'
            }),
            new HumanMessage('你好？')
        ]

        const stream = await model.stream(messages, {
            maxTokens: 90000,
            tools: [
                new MockTool({
                    name: 'faketesttool',
                    description: 'A fake test tool',
                    schema: z.object({
                        prop1: z.string(),
                        prop2: z.number().describe('Some desc'),
                        optionalProp: z.optional(
                            z.array(
                                z.object({
                                    nestedRequired: z.string(),
                                    nestedOptional: z.optional(z.string())
                                })
                            )
                        )
                    })
                })
            ]
        })

        for await (const chunk of stream) {
            expect(chunk).to.be.have.property('content', '我好！')
        }
    })

    it('Get Model info', async function () {
        this.timeout(5000)

        const requester = new MockModelRequester(app)

        const model = new ChatLunaChatModel({
            model: 'test',
            modelInfo: {
                name: 'test',
                type: ModelType.llm
            },
            requester,
            llmType: 'mock'
        })

        expect(model._llmType()).to.eql('mock')

        expect(model._modelType()).to.eql('base_chat_model')

        expect(model.modelName).to.eql('test')

        expect(model.modelInfo).to.deep.equal({
            name: 'test',
            type: ModelType.llm
        })

        expect(model.modelInfo).to.deep.equal({
            name: 'test',
            type: ModelType.llm
        })

        expect(model.callKeys).to.deep.equal([
            'stop',
            'timeout',
            'signal',
            'tags',
            'metadata',
            'callbacks',
            'model',
            'temperature',
            'maxTokens',
            'topP',
            'frequencyPenalty',
            'presencePenalty',
            'n',
            'logitBias',
            'id',
            'stream',
            'tools'
        ])

        expect(model.getModelMaxContextSize()).to.be.equal(4096)

        expect(
            model.invocationParams({
                maxTokens: 0
            })
        ).to.have.ownProperty('maxTokens', 4096 / 2)

        expect(
            model.invocationParams({
                maxTokens: 4097
            })
        ).to.have.ownProperty('maxTokens', 3276.8)

        // ???
        await model.clearContext()
    })

    it('Max Token and auto crop prompt', async function () {
        this.timeout(5000)

        const requester = new MockModelRequester(app)

        const model = new ChatLunaChatModel({
            model: 'test',
            modelInfo: {
                name: 'test',
                type: ModelType.llm,
                maxTokens: 40
            },
            requester
        })

        const messages = [
            new SystemMessage('你好'),
            new HumanMessage('你好？'),
            new AIMessage('你好'),
            // crop to this
            new HumanMessage('你好？'),
            new AIMessage('你好'),
            new HumanMessage('你好？'),
            new AIMessage('你好')
        ]

        const stream = await model.stream(messages)

        for await (const chunk of stream) {
            expect(chunk).to.be.have.property('content', '我好')
        }
    })

    it('Error catching', async function () {
        this.timeout(1000 * 30)

        let requester = new MockModelRequester(app)

        let model = new ChatLunaChatModel({
            model: 'test',
            modelInfo: {
                name: 'test',
                type: ModelType.llm,
                maxTokens: 40
            },
            requester,
            maxRetries: 0
        })

        try {
            await model.invoke([])
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 999。请联系开发者以解决此问题。'
            )
        }

        requester.throwError = new ChatLunaError(
            ChatLunaErrorCode.UNKNOWN_ERROR,
            '???'
        )

        try {
            await model.invoke('你好')
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 999。请联系开发者以解决此问题。'
            )
        }

        try {
            const stream = await model.stream('你好')
            for await (const chunk of stream) {
            }
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 999。请联系开发者以解决此问题。'
            )
        }

        requester.throwError = undefined
        requester.timeout = 120

        try {
            const stream = await model.stream('你好', { timeout: 10 })
            for await (const chunk of stream) {
            }
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 102。请联系开发者以解决此问题。'
            )
        }

        try {
            await model.invoke('你好', { timeout: 10 })
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 102。请联系开发者以解决此问题。'
            )
        }

        requester.timeout = 0
        requester.returnNull = true

        try {
            await model.invoke('你好')
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 103。请联系开发者以解决此问题。'
            )
        }
    })
})

describe('ChatLuna Base Embeddings', () => {
    it('Base Request', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester,
            stripNewLines: false
        })

        expect(
            await mockEmbedding.embedQuery('Hello. Are you eat today?')
        ).to.deep.equal([
            72, 101, 108, 108, 111, 46, 32, 65, 114, 101, 32, 121, 111, 117, 32,
            101, 97, 116, 32, 116, 111, 100, 97, 121, 63
        ])

        expect(
            await mockEmbedding.embedDocuments(['Hello. Are you eat today?'])
        ).to.deep.equal([
            [
                72, 101, 108, 108, 111, 46, 32, 65, 114, 101, 32, 121, 111, 117,
                32, 101, 97, 116, 32, 116, 111, 100, 97, 121, 63
            ]
        ])

        mockEmbeddingRequester.mode = '??'

        expect(
            await mockEmbedding.embedQuery('Hello. Are you eat today?')
        ).to.deep.equal([
            72, 101, 108, 108, 111, 46, 32, 65, 114, 101, 32, 121, 111, 117, 32,
            101, 97, 116, 32, 116, 111, 100, 97, 121, 63
        ])
    })

    it('Timeout Request', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester,
            stripNewLines: false,
            timeout: 10,
            maxRetries: 0
        })

        mockEmbeddingRequester.timeout = 10000

        try {
            await mockEmbedding.embedQuery('Hello. Are you eat today?')
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 102。请联系开发者以解决此问题。'
            )
        }
    })

    it('Request And Return Null', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester,
            stripNewLines: false,
            timeout: 10,
            maxRetries: 0
        })

        mockEmbeddingRequester.returnNull = true

        try {
            await mockEmbedding.embedQuery('Hello. Are you eat today?')
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 103。请联系开发者以解决此问题。'
            )
        }
    })

    it('Request And Api Throw Error', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester,
            stripNewLines: false,
            timeout: 10,
            maxRetries: 0
        })

        mockEmbeddingRequester.throwError = new ChatLunaError(
            ChatLunaErrorCode.UNKNOWN_ERROR,
            '???'
        )

        try {
            await mockEmbedding.embedQuery('Hello. Are you eat today?')
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 999。请联系开发者以解决此问题。'
            )
        }

        mockEmbeddingRequester.throwError = new Error('???')

        try {
            await mockEmbedding.embedQuery('Hello. Are you eat today?')
        } catch (e) {
            expect(() => {
                throw e
            }).to.throw(
                '使用 ChatLuna 时出现错误，错误码为 103。请联系开发者以解决此问题。'
            )
        }
    })
})

app.on('ready', async () => {
    // load logger
    app.plugin(logger)
})

before(async () => {
    await app.start()
})

after(async () => {
    await app.stop()
})

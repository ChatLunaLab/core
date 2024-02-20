import { expect, should } from 'chai'
import * as chai from 'chai'
import { describe, it } from 'mocha'
import * as logger from '@cordisjs/logger'
import os from 'node:os'
import {
    BaseChatMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/memory'
import chaiAsPromised from 'chai-as-promised'
import { BufferWindowMemory } from '@chatluna/core/memory'
import { ChatMessageHistory } from './mock/mock_chat_memory.ts'
import {} from '@chatluna/core/memory'
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import {
    MockEmbeddingsRequester,
    MockModelRequester
} from './mock/mock_requester.ts'
import { ChatLunaChatModel, ChatLunaEmbeddings } from '@chatluna/core/model'
import {
    ChatLunaSaveableVectorStore,
    MemoryVectorStore
} from '@chatluna/core/vectorstore'
import { VectorStoreRetriever } from '@langchain/core/vectorstores'
import { Document } from '@langchain/core/documents'
import { Context } from '@cordisjs/core'
import { waitServiceLoad } from './mock/utils.ts'
import { ModelType } from '@chatluna/core/platform'
import { apply as chatluna_core } from '@chatluna/core'
import { ChatLunaChatChain, ChainEvents } from '@chatluna/core/chain'
import { tuple } from 'zod'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/core/utils'

chai.use(chaiAsPromised)

should()

const app = new Context()

describe('Chat Chain', () => {
    it('Create', async () => {
        const model = await createChatModel()
        const memory = createHistoryMemory()
        const chain = ChatLunaChatChain.fromLLM(model, {
            historyMemory: memory
        })

        expect(chain.model).to.equal(model)
        expect(chain.historyMemory).to.equal(memory)
    })

    describe('Call', () => {
        it('Normal', async function () {
            this.timeout(5000)

            const model = await createChatModel()
            const memory = createHistoryMemory(true)
            const chain = ChatLunaChatChain.fromLLM(model, {
                historyMemory: memory
            })

            const result = await chain.call({
                message: new HumanMessage('Hello?'),
                events: {
                    'llm-new-token': async (token) => {},
                    'llm-used-token-count': async (count) => {
                        expect(count).to.equal(64)
                    }
                }
            })

            expect(result.content).to.equal('Hello!')
        })

        it('With VectorStore', async function () {
            this.timeout(5000)

            const embeddingRequester = new MockEmbeddingsRequester()
            const embedding = new ChatLunaEmbeddings({
                client: embeddingRequester
            })

            const vectorStore = await MemoryVectorStore.fromTexts(
                ['ojkdfasafjciosdpadfjscajfcdsafcjafcdjslafcdsjlk'],
                {},
                embedding
            )

            const saveableVectorStore = new ChatLunaSaveableVectorStore(
                vectorStore,
                {
                    async saveableFunction(store) {},
                    async deletableFunction(store) {}
                }
            )

            const vectorStoreMemory = new VectorStoreRetrieverMemory({
                returnDocs: true,
                inputKey: 'user',
                outputKey: 'your',

                vectorStoreRetriever: saveableVectorStore.asRetriever(1)
            })

            const model = await createChatModel()
            const memory = createHistoryMemory(true)
            const chain = ChatLunaChatChain.fromLLM(model, {
                historyMemory: memory,
                chatMemory: vectorStoreMemory
            })

            const result = await chain.call({
                message: new HumanMessage('你好?'),
                events: {
                    'llm-new-token': async (token) => {},
                    'llm-used-token-count': async (count) => {
                        expect(count).to.equal(238)
                    }
                }
            })

            expect(result.content).to.equal('我好!')

            expect(
                await vectorStoreMemory.vectorStoreRetriever.getRelevantDocuments(
                    'user: 你好?'
                )
            ).to.deep.equal([
                {
                    pageContent: 'user: 你好?\nyour: 我好!',
                    metadata: {}
                }
            ])
        })
    })

    describe('Error', async () => {
        it('Bad Chat History', async function () {
            this.timeout(5000)

            const model = await createChatModel()
            const memory = createHistoryMemory(false)
            const chain = ChatLunaChatChain.fromLLM(model, {
                historyMemory: memory
            })

            try {
                await chain.call({
                    message: new HumanMessage('Hello?'),
                    events: {
                        'llm-new-token': async (token) => {},
                        'llm-used-token-count': async (count) => {
                            expect(count).to.equal(50)
                        }
                    }
                })
                throw new Error('Should not be here')
            } catch (e) {
                expect(() => {
                    throw e
                }).to.throw(
                    '使用 ChatLuna 时出现错误，错误码为 999。请联系开发者以解决此问题。'
                )
            }
        })

        it('Request Error', async function () {
            this.timeout(5000)

            const model = await createChatModel(1000, true)
            const memory = createHistoryMemory()
            const chain = ChatLunaChatChain.fromLLM(model, {
                historyMemory: memory
            })

            try {
                await chain.call({
                    message: new HumanMessage('Hello?'),
                    events: {
                        'llm-new-token': async (token) => {},
                        'llm-used-token-count': async (count) => {
                            expect(count).to.equal(50)
                        }
                    }
                })
                throw new Error('Should not be here')
            } catch (e) {
                expect(() => {
                    throw e
                }).to.throw(
                    '使用 ChatLuna 时出现错误，错误码为 999。请联系开发者以解决此问题。'
                )
            }
        })
    })
})

async function createChatModel(
    maxTokens: number = 1000,
    error: boolean = false
) {
    await waitServiceLoad(app, ['chatluna_request'])

    const requester = new MockModelRequester(app)

    if (error) {
        requester.throwError = new ChatLunaError(
            ChatLunaErrorCode.UNKNOWN_ERROR
        )
    }

    return new ChatLunaChatModel({
        model: 'test',
        modelInfo: {
            name: 'test',
            type: ModelType.llm,
            maxTokens
        },
        requester,
        context: app
    })
}

function createHistoryMemory(returnMessages: boolean = false) {
    return new BufferWindowMemory({
        chatHistory: new ChatMessageHistory([
            new HumanMessage({
                content: 'hello',
                name: 'xxx'
            })
        ]),

        returnMessages
    })
}

app.on('ready', async () => {
    // load logger
    app.provide('logger', undefined, true)
    app.plugin(logger)
    app.plugin(chatluna_core)

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

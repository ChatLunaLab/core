import { expect, should } from 'chai'
import * as chai from 'chai'
import { describe, it, before, after } from 'mocha'
import * as logger from '@cordisjs/logger'
import { Context, ScopeStatus } from '@cordisjs/core'
import chaiAsPromised from 'chai-as-promised'
import {
    ClientConfigPool,
    CreateChatLunaLLMChainParams,
    ModelType
} from '@chatluna/core/platform'
import { MockTool } from './mock/mock_tool.ts'
import { z } from 'zod'
import { apply as chatluna_core } from '@chatluna/core'
import { loadPlugin, runAsync, waitServiceLoad } from './mock/utils.ts'
import os from 'os'
import {
    MockPlatformEmbeddingsClient,
    MockPlatformMixClient,
    MockPlatformModelClient,
    MockUnavailablePlatformModelClient
} from './mock/mock_platform_client.ts'
import { MemoryVectorStore, emptyEmbeddings } from '@chatluna/core/vectorstore'
import {} from '@chatluna/core/service'
import { MockChatChain } from './mock/mock_chat_chain.ts'
import { ChatLunaLLMChainWrapperInput } from '../lib/chain/types.js'

chai.use(chaiAsPromised)

should()

const app = new Context()

should()

describe('Platform Service', () => {
    describe('Register', () => {
        it('Client', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                platform.registerClient(
                    'mock',
                    (_, config) => new MockPlatformMixClient(config)
                )

                platform.registerConfigs('mock', {
                    apiKey: 'chatluna_123',
                    platform: 'mock'
                })

                const client = await platform.randomClient('mock')

                expect(client?.config).to.deep.equal({
                    apiKey: 'chatluna_123',
                    platform: 'mock',
                    concurrentMaxSize: 1,
                    maxRetries: 3,

                    timeout: 7200000
                })
            }
            await loadPlugin(app, plugin, 5)
        })

        it('Config pool', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform
                const pool = new ClientConfigPool()

                platform.registerConfigPool('mock', pool)

                platform.registerClient(
                    'mock',
                    (_, config) => new MockPlatformMixClient(config)
                )

                pool.addConfigs({
                    apiKey: 'chatluna_123',
                    platform: 'mock'
                })

                const client = await platform.randomClient('mock')

                expect(client?.config).to.deep.equal({
                    apiKey: 'chatluna_123',
                    platform: 'mock',
                    concurrentMaxSize: 1,
                    maxRetries: 3,

                    timeout: 7200000
                })
            }
            await loadPlugin(app, plugin, 10)
        })

        it('Tool', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                const mockTool = new MockTool({
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

                platform.registerTool('mock', {
                    createTool: async () => {
                        return mockTool
                    },
                    selector: () => true
                })

                expect(
                    await platform.getTool('mock').createTool({
                        model: undefined as any,
                        embeddings: undefined as any
                    })
                ).to.deep.equal(mockTool)
            }
            await loadPlugin(app, plugin, 5)
        })

        it('VectorStore', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                platform.registerVectorStore('mock', async (params) => {
                    return MemoryVectorStore.fromExistingIndex(
                        params.embeddings
                    )
                })

                expect(
                    await platform.createVectorStore('mock', {
                        embeddings: emptyEmbeddings
                    })
                ).to.instanceOf(MemoryVectorStore)
            }
            await loadPlugin(app, plugin, 5)
        })

        it('Chain', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                platform.registerChatChain('mock', 'mock', async (params) => {
                    return MockChatChain.fromLLM(params.model, params)
                })

                const pool = new ClientConfigPool()

                platform.registerConfigPool('mock', pool)

                platform.registerClient(
                    'mock',
                    (_, config) => new MockPlatformModelClient(config)
                )

                pool.addConfigs({
                    apiKey: 'chatluna_123',
                    platform: 'mock'
                })

                expect(
                    await platform.createChatChain('mock', {
                        model: await platform.randomModel(
                            'mock/mock_model',
                            ModelType.llm
                        ),
                        historyMemory: null as any,
                        botName: '??'
                    })
                ).to.instanceOf(MockChatChain)
            }
            await loadPlugin(app, plugin, 5)
        })
    })

    describe('Get', () => {
        it('Client', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                platform.registerClient(
                    'mock',
                    (_, config) => new MockPlatformMixClient(config)
                )

                platform.registerConfigs('mock', {
                    apiKey: 'chatluna_123',
                    platform: 'mock'
                })

                const client = await platform.randomClient('mock')

                expect(client?.config).to.deep.equal({
                    apiKey: 'chatluna_123',
                    platform: 'mock',
                    concurrentMaxSize: 1,
                    maxRetries: 3,

                    timeout: 7200000
                })
            }
            await loadPlugin(app, plugin, 5)
        })

        it('Model', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                const disposable = platform.registerClient(
                    'mock',
                    (_, config) => new MockPlatformEmbeddingsClient(config)
                )

                platform.registerConfigs('mock', {
                    apiKey: 'chatluna_123',
                    platform: 'mock'
                })

                await platform.createClients('mock')

                expect(platform.getModels('mock', ModelType.all)).to.deep.equal(
                    [
                        {
                            name: 'mock_embeddings',
                            type: ModelType.embeddings
                        }
                    ]
                )

                expect(platform.getAllModels(ModelType.all)).to.deep.equal([
                    {
                        name: 'mock_embeddings',
                        type: ModelType.embeddings
                    }
                ])

                expect(
                    platform.resolveModel('mock/mock_embeddings')
                ).to.deep.equal({
                    name: 'mock_embeddings',
                    type: ModelType.embeddings
                })

                disposable()

                expect(platform.getModels('mock', ModelType.all)).have.length(0)
            }
            await loadPlugin(app, plugin, 5)
        })

        it('Tools', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                const mockTool = new MockTool({
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

                platform.registerTool('mock', {
                    createTool: async () => {
                        return mockTool
                    },
                    selector: () => true
                })

                expect(platform.tools).to.deep.equal(['mock'])
            }
            await loadPlugin(app, plugin, 5)
        })

        it('VectorStore', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                platform.registerVectorStore('mock', async (params) => {
                    return MemoryVectorStore.fromExistingIndex(
                        params.embeddings
                    )
                })

                expect(platform.vectorStores).to.deep.equal(['mock'])
            }
            await loadPlugin(app, plugin, 5)
        })

        it('Chain', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                const createChainFunction = async (
                    params: CreateChatLunaLLMChainParams
                ) => {
                    return MockChatChain.fromLLM(params.model, params)
                }

                platform.registerChatChain('mock', 'mock', createChainFunction)

                const pool = new ClientConfigPool()

                platform.registerConfigPool('mock', pool)

                platform.registerClient(
                    'mock',
                    (_, config) => new MockPlatformModelClient(config)
                )

                pool.addConfigs({
                    apiKey: 'chatluna_123',
                    platform: 'mock'
                })

                expect(platform.chatChains).to.deep.equal([
                    {
                        name: 'mock',
                        description: 'mock',
                        createFunction: createChainFunction
                    }
                ])
            }
            await loadPlugin(app, plugin, 5)
        })

        it('Config', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform
                const pool = new ClientConfigPool()

                platform.registerConfigPool('mock', pool)

                platform.registerClient(
                    'mock',
                    (_, config) => new MockPlatformMixClient(config)
                )

                pool.addConfigs({
                    apiKey: 'chatluna_123',
                    platform: 'mock'
                })

                await platform.createClients('mock')

                const configs = platform.getConfigs('mock')

                expect(configs).to.deep.equal([
                    {
                        apiKey: 'chatluna_123',
                        platform: 'mock',
                        concurrentMaxSize: 1,
                        maxRetries: 3,
                        timeout: 7200000
                    }
                ])
            }
            await loadPlugin(app, plugin, 10)
        })
    })

    describe('Error', async () => {
        describe('Unavailable Client', async () => {
            it('Auto Check', async () => {
                const plugin = async (ctx: Context) => {
                    const platform = ctx.chatluna_platform

                    platform.registerClient(
                        'mock',
                        (_, config) =>
                            new MockUnavailablePlatformModelClient(config)
                    )

                    platform.registerConfigs('mock', {
                        apiKey: 'chatluna_123',
                        platform: 'mock'
                    })

                    let client = await platform.randomClient('mock')

                    expect(client).to.be.equal(undefined)

                    platform.registerClient('mock2', (_, config) => {
                        const result = new MockUnavailablePlatformModelClient(
                            config,
                            ctx
                        )

                        result.throwErrorOnInit = true

                        return result
                    })

                    platform.registerConfigs('mock2', {
                        apiKey: 'chatluna_123',
                        platform: 'mock2'
                    })

                    try {
                        await platform.randomModel('mock2/mock')
                    } catch (e) {
                        expect(() => {
                            throw e
                        }).to.throw(
                            '使用 ChatLuna 时出现错误，错误码为 301。请联系开发者以解决此问题。'
                        )
                    }

                    platform.registerClient('mock3', (_, config) => {
                        const result = new MockPlatformModelClient(
                            config,
                            ctx,
                            undefined
                        )

                        result.returnNullInModels = true

                        return result
                    })

                    platform.registerConfigs('mock3', {
                        apiKey: 'chatluna_123',
                        platform: 'mock3'
                    })

                    const config = platform.getConfigs('mock3')[0]

                    expect(
                        await platform.createClient('mock3', config)
                    ).to.be.equal(undefined)

                    // make code coverage happy

                    await platform.createClients('mock3')
                }

                await loadPlugin(app, plugin, 5)
            })

            it('Manual Set', async () => {
                const plugin = async (ctx: Context) => {
                    const platform = ctx.chatluna_platform

                    platform.registerClient(
                        'mock',
                        (_, config) =>
                            new MockUnavailablePlatformModelClient(config)
                    )

                    platform.registerConfigs('mock', {
                        apiKey: 'chatluna_123',
                        platform: 'mock'
                    })

                    const config = platform.getConfigs('mock')[0]

                    platform.makeConfigStatus(config, false)

                    expect(
                        await platform.createClient('mock', config)
                    ).to.be.equal(undefined)
                }

                await loadPlugin(app, plugin, 5)
            })
        })

        describe('Already exists', () => {
            it('Client', async () => {
                const plugin = async (ctx: Context) => {
                    const platform = ctx.chatluna_platform

                    platform.registerClient(
                        'mock',
                        (_, config) => new MockPlatformMixClient(config)
                    )

                    platform.registerConfigs('mock', {
                        apiKey: 'chatluna_123',
                        platform: 'mock'
                    })

                    expect(() => {
                        platform.registerClient(
                            'mock',
                            (_, config) => new MockPlatformMixClient(config)
                        )
                    }).to.throw('Client mock already exists')
                }
                await loadPlugin(app, plugin, 5)
            })

            it('Config Pool', async () => {
                const plugin = async (ctx: Context) => {
                    const platform = ctx.chatluna_platform
                    const pool = new ClientConfigPool()

                    // auto dispose
                    ctx.effect(() => platform.registerConfigPool('mock', pool))

                    expect(() => {
                        platform.registerConfigPool('mock', pool)
                    }).to.throw('Config pool mock already exists')
                }
                await loadPlugin(app, plugin, 5)
            })
        })

        describe('Not Found', () => {
            it('Config Pool', async () => {
                const plugin = async (ctx: Context) => {
                    const platform = ctx.chatluna_platform

                    expect(() => {
                        platform.registerConfigs('mock', {
                            apiKey: 'chatluna_123',
                            platform: 'mock'
                        })
                    }).to.throw('Config pool mock not found')

                    try {
                        await platform.createClients('mock')
                        throw new Error('Should not reach here')
                    } catch (e) {
                        expect(() => {
                            throw e
                        }).throw('Config pool mock not found')
                    }

                    const pool = new ClientConfigPool()

                    const config = pool.addConfig({
                        apiKey: 'chatluna_123',
                        platform: 'mock'
                    })

                    const configPoolDisposable = platform.registerConfigPool(
                        'mock',
                        pool
                    )

                    const clientDisposable = platform.registerClient(
                        'mock',
                        (_, config) => new MockPlatformMixClient(config)
                    )

                    configPoolDisposable()

                    clientDisposable()

                    expect(() => {
                        platform.makeConfigStatus(config, false)
                    }).to.throw('Config pool mock not found')
                }

                await loadPlugin(app, plugin, 5)
            })

            it('Chain', async () => {
                const plugin = async (ctx: Context) => {
                    const platform = ctx.chatluna_platform

                    try {
                        await platform.createChatChain('mock', undefined)
                        throw new Error('Should not reach here')
                    } catch (e) {
                        expect(() => {
                            throw e
                        }).throw('Chat chain mock not found or params is null')
                    }
                }
                await loadPlugin(app, plugin, 5)
            })

            it('Client', async () => {
                const plugin = async (ctx: Context) => {
                    const platform = ctx.chatluna_platform

                    try {
                        await platform.createClient('mock', undefined)
                        throw new Error('Should not reach here')
                    } catch (e) {
                        expect(() => {
                            throw e
                        }).throw(
                            'Create client function mock not found or config is null'
                        )
                    }
                }
                await loadPlugin(app, plugin, 5)
            })

            it('VectorStore', async () => {
                const plugin = async (ctx: Context) => {
                    const platform = ctx.chatluna_platform

                    try {
                        await platform.createVectorStore('mock', undefined)
                        throw new Error('Should not reach here')
                    } catch (e) {
                        expect(() => {
                            throw e
                        }).throw(
                            'Vector store retriever mock not found or params is null'
                        )
                    }
                }
                await loadPlugin(app, plugin, 5)
            })
        })

        it('Other', async () => {
            const plugin = async (ctx: Context) => {
                const platform = ctx.chatluna_platform

                platform.registerChatChain('mock', 'mock', async (params) => {
                    return MockChatChain.fromLLM(params.model, params)
                })

                const pool = new ClientConfigPool()

                platform.registerConfigPool('mock', pool)

                platform.registerClient(
                    'mock',
                    (_, config) => new MockPlatformModelClient(config)
                )

                pool.addConfigs({
                    apiKey: 'chatluna_123',
                    platform: 'mock'
                })

                try {
                    await platform.randomModel(
                        'mock/mock_model',
                        ModelType.embeddings
                    )
                    throw new Error('Should not reach here')
                } catch (e) {
                    expect(() => {
                        throw e
                    }).throw('使用 ChatLuna 时出现错误，错误码为 301。请联系开发者以解决此问题。')
                }
            }

            await loadPlugin(app, plugin, 5)
        })
    })
})

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

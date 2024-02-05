import chai, { expect, should } from 'chai'
import { describe, it, before, after } from 'node:test'
import * as logger from '@cordisjs/logger'
import { Context } from '@cordisjs/core'
import chaiAsPromised from 'chai-as-promised'
import { ClientConfigPool } from '@chatluna/core/platform'
import { MockTool } from './mock/mock_tool.ts'
import { z } from 'zod'
import { loadChatLunaCore } from '@chatluna/core'
import { loadPlugin, runAsync, waitServiceLoad } from './mock/utils.ts'
import os from 'os'
import { MockPlatformMixClient } from './mock/mock_platform_client.ts'
import { MemoryVectorStore, emptyEmbeddings } from '@chatluna/core/vectorstore'
import {} from '@chatluna/core/service'

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
            await loadPlugin(app, plugin, 5)
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

        it('VectorStoreRetriever', async () => {
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
    })
})

app.on('ready', async () => {
    // load logger
    app.provide('logger', undefined, true)
    app.plugin(logger)
    loadChatLunaCore(app)

    await setProxyAddress()
})

before((_, done) => {
    runAsync(async () => {
        await app.start()
        done()
    })
})

after((_, done) => {
    runAsync(async () => {
        await app.stop()
        done()
    })
})

async function setProxyAddress() {
    await waitServiceLoad(app, ['chatluna_request'])
    if (os.homedir()?.includes('dingyi') && os.platform() === 'win32') {
        app.chatluna_request.root.proxyAddress = 'http://127.0.0.1:7890'
    } else {
        app.chatluna_request.root.proxyAddress = undefined
    }
}

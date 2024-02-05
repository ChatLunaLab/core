import { expect } from 'chai'
import { describe, it } from 'node:test'
import {
    MockEmbeddingsRequester,
    MockModelRequester
} from './mock/mock_requester.ts'
import { HumanMessage } from '@langchain/core/messages'
import { ClientConfigPool, ClientConfigPoolMode } from '@chatluna/core/platform'

describe('Client Config', () => {
    it('get with random mode', async () => {
        const pool = new ClientConfigPool(ClientConfigPoolMode.Random)

        pool.addConfigs(
            {
                apiKey: '111',
                platform: '111'
            },
            {
                apiKey: '222',
                platform: '222'
            }
        )

        expect(pool.getConfig())
            .to.have.property('apiKey')
            .oneOf(['111', '222'])

        pool.markConfigStatus(pool.getConfig(), false)

        expect(pool.getConfig())
            .to.have.property('apiKey')
            .oneOf(['111', '222'])
    })

    it('get with alwaysTheSame', async () => {
        const pool = new ClientConfigPool(ClientConfigPoolMode.AlwaysTheSame)

        pool.addConfigs(
            {
                apiKey: '111',
                platform: '111'
            },
            {
                apiKey: '222',
                platform: '222'
            }
        )

        expect(pool.getConfig()).to.have.property('apiKey', '111')

        // make config[0] unavailable

        pool.markConfigStatus(pool.getConfig(), false)

        expect(pool.getConfig()).to.have.property('apiKey', '222')
    })

    it('get with balance mode', async () => {
        const pool = new ClientConfigPool(ClientConfigPoolMode.LoadBalancing)

        pool.addConfigs(
            {
                apiKey: '111',
                platform: '111'
            },
            {
                apiKey: '222',
                platform: '222'
            }
        )

        expect(pool.getConfig()).to.have.property('apiKey', '111')

        // config[1]
        expect(pool.getConfig()).to.have.property('apiKey', '222')

        // config[0]
        pool.markConfigStatus(pool.getConfig(), false)

        expect(pool.getConfig()).to.have.property('apiKey', '222')
    })

    it('get config list', async () => {
        const pool = new ClientConfigPool(ClientConfigPoolMode.AlwaysTheSame)

        pool.addConfigs(
            {
                apiKey: '111',
                platform: '111'
            },
            {
                apiKey: '222',
                platform: '222'
            }
        )

        expect(pool.getConfigs()).to.deep.equal([
            {
                apiKey: '111',
                platform: '111',
                // default config
                concurrentMaxSize: 1,
                maxRetries: 3,
                timeout: 7200000
            },
            {
                apiKey: '222',
                platform: '222',
                concurrentMaxSize: 1,
                maxRetries: 3,
                timeout: 7200000
            }
        ])
    })

    it('unavailable config', async () => {
        const pool = new ClientConfigPool(ClientConfigPoolMode.LoadBalancing)

        pool.addConfigs(
            {
                apiKey: '111',
                platform: '111'
            },
            {
                apiKey: '222',
                platform: '222'
            }
        )

        const config1 = pool.getConfig()
        pool.markConfigStatus(config1, false)
        pool.markConfigStatus(pool.getConfig(), false)

        expect(pool.isAvailable(config1)).to.equal(false)

        expect(() => pool.getConfig()).to.throw(
            '使用 ChatLuna 时出现错误，错误码为 307。请联系开发者以解决此问题。'
        )

        pool.mode = ClientConfigPoolMode.AlwaysTheSame

        expect(pool.mode).to.equal(ClientConfigPoolMode.AlwaysTheSame)

        expect(() => pool.getConfig()).to.throw(
            '使用 ChatLuna 时出现错误，错误码为 307。请联系开发者以解决此问题。'
        )

        pool.mode = ClientConfigPoolMode.Random

        expect(() => pool.getConfig()).to.throw(
            '使用 ChatLuna 时出现错误，错误码为 307。请联系开发者以解决此问题。'
        )
    })

    it('add same config', async () => {
        const pool = new ClientConfigPool(ClientConfigPoolMode.LoadBalancing)

        expect(() => {
            pool.addConfigs(
                {
                    apiKey: '111',
                    platform: '111'
                },
                {
                    apiKey: '111',
                    platform: '111'
                }
            )
        }).throw('')
    })
})

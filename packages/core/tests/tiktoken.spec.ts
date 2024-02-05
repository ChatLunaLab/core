import { Context } from '@cordisjs/core'
import chai, { expect, should } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { describe, it, before, after } from 'node:test'
import { loadChatLunaCore } from '@chatluna/core'
import {
    encodingForModel,
    getModelNameForTiktoken,
    getModelContextSize,
    getEmbeddingContextSize,
    calculateMaxTokens,
    parseRawModelName,
    calculateTokens
} from '@chatluna/core/utils'
import { runAsync, waitServiceLoad } from './mock/utils.ts'
import * as logger from '@cordisjs/logger'

import os from 'os'

const app = new Context()

chai.use(chaiAsPromised)

should()

describe('Tiktoken', () => {
    it('get tiktoken BPE', { timeout: 5000 }, async function () {
        await waitServiceLoad(app, ['chatluna_request'])

        let encoding = await encodingForModel('text-davinci-003', {
            ctx: app
        })

        // in old gpt-3, the length of the encoded string should 5
        encoding.encode('Hello World！').should.length(5)

        encoding = await encodingForModel('gpt-3.5-turbo', {
            ctx: app
        })

        encoding.encode('Hello World！').should.length(3)
    })

    it('get tiktoken BPE with timeout', { timeout: 10000 }, async function () {
        await waitServiceLoad(app, ['chatluna_request'])

        try {
            await encodingForModel('text-davinci-003', {
                ctx: app,
                timeout: 100,
                force: true
            })
        } catch (e) {
            e.toString().should.equal(
                '使用 ChatLuna 时出现错误，错误码为 1。请联系开发者以解决此问题。'
            )
        }
    })

    it('get tiktoken BPE with unknown error', async function () {
        await waitServiceLoad(app, ['chatluna_request'])

        app.chatluna_request.root.proxyAddress = 'http://localhost:12934'

        try {
            await encodingForModel('text-davinci-003', {
                ctx: app,
                force: true
            })
        } catch (e) {
            e.toString().should.equal(
                '使用 ChatLuna 时出现错误，错误码为 1。请联系开发者以解决此问题。'
            )
        }

        await setProxyAddress()
    })
})

describe('Count Token', () => {
    it('get tiktoken model name', () => {
        // gpt-4

        getModelNameForTiktoken('gpt-4-vision-preview').should.equal(
            'gpt-4-1106-preview'
        )

        getModelNameForTiktoken('gpt-4-1106-preview').should.equal(
            'gpt-4-1106-preview'
        )

        getModelNameForTiktoken('gpt-3.5-turbo-1106').should.equal(
            'gpt-3.5-turbo-16k'
        )

        getModelNameForTiktoken('gpt-3.5-turbo-16k').should.equal(
            'gpt-3.5-turbo-16k'
        )

        getModelNameForTiktoken('gpt-3.5-turbo-0613').should.equal(
            'gpt-3.5-turbo'
        )

        getModelNameForTiktoken('gpt-4-32k-0613').should.equal('gpt-4-32k')

        getModelNameForTiktoken('gpt-4-0613').should.equal('gpt-4')

        getModelNameForTiktoken('davinci').should.equal('davinci')

        getModelNameForTiktoken('chatglm3').should.equal('gpt-3.5-turbo')
    })

    it('get model context window size', () => {
        getModelContextSize('gpt-4-1106-preview').should.equal(128000)

        getModelContextSize('gpt-3.5-turbo-16k').should.equal(16384)

        getModelContextSize('gpt-3.5-turbo').should.equal(4096)

        getModelContextSize('gpt-4-32k').should.equal(32768)

        getModelContextSize('gpt-4').should.equal(8192)

        getModelContextSize('text-davinci-003').should.equal(4097)

        getModelContextSize('text-davinci-002').should.equal(4097)

        getModelContextSize('text-curie-001').should.equal(2048)

        getModelContextSize('text-ada-001').should.equal(2048)

        getModelContextSize('text-babbage-001').should.equal(2048)

        getModelContextSize('code-davinci-002').should.equal(8000)

        getModelContextSize('code-cushman-001').should.equal(2048)

        getModelContextSize('chatglm1').should.equal(4096)

        getEmbeddingContextSize('text-embedding-ada-002').should.equal(8191)

        getEmbeddingContextSize('text-embedding-ada-001').should.equal(2046)
    })

    it('get prompt tokens', { timeout: 10000 }, async function () {
        await waitServiceLoad(app, ['chatluna_request'])

        await setProxyAddress()

        // in old gpt-3, the length of the encoded string should 5

        expect(
            await calculateMaxTokens({
                prompt: 'Hello World！',
                modelName: 'text-davinci-003',
                ctx: app
            })
        ).to.equal(4092)

        // in old gpt-3, the length of the encoded string should 5
        expect(
            await calculateMaxTokens({
                prompt: 'Hello World！',
                modelName: 'gpt-3.5-turbo',
                ctx: app
            })
        ).to.equal(4093)

        expect(
            await calculateMaxTokens({
                prompt: 'Hello World！',
                modelName: getModelNameForTiktoken('chatglm3'),
                ctx: app
            })
        ).to.equal(4093)

        expect(
            await calculateTokens({
                prompt: 'Hello World！',
                modelName: 'text-davinci-003',
                ctx: app
            })
        ).to.equal(5)

        // fast mode
        expect(
            await calculateTokens({
                prompt: 'Hello World！',
                modelName: 'text-davinci-003',
                ctx: app,
                fast: true
            })
        ).to.equal(6)
    })

    it('get prompt tokens with error', { timeout: 10000 }, async function () {
        await waitServiceLoad(app, ['chatluna_request'])

        app.chatluna_request.root.proxyAddress =
            'http://localhossfdklansdfalkjnsadflk.com:129364'

        // fallback to prompt.length / 2
        expect(
            await calculateMaxTokens({
                prompt: 'Hello World！',
                modelName: 'text-davinci-003',
                ctx: app,
                force: true
            })
        ).to.equal(4091)

        // fallback to prompt.length / 2
        expect(
            await calculateMaxTokens({
                prompt: 'Hello World！',
                modelName: 'text-davinci-003',
                timeout: 10,
                force: true
            })
        ).to.equal(4091)

        await setProxyAddress()
    })
})

describe('Parse chatluna platform model', () => {
    it('current', () => {
        parseRawModelName('openai/gpt-3.5-turbo').should.deep.equal([
            'openai',
            'gpt-3.5-turbo'
        ])

        parseRawModelName(
            'huggingface/sentence-transformers/distilbert-base-nli-mean-tokens'
        ).should.deep.equal([
            'huggingface',
            'sentence-transformers/distilbert-base-nli-mean-tokens'
        ])

        parseRawModelName('a/b/c/d').should.deep.equal(['a', 'b/c/d'])
    })

    it('error', () => {
        expect(() => {
            parseRawModelName(null as any)
        }).to.throw(
            '使用 ChatLuna 时出现错误，错误码为 301。请联系开发者以解决此问题。'
        )

        expect(() => {
            parseRawModelName('openai')
        }).to.throw(
            '使用 ChatLuna 时出现错误，错误码为 301。请联系开发者以解决此问题。'
        )
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

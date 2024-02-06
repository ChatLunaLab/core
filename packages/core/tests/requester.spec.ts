import { expect, should } from 'chai'
import * as chai from 'chai'
import { describe, it, before, after } from 'mocha'
import * as logger from '@cordisjs/logger'
import { Context } from '@cordisjs/core'
import {
    MockEmbeddingsRequester,
    MockModelRequester
} from './mock/mock_requester.ts'
import { HumanMessage } from '@langchain/core/messages'
import chaiAsPromised from 'chai-as-promised'
import { runAsync } from './mock/utils.ts'

chai.use(chaiAsPromised)

should()

const app = new Context()

should()

describe('Requester', () => {
    it('request model streams', async () => {
        const requester = new MockModelRequester(app)

        const generator = requester.completionStream({
            input: [new HumanMessage('Hello. Are you eat today?')],
            model: 'test',
            maxTokens: 10,

            temperature: 0.5,
            topP: 1,

            frequencyPenalty: 0,
            presencePenalty: 0
        })

        for await (const chunk of generator) {
            expect(chunk).to.be.haveOwnProperty('text', 'Hello.  I eat today!')
        }
    })

    it('request model Completion', async () => {
        const requester = new MockModelRequester(app)

        const completion = await requester.completion({
            input: [new HumanMessage('Hello. Are you eat today?')],
            model: 'test',
            maxTokens: 10,

            temperature: 0.5,
            topP: 1,

            frequencyPenalty: 0
        })
        expect(completion).to.be.haveOwnProperty('text', 'Hello.  I eat today!')
    })

    it('request embeddings', async () => {
        const requester = new MockEmbeddingsRequester()

        // check return is it utf8Code
        expect(
            requester.embeddings({
                input: 'Hello. Are you eat today?'
            })
        ).to.eventually.be.equal([
            72, 101, 108, 108, 111, 46, 32, 65, 114, 101, 32, 121, 111, 117, 32,
            101, 97, 116, 32, 116, 111, 100, 97, 121, 63
        ])
    })

    it('request multiple embeddings', async () => {
        const requester = new MockEmbeddingsRequester()

        expect(
            requester.embeddings({
                input: [
                    'Hello. Are you eat today?',
                    'Hello. Are you eat today?'
                ]
            })
        ).to.eventually.be.deep.equal([
            [
                72, 101, 108, 108, 111, 46, 32, 65, 114, 101, 32, 121, 111, 117,
                32, 101, 97, 116, 32, 116, 111, 100, 97, 121, 63
            ],
            [
                72, 101, 108, 108, 111, 46, 32, 65, 114, 101, 32, 121, 111, 117,
                32, 101, 97, 116, 32, 116, 111, 100, 97, 121, 63
            ]
        ])
    })
})

app.on('ready', async () => {
    // load logger
    app.provide('logger', undefined, true)
    app.plugin(logger)
})

before(async () => {
    await app.start()
})

after(async () => {
    await app.stop()
})

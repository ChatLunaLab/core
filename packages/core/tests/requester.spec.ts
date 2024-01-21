import chai, { expect, should } from 'chai'
import { describe, it } from 'mocha'
import * as logger from '@cordisjs/logger'
import { Context } from 'cordis'
import {
    MockEmbeddingsRequester,
    MockModelRequester
} from './mock/mock_requester'
import { HumanMessage } from '@langchain/core/messages'
import chaiAsPromised from 'chai-as-promised'

chai.use(chaiAsPromised)

should()

const app = new Context()

should()

describe('Requester', () => {
    it('Request Model Streams', async () => {
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

    it('Request Model Completion', async () => {
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

    it('Request Embeddings', async () => {
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

    it('Request Multiple Embeddings', async () => {
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
    app.plugin(logger)
})

before(async () => {
    await app.start()
})

after(async () => {
    await app.stop()
})

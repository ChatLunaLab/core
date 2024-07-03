// @ts-ignore
import { apply } from '@chatluna/memory'
import {
    AIMessage,
    HumanMessage,
    SystemMessage
} from '@langchain/core/messages'
import MemoryDriver from '@minatojs/driver-memory'
import * as chai from 'chai'
import { should } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiSubset from 'chai-subset'
import { Context } from 'cordis'
import { Database } from 'minato'
import { after, before } from 'mocha'
// @ts-ignore
import { DataBaseChatMessageHistory } from '../src/memory/index.js'
import { waitServiceLoad } from './mock/utils.js'

const app = new Context()

chai.use(chaiAsPromised)
chai.use(chaiSubset)

describe('Chat History', () => {
    it('Add & Load', async () => {
        await waitServiceLoad(app, ['chatluna_conversation'])

        const messages = [
            new SystemMessage('Hello'),
            new HumanMessage('Hi'),
            new AIMessage('How are you?'),
            new AIMessage("I'm fine, thanks!"),
            new HumanMessage('How about you?'),
            new AIMessage("I'm good, thanks!"),
            new HumanMessage('What do you do?'),
            new AIMessage('I am a chatbot.')
        ]

        const conversation = await app.chatluna_conversation.createConversation(
            {
                preset: 'test',
                // platform model
                model: 'gpt-3',
                chatMode: 'long-memory',
                createdTime: new Date(),
                updatedTime: new Date()
            },
            {
                userId: 'a',
                owner: true,
                default: true
            }
        )

        const history = new DataBaseChatMessageHistory(app, conversation.id)

        for (let index = 0; index < messages.length; index++) {
            const message = messages[index]

            if (index < 4) {
                await history.addMessage(message)
                continue
            }

            if (message instanceof HumanMessage) {
                await history.addUserMessage(message.content as string)
            } else {
                await history.addAIChatMessage(message.content as string)
            }
        }

        await history.getMessages().should.be.eventually.to.eql(messages)

        await history.clear()
        await history.delete()
    })

    it('Additional Kwargs', async () => {
        await waitServiceLoad(app, ['chatluna_conversation'])

        const conversation = await app.chatluna_conversation.createConversation(
            {
                preset: 'test',
                // platform model
                model: 'gpt-3',
                chatMode: 'long-memory',
                createdTime: new Date(),
                updatedTime: new Date()
            },
            {
                userId: 'a',
                owner: true,
                default: true
            }
        )

        const history = new DataBaseChatMessageHistory(app, conversation.id)

        await history.updateAdditionalKwargs('test', '123')

        await history
            .getAdditionalKwargs('test')
            .should.eventually.to.equal('123')

        await history.deleteAdditionalKwargs('test')

        await history
            .getAdditionalKwargs('test')
            .should.eventually.to.equal(undefined)

        await history.overrideAdditionalKwargs({
            test: '123'
        })

        await history
            .getAdditionalKwargs('test')
            .should.eventually.to.equal('123')

        await history.clearAdditionalKwargs()

        await history.delete()
    })

    it('Corp Messages', async () => {
        await waitServiceLoad(app, ['chatluna_conversation'])

        const messages = [
            new SystemMessage('Hello'),
            new HumanMessage('Hi'),
            new AIMessage('How are you?'),
            new AIMessage("I'm fine, thanks!"),
            new HumanMessage('How about you?'),
            new AIMessage("I'm good, thanks!"),
            new HumanMessage('What do you do?'),
            new AIMessage('I am a chatbot.')
        ]

        const conversation = await app.chatluna_conversation.createConversation(
            {
                preset: 'test',
                // platform model
                model: 'gpt-3',
                chatMode: 'long-memory',
                createdTime: new Date(),
                updatedTime: new Date()
            },
            {
                userId: 'a',
                owner: true,
                default: true
            }
        )

        const history = new DataBaseChatMessageHistory(app, conversation.id, 4)

        for (const message of messages) {
            await history.addMessage(message)
        }

        await history
            .getMessages()
            .should.be.eventually.to.eql([
                new HumanMessage('How about you?'),
                new AIMessage("I'm good, thanks!"),
                new HumanMessage('What do you do?'),
                new AIMessage('I am a chatbot.')
            ])

        await history.clear()
        await history.delete()
    })
})

should()

app.on('ready', async () => {
    const database = new Database()
    app.provide('database', database)

    await app.database.connect(MemoryDriver, {})
    app.plugin(apply)
})

before(async () => {
    await app.start()
})

after(async () => {
    await app.stop()
})

import { apply } from '@chatluna/memory'
import MemoryDriver from '@minatojs/driver-memory'
import * as chai from 'chai'
import { should } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiSubset from 'chai-subset'
import { Context } from 'cordis'
import { Database } from 'minato'
import { after, before } from 'mocha'
// @ts-ignore
import { ChatLunaConversationService } from '../src/service/index.js'
import { waitServiceLoad } from './mock/utils.js'

const app = new Context()

chai.use(chaiAsPromised)
chai.use(chaiSubset)

describe('Conversation Service', () => {
    it('Create', async () => {
        await waitServiceLoad(app, ['chatluna_conversation'])

        const currentTime = new Date()

        const conversation = await app.chatluna_conversation.createConversation(
            {
                preset: 'test',
                // platform model
                model: 'gpt-3',
                chatMode: 'long-memory',
                createdTime: currentTime,
                updatedTime: currentTime
            },
            {
                userId: 'a',
                owner: true,
                default: true
            }
        )

        conversation.should.to.containSubset({
            preset: 'test',
            model: 'gpt-3',
            chatMode: 'long-memory',
            createdTime: currentTime,
            updatedTime: currentTime
        })

        await app.chatluna_conversation
            .resolveConversation(conversation.id)
            .should.to.eventually.be.eql(conversation)

        await app.chatluna_conversation.deleteConversation(conversation)
    })

    it('Query (Fuzzy Search)', async () => {
        await waitServiceLoad(app, ['chatluna_conversation'])

        const currentTime = new Date()

        const conversation = await app.chatluna_conversation.createConversation(
            {
                preset: 'test',
                // platform model
                model: 'gpt-3',
                chatMode: 'long-memory',
                createdTime: currentTime,
                updatedTime: currentTime
            },
            {
                userId: 'a',
                owner: true,
                default: true
            }
        )

        await app.chatluna_conversation
            .searchConversation('a')
            .should.to.eventually.be.eql([
                [
                    conversation,
                    {
                        userId: 'a',
                        conversationId: conversation.id,
                        mute: null,
                        private: null,
                        guildId: null,
                        owner: true,
                        default: true
                    }
                ]
            ])

        await app.chatluna_conversation
            .searchConversation('a', undefined, {
                model: 'gpt'
            })
            .should.to.eventually.be.eql([
                [
                    conversation,
                    {
                        userId: 'a',
                        conversationId: conversation.id,
                        mute: null,
                        private: null,
                        guildId: null,
                        owner: true,
                        default: true
                    }
                ]
            ])

        await app.chatluna_conversation.deleteConversation(conversation)
    })

    it('Query (By User)', async () => {
        await waitServiceLoad(app, ['chatluna_conversation'])

        const currentTime = new Date()

        const conversation = await app.chatluna_conversation.createConversation(
            {
                preset: 'test',
                // platform model
                model: 'gpt-3',
                chatMode: 'long-memory',
                createdTime: currentTime,
                updatedTime: currentTime
            },
            {
                userId: 'a',
                owner: true,
                default: true
            }
        )

        await app.chatluna_conversation
            .resolveConversationByUser('a', undefined, true)
            .should.to.eventually.be.eql([
                conversation,
                {
                    userId: 'a',
                    conversationId: conversation.id,
                    mute: null,
                    private: null,
                    guildId: null,
                    owner: true,
                    default: true
                }
            ])

        await app.chatluna_conversation.deleteConversation(conversation)
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

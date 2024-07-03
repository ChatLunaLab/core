// @ts-ignore
import { ModelRequestParams } from '@chatluna/core/model'
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

        let conversation = await app.chatluna_conversation.createConversation(
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

        conversation = await app.chatluna_conversation.createConversation(
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
                guildId: '1',
                default: true
            }
        )

        await app.chatluna_conversation
            .resolveConversationByUser('a', '1', true)
            .should.to.eventually.be.eql([
                conversation,
                {
                    userId: 'a',
                    conversationId: conversation.id,
                    mute: null,
                    private: null,
                    guildId: '1',
                    owner: true,
                    default: true
                }
            ])

        await app.chatluna_conversation
            .searchConversation('a', '1', {
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
                        guildId: '1',
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

        const conversation2 =
            await app.chatluna_conversation.createConversation(
                {
                    preset: 'test1',
                    // platform model
                    model: 'gpt-4',
                    chatMode: 'lon-memory',
                    createdTime: currentTime,
                    updatedTime: currentTime
                },
                {
                    userId: 'a',
                    guildId: '1',
                    owner: true,
                    default: false
                }
            )

        await app.chatluna_conversation
            .queryConversationsByUser('a', undefined, true)
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
            .queryConversationsByUser('a', '1')
            .should.to.eventually.be.eql([
                [
                    conversation2,
                    {
                        userId: 'a',
                        conversationId: conversation2.id,
                        mute: null,
                        private: null,
                        guildId: '1',
                        owner: true,
                        default: false
                    }
                ]
            ])

        await app.chatluna_conversation.deleteConversationsByUser('a')
    })

    it('Query Additional', async () => {
        await waitServiceLoad(app, ['chatluna_conversation'])

        const currentTime = new Date()

        let conversation = await app.chatluna_conversation.createConversation(
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
            .queryConversationAdditional('a')
            .should.to.eventually.be.eql({
                userId: 'a',
                conversationId: conversation.id,
                mute: null,
                private: null,
                guildId: null,
                owner: true,
                default: true
            })

        await app.chatluna_conversation
            .queryConversationAdditional('a', undefined, true, conversation.id)
            .should.to.eventually.be.eql({
                userId: 'a',
                conversationId: conversation.id,
                mute: null,
                private: null,
                guildId: null,
                owner: true,
                default: true
            })

        await app.chatluna_conversation.deleteConversation(conversation)

        conversation = await app.chatluna_conversation.createConversation(
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
                guildId: '1',
                default: true
            }
        )

        await app.chatluna_conversation
            .queryConversationAdditional('a', '1')
            .should.to.eventually.be.eql({
                userId: 'a',
                conversationId: conversation.id,
                mute: null,
                private: null,
                guildId: '1',
                owner: true,
                default: true
            })

        await app.chatluna_conversation.deleteConversationsByUser(
            'a',
            '1',
            true
        )
        await app.chatluna_conversation.deleteConversationsByUser('a')
    })

    it('Clone Conversation', async () => {
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

        let clonedConversation =
            await app.chatluna_conversation.cloneConversation(conversation, {
                userId: 'a',
                conversationId: conversation.id,
                mute: null,
                private: null,
                guildId: null,
                owner: true,
                default: false
            })

        ;({
            model: conversation.model,
            chatMode: conversation.chatMode,
            preset: conversation.preset
        }).should.to.be.eql({
            model: clonedConversation.model,
            chatMode: clonedConversation.chatMode,
            preset: clonedConversation.preset
        })

        clonedConversation = await app.chatluna_conversation.cloneConversation(
            clonedConversation.id,
            {
                userId: 'a',
                conversationId: conversation.id,
                mute: null,
                private: null,
                guildId: null,
                owner: true,
                default: false
            }
        )
        ;({
            model: conversation.model,
            chatMode: conversation.chatMode,
            preset: conversation.preset
        }).should.to.be.eql({
            model: clonedConversation.model,
            chatMode: clonedConversation.chatMode,
            preset: clonedConversation.preset
        })

        await app.chatluna_conversation.deleteConversationsByUser('a')
    })

    it('Update Conversation Additional', async () => {
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

        await app.chatluna_conversation.updateConversationAdditional(
            conversation.id,
            {
                mute: true
            },
            undefined,
            'a',
            true
        )

        await app.chatluna_conversation
            .queryConversationAdditional('a')
            .should.to.eventually.be.eql({
                userId: 'a',
                conversationId: conversation.id,
                mute: true,
                private: null,
                guildId: null,
                owner: true,
                default: true
            })

        await app.chatluna_conversation.deleteConversation(conversation)
    })

    it('Add Messages', async () => {
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

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i]

            await app.chatluna_conversation.addMessage(conversation.id, {
                role: message._getType(),
                content: message.content,
                conversationId: conversation.id
            })
        }

        const savedMessages = await app.chatluna_conversation.fetchAllMessages(
            conversation.id
        )

        savedMessages.should.to.be.containSubset([
            {
                role: 'system',
                content: 'Hello',
                conversationId: conversation.id
            },
            {
                role: 'human',
                content: 'Hi',
                conversationId: conversation.id
            },
            {
                role: 'ai',
                content: 'How are you?',
                conversationId: conversation.id
            },
            {
                role: 'ai',
                content: "I'm fine, thanks!",
                conversationId: conversation.id
            },
            {
                role: 'human',
                content: 'How about you?',
                conversationId: conversation.id
            },
            {
                role: 'ai',
                content: "I'm good, thanks!",
                conversationId: conversation.id
            },
            {
                role: 'human',
                content: 'What do you do?',
                conversationId: conversation.id
            },
            {
                role: 'ai',
                content: 'I am a chatbot.',
                conversationId: conversation.id
            }
        ])

        await app.chatluna_conversation.clearMessages(conversation.id)

        await app.chatluna_conversation.deleteConversation(conversation)
    })

    it('Crop Messages', async () => {
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

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i]

            await app.chatluna_conversation.addMessage(
                conversation.id,
                {
                    role: message._getType(),
                    content: message.content,
                    conversationId: conversation.id
                },
                true,
                100
            )
        }

        // crop 4 messages
        await app.chatluna_conversation.cropMessages(conversation.id, 4)

        let savedMessages = await app.chatluna_conversation.fetchAllMessages(
            conversation.id
        )

        savedMessages.should.to.be.containSubset([
            {
                role: 'human',
                content: 'How about you?',
                conversationId: conversation.id
            },
            {
                role: 'ai',
                content: "I'm good, thanks!",
                conversationId: conversation.id
            },
            {
                role: 'human',
                content: 'What do you do?',
                conversationId: conversation.id
            },
            {
                role: 'ai',
                content: 'I am a chatbot.',
                conversationId: conversation.id
            }
        ])

        await app.chatluna_conversation.cropMessages(conversation.id, 3)

        savedMessages = await app.chatluna_conversation.fetchAllMessages(
            conversation.id
        )

        savedMessages.should.to.be.containSubset([
            {
                role: 'human',
                content: 'What do you do?',
                conversationId: conversation.id
            },
            {
                role: 'ai',
                content: 'I am a chatbot.',
                conversationId: conversation.id
            }
        ])

        await app.chatluna_conversation.deleteAllConversation()
    })

    describe('Error', () => {
        it('Resolve Conversation', async () => {
            await waitServiceLoad(app, ['chatluna_conversation'])

            await app.chatluna_conversation
                .resolveConversation('1', false)
                .should.eventually.to.be.eql(undefined)

            await app.chatluna_conversation
                .resolveConversation('1', true)
                .should.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 405。请联系开发者以解决此问题。'
                )
        })

        it('Query Conversation', async () => {
            await waitServiceLoad(app, ['chatluna_conversation'])

            await app.chatluna_conversation
                .queryConversationAdditional('1', '1', true)
                .should.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 405。请联系开发者以解决此问题。'
                )
        })

        it('Resolve Conversation By User', async () => {
            await waitServiceLoad(app, ['chatluna_conversation'])

            await app.chatluna_conversation
                .resolveConversationByUser('1', '1', true)
                .should.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 405。请联系开发者以解决此问题。'
                )
        })
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

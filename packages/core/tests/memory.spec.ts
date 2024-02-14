import { expect, should } from 'chai'
import * as chai from 'chai'
import { describe, it } from 'mocha'
import {
    BaseChatMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/memory'
import chaiAsPromised from 'chai-as-promised'
import { BufferWindowMemory } from '@chatluna/core/memory'
import { ChatMessageHistory } from './mock/mock_chat_memory.ts'
import {} from '@chatluna/core/memory'
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { MockEmbeddingsRequester } from './mock/mock_requester.ts'
import { ChatLunaEmbeddings } from '@chatluna/core/model'
import { MemoryVectorStore } from '@chatluna/core/vectorstore'
import { VectorStoreRetriever } from '@langchain/core/vectorstores'
import { Document } from '@langchain/core/documents'

chai.use(chaiAsPromised)

should()

describe('BufferWindowMemory', () => {
    it('Create', () => {
        const memory = new BufferWindowMemory({
            memoryKey: 'memory',
            chatHistory: new ChatMessageHistory()
        })

        expect(memory.memoryKey).to.equal('memory')

        expect(memory.memoryKeys).to.deep.equal(['memory'])
    })

    it('Load', async () => {
        let memory = new BufferWindowMemory({
            memoryKey: 'memory',
            k: 2,
            chatHistory: new ChatMessageHistory(generateMessages(10))
        })

        expect((await memory.loadMemoryVariables({}))['memory']).to.equal(
            'Human: hello human 6\nAI: hello ai 7\nHuman: hello human 8\nAI: hello ai 9'
        )

        memory = new BufferWindowMemory({
            memoryKey: 'memory',
            k: 2,
            returnMessages: true,
            chatHistory: new ChatMessageHistory(generateMessages(10))
        })

        expect((await memory.loadMemoryVariables({}))['memory']).to.deep.equal([
            new HumanMessage('hello human 6'),
            new AIMessage('hello ai 7'),
            new HumanMessage('hello human 8'),
            new AIMessage('hello ai 9')
        ])
    })

    it('Clear', async () => {
        const memory = new BufferWindowMemory({
            memoryKey: 'memory',
            k: 2,
            chatHistory: new ChatMessageHistory(generateMessages(10))
        })

        await memory.clear()

        expect((await memory.loadMemoryVariables({}))['memory']).to.equal('')
    })

    it('Save', async () => {
        const memory = new BufferWindowMemory({
            memoryKey: 'memory',
            chatHistory: new ChatMessageHistory()
        })

        await memory.saveContext(
            { input: new HumanMessage('hello human') },
            { output: new AIMessage('hello ai') }
        )

        expect((await memory.loadMemoryVariables({}))['memory']).to.equal(
            'Human: hello human\nAI: hello ai'
        )
    })

    it('Error', () => {
        expect(
            () =>
                new BufferWindowMemory({
                    memoryKey: 'memory',
                    k: 2
                })
        ).to.throw(
            '使用 ChatLuna 时出现错误，错误码为 999。请联系开发者以解决此问题。'
        )
    })
})

describe('VectorStoreRetrieverMemory', () => {
    it('Load', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester
        })

        const vectorStore = await MemoryVectorStore.fromTexts(
            ['hello', 'world'],
            {},
            mockEmbedding
        )

        const vectorStoreRetriever = vectorStore.asRetriever(1)

        let memory = new VectorStoreRetrieverMemory({
            vectorStoreRetriever
        })

        expect(
            (await memory.loadMemoryVariables({ input: 'he' }))['memory']
        ).to.equal('hello')

        memory = new VectorStoreRetrieverMemory({
            vectorStoreRetriever,
            returnDocs: true
        })

        expect(
            (await memory.loadMemoryVariables({ input: 'he' }))['memory']
        ).to.deep.equal([
            {
                pageContent: 'hello',
                metadata: {}
            }
        ])

        expect(memory.memoryKeys).to.deep.equal(['memory'])
    })

    it('Save', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester
        })

        const vectorStore = await MemoryVectorStore.fromTexts(
            [],
            {},
            mockEmbedding
        )

        const vectorStoreRetriever = vectorStore.asRetriever(1)

        const memory = new VectorStoreRetrieverMemory({
            vectorStoreRetriever
        })

        await memory.saveContext(
            { input: 'hello' },
            { input: 'world' }
        )

        expect(
            (await memory.loadMemoryVariables({ input: 'he' }))['memory']
        ).to.equal(`input: hello\ninput: world`)
    })
})

function generateMessages(n: number): BaseMessage[] {
    const messages: BaseMessage[] = []
    for (let i = 0; i < n; i++) {
        const message =
            i % 2 === 0
                ? new HumanMessage(`hello human ${i}`)
                : new AIMessage(`hello ai ${i}`)
        messages.push(message)
    }
    return messages
}

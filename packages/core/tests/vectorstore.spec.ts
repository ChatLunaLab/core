import chai, { expect, should } from 'chai'
import { describe, it } from 'mocha'
import {
    ChatLunaSaveableVectorStore,
    emptyEmbeddings,
    inMemoryVectorStoreRetrieverProvider,
    MemoryVectorStore
} from '@chatluna/core/src/vectorstore'
import chaiAsPromised from 'chai-as-promised'
import { MockEmbeddingsRequester } from './mock/mock_requester'
import { ChatLunaEmbeddings } from '../src/model'
import { makeRegExp } from 'koishi'

chai.use(chaiAsPromised)

should()

describe('Memory Vector Store', () => {
    it('form empty vector store', async () => {
        const emptyVectorStoreRetriever =
            await inMemoryVectorStoreRetrieverProvider.createVectorStoreRetriever(
                {
                    embeddings: emptyEmbeddings
                }
            )

        expect(
            emptyVectorStoreRetriever.addDocuments([
                {
                    pageContent: 'hiowfdsecsfedoijwp',
                    metadata: {}
                }
            ])
        ).to.eventually.length(0)

        expect(
            emptyVectorStoreRetriever.getRelevantDocuments('a')
        ).to.eventually.length(0)
    })

    it('from text', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester
        })

        const memoryVectorStore = await MemoryVectorStore.fromTexts(
            ['hello', 'world'],
            {},
            mockEmbedding
        )

        expect((await memoryVectorStore.similaritySearch('he'))[0]).to.property(
            'pageContent',
            'hello'
        )

        expect((await memoryVectorStore.similaritySearch('wo'))[0]).to.property(
            'pageContent',
            'world'
        )
    })

    it('from documents', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester
        })

        const memoryVectorStore = await MemoryVectorStore.fromDocuments(
            [
                {
                    pageContent: 'hello',
                    metadata: {}
                },
                {
                    pageContent: 'world',
                    metadata: {}
                }
            ],
            mockEmbedding
        )

        expect((await memoryVectorStore.similaritySearch('he'))[0]).to.property(
            'pageContent',
            'hello'
        )

        expect((await memoryVectorStore.similaritySearch('wo'))[0]).to.property(
            'pageContent',
            'world'
        )

        expect(
            await memoryVectorStore.similaritySearch('he', 1, (_) => false)
        ).to.have.length(0)
    })
})

describe('Saveable vector store', () => {
    it('save vector store', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester
        })
        const memoryVectorStoreRetriever =
            await inMemoryVectorStoreRetrieverProvider.createVectorStoreRetriever(
                {
                    embeddings: mockEmbedding
                }
            )

        const memoryVectorStore = memoryVectorStoreRetriever.vectorStore

        const saveableVectorStore = new ChatLunaSaveableVectorStore(
            memoryVectorStore,
            {
                async saveableFunction(store) {
                    expect(store._vectorstoreType()).to.equal('memory')
                },
                async deletableFunction(store) {
                    console.log(`deletable function ${store}`)
                }
            }
        )

        await saveableVectorStore.addDocuments([
            {
                pageContent: 'hello',
                metadata: {}
            }
        ])

        await saveableVectorStore.save()
    })

    it('delete vector store', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester
        })
        const memoryVectorStoreRetriever =
            await inMemoryVectorStoreRetrieverProvider.createVectorStoreRetriever(
                {
                    embeddings: mockEmbedding
                }
            )

        const memoryVectorStore = memoryVectorStoreRetriever.vectorStore

        const saveableVectorStore = new ChatLunaSaveableVectorStore(
            memoryVectorStore,
            {
                async saveableFunction(store) {
                    console.log(`saveable function ${store}`)
                },
                async deletableFunction(store) {
                    expect(store._vectorstoreType()).to.equal('memory')
                }
            }
        )

        await saveableVectorStore.addDocuments([
            {
                pageContent: 'hello',
                metadata: {}
            }
        ])

        await saveableVectorStore.delete()
    })

    it('search vector store', async () => {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()
        const mockEmbedding = new ChatLunaEmbeddings({
            client: mockEmbeddingRequester
        })
        const memoryVectorStoreRetriever =
            await inMemoryVectorStoreRetrieverProvider.createVectorStoreRetriever(
                {
                    embeddings: mockEmbedding
                }
            )

        const memoryVectorStore = memoryVectorStoreRetriever.vectorStore

        const saveableVectorStore = new ChatLunaSaveableVectorStore(
            memoryVectorStore,
            {
                async saveableFunction(store) {
                    console.log(`saveable function ${store}`)
                },
                async deletableFunction(store) {
                    console.log(`deletable function ${store}`)
                }
            }
        )

        await saveableVectorStore.addDocuments([
            {
                pageContent: 'hello',
                metadata: {}
            }
        ])

        expect(
            (await saveableVectorStore.similaritySearch('he'))[0]
        ).to.property('pageContent', 'hello')

        await saveableVectorStore.addVectors(
            [await mockEmbedding.embedQuery('world')],
            [
                {
                    pageContent: 'world',
                    metadata: {}
                }
            ]
        )

        expect(
            (await saveableVectorStore.similaritySearch('wo'))[0]
        ).to.property('pageContent', 'world')
    })
})

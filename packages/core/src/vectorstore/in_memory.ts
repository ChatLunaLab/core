import { VectorStore, VectorStoreRetriever } from '@langchain/core/vectorstores'
import { EmbeddingsParams } from '@langchain/core/embeddings'
import { MemoryVectorStore } from '@chatluna/core/src/vectorstore'

import { ScoreThresholdRetriever } from '@chatluna/core/src/retriever'
import { ChatHubBaseEmbeddings } from '@chatluna/core/src/model'
import { CreateVectorStoreParams } from '@chatluna/core/src/platform'

class InMemoryVectorStoreRetrieverProvider {
    async createVectorStoreRetriever(
        params: CreateVectorStoreParams
    ): Promise<VectorStoreRetriever<VectorStore>> {
        const embeddings = params.embeddings

        const store = await MemoryVectorStore.fromExistingIndex(embeddings)

        const retriever = ScoreThresholdRetriever.fromVectorStore(store, {
            minSimilarityScore: 0.85, // Finds results with at least this similarity score
            maxK: 100, // The maximum K value to use. Use it based to your chunk size to make sure you don't run out of tokens
            kIncrement: 2 // How much to increase K by each time. It'll fetch N results, then N + kIncrement, then N + kIncrement * 2, etc.
        })

        return retriever
    }
}

export class EmptyEmbeddings extends ChatHubBaseEmbeddings {
    constructor(params?: EmbeddingsParams) {
        super(params ?? {})
    }

    embedDocuments(documents: string[]): Promise<number[][]> {
        return Promise.resolve(documents.map(() => []))
    }

    embedQuery(_: string): Promise<number[]> {
        return Promise.resolve([])
    }
}

export const emptyEmbeddings = new EmptyEmbeddings()

export const inMemoryVectorStoreRetrieverProvider =
    new InMemoryVectorStoreRetrieverProvider()

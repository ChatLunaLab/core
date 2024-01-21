import { Logger } from '@cordisjs/logger'
import { Context } from 'cordis'
import {
    ChatLunaEmbeddings,
    EmbeddingsRequestParams,
    EmbeddingsRequester,
    ModelRequestParams,
    ModelRequester
} from '@chatluna/core/src/model'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { AIMessageChunk } from '@langchain/core/messages'
import { ChatLunaError, sleep } from '@chatluna/core/src/utils'

export class MockModelRequester extends ModelRequester {
    logger?: Logger

    throwError?: ChatLunaError

    timeout = 0

    returnNull = false

    constructor(
        ctx?: Context
        /*  private _config: ClientConfig */
    ) {
        super()
        this.logger = ctx?.logger('chatluna-mock-model-adapter')
    }

    async *completionStream(
        //[!code focus:3]
        params: ModelRequestParams
    ): AsyncGenerator<ChatGenerationChunk> {
        /* if (!this._config.apiKey.startsWith('chatluna_')) {
            throw new ChatLunaError(
                ChatLunaErrorCode.API_KEY_UNAVAILABLE,
                new Error('API Key is not valid')
            )
        } */

        if (this.throwError) {
            throw this.throwError
        }

        if (this.returnNull) {
            yield undefined
            return
        }

        if (this.timeout > 0) {
            await sleep(this.timeout)
        }

        const { input: messages } = params

        const input = messages[messages.length - 1].content as string

        const response = input
            .replaceAll('你', '我')
            .replaceAll('you', 'I')
            .replaceAll('Are', '')
            .replaceAll('Yes', 'No')
            .replaceAll('?', '!')
            .replaceAll('不', ' ')
            .replaceAll('吗', ' ')
            .replaceAll('有', '没有')
            .replaceAll('？', '！')

        this.logger?.debug(`[test] ${input} => ${response}`)

        yield new ChatGenerationChunk({
            text: response,
            message: new AIMessageChunk(response)
        })
    }

    async init(): Promise<void> {}
    async dispose(): Promise<void> {}
}

export class MockEmbeddingsRequester implements EmbeddingsRequester {
    constructor() {}

    timeout = 0

    returnNull = false

    mode = 'default'

    throwError?: Error

    async embeddings(
        params: EmbeddingsRequestParams
    ): Promise<number[] | number[][]> {
        const input = params.input

        if (typeof input === 'string') {
            const result = this.embedDocuments([input])

            if (this.mode != 'default') {
                return await result
            }

            return (await result)[0]
        } else {
            return this.embedDocuments(input)
        }
    }

    private async embedDocuments(documents: string[]): Promise<number[][]> {
        if (this.timeout > 0) {
            await sleep(this.timeout)
        }

        if (this.returnNull) {
            return null
        }

        if (this.throwError) {
            throw this.throwError
        }

        return documents.map((text) => {
            // as uni8 code
            return text.split('').map((char) => char.charCodeAt(0))
        })
    }
}

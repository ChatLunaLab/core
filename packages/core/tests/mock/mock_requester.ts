import { Logger } from '@cordisjs/logger'
import { Context } from 'cordis'
import {
    EmbeddingsRequestParams,
    EmbeddingsRequester,
    ModelRequestParams,
    ModelRequester
} from '@chatluna/core/src/model'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { AIMessageChunk } from '@langchain/core/messages'

let logger: Logger

export class MockModelRequester extends ModelRequester {
    constructor(
        private ctx: Context
        /*  private _config: ClientConfig */
    ) {
        super()
        logger = ctx.logger('chatluna-mock-model-adapter')
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

        logger.debug(`[test] ${input} => ${response}`)

        yield new ChatGenerationChunk({
            text: response,
            message: new AIMessageChunk(response)
        })
    }

    async init(): Promise<void> {}
    async dispose(): Promise<void> {}
}

export class MockEmbeddingsRequester implements EmbeddingsRequester {
    private _logger: Logger

    constructor(
        private ctx: Context
        /*  private _config: ClientConfig */
    ) {
        this._logger = ctx.logger('[test]chatluna-test-adapter')
    }

    async embeddings(
        params: EmbeddingsRequestParams
    ): Promise<number[] | number[][]> {
        const input = params.input

        if (typeof input === 'string') {
            return this.embedDocuments([input])[0]
        } else {
            return this.embedDocuments(input)
        }
    }

    private embedDocuments(documents: string[]): number[][] {
        return documents.map((text) => {
            // as uni8 code
            return text.split('').map((char) => char.charCodeAt(0))
        })
    }
}

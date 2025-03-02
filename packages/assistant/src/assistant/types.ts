import { ChainValues } from '@langchain/core/utils/types'
import { Assistant } from '@chatluna/assistant'
import { BaseMessageChunk, UserMessage } from 'cortexluna'

declare module 'cordis' {
    interface Events {
        'chatluna/before-assistant-chat': (
            message: UserMessage,
            promptVariables: ChainValues,
            assistant: Assistant
        ) => Promise<void>
        'chatluna/after-assistant-chat': (
            sourceMessage: UserMessage,
            responseMessage: BaseMessageChunk,
            promptVariables: ChainValues,
            assistant: Assistant
        ) => Promise<void>
    }
}

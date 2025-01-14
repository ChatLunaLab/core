import { BaseMessageChunk, HumanMessage } from '@langchain/core/messages'
import { ChainValues } from '@langchain/core/utils/types'
import { Assistant } from '@chatluna/assistant'

declare module 'cordis' {
    interface Events {
        'chatluna/before-assistant-chat': (
            message: HumanMessage,
            promptVariables: ChainValues,
            assistant: Assistant
        ) => Promise<void>
        'chatluna/after-assistant-chat': (
            sourceMessage: HumanMessage,
            responseMessage: BaseMessageChunk,
            promptVariables: ChainValues,
            assistant: Assistant
        ) => Promise<void>
    }
}

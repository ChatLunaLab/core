import { StructuredTool } from '@langchain/core/tools'

import { BaseChatMemory } from '@chatluna/core/memory'
import { ChatLunaChatModel } from '@chatluna/core/model'

export interface Environment {
    sharedResources: Map<string, unknown>

    chatMemory: BaseChatMemory

    setSharedResource(key: string, value: unknown): void
    getSharedResource(key: string): unknown

    addTool(tool: StructuredTool): void
    removeTool(toolId: string): void
    getTool(toolId: string): StructuredTool | undefined

    useModel(): Promise<ChatLunaChatModel>
}

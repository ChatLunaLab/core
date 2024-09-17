import { StructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'

import { BaseChatMemory } from '@chatluna/agent/langchain'

export interface Environment {
    sharedResources: Map<string, unknown>

    chatMemory: BaseChatMemory

    setSharedResource(key: string, value: unknown): void
    getSharedResource(key: string): unknown

    addTool(tool: StructuredTool): void
    removeTool(toolId: string): void
    getTool(toolId: string): StructuredTool | undefined

    useModel(): Promise<BaseChatModel>
}

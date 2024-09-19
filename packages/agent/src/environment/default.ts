import { ChatLunaChatModel } from '@chatluna/core/model'
import { StructuredTool } from '@langchain/core/tools'
import { Environment } from './types.ts'
import { BaseChatMemory } from '@chatluna/core/memory'

export class DefaultEnvironment implements Environment {
    constructor(
        public chatMemory: BaseChatMemory,
        private model:
            | ChatLunaChatModel
            | (() => PromiseLike<ChatLunaChatModel> | ChatLunaChatModel)
    ) {}

    sharedResources: Map<string, unknown> = new Map()

    private tools: StructuredTool[] = []

    setSharedResource(key: string, value: unknown): void {
        this.sharedResources.set(key, value)
    }

    getSharedResource(key: string): unknown {
        return this.sharedResources.get(key)
    }

    addTool(tool: StructuredTool): void {
        this.tools.push(tool)
    }

    removeTool(toolId: string): void {
        const indexOfTool = this.tools.findIndex((tool) => tool.name === toolId)
        this.tools.splice(indexOfTool, 1)
    }

    getTool(toolId: string): StructuredTool | undefined {
        return this.tools.find((tool) => tool.name === toolId)
    }

    async useModel() {
        const model = this.model
        if (typeof model === 'function') {
            return await model()
        }

        return model
    }
}

import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { StructuredTool } from '@langchain/core/tools'
import { BaseChatMemory } from '../langchain/index.ts'
import { Environment } from './types.ts'

export class DefaultEnvironment implements Environment {
    constructor(
        public chatMemory: BaseChatMemory,
        private model:
            | BaseChatModel
            | (() => PromiseLike<BaseChatModel> | BaseChatModel)
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
        throw new Error('Method not implemented.')
    }

    async useModel() {
        const model = this.model
        if (typeof model === 'function') {
            return await model()
        }

        return model
    }
}

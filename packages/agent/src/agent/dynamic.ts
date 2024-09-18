import {
    AIMessageChunk,
    BaseMessage,
    BaseMessageChunk
} from '@langchain/core/messages'
import { BaseAgent } from './index.ts'
import { AgentFinish, AgentState, AgentStep } from './types.ts'
import { Environment } from '@chatluna/agent/environment'
import { ChatPromptTemplate } from '@langchain/core/prompts'

export class DynamicAgent extends BaseAgent {
    private tempMessages: BaseMessage[] = []

    constructor(
        public name: string,
        public description: string,
        public environment: Environment,
        public prompt: ChatPromptTemplate,
        public useTools?: string[]
    ) {
        super(name, description, environment, useTools)
    }

    async invoke(message: BaseMessage): Promise<AgentFinish | AgentStep> {
        const keys = this.prompt.inputVariables

        const systemPrompt = await this.prompt.formatMessages(
            this._getVariables(this.state, keys)
        )

        const historyMessage =
            await this.environment.chatMemory.chatHistory.getMessages()

        const finalMessages = [
            ...systemPrompt,
            ...historyMessage,
            ...this.tempMessages,
            message
        ]

        const tools = this.useTools
            ?.map((tool) => this.environment.getTool(tool))
            .filter((tool) => tool !== undefined)

        const model = await this.environment.useModel()

        let finalChunk: BaseMessageChunk

        for await (const chunk of await model.stream(finalMessages, {
            tools
        })) {
            finalChunk = finalChunk ? finalChunk.concat(chunk) : chunk
        }

        if (finalChunk instanceof AIMessageChunk) {
            const actions = finalChunk.tool_call_chunks ?? []

            if (actions.length !== 0) {
                return {
                    state: this.state,
                    actions: finalChunk.tool_call_chunks
                } satisfies AgentStep
            }

            this.tempMessages.push(finalChunk)
        }

        this.tempMessages.length = 0
        return {
            state: this.state,
            message: finalChunk
        } satisfies AgentFinish
    }

    private _getVariables(
        state: AgentState,
        keys: string[]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): import('@langchain/core/prompts').TypedPromptInputValues<any> {
        const result = {}

        for (const key of keys) {
            const value = state[key] ?? this.environment.getSharedResource(key)

            result[key] = value
        }

        return result
    }
}

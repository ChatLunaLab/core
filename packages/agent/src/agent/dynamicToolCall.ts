import {
    AIMessageChunk,
    BaseMessage,
    BaseMessageChunk,
    ToolMessage
} from '@langchain/core/messages'
import { BaseAgent } from './index.ts'
import { AgentFinish, AgentState, AgentStep } from './types.ts'
import { Environment } from '@chatluna/agent/environment'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StructuredTool } from '@langchain/core/tools'

export class DynamicToolCallAgent extends BaseAgent {
    private tempMessages: BaseMessage[] = []

    public maxIterations = 10

    constructor(
        public name: string,
        public description: string,
        public environment: Environment,
        public prompt: ChatPromptTemplate,
        public useTools?: string[]
    ) {
        super(name, description, environment, useTools)
    }

    async invoke(
        message: BaseMessage | BaseMessage[]
    ): Promise<AgentFinish | AgentStep> {
        const keys = this.prompt.inputVariables

        const historyMessage =
            await this.environment.chatMemory.chatHistory.getMessages()

        const finalMessages = [
            ...historyMessage,
            ...this.tempMessages,
            ...(Array.isArray(message) ? message : [message])
        ]

        const systemPrompt = await this.prompt.formatMessages(
            this._getVariables(
                {
                    ...this.state,
                    history: finalMessages
                },
                keys
            )
        )

        // insert system prompt to the first of finalMessages
        for (const message of systemPrompt) {
            finalMessages.unshift(message)
        }

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
                this.tempMessages.push(
                    ...(Array.isArray(message) ? message : [message])
                )
                this.tempMessages.push(finalChunk)
                finalChunk = await this._invokeWithToolCall(
                    finalMessages,
                    actions
                )
            }
        }

        this.tempMessages.length = 0

        return {
            state: this.state,
            message: finalChunk
        } satisfies AgentFinish
    }

    private async _invokeWithToolCall(
        finalMessages: BaseMessage[],
        actions: AIMessageChunk['tool_call_chunks']
    ) {
        const tools = this.useTools
            ?.map((tool) => this.environment.getTool(tool))
            .filter((tool) => tool !== undefined)

        const model = await this.environment.useModel()

        let finalChunk: BaseMessageChunk

        let currentIteration = 0

        let toolActions: AIMessageChunk['tool_call_chunks'] = actions

        while (currentIteration < this.maxIterations) {
            const toolMessages = await this._invokeCallTool(tools, toolActions)

            this.tempMessages.push(...toolMessages)

            console.log(
                `iteration: ${currentIteration}, tools: ${JSON.stringify(
                    toolMessages
                )}`
            )

            for await (const chunk of await model.stream(
                [...finalMessages, ...this.tempMessages],
                {
                    tools
                }
            )) {
                finalChunk = finalChunk ? finalChunk.concat(chunk) : chunk
            }

            currentIteration++

            if (finalChunk instanceof AIMessageChunk) {
                const actions = finalChunk.tool_call_chunks ?? []

                if (actions.length !== 0) {
                    toolActions = actions
                    this.tempMessages.push(finalChunk)
                } else {
                    return finalChunk
                }
            }
        }

        if (actions.length !== 0) {
            throw new Error('Max iterations reached')
        }

        return finalChunk
    }

    private async _invokeCallTool(
        tools: StructuredTool[],
        actions: AIMessageChunk['tool_call_chunks']
    ) {
        return Promise.all(
            actions.map(async (action) => {
                const tool = tools.find((t) => t.name === action.name)

                let invokeTool = await tool?.invoke(action.args)

                if (invokeTool == null) {
                    console.warn(`Tool ${action.name} not found`)
                    invokeTool = `The tool ${action.name} is not found`
                }

                return new ToolMessage({
                    tool_call_id: action.id,
                    name: action.name,
                    content: invokeTool
                })
            })
        )
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

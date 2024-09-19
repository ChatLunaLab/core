import { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { Environment } from '../environment/types.js'

export interface Agent {
    name: string
    description: string
    environment: Environment
    state: AgentState

    useTools?: string[]

    invoke(
        message: BaseMessage | BaseMessage[]
    ): Promise<AgentFinish | AgentStep>

    updateState(state: AgentState): void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AgentState extends Record<string, any> {
    plan: string
    goal: string
}

export type AgentFinish = {
    state: AgentState
    message: BaseMessage
}
export type AgentStep = {
    actions: AIMessageChunk['tool_call_chunks']
    state: AgentState
}

export function isAgentFinish(
    action: AgentFinish | AgentStep
): action is AgentFinish {
    return 'message' in action
}

export function isAgentStep(
    action: AgentFinish | AgentStep
): action is AgentStep {
    return 'actions' in action
}

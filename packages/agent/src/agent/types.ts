import { BaseMessage } from '@langchain/core/messages'
import { Environment } from '../environment/types.js'
import { AgentAction } from '@langchain/core/agents'

export interface Agent {
    name: string
    description: string
    environment: Environment
    state: AgentState

    useTools?: string[]

    invoke(message: BaseMessage): AgentFinish | AgentStep

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
    action: AgentAction
    observation: string
}

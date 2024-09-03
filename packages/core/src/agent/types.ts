import { Context } from 'cordis'

export interface AgentNode {
    id: string
    type: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    with: Record<string, AgentInput>
    next: string
}

export interface Agent {
    nodes: AgentNode[]
    start: AgentNode
}

export interface AgentInput {
    paramId: string
    paramType: string
    paramValue: string
}

export type AgentOutput = AgentInput

export interface RawAgent {
    name: string
    keywords: string[]
    prompts: {
        role: 'user' | 'system' | 'assistant'
        content: string
    }[]
    nodes: RawAgentNode[]
}

export interface RawAgentNode {
    id: string
    type: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    with: Record<string, any>
    next: string
}

export interface AgentTypeRunner {
    type: string
    run: (
        ctx: Context,
        node: AgentNode,

        // $session -> koishi.session ?
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input: Record<string, any>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Record<string, any>
    input: AgentInput[]
    output: AgentOutput[]
}

import { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { StructuredTool } from '@langchain/core/tools'
import { BaseChatMemory } from '@chatluna/core/memory'
import { ChatLunaChatModel } from '@chatluna/core/model'

export interface RawAgent {
    name: string
    keywords: string[]
    prompts: {
        role: 'user' | 'system' | 'assistant'
        content: string
    }[]
    nodes?: RawAgentNode[]
}

export interface RawAgentNode {
    id: string
    type: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: Record<string, any>
    connections?: {
        to: string
        from?: string
        toPort?: string
        fromPort?: string
    }[]
}

export interface NodeConnection {
    from: { nodeId: string; portId: string }
    to: { nodeId: string; portId: string }
}

export interface AgentDataNode {
    id: string
    type: string
    inputs: Map<string, string>
    outputs: Map<string, string>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any
}

export interface NodePortGetter {
    getNodePorts(nodeType: string): {
        inputs: string[]
        outputs: string[]
    }
}

export interface ExecutionContext {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGlobal: (key: string, value: any) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getGlobal: (key: string) => any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentTypeProcessor<R = any> = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputs: Record<string, any>,
    context: ExecutionContext,
    data?: R
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<Record<string, any>>

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint, @typescript-eslint/no-explicit-any
export interface AgentTypeRunner<R = any> {
    ports: {
        inputs: string[]
        outputs: string[]
    }
    processor: AgentTypeProcessor<R>
    type: string
}

export interface Agent {
    name: string
    description: string
    environment: Environment
    state: AgentState

    useTools?: string[]

    invoke(
        message: BaseMessage | BaseMessage[],
        args?: Record<string, unknown>
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
export interface Environment {
    sharedResources: Map<string, unknown>

    chatMemory: BaseChatMemory

    setSharedResource(key: string, value: unknown): void
    getSharedResource(key: string): unknown

    addTool(tool: StructuredTool): void
    removeTool(toolId: string): void
    getTool(toolId: string): StructuredTool | undefined

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useModel(arg: any): Promise<ChatLunaChatModel>
}

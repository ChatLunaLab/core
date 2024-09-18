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

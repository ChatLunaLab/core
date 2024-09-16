import {
    AgentDataNode,
    NodeConnection,
    NodePortGetter
} from '@chatluna/core/agent'

export class NodeGraph {
    nodes: Map<string, AgentDataNode> = new Map()
    connections: NodeConnection[] = []

    addNode(
        type: string,
        ports: { inputs: string[]; outputs: string[] },
        id: string = crypto.randomUUID()
    ): string {
        const { inputs, outputs } = ports
        const node: AgentDataNode = {
            id,
            type,
            inputs: new Map(inputs.map((name) => [name, crypto.randomUUID()])),
            outputs: new Map(outputs.map((name) => [name, crypto.randomUUID()]))
        }
        this.nodes.set(id, node)
        return id
    }

    connect(
        from: { nodeId: string; portName: string },
        to: { nodeId: string; portName: string },
        condition?: string
    ) {
        const fromNode = this.nodes.get(from.nodeId)
        const toNode = this.nodes.get(to.nodeId)
        if (!fromNode || !toNode)
            throw new Error(`Node not found: ${from.nodeId} or ${to.nodeId}`)

        const fromPortId = fromNode.outputs.get(from.portName)
        const toPortId = toNode.inputs.get(to.portName)
        if (!fromPortId || !toPortId) {
            console.warn(
                `Port not found: ${from.portName} or ${to.portName} for nodes ${from.nodeId} and ${to.nodeId}`
            )
            return // 跳过这个连接，而不是抛出错误
        }

        this.connections.push({
            from: { nodeId: from.nodeId, portId: fromPortId },
            to: { nodeId: to.nodeId, portId: toPortId }
        })

        if (condition && fromNode.type === 'condition') {
            if (!fromNode.data) {
                fromNode.data = {}
            }
            if (!fromNode.data.branches) {
                fromNode.data.branches = []
            }
            fromNode.data.branches.push({
                condition,
                targetNodeId: to.nodeId
            })
        }
    }

    compile(): CompiledNodeGraph {
        return new CompiledNodeGraph(this.nodes, this.connections)
    }

    toJSON(): object {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nodeConnections = new Map<string, any[]>()

        // 预处理连接信息
        this.connections.forEach((conn) => {
            if (!nodeConnections.has(conn.from.nodeId)) {
                nodeConnections.set(conn.from.nodeId, [])
            }
            nodeConnections.get(conn.from.nodeId)!.push({
                to: conn.to.nodeId,
                fromPort: this.getPortName(conn.from),
                toPort: this.getPortName(conn.to)
            })
        })

        return {
            nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
                id,
                type: node.type,
                data: node.data,
                connections: nodeConnections.get(id) || []
            }))
        }
    }

    private getPortName(port: {
        nodeId: string
        portId: string
    }): string | undefined {
        const node = this.nodes.get(port.nodeId)
        if (!node) return undefined
        for (const [name, id] of [...node.inputs, ...node.outputs]) {
            if (id === port.portId) return name
        }
        return undefined
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromJSON(json: any, getter: NodePortGetter): NodeGraph {
        if (!json || !json.nodes || !Array.isArray(json.nodes)) {
            throw new Error(
                'Invalid JSON: nodes array is missing or not an array'
            )
        }

        const graph = new NodeGraph()
        const nodeMap = new Map<string, string>()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        json.nodes.forEach((nodeData: any) => {
            if (!nodeData.type) {
                throw new Error('Invalid node data: type is missing')
            }
            const nodeId = graph.addNode(
                nodeData.type,
                getter.getNodePorts(nodeData.type),
                nodeData.id
            )
            nodeMap.set(nodeData.id, nodeId)
            const node = graph.nodes.get(nodeId)!
            node.data = nodeData.data
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        json.nodes.forEach((nodeData: any) => {
            if (nodeData.connections) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                nodeData.connections.forEach((conn: any) => {
                    const fromNodeId = nodeMap.get(nodeData.id)
                    const toNodeId = nodeMap.get(conn.to)
                    if (fromNodeId && toNodeId) {
                        graph.connect(
                            {
                                nodeId: fromNodeId,
                                portName: conn.fromPort || 'output'
                            },
                            {
                                nodeId: toNodeId,
                                portName: conn.toPort || 'input'
                            },
                            conn.condition
                        )
                    } else {
                        console.warn(
                            `Unable to create connection: ${nodeData.id} -> ${conn.to}`
                        )
                    }
                })
            }
        })

        return graph
    }
}

export class CompiledNodeGraph {
    private adjacencyList: Map<string, Set<string>> = new Map()
    private nodeData: Map<string, AgentDataNode> = new Map()
    private inputConnections: Map<
        string,
        Map<string, { nodeId: string; portId: string }>
    > = new Map()

    constructor(
        nodes: Map<string, AgentDataNode>,
        connections: NodeConnection[]
    ) {
        this.nodeData = new Map(nodes)
        for (const node of nodes.keys()) {
            this.adjacencyList.set(node, new Set())
        }
        for (const conn of connections) {
            this.adjacencyList.get(conn.from.nodeId)!.add(conn.to.nodeId)
            if (!this.inputConnections.has(conn.to.nodeId)) {
                this.inputConnections.set(conn.to.nodeId, new Map())
            }
            this.inputConnections
                .get(conn.to.nodeId)!
                .set(conn.to.portId, conn.from)
        }
    }

    getNode(string: string): AgentDataNode | undefined {
        return this.nodeData.get(string)
    }

    getNodeInputs(
        nodeId: string
    ): Map<string, { nodeId: string; portId: string }> | undefined {
        return this.inputConnections.get(nodeId)
    }

    getNextNodes(string: string): Set<string> {
        return this.adjacencyList.get(string) || new Set()
    }

    getAllNodeIds(): string[] {
        return Array.from(this.nodeData.keys())
    }

    getEntryNodes(): string[] {
        return this.getAllNodeIds().filter(
            (string) =>
                !this.inputConnections.has(string) ||
                this.inputConnections.get(string)!.size === 0
        )
    }
}

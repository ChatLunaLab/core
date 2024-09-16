/* eslint-disable no-new-func */

import {
    AgentDataNode,
    CompiledNodeGraph,
    ExecutionContext
} from '@chatluna/core/agent'

export class AgentGraphRunner {
    private nodeProcessors: Map<
        string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (inputs: any[], context: ExecutionContext, data?: any) => Promise<any[]>
    > = new Map()

    private nodePorts: Map<string, { inputs: string[]; outputs: string[] }> =
        new Map()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private globalContext: Map<string, any> = new Map()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private nodeResults: Map<string, any[]> = new Map()

    constructor() {
        this.registerBuiltInNodes()
    }

    private registerBuiltInNodes() {
        this.registerNodeType('expression', this.expressionProcessor, {
            inputs: ['input'],
            outputs: ['output']
        })
        this.registerNodeType('condition', this.conditionProcessor, {
            inputs: ['input'],
            outputs: ['output']
        })
        this.registerNodeType('constant', this.constantProcessor, {
            inputs: [],
            outputs: ['output']
        })
    }

    private async expressionProcessor(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: any[],
        context: ExecutionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any[]> {
        const expression = data?.expression ?? '0'
        const safeEval = new Function(
            'inputs',
            'context',
            `
        if (!Array.isArray(inputs) || inputs.length === 0 || inputs[0] === undefined) {
          return [];
        }
        return ${expression};
      `
        )
        try {
            const contextObj = Object.fromEntries(
                Object.entries(context).filter(
                    ([key]) =>
                        key !== 'setGlobalContext' && key !== 'getGlobalContext'
                )
            )
            const result = safeEval(inputs, contextObj)
            console.log(
                `Expression node: ${expression} = ${JSON.stringify(result)}`
            )
            return [result]
        } catch (error) {
            console.error(`Error evaluating expression: ${expression}`, error)
            return []
        }
    }

    private async conditionProcessor(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: any[],
        context: ExecutionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any[]> {
        const expression = data?.expression ?? 'true'
        const safeEval = new Function(
            'inputs',
            'context',
            `
        if (!Array.isArray(inputs) || inputs.length === 0 || inputs[0] === undefined) {
          return false;
        }
        const result = ${expression};
        return result;
      `
        )
        try {
            const contextObj = Object.fromEntries(
                Object.entries(context).filter(
                    ([key]) =>
                        key !== 'setGlobalContext' && key !== 'getGlobalContext'
                )
            )
            const result = safeEval(inputs, contextObj)
            console.log(`Condition node: ${expression} = ${result}`)
            return [result]
        } catch (error) {
            console.error(`Error evaluating condition: ${expression}`, error)
            return [false]
        }
    }

    private async constantProcessor(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: any[],
        context: ExecutionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any[]> {
        const value = data?.value
        console.log(`Constant node: ${JSON.stringify(value)}`)
        return [value]
    }

    registerNodeType(
        type: string,
        processor: (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputs: any[],
            context: ExecutionContext,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?: any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) => Promise<any[]>,
        ports: { inputs: string[]; outputs: string[] }
    ) {
        this.nodeProcessors.set(type, processor)
        this.nodePorts.set(type, ports)
    }

    getNodePorts(type: string): { inputs: string[]; outputs: string[] } {
        const ports = this.nodePorts.get(type)
        if (!ports) {
            throw new Error(`No ports registered for node type: ${type}`)
        }
        return ports
    }

    async execute(
        compiledGraph: CompiledNodeGraph
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Map<string, any[]>> {
        this.nodeResults.clear() // 清除之前的结果
        const context = this.createExecutionContext()
        const inDegree = this.initializeInDegree(compiledGraph)
        let currentLevel = compiledGraph.getEntryNodes()

        while (currentLevel.length > 0) {
            const nextLevel: string[] = []

            for (const nodeId of currentLevel) {
                const node = compiledGraph.getNode(nodeId)
                if (!node) continue

                const inputs = await this.getNodeInputs(node, compiledGraph)
                const outputValues = await this.runNode(node, inputs, context)
                this.nodeResults.set(nodeId, outputValues) // 存储节点结果

                if (node.type === 'condition' && node.data?.branches) {
                    const branchNodeIds = this.handleConditionNode(
                        node,
                        outputValues,
                        compiledGraph
                    )
                    nextLevel.push(...branchNodeIds)
                } else {
                    const readyNodes = this.handleRegularNode(
                        nodeId,
                        compiledGraph,
                        inDegree
                    )
                    nextLevel.push(...readyNodes)
                }
            }
            currentLevel = nextLevel
        }

        return this.nodeResults
    }

    private createExecutionContext(): ExecutionContext {
        return new Proxy(
            {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setGlobal: (key: string, value: any) =>
                    this.globalContext.set(key, value),
                getGlobal: (key: string) => this.globalContext.get(key)
            },
            {
                get: (target, prop) => {
                    if (prop in target) {
                        return target[prop as keyof typeof target]
                    }
                    return this.globalContext.get(prop as string)
                },
                set: (target, prop, value) => {
                    this.globalContext.set(prop as string, value)
                    return true
                },
                ownKeys: () => [...this.globalContext.keys()],
                getOwnPropertyDescriptor: (target, prop) => {
                    return {
                        enumerable: true,
                        configurable: true,
                        value: this.globalContext.get(prop as string)
                    }
                }
            }
        )
    }

    private initializeInDegree(
        compiledGraph: CompiledNodeGraph
    ): Map<string, number> {
        const inDegree = new Map<string, number>()
        for (const nodeId of compiledGraph.getAllNodeIds()) {
            inDegree.set(nodeId, compiledGraph.getNodeInputs(nodeId)?.size || 0)
        }
        return inDegree
    }

    private handleConditionNode(
        node: AgentDataNode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        outputValues: any[],
        compiledGraph: CompiledNodeGraph
    ): string[] {
        const conditionResult = outputValues[0]
        for (const branch of node.data.branches) {
            let branchCondition = branch.condition
            if (!branchCondition.includes('result')) {
                branchCondition = `${branchCondition} === true`
            }
            if (
                // eslint-disable-next-line no-eval
                eval(
                    branchCondition.replace(
                        /\bresult\b/g,
                        conditionResult.toString()
                    )
                )
            ) {
                const targetNode = compiledGraph.getNode(branch.targetNodeId)
                if (targetNode) {
                    console.log(
                        `Condition triggered: ${branch.condition}, executing node: ${targetNode.type}`
                    )
                    return [branch.targetNodeId]
                }
            }
        }
        return []
    }

    private handleRegularNode(
        nodeId: string,
        compiledGraph: CompiledNodeGraph,
        inDegree: Map<string, number>
    ): string[] {
        const nextNodes = compiledGraph.getNextNodes(nodeId)
        const readyNodes: string[] = []
        for (const nextNodeId of nextNodes) {
            const nextInDegree = inDegree.get(nextNodeId)! - 1
            inDegree.set(nextNodeId, nextInDegree)
            if (nextInDegree === 0) {
                readyNodes.push(nextNodeId)
            }
        }
        return readyNodes
    }

    private async getNodeInputs(
        node: AgentDataNode,
        compiledGraph: CompiledNodeGraph
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any[]> {
        const nodeInputs = compiledGraph.getNodeInputs(node.id)
        if (!nodeInputs || nodeInputs.size === 0) {
            return []
        }
        return Promise.all(
            Array.from(node.inputs.entries()).map(
                async ([portName, portId]) => {
                    const inputConn = nodeInputs.get(portId)
                    return inputConn
                        ? this.nodeResults.get(inputConn.nodeId)![0]
                        : undefined
                }
            )
        )
    }

    private async runNode(
        node: AgentDataNode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: any[],
        context: ExecutionContext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any[]> {
        const processor = this.nodeProcessors.get(node.type)
        if (!processor) {
            throw new Error(
                `No processor registered for node type: ${node.type}`
            )
        }

        return processor(inputs, context, node.data)
    }
}

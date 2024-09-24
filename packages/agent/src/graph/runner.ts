/* eslint-disable no-new-func */

import {
    AgentDataNode,
    AgentTypeProcessor,
    CompiledNodeGraph,
    ExecutionContext
} from '@chatluna/agent/graph'

export class AgentGraphRunner {
    private nodeProcessors: Map<string, AgentTypeProcessor> = new Map()

    private nodePorts: Map<string, { inputs: string[]; outputs: string[] }> =
        new Map()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private globalContext: Map<string, any> = new Map()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private nodeResults: Map<string, Record<string, any>> = new Map()

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
        inputs: Record<string, any>,
        context: ExecutionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Record<string, any>> {
        const expression = data?.expression ?? '0'
        const safeEval = new Function(
            'inputs',
            'context',
            `
        if (!inputs || Object.keys(inputs).length === 0 || inputs.input === undefined) {
          return { output: null };
        }
        return { output: ${expression} };
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
            return result
        } catch (error) {
            console.error(`Error evaluating expression: ${expression}`, error)
            return { output: null }
        }
    }

    private async conditionProcessor(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: Record<string, any>,
        context: ExecutionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Record<string, any>> {
        const expression = data?.expression ?? 'true'
        const safeEval = new Function(
            'inputs',
            'context',
            `
        if (!inputs || Object.keys(inputs).length === 0 || inputs.input === undefined) {
          return { output: false };
        }
        const result = ${expression};
        return { output: result };
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
            console.log(`Condition node: ${expression} = ${result.output}`)
            return result
        } catch (error) {
            console.error(`Error evaluating condition: ${expression}`, error)
            return { output: false }
        }
    }

    private async constantProcessor(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: Record<string, any>,
        context: ExecutionContext,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Record<string, any>> {
        const value = data?.value
        console.log(`Constant node: ${JSON.stringify(value)}`)
        return { output: value }
    }

    registerNodeType(
        type: string,
        processor: (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputs: Record<string, any>,
            context: ExecutionContext,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?: any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) => Promise<Record<string, any>>,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setGlobal(key: string, value: any) {
        this.globalContext.set(key, value)
    }

    getGlobal(key: string) {
        return this.globalContext.get(key)
    }

    async execute(
        compiledGraph: CompiledNodeGraph,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: Record<string, any> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Map<string, Record<string, any>>> {
        console.log(`[DEBUG] Starting graph execution`)
        console.log(`[DEBUG] Initial inputs:`, inputs)

        this.nodeResults.clear()

        const context = this.createExecutionContext()
        const inDegree = this.initializeInDegree(compiledGraph)
        let currentLevel = compiledGraph.getEntryNodes()
        let currentNodeNameInput: Record<string, string[]> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentNodeInput: Record<string, any> = inputs

        let round = 1
        while (currentLevel.length > 0) {
            console.log(`\n[DEBUG] ---- Execution Round ${round} ----`)
            console.log(`[DEBUG] Processing level with nodes:`, currentLevel)

            const nextLevel: string[] = []
            const nextNodeInput: Record<string, string[]> = {}

            for (const nodeId of currentLevel) {
                const node = compiledGraph.getNode(nodeId)
                if (!node) continue

                let inputs = await this.getNodeInputs(
                    node,
                    currentNodeNameInput[nodeId] || [],
                    compiledGraph
                )

                if (Object.keys(inputs).length === 0 && currentNodeInput) {
                    inputs = currentNodeInput
                }

                currentNodeInput = inputs

                const outputValues = await this.runNode(node, inputs, context)
                this.nodeResults.set(nodeId, outputValues) // 存储节点结果

                if (node.type === 'condition' && node.data?.branches) {
                    const branchNodeIds = this.handleConditionNode(
                        node,
                        outputValues,
                        compiledGraph
                    )
                    for (const branchNodeId of branchNodeIds) {
                        nextNodeInput[branchNodeId] = [
                            ...(nextNodeInput[branchNodeId] || []),
                            nodeId
                        ]
                    }
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
            currentNodeNameInput = nextNodeInput

            // Add this new log statement
            console.log(`[DEBUG] Next level nodes to be executed:`, nextLevel)
            round++
        }

        console.log(`[DEBUG] Graph execution completed`)
        console.log(
            `[DEBUG] Final node results:`,
            Object.fromEntries(this.nodeResults)
        )

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
        outputValues: Record<string, any>,
        compiledGraph: CompiledNodeGraph
    ): string[] {
        const conditionResult = outputValues.output
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
        nodeInput: string[],
        compiledGraph: CompiledNodeGraph
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Record<string, any>> {
        const nodeInputs = compiledGraph.getNodeInputs(node.id)
        if (!nodeInputs || nodeInputs.size === 0) {
            return {}
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inputs: Record<string, any> = {}
        for (const [portName, portId] of node.inputs.entries()) {
            const inputConn = nodeInputs.get(portId)

            console.log(
                `[DEBUG] Input connection for port ${portName} - ${portId}:`,
                inputConn,
                this.nodeResults.get(inputConn?.nodeId)
            )
            inputs[portName] = inputConn
                ? this.nodeResults.get(inputConn.nodeId)![inputConn.portId]
                : undefined
        }

        const ports = this.getNodePorts(node.type)
        for (const portName of ports.inputs) {
            console.log(
                `[DEBUG] Input for port ${portName}:`,
                inputs[portName],
                this.nodeResults.get(portName)
            )
            if (!inputs[portName]) {
                inputs[portName] = nodeInput.find((id) => id === portName)
                    ? this.nodeResults.get(portName)![portName]
                    : undefined
            }
        }
        return inputs
    }

    private async runNode(
        node: AgentDataNode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs: Record<string, any>,
        context: ExecutionContext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<Record<string, any>> {
        const processor = this.nodeProcessors.get(node.type)
        if (!processor) {
            throw new Error(
                `No processor registered for node type: ${node.type}`
            )
        }

        console.log(
            `[DEBUG] Starting execution of node: ${node.id} (Type: ${node.type})`
        )
        console.log(`[DEBUG] Node inputs:`, inputs)

        const startTime = Date.now()
        const result = await processor(inputs, context, node.data)
        const executionTime = Date.now() - startTime

        console.log(
            `[DEBUG] Node ${node.id} execution completed in ${executionTime}ms`
        )
        console.log(`[DEBUG] Node outputs:`, result)

        return result
    }
}

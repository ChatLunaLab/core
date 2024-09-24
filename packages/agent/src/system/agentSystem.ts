import { Environment } from '@chatluna/agent/environment'
import {
    AgentGraphRunner,
    AgentTypeProcessor,
    ExecutionContext,
    NodeGraph
} from '@chatluna/agent/graph'
import { Context } from 'cordis'
import { Agent, AgentFinish } from '@chatluna/agent'
import { BaseMessage } from '@langchain/core/messages'

export class AgentSystem {
    private _graph: NodeGraph

    private _runner: AgentGraphRunner

    private agents: Agent[] = []

    constructor(
        private ctx: Context,
        private environment: Environment
    ) {
        this._graph = new NodeGraph()
        this._runner = new AgentGraphRunner()
    }

    async addAgent(agent: Agent) {
        this.agents.push(agent)
    }

    async removeAgent(agent: Agent) {
        this.agents = this.agents.filter((a) => a !== agent)
    }

    async invoke(
        agentName: string,
        message: BaseMessage,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: Record<string, any>
    ) {
        this._runner.setGlobal('agent', agentName)

        for (const key in args) {
            this._runner.setGlobal(key, args[key])
        }

        const result = await this._runner
            .clone()
            .execute(this._graph.compile(), {
                message,
                args
            })

        return result.get('output')?.['message'] as BaseMessage
    }

    async registerDefaultNodes() {
        this._runner.registerNodeType(
            'system/prepare',
            this.prepareProcessor.bind(this),
            {
                inputs: ['message'],
                outputs: ['message']
            }
        )

        // prepare
        this._graph.addNode(
            'system/prepare',
            this._runner.getNodePorts('system/prepare'),
            'prepare'
        )

        this._runner.registerNodeType(
            'system/call_agent',
            this.callAgentProcessor.bind(this),
            {
                inputs: ['message', 'agent'],
                outputs: ['action']
            }
        )

        // call agent
        this._graph.addNode(
            'system/call_agent',
            this._runner.getNodePorts('system/call_agent'),
            'call_agent'
        )

        this._graph.connect(
            {
                nodeId: 'prepare',
                portName: 'message'
            },
            {
                nodeId: 'call_agent',
                portName: 'message'
            }
        )

        this._runner.registerNodeType(
            'system/output',
            this.handleAgentOutputProcessor.bind(this),
            {
                inputs: ['message'],
                outputs: ['message']
            }
        )

        // handle agent output
        this._graph.addNode(
            'system/output',
            this._runner.getNodePorts('system/output'),
            'output'
        )

        this._graph.connect(
            {
                nodeId: 'call_agent',
                portName: 'action'
            },
            {
                nodeId: 'output',
                portName: 'message'
            }
        )
    }

    private async prepareProcessor(
        inputs: Parameters<AgentTypeProcessor>[0],
        context: ExecutionContext
    ) {
        context.setGlobal(
            'messages',
            this.environment.chatMemory.chatHistory.getMessages()
        )

        context.setGlobal('environment', this.environment)

        const message = inputs['message'] as BaseMessage

        context.setGlobal('input_message', message)

        return { message }
    }

    private async callAgentProcessor(
        inputs: Parameters<AgentTypeProcessor>[0],
        context: ExecutionContext
    ) {
        const message = inputs['message'] as BaseMessage

        const agentName = (inputs['agent'] ??
            context.getGlobal('agent')) as string

        const agent = this.agents.find((a) => a.name === agentName)

        if (!agent) {
            throw new Error(`Agent ${agentName} not found`)
        }

        const action = await agent.invoke(message, context)

        return { action }
    }

    private async handleAgentOutputProcessor(
        inputs: Parameters<AgentTypeProcessor>[0],
        context: ExecutionContext
    ) {
        const action = inputs['message'] as AgentFinish

        return { message: action.message }
    }

    get runner() {
        return this._runner
    }

    get graph() {
        return this._graph
    }
}

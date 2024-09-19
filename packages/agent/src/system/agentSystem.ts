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
    private graph: NodeGraph

    private runner: AgentGraphRunner

    private agents: Agent[] = []

    constructor(
        private ctx: Context,
        private environment: Environment
    ) {
        this.graph = new NodeGraph()
        this.runner = new AgentGraphRunner()
    }

    async addAgent(agent: Agent) {
        this.agents.push(agent)
    }

    async removeAgent(agent: Agent) {
        this.agents = this.agents.filter((a) => a !== agent)
    }

    async invoke(agentName: string, message: BaseMessage) {
        this.runner.setGlobal('agent', agentName)
        const result = await this.runner.execute(this.graph.compile(), {
            message
        })

        return result.get('output')?.['message'] as BaseMessage
    }

    async registerDefaultNodes() {
        this.runner.registerNodeType(
            'system/prepare',
            this.prepareProcessor.bind(this),
            {
                inputs: ['message'],
                outputs: ['message']
            }
        )

        // prepare
        this.graph.addNode(
            'system/prepare',
            this.runner.getNodePorts('system/prepare'),
            'prepare'
        )

        this.runner.registerNodeType(
            'system/call_agent',
            this.callAgentProcessor.bind(this),
            {
                inputs: ['message', 'agent'],
                outputs: ['action']
            }
        )

        // call agent
        this.graph.addNode(
            'system/call_agent',
            this.runner.getNodePorts('system/call_agent'),
            'call_agent'
        )

        this.graph.connect(
            {
                nodeId: 'prepare',
                portName: 'message'
            },
            {
                nodeId: 'call_agent',
                portName: 'message'
            }
        )

        this.runner.registerNodeType(
            'system/output',
            this.handleAgentOutputProcessor.bind(this),
            {
                inputs: ['message'],
                outputs: ['message']
            }
        )

        // handle agent output
        this.graph.addNode(
            'system/output',
            this.runner.getNodePorts('system/output'),
            'output'
        )

        this.graph.connect(
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

        const action = await agent.invoke(message)

        return { action }
    }

    private async handleAgentOutputProcessor(
        inputs: Parameters<AgentTypeProcessor>[0],
        context: ExecutionContext
    ) {
        const action = inputs['action'] as AgentFinish

        return action.message
    }
}

import { Environment } from '@chatluna/agent/environment'
import {
    AgentGraphRunner,
    AgentTypeProcessor,
    ExecutionContext,
    NodeGraph
} from '@chatluna/agent/graph'
import { Context } from 'cordis'
import { Agent } from '@chatluna/agent'
import { BaseMessage } from '@langchain/core/messages'

export class AgentSystem {
    private graph: NodeGraph

    private runner: AgentGraphRunner

    private agents: Agent[]

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

    async registerDefaultNodes() {
        // call agent
        this.graph.addNode(
            'system/call_agent',
            {
                inputs: ['messages'],
                outputs: ['message']
            },
            'call_agent'
        )

        // add to messages
        this.graph.addNode(
            'system/add_to_messages',
            {
                inputs: ['agentMessage'],
                outputs: ['messsage']
            },
            'add_to_messages'
        )

        // send message
        this.graph.addNode(
            'system/send_message',
            {
                inputs: ['message'],
                outputs: []
            },
            'send_message'
        )

        this.runner.registerNodeType('system/prepare', this.prepareProcessor, {
            inputs: ['message'],
            outputs: ['message']
        })

        // prepare
        this.graph.addNode(
            'system/prepare',
            this.runner.getNodePorts('system/prepare'),
            'prepare'
        )
    }

    async prepareProcessor(
        inputs: Parameters<AgentTypeProcessor>[0],
        context: ExecutionContext
    ) {
        context.set(
            'messages',
            this.environment.chatMemory.chatHistory.getMessages()
        )

        context.setGlobal('environment', this.environment)

        const message = inputs['message'] as BaseMessage

        context.setGlobal('input_message', message)

        return { output: message }
    }
}

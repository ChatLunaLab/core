import { BaseMessage } from '@langchain/core/messages'
import { Agent, AgentFinish, AgentState, AgentStep } from './types.ts'
import { Environment } from '@chatluna/agent/environment'
export abstract class BaseAgent implements Agent {
    state: AgentState

    constructor(
        public name: string,
        public description: string,
        public environment: Environment,
        public useTools?: string[]
    ) {}

    invoke(message: BaseMessage): AgentFinish | AgentStep {
        throw new Error('Method not implemented.')
    }

    updateState(state: AgentState): void {
        this.state = state
    }
}

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

    abstract invoke(
        message: BaseMessage | BaseMessage[],
        args?: Record<string, unknown>
    ): Promise<AgentFinish | AgentStep>

    updateState(state: AgentState): void {
        this.state = state
    }
}

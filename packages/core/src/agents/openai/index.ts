import {
    AIMessage,
    BaseMessage,
    FunctionMessage,
    ToolMessage
} from '@langchain/core/messages'
import { BaseOutputParser } from '@langchain/core/output_parsers'
import {
    FunctionsAgentAction,
    OpenAIFunctionsAgentOutputParser,
    OpenAIToolsAgentOutputParser,
    ToolsAgentAction
} from '@chatluna/core/agents'
import { AgentAction, AgentFinish, AgentStep } from '@langchain/core/agents'
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    MessagesPlaceholder
} from '@langchain/core/prompts'
import { StructuredTool } from '@langchain/core/tools'
import { ChatLunaChatModel } from '@chatluna/core/model'
import {
    RunnableLambda,
    RunnablePassthrough,
    RunnableSequence
} from '@langchain/core/runnables'
import { SystemPrompts } from '@chatluna/core/chain'
/**
 * Checks if the given action is a FunctionsAgentAction.
 * @param action The action to check.
 * @returns True if the action is a FunctionsAgentAction, false otherwise.
 */
function isFunctionsAgentAction(
    action: AgentAction | FunctionsAgentAction
): action is FunctionsAgentAction {
    return (action as FunctionsAgentAction).messageLog !== undefined
}

function isToolsAgentAction(
    action: AgentAction | ToolsAgentAction
): action is ToolsAgentAction {
    return (action as ToolsAgentAction).toolCallId !== undefined
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function _convertAgentStepToMessages(
    action: AgentAction | FunctionsAgentAction | ToolsAgentAction,
    observation: string
) {
    if (isToolsAgentAction(action) && action.toolCallId !== undefined) {
        const log = action.messageLog as BaseMessage[]
        return log.concat(
            new ToolMessage({
                content: observation,
                name: action.tool,
                tool_call_id: action.toolCallId
            })
        )
    } else if (
        isFunctionsAgentAction(action) &&
        action.messageLog !== undefined
    ) {
        return action.messageLog?.concat(
            new FunctionMessage(observation, action.tool)
        )
    } else {
        return [new AIMessage(action.log)]
    }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function _formatIntermediateSteps(
    intermediateSteps: AgentStep[]
): BaseMessage[] {
    return intermediateSteps.flatMap(({ action, observation }) =>
        _convertAgentStepToMessages(action, observation)
    )
}

/**
 * Params used by the createOpenAIFunctionsAgent function.
 */
export type CreateOpenAIAgentParams = {
    /**
     * LLM to use as the agent. Should work with OpenAI function calling,
     * so must either be an OpenAI model that supports that or a wrapper of
     * a different model that adds in equivalent support.
     */
    llm: ChatLunaChatModel
    /** Tools this agent has access to. */
    tools: StructuredTool[]
    /** The prompt to use, must have an input key for `agent_scratchpad`. */
    preset: SystemPrompts
}

export function createOpenAIAgent({
    llm,
    tools,
    preset
}: CreateOpenAIAgentParams) {
    const prompt = ChatPromptTemplate.fromMessages([
        new MessagesPlaceholder('preset'),
        new MessagesPlaceholder('chat_history'),
        HumanMessagePromptTemplate.fromTemplate('{input}'),
        new MessagesPlaceholder('agent_scratchpad')
    ])

    const llmWithTools = llm.bind({
        tools
    })

    let outputParser: BaseOutputParser<
        AgentAction[] | AgentFinish | AgentAction
    > = new OpenAIFunctionsAgentOutputParser()

    const agent = RunnableSequence.from([
        RunnablePassthrough.assign({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            agent_scratchpad: (input: { steps: AgentStep[] }) =>
                _formatIntermediateSteps(input.steps),
            preset: () => preset
        }),
        prompt,
        llmWithTools,
        RunnableLambda.from((input: BaseMessage) => {
            if (
                input.additional_kwargs.tool_calls &&
                outputParser instanceof OpenAIFunctionsAgentOutputParser
            ) {
                outputParser = new OpenAIToolsAgentOutputParser()
            } else if (
                input.additional_kwargs.function_call &&
                outputParser instanceof OpenAIToolsAgentOutputParser
            ) {
                outputParser = new OpenAIFunctionsAgentOutputParser()
            }
            return outputParser.parseResult([
                {
                    message: input,
                    text: input.content as string
                }
            ])
        })
    ])

    return agent
}

export * from    './output_parser.ts'
export * from    './prompt.ts'

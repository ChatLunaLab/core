import { AIMessage, BaseMessage } from '@langchain/core/messages'
import {
    ChatLunaLLMCallArg,
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput,
    SystemPrompts
} from '@chatluna/core/src/chain'
import { ChatLunaChatModel, ChatLunaEmbeddings } from '@chatluna/core/src/model'
import { ChatLunaTool } from '@chatluna/core/src/platform'
import { StructuredTool } from '@langchain/core/tools'
import { ChainValues } from '@langchain/core/utils/types'
import { createOpenAIAgent } from '@chatluna/core/src/agents'
import { Runnable, RunnableSequence } from '@langchain/core/runnables'
import { AgentAction, AgentFinish, AgentStep } from '@langchain/core/agents'
import { BaseChatMemory, BufferWindowMemory } from '@chatluna/core/src/memory'

export interface ChatLunaPluginChainInput extends ChatLunaLLMChainWrapperInput {
    systemPrompts?: SystemPrompts
    historyMemory: BaseChatMemory
    embeddings: ChatLunaEmbeddings
    dynamicTool?: boolean
    createExecutor: (args: {
        agent: RunnableSequence<
            {
                steps: AgentStep[]
            },
            AgentAction | AgentAction[] | AgentFinish
        >
        tools: StructuredTool[]
        memory: BaseChatMemory
        verbose: boolean
    }) => Runnable<ChainValues, ChainValues>
}

export class ChatLunaPluginChain
    extends ChatLunaLLMChainWrapper
    implements ChatLunaPluginChainInput
{
    executor: Runnable<ChainValues, ChainValues>

    createExecutor: (args: {
        agent: RunnableSequence<
            { steps: AgentStep[] },
            AgentAction | AgentAction[] | AgentFinish
        >
        tags?: string[]
        tools: StructuredTool[]
        memory: BaseChatMemory
        verbose: boolean
    }) => Runnable<ChainValues, ChainValues>

    historyMemory: BaseChatMemory

    dynamicTool?: boolean

    systemPrompts?: SystemPrompts

    llm: ChatLunaChatModel

    embeddings: ChatLunaEmbeddings

    activeTools: ChatLunaTool[] = []

    tools: ChatLunaTool[]

    verbose?: boolean

    constructor(
        params: ChatLunaPluginChainInput & {
            tools: ChatLunaTool[]
            llm: ChatLunaChatModel
        }
    ) {
        super(params)

        const {
            historyMemory,
            systemPrompts,
            llm,
            verbose,
            tools,
            dynamicTool,
            embeddings,
            createExecutor
        } = params

        this.historyMemory = historyMemory
        this.systemPrompts = systemPrompts
        this.dynamicTool = dynamicTool
        this.createExecutor = createExecutor
        this.tools = tools
        this.embeddings = embeddings
        this.verbose = verbose
        this.llm = llm
    }

    static async fromLLMAndTools(
        llm: ChatLunaChatModel,
        tools: ChatLunaTool[],
        {
            historyMemory,
            systemPrompts,
            embeddings,
            createExecutor,
            verbose
        }: ChatLunaPluginChainInput
    ): Promise<ChatLunaPluginChain> {
        return new ChatLunaPluginChain({
            historyMemory,
            systemPrompts,
            llm,
            embeddings,
            verbose,
            createExecutor,
            tools
        })
    }

    private async _createExecutor(
        llm: ChatLunaChatModel,
        tools: StructuredTool[],
        {
            historyMemory,
            systemPrompts
        }: Omit<ChatLunaPluginChainInput, 'embeddings' | 'createExecutor'>
    ) {
        return this.createExecutor({
            tags: ['openai-functions'],
            agent: createOpenAIAgent({
                llm,
                tools,
                preset: systemPrompts
            }),
            tools,
            memory:
                historyMemory ??
                new BufferWindowMemory({
                    returnMessages: true,
                    memoryKey: 'chat_history',
                    inputKey: 'input',
                    outputKey: 'output'
                }),
            verbose: true
        })
    }

    private _getActiveTools(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authorizationObj: any,
        messages: BaseMessage[]
    ): [ChatLunaTool[], boolean] {
        const tools: ChatLunaTool[] = this.activeTools

        const newActiveTools: [ChatLunaTool, boolean][] = this.tools.map(
            (tool) => {
                const base = tool.selector(messages)

                if (tool.authorization) {
                    return [tool, tool.authorization(authorizationObj) && base]
                }

                return [tool, base]
            }
        )

        const differenceTools: [ChatLunaTool, boolean][] =
            newActiveTools.filter((tool) => {
                const include = tools.includes(tool[0])

                return !include || (include && tool[1] === false)
            })

        if (differenceTools.length <= 0) {
            return [
                this.tools,
                this.tools.some((tool) => tool?.alwaysRecreate === true)
            ]
        }

        for (const differenceTool of differenceTools) {
            if (differenceTool[1] === false) {
                const index = tools.findIndex(
                    (tool) => tool === differenceTool[0]
                )
                if (index > -1) {
                    tools.splice(index, 1)
                }
            } else {
                tools.push(differenceTool[0])
            }
        }
        return [this.activeTools, true]
    }

    async call({
        message,
        stream,
        events,
        params
    }: ChatLunaLLMCallArg): Promise<ChainValues> {
        const requests: ChainValues & {
            chat_history?: BaseMessage[]
            id?: string
        } = {
            input: message.content
        }

        const memoryVariables =
            await this.historyMemory.loadMemoryVariables(requests)

        requests['chat_history'] = memoryVariables[
            this.historyMemory.outputKey
        ] as BaseMessage[]

        Object.assign(requests, params)

        const [activeTools, recreate] = this._getActiveTools(
            params['authorization'],
            requests['chat_history'].concat(message)
        )

        if (recreate || this.executor == null) {
            this.executor = await this._createExecutor(
                this.llm,
                await Promise.all(
                    activeTools.map((tool) =>
                        tool.createTool(
                            {
                                model: this.llm,
                                embeddings: this.embeddings
                            },
                            params['authorization']
                        )
                    )
                ),
                {
                    historyMemory: this.historyMemory,
                    systemPrompts: this.systemPrompts
                }
            )
        }

        let usedToken = 0

        const response = await this.executor.invoke(
            {
                ...requests
            },
            {
                callbacks: [
                    {
                        handleLLMEnd(output, runId, parentRunId, tags) {
                            usedToken +=
                                output.llmOutput?.tokenUsage?.totalTokens
                        },
                        handleAgentAction(action, runId, parentRunId, tags) {
                            events?.['llm-call-tool'](
                                action.tool,
                                action.toolInput
                            )
                        }
                    }
                ]
            }
        )

        await events?.['llm-used-token-count']?.(usedToken)

        const responseString = response.output

        const aiMessage = new AIMessage(responseString)
        response.message = aiMessage

        await this.historyMemory.chatHistory.addMessage(message)
        await this.historyMemory.chatHistory.addAIChatMessage(responseString)

        return response
    }

    get model() {
        return this.llm
    }
}

// base agent type
export type AgentExecutor = Runnable<ChainValues, ChainValues>

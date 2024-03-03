import { createOpenAIAgent } from '@chatluna/core/agents'
import {
    ChatLunaLLMCallArg,
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput,
    SystemPrompts
} from '@chatluna/core/chain'
import { BaseChatMemory, BufferWindowMemory } from '@chatluna/core/memory'
import { ChatLunaChatModel, ChatLunaEmbeddings } from '@chatluna/core/model'
import { ChatLunaTool } from '@chatluna/core/platform'
import { AgentAction, AgentFinish, AgentStep } from '@langchain/core/agents'
import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { Runnable, RunnableSequence } from '@langchain/core/runnables'
import { StructuredTool } from '@langchain/core/tools'
import { ChainValues } from '@langchain/core/utils/types'

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

    currentChatMemory: BaseChatMemory

    baseMessages: BaseMessage[] = []

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
        systemPrompts: SystemPrompts
    ) {
        if (this.currentChatMemory == null) {
            this.currentChatMemory = new BufferWindowMemory({
                returnMessages: true,
                memoryKey: 'chat_history',
                inputKey: 'input',
                outputKey: 'output'
            })

            for (const message of this.baseMessages) {
                await this.currentChatMemory.chatHistory.addMessage(message)
            }
        }

        return this.createExecutor({
            tags: ['openai-functions'],
            agent: createOpenAIAgent({
                llm,
                tools,
                preset: systemPrompts
            }),
            tools,
            memory: this.currentChatMemory,
            verbose: this.verbose ?? true
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

                return !include || (include && !tool[1])
            })

        if (differenceTools.length <= 0) {
            return [this.tools, this.tools.some((tool) => tool?.alwaysRecreate)]
        }

        for (const differenceTool of differenceTools) {
            if (!differenceTool[1]) {
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
    }: ChatLunaLLMCallArg): Promise<AIMessage> {
        const requests: ChainValues & {
            chat_history?: BaseMessage[]
            id?: string
        } = {
            input: message.content
        }

        this.baseMessages =
            this.baseMessages ??
            (await this.historyMemory.chatHistory.getMessages())

        // requests['chat_history'] = this.baseMessages

        Object.assign(requests, params)

        const [activeTools, recreate] = this._getActiveTools(
            params['authorization'],
            (this.currentChatMemory != null
                ? await this.currentChatMemory.chatHistory.getMessages()
                : this.baseMessages
            ).concat(message)
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
                this.systemPrompts
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
                        handleLLMEnd(output) {
                            usedToken +=
                                output.llmOutput?.tokenUsage?.totalTokens
                        },
                        handleAgentAction(action) {
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

        await this.historyMemory.chatHistory.addMessage(message)
        await this.historyMemory.chatHistory.addAIChatMessage(responseString)

        return aiMessage
    }

    get model() {
        return this.llm
    }
}

// base agent type
export type AgentExecutor = Runnable<ChainValues, ChainValues>

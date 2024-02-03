/* eslint-disable max-len */
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages'
import {
    HumanMessagePromptTemplate,
    MessagesPlaceholder,
    PromptTemplate
} from '@langchain/core/prompts'
import { Embeddings } from '@langchain/core/embeddings'
import { StructuredTool, Tool } from '@langchain/core/tools'

import { ChainValues } from '@langchain/core/utils/types'
import {
    callChatLunaChain,
    ChatLunaChatPrompt,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput,
    SystemPrompts
} from '@chatluna/core/src/chain'
import { ChatLunaChatModel } from '@chatluna/core/src/model'
import {
    ChatLunaSaveableVectorStore,
    MemoryVectorStore
} from '@chatluna/core/src/vectorstore'
import {
    BufferWindowMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/src/memory'
import { VectorStore } from '@langchain/core/vectorstores'
import { DocumentInterface } from '@langchain/core/documents'
import { BaseRetrieverInterface } from '@langchain/core/retrievers'
import { Logger } from '@cordisjs/logger'

// github.com/langchain-ai/weblangchain/blob/main/nextjs/app/api/chat/stream_log/route.ts#L81

export interface ChatLunaBrowsingChainInput
    extends ChatLunaLLMChainWrapperInput {
    botName: string
    systemPrompts?: SystemPrompts
    embeddings: Embeddings
    chatMemory: VectorStoreRetrieverMemory
    htmlMemory?: VectorStore
    historyMemory: BufferWindowMemory
    htmlLoader?: (url: string) => Promise<DocumentInterface[]>

    htmlRetriever?: (
        args: CreateChatLunaBrowsingRetrieverArgs
    ) => BaseRetrieverInterface
    browsePage: boolean
}

export class ChatLunaBrowsingChain extends ChatLunaLLMChainWrapper {
    botName: string

    embeddings: Embeddings

    htmlMemory: VectorStore

    browsePage: boolean

    chain: ChatLunaLLMChain

    historyMemory: BufferWindowMemory

    systemPrompts?: SystemPrompts

    chatMemory: VectorStoreRetrieverMemory

    formatQuestionChain: ChatLunaLLMChain

    tools: StructuredTool[]

    responsePrompt: PromptTemplate

    htmlLoader?: (url: string) => Promise<DocumentInterface[]>

    htmlRetriever: BaseRetrieverInterface

    logger?: Logger

    llm?: ChatLunaChatModel

    constructor(
        params: ChatLunaBrowsingChainInput & {
            chain: ChatLunaLLMChain
            formatQuestionChain: ChatLunaLLMChain
            tools: StructuredTool[]
            llm: ChatLunaChatModel
        }
    ) {
        super(params)

        const {
            botName,
            embeddings,
            historyMemory,
            systemPrompts,
            chain,
            tools,
            chatMemory,
            formatQuestionChain,
            htmlMemory,
            browsePage,
            htmlLoader,
            htmlRetriever
        } = params

        this.botName = botName

        this.embeddings = embeddings

        // use memory
        this.chatMemory = chatMemory
        this.historyMemory = historyMemory
        this.formatQuestionChain = formatQuestionChain

        this.historyMemory = historyMemory
        this.systemPrompts = systemPrompts
        this.responsePrompt = PromptTemplate.fromTemplate(RESPONSE_TEMPLATE)
        this.chain = chain
        this.tools = tools
        this.browsePage = browsePage
        this.htmlMemory =
            htmlMemory ??
            (embeddings != null ? new MemoryVectorStore(embeddings) : undefined)
        this.htmlLoader = htmlLoader

        if (this.browsePage) {
            this.htmlRetriever = htmlRetriever({
                embeddings,
                baseRetriever: this.htmlMemory.asRetriever()
            })
        }

        this.llm = params.llm

        this.logger = params.ctx?.logger('chatluna_browsing_chain')
    }

    static fromLLMAndTools(
        llm: ChatLunaChatModel,
        tools: Tool[],
        {
            botName,
            embeddings,
            historyMemory,
            systemPrompts,
            chatMemory,
            htmlRetriever,
            htmlLoader,
            htmlMemory,
            browsePage
        }: ChatLunaBrowsingChainInput
    ): ChatLunaBrowsingChain {
        const humanMessagePromptTemplate =
            HumanMessagePromptTemplate.fromTemplate('{input}')

        const conversationSummaryPrompt =
            HumanMessagePromptTemplate.fromTemplate(
                // eslint-disable-next-line max-len
                `Relevant pieces of previous conversation: {long_history} (You do not need to use these pieces of information if not relevant, and based on these information, generate similar but non-repetitive responses. Pay attention, you need to think more and diverge your creativity.)`
            )

        const messagesPlaceholder = new MessagesPlaceholder('chat_history')

        const prompt = new ChatLunaChatPrompt({
            systemPrompts: systemPrompts ?? [
                new SystemMessage(
                    "You are ChatGPT, a large language model trained by OpenAI. Carefully heed the user's instructions."
                )
            ],
            conversationSummaryPrompt,
            messagesPlaceholder,
            tokenCounter: (text) => llm.getNumTokens(text),
            humanMessagePromptTemplate,
            sendTokenLimit:
                llm.invocationParams().maxTokens ?? llm.getModelMaxContextSize()
        })

        const chain = prompt.pipe(llm)
        const formatQuestionChain =
            PromptTemplate.fromTemplate(REPHRASE_TEMPLATE).pipe(llm)

        return new ChatLunaBrowsingChain({
            botName,
            formatQuestionChain,
            embeddings,
            historyMemory,
            systemPrompts,
            chain,
            tools,
            llm,
            chatMemory,
            htmlLoader,
            htmlMemory,
            htmlRetriever,
            browsePage
        })
    }

    private _selectTool(name: string): StructuredTool {
        return this.tools.find((tool) => tool.name === name)
    }

    private async _formatInnerResults(searchResults: SearchResult[]) {
        return searchResults
            .map(
                (result) =>
                    `title: ${result.title}\ndesc: ${result.description}` +
                    (result.url ? `\nsource: ${result.url}` : '')
            )
            .join('\n\n')
    }

    private async _formatSearchResults(
        searchResults: SearchResult[],
        question: string
    ) {
        if (this.browsePage === false || this.browsePage == null) {
            return this._formatInnerResults(searchResults)
        }

        // transform to html

        const htmlResults = await Promise.all(
            searchResults.flatMap(async (result) => {
                const { url } = result

                return this.htmlLoader(url).then((documents) => {
                    documents.forEach((document) => {
                        document.metadata = result
                    })

                    return documents
                })
            })
        ).then((result) => result.flatMap((_) => _))

        await this.htmlMemory.addDocuments(htmlResults)

        const similarityDocuments =
            await this.htmlRetriever.getRelevantDocuments(question)

        return similarityDocuments
            .map(
                (result) =>
                    `title: ${result.metadata.title}\ncontent: ${result.metadata.content}` +
                    (result.metadata.url
                        ? `\nsource: ${result.metadata.url}`
                        : '')
            )
            .join('\n\n')
    }

    async call({
        message,
        stream,
        events,
        params
    }: ChatLunaLLMCallArg): Promise<ChainValues> {
        const requests: ChainValues = {
            input: message
        }

        const chatHistory = (
            await this.historyMemory.loadMemoryVariables(requests)
        )[this.historyMemory.memoryKey] as BaseMessage[]

        const longHistory = (
            await this.chatMemory.loadMemoryVariables({
                user: message.content
            })
        )[this.chatMemory.memoryKey]

        requests['long_history'] = longHistory
        requests['chat_history'] = chatHistory
        Object.assign(requests, params)

        // recreate questions

        const newQuestion = (
            await callChatLunaChain(
                this.formatQuestionChain,
                {
                    chat_history: formatChatHistoryAsString(chatHistory),
                    question: message.content
                },
                {
                    'llm-used-token-count': events['llm-used-token-count']
                }
            )
        )['text'] as string

        this.logger?.debug(`new questions %c`, newQuestion)

        // search questions

        const searchTool = this._selectTool('web-search')

        const searchResults =
            (JSON.parse(
                (await searchTool.call(newQuestion)) as string
            ) as unknown as SearchResult[]) ?? []

        // format questions

        const formattedSearchResults = await this._formatSearchResults(
            searchResults,
            newQuestion
        )

        this.logger?.debug('formatted search results', formattedSearchResults)

        // format and call

        requests['input'] =
            searchResults?.length > 0
                ? await this.responsePrompt.format({
                      question: message.content,
                      context: formattedSearchResults
                  })
                : message.content

        const { text: finalResponse } = await callChatLunaChain(
            this.chain,
            {
                ...requests,
                stream
            },
            events
        )

        this.logger?.debug(`final response %c`, finalResponse)

        await this.historyMemory.chatHistory.addMessage(message)
        await this.historyMemory.chatHistory.addAIChatMessage(finalResponse)

        await this.chatMemory.saveContext(
            { user: message.content },
            { your: finalResponse }
        )

        const vectorStore = this.chatMemory.vectorStoreRetriever.vectorStore

        if (vectorStore instanceof ChatLunaSaveableVectorStore) {
            this.logger?.debug('saving vector store')
            await vectorStore.save()
        }

        const aiMessage = new AIMessage(finalResponse)

        return {
            message: aiMessage
        }
    }

    get model() {
        return this.llm
    }
}

const RESPONSE_TEMPLATE = `GOAL: You are an expert researcher and writer, tasked with answering any question.
You need answering any user question and output with question language.

Generate a comprehensive and informative, yet concise answer of 250 words or less for the
given question based solely on the provided search results (URL and content). You must
only use information from the provided search results. Use an unbiased and
journalistic tone. Combine search results together into a coherent answer. Do not
repeat text. Cite search results using [\${{number}}] notation. Only cite the most
relevant results that answer the question accurately. Place these citations at the end
of the sentence or paragraph that reference them - do not put them all at the end. If
different results refer to different entities within the same name, write separate
answers for each entity. If you want to cite multiple results for the same sentence,
format it as \`[\${{number1}}] [\${{number2}}]\`. However, you should NEVER do this with the
same number - if you want to cite \`number1\` multiple times for a sentence, only do
\`[\${{number1}}]\` not \`[\${{number1}}] [\${{number1}}]\`

Your text style should be the same as the system message set to.

You should use bullet points in your answer for readability. Put citations where they apply rather than putting them all at the end.

At the end, list the source of the referenced search results in markdown format.

If there is nothing in the context relevant to the question at hand, just say "Hmm,
I'm not sure." Don't try to make up an answer.

Anything between the following \`context\` html blocks is retrieved from a knowledge
bank, not part of the conversation with the user.

<context>
    {context}
<context/>

REMEMBER: If there is no relevant information within the context, just say "Hmm, I'm
not sure." Don't try to make up an answer. Anything between the preceding 'context'
html blocks is retrieved from a knowledge bank, not part of the conversation with the
user. The current date is ${new Date().toISOString()}

QUESTION: {question}

ANSWER:`

// eslint-disable-next-line max-len
const REPHRASE_TEMPLATE = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question and use origin question language.

The standalone question should be search engine friendly.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone Question:`

const formatChatHistoryAsString = (history: BaseMessage[]) => {
    return history
        .map((message) => `${message._getType()}: ${message.content}`)
        .join('\n')
}

export interface CreateChatLunaBrowsingRetrieverArgs {
    embeddings: Embeddings
    baseRetriever: BaseRetrieverInterface
}

export interface SearchResult {
    title: string
    description: string
    url: string
}

import {
    callChatLunaChain,
    ChatLunaChatPrompt,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput,
    SystemPrompts
} from '@chatluna/core/chain'
import { ChainValues } from '@langchain/core/utils/types'
import {
    HumanMessagePromptTemplate,
    MessagesPlaceholder
} from '@langchain/core/prompts'
import { AIMessage, SystemMessage } from '@langchain/core/messages'
import {
    BaseChatMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/memory'
import { ChatLunaChatModel } from '@chatluna/core/model'
import { ChatLunaSaveableVectorStore } from '@chatluna/core/vectorstore'

export class MockChatChain
    extends ChatLunaLLMChainWrapper
    implements ChatLunaLLMChainWrapperInput {

    chain: ChatLunaLLMChain

    historyMemory: BaseChatMemory


    llm: ChatLunaChatModel

    constructor(
        params: ChatLunaLLMChainWrapperInput & {
            chain: ChatLunaLLMChain

            llm: ChatLunaChatModel
        }
    ) {
        super(params)

        const { chatMemory: longMemory, historyMemory, chain } = params


        this.historyMemory = historyMemory

        this.chain = chain

        this.llm = params.llm
    }

    static fromLLM(
        llm: ChatLunaChatModel,
        params: ChatLunaLLMChainWrapperInput
    ): MockChatChain {
        const humanMessagePromptTemplate =
            HumanMessagePromptTemplate.fromTemplate(
                params.humanMessagePrompt ?? '{input}'
            )


        const messagesPlaceholder = new MessagesPlaceholder('chat_history')



        return new MockChatChain({
            ...params,
            chain: messagesPlaceholder.pipe(llm),
            llm
        })
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
        const chatHistory =
            await this.historyMemory.loadMemoryVariables(requests)


        requests['chat_history'] = chatHistory[this.historyMemory.memoryKeys[0]]

        Object.assign(requests, params)

        const response = await callChatLunaChain(
            this.chain,
            {
                ...requests,
                stream
            },
            events
        )

        if (response.text == null) {
            throw new Error('response.text is null')
        }

        const responseString = response.text



        const aiMessage = new AIMessage(responseString)
        response.message = aiMessage

        if (
            response.extra != null &&
            'additionalReplyMessages' in response.extra
        ) {
            response.additionalReplyMessages =
                response.extra.additionalReplyMessages
        }

        return response
    }

    get model() {
        return this.llm
    }
}


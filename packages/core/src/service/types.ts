import { PlatformService, RequestService } from '@chatluna/core/service'
import {
    BasePlatformClient,
    ChatLunaChainInfo,
    ModelType
} from '@chatluna/core/platform'
import { ChatLunaChatModel, ChatLunaEmbeddings } from '@chatluna/core/model'
import { AgentTypeRunner } from '@chatluna/core/agent'
declare module '@cordisjs/core' {
    interface Context {
        chatluna_request: RequestService
        chatluna_platform: PlatformService
    }

    interface Events {
        'chatluna/model-added': (
            service: PlatformService,
            platform: string,
            client: BasePlatformClient | BasePlatformClient[]
        ) => void
        'chatluna/embeddings-added': (
            service: PlatformService,
            platform: string,
            client: BasePlatformClient | BasePlatformClient[]
        ) => void
        'chatluna/vector-store-added': (
            service: PlatformService,
            name: string
        ) => void
        'chatluna/chat-chain-removed': (
            service: PlatformService,
            chain: ChatLunaChainInfo
        ) => void
        'chatluna/model-removed': (
            service: PlatformService,
            platform: string,
            client: BasePlatformClient
        ) => void
        'chatluna/vector-store-removed': (
            service: PlatformService,
            name: string
        ) => void
        'chatluna/embeddings-removed': (
            service: PlatformService,
            platform: string,
            client: BasePlatformClient | BasePlatformClient[]
        ) => void
        'chatluna/tool-updated': (service: PlatformService) => void
        'chatluna/agent-runner-added': (
            service: PlatformService,
            name: string,
            agentRunner: AgentTypeRunner
        ) => void
        'chatluna/agent-runner-removed': (
            service: PlatformService,
            name: string
        ) => void
    }
}

export type PickModelType<T = ModelType.all> = T extends ModelType.all
    ? ChatLunaEmbeddings | ChatLunaChatModel
    : T extends ModelType.embeddings
      ? ChatLunaEmbeddings
      : T extends ModelType.llm
        ? ChatLunaChatModel
        : never

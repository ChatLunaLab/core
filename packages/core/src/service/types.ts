import { PlatformService, RequestService } from '@chatluna/core/service'
import {
    BasePlatformClient,
    ChatLunaChainInfo,
    ModelType
} from '@chatluna/core/platform'
import { ChatLunaChatModel, ChatLunaEmbeddings } from '../model/base.ts'
declare module '@cordisjs/core' {
    interface Context {
        chatluna_request: RequestService
        chatluna_platform: PlatformService
    }

    interface Events {
        'chatluna/chat-chain-added': (
            service: PlatformService,
            chain: ChatLunaChainInfo
        ) => void
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
    }
}

export type PickModelType<T = ModelType.all> = T extends ModelType.all
    ? ChatLunaEmbeddings | ChatLunaChatModel
    : T extends ModelType.embeddings
      ? ChatLunaEmbeddings
      : T extends ModelType.llm
        ? ChatLunaChatModel
        : never

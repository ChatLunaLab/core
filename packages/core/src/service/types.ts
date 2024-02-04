import { PlatformService, RequestService } from '@chatluna/core/service'
import { BasePlatformClient, ChatLunaChainInfo } from '@chatluna/core/platform'

declare module 'cordis' {
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

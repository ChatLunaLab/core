import {
    PlatformService,
    PresetService,
    RequestService
} from '@chatluna/core/service'
import { ChatLunaChainInfo } from '@chatluna/core/platform'

declare module 'cordis' {
    interface Context {
        chatluna_request: RequestService
        chatluna_platform: PlatformService
        chatluna_preset: PresetService
    }

    interface Events {
        'chatluna/vector-store-added': (
            service: PlatformService,
            name: string
        ) => void
        'chatluna/chat-chain-removed': (
            service: PlatformService,
            chain: ChatLunaChainInfo
        ) => void

        'chatluna/vector-store-removed': (
            service: PlatformService,
            name: string
        ) => void

        'chatluna/tool-updated': (service: PlatformService) => void
    }
}

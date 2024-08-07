import { ChatLunaError, ChatLunaErrorCode } from './error.ts'
import { ObjectLock } from './lock.ts'

export class RequestQueue {
    private _queue: Record<string, RequestInfo[]> = {}

    private _lock = new ObjectLock()

    // 200 queue
    private _maxQueueSize = 50

    add(key: string, requestId: string): Promise<AbortController>
    add(key: string, requestId: string, signal: AbortSignal): Promise<void>

    public async add(
        key: string,
        requestId: string,
        signal?: AbortSignal
    ): Promise<void | AbortController> {
        const id = await this._lock.lock()
        if (!this._queue[key]) {
            this._queue[key] = []
        }

        let abortController: AbortController | undefined

        if (signal == null) {
            abortController = new AbortController()
            signal = abortController.signal
        }

        if (this._queue[key].length >= this._maxQueueSize) {
            throw new ChatLunaError(ChatLunaErrorCode.QUEUE_OVERFLOW)
        }

        this._queue[key].push({
            requestId,
            signal
        })
        signal.addEventListener('abort', () => {
            this.remove(key, requestId)
        })
        await this._lock.unlock(id)

        if (abortController != null) {
            return abortController
        }
    }

    public async remove(key: string, requestId: string) {
        const id = await this._lock.lock()
        if (!this._queue[key]) {
            return
        }

        const index = this._queue[key].findIndex(
            (id) => id.requestId === requestId
        )

        if (index !== -1) {
            this._queue[key].splice(index, 1)
        }
        await this._lock.unlock(id)
    }

    public async wait(key: string, requestId: string, maxConcurrent: number) {
        if (!this._queue[key]) {
            await this._lock.runLocked(async () => {})

            await this.add(key, requestId)
        }

        await new Promise((resolve, reject) => {
            const timer = setInterval(() => {
                const index = this._queue[key].findIndex(
                    (id) => id.requestId === requestId
                )

                if (index === -1) {
                    clearInterval(timer)
                    resolve(undefined)
                }

                if (index < maxConcurrent || index === 0) {
                    clearInterval(timer)
                    resolve(undefined)
                }
            }, 60)
        })
    }

    public async getQueueLength(key: string) {
        return await this._lock.runLocked(
            async () => this._queue[key]?.length ?? 0
        )
    }
}

interface RequestInfo {
    /**
     * The request id
     */
    requestId: string

    signal: AbortSignal
}

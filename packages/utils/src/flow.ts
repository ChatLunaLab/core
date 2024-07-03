import { ObjectLock } from './lock.ts'
import { sleep } from './promise.ts'

export class SubscribeFlow<T> {
    private _subscribes: ((value: T) => Promise<void>)[] = []

    private _value: T

    private _lock = new ObjectLock()

    private _running = false

    async subscribe(func: (value: T) => Promise<void>) {
        this._subscribes.push(func)
    }

    async unsubscribe(func: (value: T) => Promise<void>) {
        const index = this._subscribes.indexOf(func)

        if (index !== -1) {
            this._subscribes.splice(index, 1)
        }
    }

    async push(value: T) {
        this._value = value
    }

    async run(loop: number = Number.MAX_SAFE_INTEGER) {
        if (this._running) {
            return
        }

        this._running = true

        let currentLoop = 0

        let last: T

        while (this._running && currentLoop < loop) {
            const current = this._value

            if (!current || current === last) {
                await sleep(50)
                continue
            }

            const id = await this._lock.lock()

            for (const func of this._subscribes) {
                await func(current)
            }

            currentLoop++

            last = current

            await this._lock.unlock(id)
        }

        await this.stop()
    }

    async stop() {
        await this._lock.runLocked(async () => {
            this._running = false
        })
    }
}

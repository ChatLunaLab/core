export class TTLCache<T> {
    private _cache: Map<string, CacheItem<T>> = new Map()

    private _dispose: () => void

    constructor(private _ttlTime: number = 1000 * 60 * 20) {
        const timeout = setInterval(() => {
            const now = Date.now()
            for (const [key, value] of this._cache.entries()) {
                if (value.expire < now) {
                    this._cache.delete(key)
                }
            }
        }, _ttlTime)

        this._dispose = () => {
            clearInterval(timeout)
        }
    }

    get(key: string) {
        const item = this._cache.get(key)
        if (item) {
            return item.value
        }
    }

    set(key: string, value: T) {
        const item: CacheItem<T> = {
            value,
            expire: Date.now() + this._ttlTime
        }
        this._cache.set(key, item)
    }

    delete(key: string) {
        this._cache.delete(key)
    }

    clear() {
        this._cache.clear()
    }

    dispose() {
        this._dispose()
    }
}

interface CacheItem<T> {
    value: T
    expire: number
}

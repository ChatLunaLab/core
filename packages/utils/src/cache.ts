// 定义事件监听器接口
interface CacheEventListener<T> {
    onAdd?(key: string, value: T): void
    onDelete?(key: string, value: T): void
}

// 基础缓存类，包含公共事件处理逻辑
abstract class BaseCache<T> {
    protected _eventListeners: CacheEventListener<T>[] = []

    addEventListener(listener: CacheEventListener<T>) {
        this._eventListeners.push(listener)
    }

    protected triggerAddEvent(key: string, value: T) {
        for (const listener of this._eventListeners) {
            listener.onAdd?.(key, value)
        }
    }

    protected triggerDeleteEvent(key: string, value: T) {
        for (const listener of this._eventListeners) {
            listener.onDelete?.(key, value)
        }
    }
}

export class TTLCache<T> extends BaseCache<T> {
    private _cache: Map<string, TTLCacheItem<T>> = new Map()
    private _dispose: () => void

    constructor(private _ttlTime: number = 1000 * 60 * 20) {
        super()
        const timeout = setInterval(() => {
            const now = Date.now()
            for (const [key, value] of this._cache.entries()) {
                if (value.expire < now) {
                    this._cache.delete(key)
                    this.triggerDeleteEvent(key, value.value) // 触发删除事件
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
        const item: TTLCacheItem<T> = {
            value,
            expire: Date.now() + this._ttlTime
        }
        this._cache.set(key, item)
        this.triggerAddEvent(key, value) // 触发添加事件
    }

    delete(key: string) {
        const item = this._cache.get(key)
        if (item) {
            this._cache.delete(key)
            this.triggerDeleteEvent(key, item.value) // 触发删除事件
        }
    }

    clear() {
        for (const [key, item] of this._cache.entries()) {
            this.triggerDeleteEvent(key, item.value) // 触发删除事件
        }
        this._cache.clear()
    }

    dispose() {
        this._dispose()
    }
}

interface TTLCacheItem<T> {
    value: T
    expire: number
}

// 双向链表节点
class ListNode<T> {
    key: string
    value: T
    next: ListNode<T> | null = null
    prev: ListNode<T> | null = null

    constructor(key: string, value: T) {
        this.key = key
        this.value = value
    }
}

// 优化后的 LRUCache 实现
export class LRUCache<T> extends BaseCache<T> {
    private _cache: Map<string, ListNode<T>> = new Map()
    private _capacity: number
    private _head: ListNode<T> | null = null
    private _tail: ListNode<T> | null = null

    constructor(capacity: number) {
        super()
        this._capacity = capacity
    }

    get(key: string): T | undefined {
        const node = this._cache.get(key)
        if (!node) return undefined

        this._moveToFront(node)
        return node.value
    }

    set(key: string, value: T) {
        let node = this._cache.get(key)

        if (node) {
            // 更新现有节点
            node.value = value
            this._moveToFront(node)
        } else {
            // 创建新节点
            node = new ListNode(key, value)
            this._cache.set(key, node)
            this._addToFront(node)

            // 如果超出容量，移除最久未使用的
            if (this._cache.size > this._capacity) {
                this._removeLRU()
            }
        }

        this.triggerAddEvent(key, value)
    }

    delete(key: string) {
        const node = this._cache.get(key)
        if (!node) return

        this._removeNode(node)
        this._cache.delete(key)
        this.triggerDeleteEvent(key, node.value)
    }

    clear() {
        this._cache.clear()
        this._head = this._tail = null
    }

    private _moveToFront(node: ListNode<T>) {
        if (node === this._head) return

        this._removeNode(node)
        this._addToFront(node)
    }

    private _addToFront(node: ListNode<T>) {
        if (!this._head) {
            this._head = this._tail = node
        } else {
            node.next = this._head
            this._head.prev = node
            this._head = node
        }
    }

    private _removeNode(node: ListNode<T>) {
        if (node.prev) {
            node.prev.next = node.next
        } else {
            this._head = node.next
        }

        if (node.next) {
            node.next.prev = node.prev
        } else {
            this._tail = node.prev
        }
    }

    private _removeLRU() {
        if (!this._tail) return

        const key = this._tail.key
        const value = this._tail.value
        this._cache.delete(key)
        this._removeNode(this._tail)
        this.triggerDeleteEvent(key, value)
    }
}

export function removeNullValues<T>(obj: T): T {
    if (typeof obj !== 'object' || obj === null) {
        return obj
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => removeNullValues(item)) as T
    }
    const result = {} as T
    for (const key in obj) {
        const value = obj[key]
        if (value !== null) {
            result[key] = removeNullValues(value)
        }
    }
    return result
}

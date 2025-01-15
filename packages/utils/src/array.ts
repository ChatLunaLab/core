export function notNull<T>(array: T[]): T[] {
    return array.filter((item) => item != null)
}

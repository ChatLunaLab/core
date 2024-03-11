export function generateUUID() {
    return crypto.randomUUID()
}

export function dateWithDays(offsetDay: number) {
    const now = new Date()
    now.setDate(now.getDate() + offsetDay)
    return now
}

export class TextSplitter {
    private _bufferText: BufferText = {
        text: '',
        bufferText: '',
        diffText: '',
        lastText: ''
    }

    constructor(private _markdownSplitMode: boolean = false) {}

    splitText(diffText: string, finish: boolean): string[] {
        let { text, bufferText, lastText } = this._bufferText

        text = lastText + diffText

        const result: string[] = []

        const punctuations = ['，', '.', '。', '!', '！', '?', '？']

        const sendTogglePunctuations = ['.', '!', '！', '?', '？']

        if (
            finish &&
            (diffText.trim().length > 0 || bufferText.trim().length > 0)
        ) {
            bufferText = bufferText + diffText

            result.push(bufferText)
            bufferText = ''

            this._bufferText.lastText = text
            return result
        }

        let lastChar = ''

        if (!this._markdownSplitMode) {
            for (const char of diffText) {
                if (!punctuations.includes(char)) {
                    bufferText += char
                    continue
                }

                if (bufferText.trim().length > 0) {
                    result.push(
                        bufferText.trimStart() +
                            (sendTogglePunctuations.includes(char) ? char : '')
                    )
                }
                bufferText = ''
            }
        } else {
            // match \n\n like markdown

            for (const char of diffText) {
                if (char === '\n' && lastChar === '\n') {
                    if (bufferText.trim().length > 0) {
                        result.push(bufferText.trimStart().trimEnd())
                    }
                    bufferText = ''
                } else {
                    bufferText += char
                }
                lastChar = char
            }
        }

        this._bufferText.diffText = ''
        this._bufferText.bufferText = bufferText
        this._bufferText.lastText = text

        return result
    }
}

interface BufferText {
    text: string
    bufferText: string
    diffText: string
    lastText: string
}

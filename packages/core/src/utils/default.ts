import { Document } from '@langchain/core/documents'

export const chunkArray = <T>(arr: T[], chunkSize: number) =>
    arr.reduce((chunks, elem, index) => {
        const chunkIndex = Math.floor(index / chunkSize)
        const chunk = chunks[chunkIndex] || []
        // eslint-disable-next-line no-param-reassign
        chunks[chunkIndex] = chunk.concat([elem])
        return chunks
    }, [] as T[][])

/**
 * Given a list of documents, this util formats their contents
 * into a string, separated by newlines.
 *
 * @param documents
 * @returns A string of the documents page content, separated by newlines.
 */
export const formatDocumentsAsString = (documents: Document[]): string =>
    documents.map((doc) => doc.pageContent).join('\n\n')

import { apply } from '@chatluna/memory'
import MemoryDriver from '@minatojs/driver-memory'
import * as chai from 'chai'
import { should } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { Context } from 'cordis'
import { Database } from 'minato'
import { after, before } from 'mocha'
import { waitServiceLoad } from './mock/utils.ts'

const app = new Context()

chai.use(chaiAsPromised)

describe('User service', () => {
    it('Create', async function () {
        this.timeout(100000)

        await waitServiceLoad(app, ['chatluna_user'])

        const date = new Date()

        const user = await app.chatluna_user.createUser('a', {
            excludeModels: ['gpt'],
            userGroupId: ['a'],
            balance: 1,

            // userGroup or chat limit
            // global set
            chatTimeLimitPerMin: 1,
            lastChatTime: date
        })

        user.should.be.eql({
            userId: 'a',
            excludeModels: ['gpt'],
            userGroupId: ['a'],
            balance: 1,
            chatTimeLimitPerMin: 1,
            lastChatTime: date
        })

        user.should.be.eql(await app.chatluna_user.queryUser('a'))

        await app.chatluna_user.removeUser('a')
    })
})

should()

app.on('ready', async () => {
    const database = new Database()
    app.provide('database', database)

    await app.database.connect(MemoryDriver, {})
    app.plugin(apply)
})

before(async () => {
    await app.start()
})

after(async () => {
    await app.stop()
})

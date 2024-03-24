import { apply } from '@chatluna/memory'
import MemoryDriver from '@minatojs/driver-memory'
import * as chai from 'chai'
import { should } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { Context } from 'cordis'
import { Database } from 'minato'
import { after, before } from 'mocha'
// @ts-ignore
import { ChatLunaUserService } from '../src/service/user.ts'
import { waitServiceLoad } from './mock/utils.ts'

const app = new Context()

chai.use(chaiAsPromised)

describe('User service', () => {
    it('Create & Query & Delete', async function () {
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

        // user.should.be.eql(await app.chatluna_user.queryUser('a'))

        await app.chatluna_user.queryUser('a').should.to.eventually.be.eql(user)

        await app.chatluna_user.removeUser('a')

        await app.chatluna_user
            .queryUser('a', false)
            .should.to.be.rejectedWith(
                '使用 ChatLuna 时出现错误，错误码为 600。请联系开发者以解决此问题。'
            )
    })

    it('Query User & Additional', async function () {
        await waitServiceLoad(app, ['chatluna_user'])

        const user = await app.chatluna_user.createUser('a', {
            excludeModels: ['gpt'],
            userGroupId: ['a'],
            balance: 1,

            // userGroup or chat limit
            // global set
            chatTimeLimitPerMin: 1
        })

        // query user
        await app.chatluna_user.queryUser('a').should.to.eventually.be.eql(user)

        // query user additional
        await app.chatluna_user
            .queryUserAdditional('a')
            .should.to.eventually.be.eql({
                userId: 'a',
                lastLimitPerDay: 0,
                lastLimitPerMin: 0
            })

        // query all
        await app.chatluna_user
            .queryUserWithAdditional('a')
            .should.to.eventually.be.eql([
                user,
                {
                    userId: 'a',
                    lastLimitPerDay: 0,
                    lastLimitPerMin: 0
                }
            ])

        await app.chatluna_user.removeUser('a')
    })

    it('Update User', async function () {
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

        // set balance to 2
        user.balance = 2

        await app.chatluna_user.updateUser('a', user)

        await app.chatluna_user.queryUser('a').should.to.eventually.be.eql(user)

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

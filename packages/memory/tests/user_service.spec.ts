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

    it('Update ChatTime', async () => {
        await waitServiceLoad(app, ['chatluna_user'])

        let currentTime = new Date()
        await app.chatluna_user.createUser('a', {
            excludeModels: ['gpt'],
            userGroupId: ['a'],
            balance: 1,

            // userGroup or chat limit
            // global set
            chatTimeLimitPerMin: 1,
            lastChatTime: currentTime
        })

        // First, simulate 10 chats

        for (let i = 0; i < 10; i++) {
            await app.chatluna_user.updateChatTime('a', currentTime)
        }

        // Check the correct number of chats

        await app.chatluna_user
            .queryUserAdditional('a')
            .should.to.eventually.be.eql({
                userId: 'a',
                lastLimitPerDay: 10,
                lastLimitPerMin: 10
            })

        // Simulate a minute of conversation again

        // The memory database will directly store the object instance (will not clone)
        // so we need to create a new object
        currentTime = new Date(currentTime)
        currentTime.setMinutes(currentTime.getMinutes() + 2)

        await app.chatluna_user.updateChatTime('a', currentTime)

        await app.chatluna_user
            .queryUserAdditional('a')
            .should.to.eventually.be.eql({
                userId: 'a',
                lastLimitPerDay: 11,
                lastLimitPerMin: 1
            })

        // Simulate a day of conversation again

        currentTime = new Date(currentTime)
        currentTime.setDate(currentTime.getDate() + 1)

        await app.chatluna_user.updateChatTime('a', currentTime)

        await app.chatluna_user
            .queryUserAdditional('a')
            .should.to.eventually.be.eql({
                userId: 'a',
                lastLimitPerDay: 1,
                lastLimitPerMin: 1
            })

        await app.chatluna_user.removeUser('a')
    })

    describe('Error', () => {
        it('Query Error', async () => {
            await waitServiceLoad(app, ['chatluna_user'])

            await app.chatluna_user
                .queryUser('a', false)
                .should.to.be.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 600。请联系开发者以解决此问题。'
                )

            // make coverage happy

            await app.chatluna_user.queryUser('a')

            await app.chatluna_user.removeUser('a')

            await app.chatluna_user
                .queryUserAdditional('a')
                .should.to.be.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 600。请联系开发者以解决此问题。'
                )

            await app.chatluna_user
                .queryUserWithAdditional('a')
                .should.to.be.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 600。请联系开发者以解决此问题。'
                )
        })

        it('Remove Error', async () => {
            await waitServiceLoad(app, ['chatluna_user'])

            await app.chatluna_user
                .removeUser('a')
                .should.to.be.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 600。请联系开发者以解决此问题。'
                )
        })
    })
})

describe('User Group', () => {
    it('Create & Query & Delete', async function () {
        await waitServiceLoad(app, ['chatluna_user'])

        const group = await app.chatluna_user.createUserGroup({
            name: 'a',
            limitPerMin: 10,
            limitPerDay: 100,

            costPerToken: 0.2,

            supportModels: ['gpt3.5']
        })

        group.should.be.eql({
            name: 'a',
            limitPerMin: 10,
            limitPerDay: 100,
            id: 1,
            costPerToken: 0.2,

            supportModels: ['gpt3.5']
        })

        await app.chatluna_user
            .queryUserGroup(group.id)
            .should.to.eventually.be.eql(group)

        await app.chatluna_user.removeUserGroup(group.id)
    })

    it('Query By Name', async function () {
        await waitServiceLoad(app, ['chatluna_user'])

        const group = await app.chatluna_user.createUserGroup({
            name: 'a',
            limitPerMin: 10,
            limitPerDay: 100,

            costPerToken: 0.2,

            supportModels: ['gpt3.5']
        })

        await app.chatluna_user
            .queryUserGroupByName('a')
            .should.to.eventually.be.eql(group)

        await app.chatluna_user.removeUserGroup(group.id)
    })

    it('Update', async function () {
        await waitServiceLoad(app, ['chatluna_user'])

        const group = await app.chatluna_user.createUserGroup({
            name: 'a',
            limitPerMin: 10,
            limitPerDay: 100,

            costPerToken: 0.2,

            supportModels: ['gpt3.5']
        })

        group.limitPerMin = 20

        await app.chatluna_user.updateUserGroup(group.id, group)

        await app.chatluna_user
            .queryUserGroup(group.id)
            .should.to.eventually.be.eql(group)

        await app.chatluna_user.removeUserGroup(group.id)
    })

    describe('Error', () => {
        it('Query Error', async () => {
            await waitServiceLoad(app, ['chatluna_user'])

            await app.chatluna_user
                .queryUserGroup(1)
                .should.to.be.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 602。请联系开发者以解决此问题。'
                )

            await app.chatluna_user
                .queryUserGroupByName('a')
                .should.to.be.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 602。请联系开发者以解决此问题。'
                )
        })

        it('Remove Error', async () => {
            await waitServiceLoad(app, ['chatluna_user'])

            await app.chatluna_user
                .removeUserGroup(1)
                .should.to.be.rejectedWith(
                    '使用 ChatLuna 时出现错误，错误码为 602。请联系开发者以解决此问题。'
                )
        })
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

import net, { AddressInfo } from 'net'
import { withResolver } from '../../src/utils'

export function buildSock5Proxy() {
    const { promise, resolve } = withResolver<net.Server>()
    const server = net.createServer((client) => {
        client.on('error', (err) => {
            client.end()
            console.error('error', err)
        })

        client.setTimeout(10000, client.end)

        client.once('data', (data) => {
            //客户端第一次握手
            if (data[0] != 5) {
                return client.end('仅支持socks5')
            }
            client.write(Buffer.from([5, 0])) //服务器应答握手
            client.once('data', (data) => {
                //客户端发来请求连接地址
                const cmd = data[1] //1connect 2bind 3udp
                if (cmd !== 1) {
                    return client.end(
                        Buffer.from([5, 0, 0, 2, 0, 0, 0, 0, 0, 0])
                    ) //不支持tcp以外连接
                }
                const addr_type = data[3] //1ipv4 3domain 4ipv6
                const addr = data.subarray(4, data.length - 2)
                const host = addr2host(addr_type, addr)
                const port = data[data.length - 1] + data[data.length - 2] * 256
                if (host instanceof Error) {
                    return client.end(
                        Buffer.from([5, 0, 0, 3, 0, 0, 0, 0, 0, 0])
                    ) //不支持ipv6地址
                }
                // console.log(`socks5 => ${host}:${port}`)

                // 连接到要求的 host 和 port

                const remote = net.connect(port, host, () => {
                    client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])) //连接远程服务器成功
                    remote.pipe(client)
                    client.pipe(remote)
                })
            })
        })
    })

    server.listen(0, () => {
        console.log('Server listening: ' + JSON.stringify(server.address()))

        server.on('close', function () {
            // console.log('exit');
        })
        server.on('error', function (err) {
            console.log('error: ', JSON.stringify(err))
        })

        const port = (server.address() as AddressInfo).port

        resolve(server)
    })

    return promise
}

function addr2host(addr_type: number, addr: Buffer) {
    if (addr_type == 1) {
        //ipv4地址
        return addr.join('.')
    } else if (addr_type == 3) {
        //domain
        return addr.slice(1).toString()
    } else if (addr_type == 4) {
        //ipv6
        return new Error('不支持的ipv6地址类型')
    } else {
        return new Error('不支持的地址类型')
    }
}

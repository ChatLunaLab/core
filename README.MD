# ChatLuna Core Library

ChatLuna 核心相关项目，ChatLuna 基础框架。

[![npm](https://img.shields.io/npm/v/@chatluna/core)](https://www.npmjs.com/package/@chatluna/core) [![npm](https://img.shields.io/npm/dm/@chatluna/core)](https://www.npmjs.com/package/@chatluna/core)

## 项目结构

- [@chatluna/core](./packages/core/README.MD)

  ChatLuna 核心库，基于 LangChain 建设的一套简易的适用于聊天机器人插件的 LLM Framework。

- [@chatluna/memory](./packages/memory/README.MD)

  ChatLuna 对话存储相关库，提供相关 API。基于 [minato](https://github.com/cordiverse/minato) 实现与数据库的交互。

- [@chatluna/chat](./packages/chat/README.MD)

  ChatLuna 聊天相关基础库，提供有向环图的依赖性中间件模块，抽象化发送与接收模块，流式消息解析，组合对话存储与聊天模式实现与模型聊天功能。

- [@chatluna/service](./packages/service/README.MD)

  ChatLuna 的 Service 实现，提供 ChatLuna 核心服务。

- [@chatluna/utils](./packages/utils/README.MD)

  ChatLuna 辅助库，提供一些简单的 API 如 SSE 解析，等待锁等。

## 致谢

感谢 [cordis](https://github.com/cordiverse/cordis)。本项目大量使用了其相关生态的库。

感谢 [LangChain](https://github.com/langchain-ai/langchainjs) 项目。本项目基于其进行二次封装。

最后感谢所有 ChatLuna 的贡献者和用户，没有你们的支持，ChatLuna 就不会继续向前发展。

## 许可证

使用 [MIT](./LICENSE) 许可证发布。

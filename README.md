<div align="center">

<img style="width:150px;" alt="Hector Bonilla" src="https://conteudo.imguol.com.br/c/entretenimento/6a/2019/01/17/o-ator-mexicano-hector-bonilla-em-1979-e-atualmente-1547766366759_v2_1x1.jpg" />

# Actor Bonilla

**Monorepo** — [`@actor-bonilla/core`](packages/core/README.md) and [`@actor-bonilla/http`](packages/http/README.md).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## Packages

| Package | Description |
|--------|-------------|
| [@actor-bonilla/core](packages/core/README.md) | Mailboxes, supervision, routers, FSM, pub/sub, optional worker-thread actors |
| [@actor-bonilla/http](packages/http/README.md) | Native `fetch` HTTP client with retries and hooks |
| [@actor-bonilla/native](packages/native/README.md) | Optional Zig Node-API addon — ships **prebuilt** binaries (no compile on `npm install`; same goal as [prebuildify](https://github.com/prebuild/prebuildify)) |

Native acceleration is loaded only when prebuilds are published with the package; see [packages/native/README.md](packages/native/README.md).

## Contributing

Clone the repo, install with **pnpm** at the repository root (`pnpm install`), then build and test:

```bash
pnpm run build
pnpm run test
```

See [Developing](packages/core/docs/developing.md) for details.

## License

MIT © Gustavo Cavalcante

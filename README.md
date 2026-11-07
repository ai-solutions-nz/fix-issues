# Online Reset — Your AI Online Performance Partner

Private codebase for the Online Reset AEO/GEO platform (AI Solutions NZ).

Online Reset is built on a fork of [Elmo](https://github.com/elmohq/elmo) (MIT) at
upstream commit `db2d52b560b1917ea4e8fe4b619f1c402b8cdb14`, extended with modules
ported from other permissively licensed projects. See `UPSTREAM.md` for every
reused source and `THIRD_PARTY_NOTICES.md` for the notices we must keep.

- Research that drove the design: `docs/research/`
- Current state of the build: `BUILD-STATUS.md`

## Local development

Requirements: Node.js 24, pnpm (via corepack), PostgreSQL 16+ with pgvector.

```bash
corepack enable
pnpm install
cp .env.example .env && cp .env.example apps/web/.env   # then fill in local values
pnpm test                                               # unit tests
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/elmo_test \
  pnpm -C packages/lib test:integration                 # Postgres integration tests
```

No paid provider is called unless its key is set in `.env`. The default local
configuration uses clearly labelled **fixture** providers (`fixture:*`) whose
results are synthetic and are stored with `collection_method = fixture`.

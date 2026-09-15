# API de Consulta de CEP

API REST desenvolvida em **NestJS + TypeScript** para consulta de CEP com resiliência, cache Redis, retry assíncrono via BullMQ e múltiplos providers externos com fallback.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Fluxo de uma Requisição](#fluxo-de-uma-requisição)
- [Fluxo de Fallback](#fluxo-de-fallback)
- [Cache Redis](#cache-redis)
- [BullMQ e Retry Assíncrono](#bullmq-e-retry-assíncrono)
- [Resiliência](#resiliência)
- [Tratamento de Erros](#tratamento-de-erros)
- [Observabilidade](#observabilidade)
- [Como Adicionar um Novo Provider](#como-adicionar-um-novo-provider)
- [Endpoints](#endpoints)
- [Como Executar](#como-executar)
- [Testes](#testes)
- [Variáveis de Ambiente](#variáveis-de-ambiente)

---

## Visão Geral

O problema: consultar CEP é simples, mas APIs externas são imprevisíveis. Elas demoram, caem, retornam dados inválidos. Este serviço resolve isso com:

- **Dois providers** (ViaCEP e BrasilAPI) com fallback automático
- **Cache Redis** para evitar consultas repetidas
- **Timeout configurável** por provider
- **Retry assíncrono** via BullMQ quando todos os providers falham
- **Logs estruturados** com `requestId` para rastreamento em produção
- **Contrato único** de resposta independente do provider usado

---

## Arquitetura

```
GET /cep/:cep
     │
     ▼
CepController          ← valida e normaliza o CEP via DTO
     │
     ▼
CepService             ← orquestra cache, providers e retry
     │
     ├──► CacheService ──► Redis          (Cache-Aside)
     │         │
     │    [cache miss]
     │
     ├──► ProviderSelectorService         (Strategy: round-robin)
     │         │
     │    [lista ordenada de providers]
     │
     ├──► ViaCepProvider                  (Adapter)
     │         └──► HttpClientService ──► viacep.com.br
     │
     └──► BrasilApiProvider               (Adapter)
               └──► HttpClientService ──► brasilapi.com.br
```

### Padrões utilizados

| Padrão | Onde | Por quê |
|--------|------|---------|
| **Adapter** | `ViaCepProvider`, `BrasilApiProvider` | Isola os contratos externos; o domínio conhece apenas `CepProvider` |
| **Strategy** | `ProviderSelectorService` | Seleciona a ordem dos providers sem que `CepService` saiba qual é o "primário" |
| **Dependency Injection** | Todo o projeto | Testabilidade, desacoplamento, extensibilidade |
| **Cache-Aside** | `CacheService` + Redis | Controle explícito de leitura/escrita no cache |

---

## Fluxo de uma Requisição

```
GET /cep/55200000
       │
       ▼
  Validação do CEP (class-validator + @Transform)
       │  CEP inválido → 400
       │
       ▼
  Redis GET cep:55200000
       │
    ┌──┴──┐
   HIT   MISS
    │     │
    │     ▼
    │  ProviderSelectorService → [ViaCEP, BrasilAPI] (round-robin)
    │     │
    │     ▼
    │  Provider.getCep(cep)
    │     │
    │     ├── Sucesso
    │     │     ├── Redis SET cep:55200000 (TTL=86400s)
    │     │     └── HTTP 200
    │     │
    │     ├── CepNotFoundException → tenta próximo provider
    │     └── Erro técnico → tenta próximo provider
    │
    └──► HTTP 200 (cache hit)
```

---

## Fluxo de Fallback

```
ViaCEP.getCep("55200000")
    │
    ├── Sucesso ─────────────────────────────────► retorna resultado
    │
    ├── Timeout (ProviderTimeoutException)
    │       │
    │       ▼ log: cep_provider_fallback {from: viacep, to: brasilapi}
    │
    ├── Resposta inválida (ProviderInvalidResponseException)
    │       │
    │       ▼
    │
    └── CEP não encontrado (CepNotFoundException) ← ainda tenta próximo!
            │  (pode ser inconsistência entre serviços)
            ▼
BrasilAPI.getCep("55200000")
    │
    ├── Sucesso ─────────────────────────────────► retorna resultado
    │
    └── Falha
            │
            ▼
    Todos os providers falharam
            │
    ┌───────┴───────────┐
    │                   │
  Todos retornaram   Erro técnico
  "não encontrado"   em ao menos um
    │                   │
    ▼                   ▼
  HTTP 404          HTTP 503
                  + BullMQ job enfileirado
                    (retry assíncrono)
```

### Por que o CEP "não encontrado" também tenta o próximo provider?

ViaCEP e BrasilAPI podem ter dados diferentes ou estar desatualizados. Se o primeiro diz que o CEP não existe, o segundo ainda pode encontrá-lo. Só retornamos 404 se **todos** os providers derem uma resposta definitiva de "não encontrado" **sem erros técnicos**.

---

## Cache Redis

### Estratégia: Cache-Aside

A aplicação controla explicitamente leitura e escrita no cache:

1. **Leitura**: `CacheService.get(key)` → null se miss
2. **Escrita**: `CacheService.set(key, value, ttl)` → após provider retornar sucesso

### Chaves

```
cep:{cep_normalizado}

# Exemplos:
cep:55200000
cep:01001000
```

O CEP é normalizado (apenas dígitos) **antes** de ser usado como chave:
```typescript
// "55200-000" e "55200000" resultam na mesma chave:
cep:55200000
```

### TTL

Configurável via variável de ambiente:
```env
CEP_CACHE_TTL=86400  # 24 horas (padrão)
```

### Redis como best-effort

O Redis **nunca** é um ponto único de falha:
- `GET` falhou → trata como cache miss, consulta providers normalmente
- `SET` falhou → retorna o resultado mesmo assim, apenas loga o erro
- Nenhum erro do Redis vira HTTP 500

---

## BullMQ e Retry Assíncrono

### Por que a fila não bloqueia o GET?

O endpoint `GET /cep/:cep` é **100% síncrono**. Quando todos os providers falham:

1. O serviço **imediatamente** lança `ProvidersUnavailableException` → HTTP 503
2. **Após** retornar 503, enfileira um job de retry **em background**
3. O `CepProcessor` tenta os providers assincronamente
4. Em caso de sucesso, **popula o cache** para que a próxima requisição seja rápida

Adicionar latência ao GET aguardando a fila seria contraproducente.

### Configuração do retry

```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,  // 1s, 2s, 4s
  },
  removeOnComplete: true,
  removeOnFail: 50,  // mantém os últimos 50 jobs falhos para debug
}
```

### Redis compartilhado

O mesmo servidor Redis é usado pelo cache **e** pelo BullMQ:

```
Redis :6379
 ├── Cache keys:  cep:55200000, cep:01001000, ...
 └── BullMQ:      bull:cep-retry:waiting, bull:cep-retry:active, ...
```

Isso simplifica a infraestrutura sem sacrificar funcionalidade.

---

## Resiliência

### Timeout

Cada chamada externa tem timeout configurável:
```env
CEP_PROVIDER_TIMEOUT_MS=3000  # 3 segundos (padrão)
```

Implementado com `AbortController` no `HttpClientService`:
```
ViaCEP request
    │
    │  até 3000ms
    │
    ├── resposta ──► sucesso
    └── timeout ──► ProviderTimeoutException ──► fallback para BrasilAPI
```

### Fallback

O `CepService` tenta os providers em ordem retornada pelo `ProviderSelectorService`. Erros técnicos (timeout, resposta inválida, rede) e "não encontrado" permitem tentar o próximo provider.

### Backoff exponencial no retry

```
Tentativa 1: aguarda 1s
Tentativa 2: aguarda 2s
Tentativa 3: aguarda 4s
→ Job marcado como failed (mantido para debugging)
```

---

## Tratamento de Erros

| Situação | HTTP | Código |
|---|:---:|---|
| CEP com formato inválido | `400` | `BAD_REQUEST` |
| CEP não encontrado (ambos os providers confirmam) | `404` | `CEP_NOT_FOUND` |
| Providers temporariamente indisponíveis | `503` | `PROVIDERS_UNAVAILABLE` |

### Exemplos de resposta

```json
// 400 - CEP inválido
{
  "statusCode": 400,
  "message": ["CEP deve conter exatamente 8 dígitos numéricos"],
  "error": "Bad Request"
}

// 404 - CEP não encontrado
{
  "statusCode": 404,
  "code": "CEP_NOT_FOUND",
  "message": "CEP não encontrado"
}

// 503 - Providers indisponíveis
{
  "statusCode": 503,
  "code": "PROVIDERS_UNAVAILABLE",
  "message": "Serviço de consulta de CEP temporariamente indisponível"
}
```

Stack traces e detalhes internos **nunca** são expostos ao cliente.

---

## Observabilidade

Todos os logs são estruturados em JSON com `requestId` propagado via `AsyncLocalStorage`:

```json
{ "event": "cep_request",           "requestId": "abc123", "cep": "55200000" }
{ "event": "cep_cache_miss",        "requestId": "abc123", "cep": "55200000" }
{ "event": "cep_provider_request",  "requestId": "abc123", "provider": "viacep", "cep": "55200000" }
{ "event": "cep_provider_timeout",  "requestId": "abc123", "provider": "viacep", "duration": 3001 }
{ "event": "cep_provider_fallback", "requestId": "abc123", "from": "viacep", "to": "brasilapi" }
{ "event": "cep_provider_success",  "requestId": "abc123", "provider": "brasilapi", "duration": 245 }
{ "event": "cep_cache_hit",         "requestId": "abc123", "cep": "55200000" }
```

O `requestId` pode ser fornecido pelo cliente via header `x-request-id` ou gerado automaticamente (UUID v4). Ele aparece em **todos** os logs da mesma requisição, facilitando investigação em produção.

---

## Como Adicionar um Novo Provider

**Passo 1**: Crie o DTO da resposta externa

```typescript
// src/modules/cep/providers/meu-provider/dto/meu-provider-response.dto.ts
export class MeuProviderResponseDto {
  @IsString() @IsNotEmpty() cep: string;
  @IsString() @IsNotEmpty() estado: string;
  @IsString() @IsNotEmpty() cidade: string;
  // ...
}
```

**Passo 2**: Implemente o adapter

```typescript
// src/modules/cep/providers/meu-provider/meu-provider.provider.ts
@Injectable()
export class MeuProvider implements CepProvider {
  readonly name = 'meuprovider';

  async getCep(cep: string): Promise<CepProviderResult> {
    // 1. Montar URL
    // 2. Chamar HttpClientService.get()
    // 3. Tratar HttpTimeoutError → ProviderTimeoutException
    // 4. Tratar status não encontrado → CepNotFoundException
    // 5. validateDto(MeuProviderResponseDto, data)
    // 6. Normalizar para CepProviderResult
  }
}
```

**Passo 3**: Registrar no módulo

```typescript
// src/modules/cep/cep.module.ts
@Module({
  providers: [
    // ... existentes ...
    MeuProvider,
    {
      provide: CEP_PROVIDERS,
      inject: [ViaCepProvider, BrasilApiProvider, MeuProvider],
      useFactory: (v, b, m) => [v, b, m],  // ← só aqui
    },
  ],
})
```

**Nenhuma alteração** necessária em `CepService` ou `ProviderSelectorService`.

---

## Endpoints

### `GET /cep/:cep`

Consulta dados de um CEP.

**Parâmetros aceitos:**
- `55200000` (sem traço)
- `55200-000` (com traço)

**Resposta de sucesso (200):**
```json
{
  "cep": "55200-000",
  "street": "Praça Mestre Dominguinhos",
  "neighborhood": "Centro",
  "city": "Garanhuns",
  "state": "PE"
}
```

### `GET /health`

Verifica a saúde da aplicação e conectividade com Redis.

```json
{
  "status": "ok",
  "info": { "redis": { "status": "up" } }
}
```

### `GET /api`

Swagger UI com documentação interativa (disponível apenas fora de produção).

---

## Como Executar

### Pré-requisitos

- Node.js 18+
- Docker (para Redis)

### 1. Clonar e instalar dependências

```bash
git clone <repo>
cd teste-dev
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env se necessário (os valores padrão funcionam com Docker local)
```

### 3. Subir o Redis

```bash
docker compose up -d
```

### 4. Iniciar a aplicação

```bash
npm run start:dev
```

A API estará disponível em `http://localhost:3000`.

### Testar rapidamente

```bash
# CEP válido
curl http://localhost:3000/cep/01001000

# CEP com traço
curl http://localhost:3000/cep/55200-000

# CEP inválido (400)
curl http://localhost:3000/cep/123

# Health check
curl http://localhost:3000/health

# Swagger
open http://localhost:3000/api
```

---

## Testes

```bash
# Todos os testes
npm run test

# Com coverage
npm run test:cov

# Watch mode
npm run test:watch
```

### Cobertura dos testes

| Arquivo | O que testa |
|---------|-------------|
| `cep.service.spec.ts` | Cache hit/miss, fallback, 404 vs 503, Redis resilience |
| `viacep.provider.spec.ts` | Resposta válida, erro flag, HTTP 400, timeout, resposta inválida |
| `brasil-api.provider.spec.ts` | Resposta válida, HTTP 404, timeout, campos opcionais |
| `cache.service.spec.ts` | GET hit/miss, SET com TTL, DEL, erros Redis |
| `cep.controller.spec.ts` | HTTP 200/400/404/503, normalização do CEP |

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ENV` | `development` | Ambiente (development, production, test) |
| `PORT` | `3000` | Porta da aplicação |
| `REDIS_HOST` | `localhost` | Host do Redis |
| `REDIS_PORT` | `6379` | Porta do Redis |
| `CEP_CACHE_TTL` | `86400` | TTL do cache em segundos (24h) |
| `CEP_PROVIDER_TIMEOUT_MS` | `3000` | Timeout por provider em milissegundos |
| `VIACEP_BASE_URL` | `https://viacep.com.br` | URL base do ViaCEP |
| `BRASIL_API_BASE_URL` | `https://brasilapi.com.br` | URL base do BrasilAPI |

---

## Decisões Técnicas

### Por que ioredis diretamente em vez de cache-manager?

O `cache-manager` adiciona uma camada de abstração que dificulta controlar o comportamento best-effort. Com `ioredis` diretamente, o `CacheService` tem controle total sobre o tratamento de erros — cada operação tem seu próprio `try/catch` com log específico.

### Por que AsyncLocalStorage para requestId?

Permite propagar o `requestId` por toda a cadeia assíncrona (service, providers, cache) sem passar o ID manualmente em cada chamada. A alternativa (passar como parâmetro) poluiria todas as assinaturas de métodos.

### Por que round-robin simples?

O `ProviderSelectorService` usa um contador em memória — simples, previsível, fácil de explicar. Soluções mais complexas (pesos por latência, circuit breaker) adicionariam complexidade sem benefício claro para este contexto.

### Por que validar DTOs externos com class-validator?

APIs externas não são confiáveis. Validar a resposta antes de normalizar garante que dados malformados falham explicitamente (`ProviderInvalidResponseException`) em vez de propagar silenciosamente dados incorretos para o cliente.

## Rate Limiting (Token Bucket)

A API implementa proteção contra abuso utilizando o algoritmo **Token Bucket**.

### Por que Token Bucket e Redis?
O Token Bucket permite rajadas controladas enquanto mantém uma taxa média constante de consumo. Utilizamos **Redis com Lua Script** para garantir a **atomicidade total** das operações em um ambiente distribuído (múltiplas instâncias da API).

### Como funciona?
1. **Bucket:** Cada IP possui um bucket com capacidade máxima (ex: 100 tokens).
2. **Consumo:** Cada requisição consome 1 token.
3. **Refill (Reposição):** A cada janela de tempo (ex: 1 minuto), o bucket enche de volta de forma constante e *lazy*.
4. **Bloqueio (429):** Se os tokens acabarem, a API retorna HTTP 429 com o header `Retry-After` informando quantos segundos aguardar para um novo token.

### Redis Indisponível (Fail-Open)
O Rate Limiting possui estratégia *Fail-Open*. Se o Redis falhar temporariamente, a API prioriza a disponibilidade: a requisição é permitida e um log (`rate_limit_redis_error`) é gerado, não derrubando o negócio principal.

### Headers de Rate Limit
Cada requisição inclui informativos no header HTTP:
- `X-RateLimit-Limit`: Capacidade do Bucket.
- `X-RateLimit-Remaining`: Tokens sobrando no bucket.
- `Retry-After`: Segundos para tentar novamente (só em 429).

### Configurações (Variáveis de Ambiente)
- `RATE_LIMIT_CAPACITY`: Tamanho do Bucket (Padrão: 100).
- `RATE_LIMIT_REFILL_RATE`: Tokens adicionados por janela (Padrão: 100).
- `RATE_LIMIT_WINDOW_SECONDS`: Janela de reposição em segundos (Padrão: 60).

## Métricas e Observabilidade (Prometheus + Grafana)

A API expõe nativamente métricas no padrão **Prometheus** através do endpoint `GET /metrics`. Isso permite integração direta com ferramentas de visualização, como o Grafana (incluso no `docker-compose.yml`).

<img width="1105" height="609" alt="image" src="https://github.com/user-attachments/assets/c5a8a351-c6c0-460d-8e78-c3ad9d537ec3" />


### Endpoint
- `GET /metrics`

### Principais Métricas Disponíveis

| Métrica | Tipo | Descrição | Labels |
|---|---|---|---|
| `cep_request_total` | Counter | Total de buscas de CEP realizadas pela API | `status="hit\|miss\|invalid\|not_found\|error"` |
| `cep_provider_request_total` | Counter | Total de chamadas a provedores externos | `provider="viacep\|brasilapi"`, `result="success\|not_found\|invalid\|error"` |
| `cep_provider_duration_seconds`| Histogram| Latência de comunicação com os provedores | `provider="viacep\|brasilapi"` |
| `cep_fallback_total` | Counter | Quantas vezes o sistema ativou o fallback | `from="viacep"`, `to="brasilapi"` |
| `cep_rate_limit_total` | Counter | Requisições interceptadas pelo Token Bucket | `result="allowed\|exceeded"` |

Essas métricas oferecem visibilidade total sobre a **taxa de sucesso do cache**, a **latência e estabilidade** dos provedores de terceiros (ViaCEP/BrasilAPI) e a volumetria de tráfego bloqueado pelo **Rate Limiting**.

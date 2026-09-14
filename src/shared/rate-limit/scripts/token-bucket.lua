local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2]) -- tokens per millisecond
local now = tonumber(ARGV[3]) -- current time in ms
local ttl = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'lastRefillAt')
local tokens = capacity
local lastRefillAt = now

-- If the bucket exists, calculate the current tokens based on elapsed time
if bucket[1] then
    tokens = tonumber(bucket[1])
    lastRefillAt = tonumber(bucket[2])
    local timePassedMs = math.max(0, now - lastRefillAt)
    local newTokens = timePassedMs * refillRate
    tokens = math.min(capacity, tokens + newTokens)
end

local allowed = 0
local remaining = math.floor(tokens)
local retryAfter = 0

if tokens >= 1 then
    -- We have enough tokens, allow the request
    allowed = 1
    tokens = tokens - 1
    remaining = math.floor(tokens)
    lastRefillAt = now
    
    redis.call('HMSET', key, 'tokens', tokens, 'lastRefillAt', lastRefillAt)
    redis.call('EXPIRE', key, ttl)
else
    -- Not enough tokens, calculate retryAfter (in seconds)
    local deficit = 1 - tokens
    retryAfter = math.ceil((deficit / refillRate) / 1000)
    if retryAfter <= 0 then
        retryAfter = 1
    end
end

return {allowed, remaining, retryAfter}

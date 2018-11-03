local uid_list = cjson.decode(KEYS[1])
local key = KEYS[2]
local asJson = KEYS[3]

local result = {}

for i,uid in ipairs(uid_list) do
    local item = redis.call('get', key .. '_' .. uid);

    if asJson == 'true' then
        item = cjson.decode(item);
    end

    result[uid] = item;
end

return cjson.encode(result)

-- evalsha [...SHA1] projectIds
local projectIds = cjson.decode(KEYS[1]);

local counter = 1;
local result = {};

while projectIds[counter] do
    local uids = redis.call('lrange', 'PROJECT_CLIENTS_' .. projectIds[counter], 0, -1);
    local uidsCounter = 1;
    while uids[uidsCounter] do
        table.insert(result, uids[uidsCounter]);
        uidsCounter = uidsCounter + 1;
    end
    counter = counter + 1;
end

if #result > 0 then
    return cjson.encode(result);
else
    return '[]'
end

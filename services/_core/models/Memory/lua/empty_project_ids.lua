-- evalsha [...SHA1] emptyProjectIds
local projectIds = cjson.decode(KEYS[1]);

local counter = 1;
local result = {};

while projectIds[counter] do
    local projectId = projectIds[counter];
    local clientsCount = redis.call('LLEN', 'PROJECT_CLIENTS_' .. projectId);
    if clientsCount == 0 then table.insert(result, projectId) end;
    counter = counter + 1;
end

if #result > 0 then
    return cjson.encode(result);
else
    return '[]'
end

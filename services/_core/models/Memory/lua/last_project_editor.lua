local project_id = KEYS[1];
local project_ops = redis.call('lrange', project_id, 0, -1);
local operations_count = #project_ops

local operation = {}
local owner

for i in ipairs(project_ops) do
    operation = cjson.decode(project_ops[operations_count + 1 - i])

    if operation.properties and operation.properties.content and operation.properties.content.owner then
        owner = operation.properties.content.owner
        break
    end
end

return owner
